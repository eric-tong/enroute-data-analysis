// @flow

import database from "../database/database";

export async function createTempTable() {
  const CREATE_TEMP_TABLE = `
  CREATE TABLE IF NOT EXISTS visits_temp AS

  WITH bus_stop_visits AS (
  SELECT  bus_stop_visits.*,
          ROW_NUMBER() OVER (ORDER BY timestamp::DATE, vehicle_id, timestamp)
          - ROW_NUMBER() OVER (PARTITION BY bus_stop_id ORDER BY timestamp::DATE, vehicle_id, timestamp) AS group
    FROM bus_stop_visits
    INNER JOIN avl ON avl.id = bus_stop_visits.avl_id
    WHERE NOW()::DATE - timestamp::DATE < 14
  )

  SELECT  ROW_NUMBER() OVER (ORDER BY MAX(avl.timestamp)::DATE, vehicle_id, MAX(avl.timestamp)) * 2 AS id,
          bus_stops.id AS bus_stop_id, 
          bus_stops.name,
          bus_stops.is_terminal,
          vehicle_id,
          scheduled_departures.trip_id,
          scheduled_departure_id,
          MIN(avl.timestamp)::DATE + MAKE_INTERVAL(mins => scheduled_departures.minute_of_day) AS scheduled,
          MIN(avl.timestamp)::TIMESTAMP as enter, 
          MAX(avl.timestamp)::TIMESTAMP as exit,
          MAX(avl.timestamp)::TIMESTAMP - MIN(avl.timestamp)::DATE - MAKE_INTERVAL(mins => scheduled_departures.minute_of_day) AS delta,
          is_proxy AS skipped

    FROM avl
    INNER JOIN bus_stop_visits ON bus_stop_visits.avl_id = avl.id
    INNER JOIN bus_stops ON bus_stops.id = bus_stop_visits.bus_stop_id
    LEFT JOIN scheduled_departures ON scheduled_departures.id = bus_stop_visits.scheduled_departure_id
    WHERE NOW()::DATE - timestamp::DATE < 14
    AND EXTRACT(dow FROM timestamp) BETWEEN 1 AND 5
    GROUP BY bus_stop_visits.group, avl.timestamp::DATE, vehicle_id, scheduled_departure_id, bus_stops.name, bus_stops.id, is_proxy, scheduled_departures.minute_of_day, trip_id
    ORDER BY MAX(avl.timestamp)::DATE, vehicle_id, MAX(avl.timestamp)
  `;

  return await database.query<any>(CREATE_TEMP_TABLE);
}

export async function cleanData() {
  await updateStartOfTrips();
  await updateEndOfTrips();
  await deleteDiscontinuousVisits();
}

export async function updateStartOfTrips() {
  const rows = await getRawData();
  const SET_TRIP_AND_SCHEDULED_DEPARTURE_OF_ID = `
  UPDATE visits_temp
    SET trip_id = $2, 
        scheduled_departure_id = (SELECT id FROM scheduled_departures
                                  WHERE scheduled_departures.bus_stop_id = bus_stop_id
                                  AND trip_id = $2 ORDER BY minute_of_day LIMIT 1), 
        scheduled = (SELECT enter::DATE + MAKE_INTERVAL(mins => minute_of_day)
                     FROM scheduled_departures WHERE id = 
                     (SELECT id FROM scheduled_departures
                      WHERE scheduled_departures.bus_stop_id = visits_temp.bus_stop_id
                      AND trip_id = $2 ORDER BY minute_of_day LIMIT 1)),
        delta = exit - (SELECT enter::DATE + MAKE_INTERVAL(mins => minute_of_day)
                        FROM scheduled_departures WHERE id =
                        (SELECT id FROM scheduled_departures
                          WHERE scheduled_departures.bus_stop_id = visits_temp.bus_stop_id
                          AND trip_id = $2 ORDER BY minute_of_day LIMIT 1))
    WHERE id = $1
  `;

  let currentTripId = 0;
  let currentScheduledDepartureId = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.trip_id) continue;

    // Find a start of trip that doesn't start with a terminal
    if (row.trip_id !== currentTripId && !row.is_terminal) {
      currentTripId = row.trip_id;
      for (let j = i - 1; j >= 0; j--) {
        const testRow = rows[j];
        if (testRow.is_terminal) {
          await database.query(SET_TRIP_AND_SCHEDULED_DEPARTURE_OF_ID, [
            testRow.id,
            currentTripId
          ]);
          break;
        }
      }
    }
  }
}

export async function updateEndOfTrips() {
  const rows = await database
    .query("SELECT * FROM visits_temp WHERE is_terminal ORDER BY id")
    .then(results => results.rows);
  const DUPLICATE_ROW_WITH_ID = `
    INSERT INTO visits_temp
      SELECT 
        id - 1 AS id,
        bus_stop_id,
        name, 
        is_terminal,
        vehicle_id,
        $2 AS trip_id,
        (SELECT id FROM scheduled_departures
          WHERE scheduled_departures.bus_stop_id = bus_stop_id
          AND trip_id = $2 ORDER BY minute_of_day DESC LIMIT 1) AS scheduled_departure_id,
        (SELECT enter::DATE + MAKE_INTERVAL(mins => minute_of_day)
          FROM scheduled_departures WHERE id = 
          (SELECT id FROM scheduled_departures
           WHERE scheduled_departures.bus_stop_id = visits_temp.bus_stop_id
           AND trip_id = $2 ORDER BY minute_of_day DESC LIMIT 1)) AS scheduled,
        enter,
        enter AS exit,
        enter - (SELECT enter::DATE + MAKE_INTERVAL(mins => minute_of_day)
                        FROM scheduled_departures WHERE id =
                        (SELECT id FROM scheduled_departures
                          WHERE scheduled_departures.bus_stop_id = visits_temp.bus_stop_id
                          AND trip_id = $2 ORDER BY minute_of_day DESC LIMIT 1)) delta,
        skipped
      FROM visits_temp WHERE id = $1 LIMIT 1
  `;

  let currentTripId = 0;
  let currentVehicleId = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!currentTripId || row.vehicle_id != currentVehicleId) {
      currentTripId = row.trip_id;
      currentVehicleId = row.vehicle_id;
      continue;
    }

    if (row.trip_id !== currentTripId) {
      await database.query(DUPLICATE_ROW_WITH_ID, [row.id, currentTripId]);
      currentTripId = row.trip_id;
    }
  }
}

export async function deleteDiscontinuousVisits() {
  const rows = await getRawData();
  const DELETE_IN_RANGE = "DELETE FROM visits_temp WHERE id >= $1 AND id <= $2";

  let currentTrip = 0;
  let currentScheduledDepartureId = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.trip_id) continue;
    if (row.trip_id != currentTrip) {
      currentTrip = row.trip_id;
      currentScheduledDepartureId = row.scheduled_departure_id;
      continue;
    }
    if (row.scheduled_departure_id === currentScheduledDepartureId + 1) {
      currentScheduledDepartureId++;
      continue;
    }
    // Check if the next continuous is within 5 visits.
    // If yes, delete everything in between.
    for (let j = i; j < Math.min(i + 5, rows.length); j++) {
      const testRow = rows[j];
      if (testRow.scheduled_departure_id === currentScheduledDepartureId + 1) {
        await database.query(DELETE_IN_RANGE, [row.id, testRow.id - 1]);
        i = j;
        currentScheduledDepartureId++;
        break;
      }
    }
  }
}

export async function getRawData() {
  const GET_ALL_ROWS = "SELECT * FROM visits_temp ORDER BY id";
  return database.query<any>(GET_ALL_ROWS).then(results => results.rows);
}

export async function dropTable() {
  const DROP_TABLE = "DROP TABLE IF EXISTS visits_temp";
  return database.query<any>(DROP_TABLE);
}
