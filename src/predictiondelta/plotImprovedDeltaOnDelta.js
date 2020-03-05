// @flow
import "../service/config";

import { MAX_DELTA, MAX_DISTANCE } from "./data";
import { mean, median, std } from "mathjs";

import database from "../database/database";
import { plot } from "nodeplotlib";

plotHistogram();
for (let i = 1; i <= 29; i++) plotScatter(i);

async function plotHistogram() {
  const xbins = { size: 0.25, start: -10.125, end: 10.125 };
  const data = await getRawData();
  const originalDeltaPlot = {
    x: data.map(row => row.delta / 60),
    type: "histogram",
    xbins,
    opacity: 0.5,
    name: "Original Delta"
  };
  const improvedDeltaPlot = {
    x: data.map(row => row.improved_delta / 60),
    type: "histogram",
    xbins,
    opacity: 0.5,
    name: "Improved Delta"
  };
  const layout = {
    title: {
      text: `Delta Histogram`
    },
    xaxis: {
      title: {
        text: "Delta /min"
      }
    },
    barmode: "overlay"
  };

  plot([originalDeltaPlot, improvedDeltaPlot], layout);
  console.table(
    [originalDeltaPlot, improvedDeltaPlot].map(plot => ({
      name: plot.name,
      median: median(plot.x),
      mean: mean(plot.x),
      std: std(plot.x)
    }))
  );
  console.log({
    improvement:
      originalDeltaPlot.x.filter(
        (_, i) =>
          Math.abs(originalDeltaPlot.x[i]) >= Math.abs(improvedDeltaPlot.x[i])
      ).length / originalDeltaPlot.x.length
  });
}

async function plotScatter(tripId: number) {
  const data = await getRawData(tripId);
  const originalDeltaPlot = {
    x: data.map(row => row.distance),
    y: data.map(row => row.delta / 60),
    type: "scatter",
    mode: "markers",
    name: "Original Delta"
  };
  const improvedDeltaPlot = {
    x: data.map(row => row.distance),
    y: data.map(row => row.improved_delta / 60),
    type: "scatter",
    mode: "markers",
    name: "Improved Delta"
  };
  const layout = {
    title: {
      text: `Delta vs Distance for Trip ${tripId}`
    },
    xaxis: {
      title: {
        text: "Distance /m"
      }
    },
    yaxis: {
      title: {
        text: "Delta /min"
      }
    }
  };

  plot([originalDeltaPlot, improvedDeltaPlot], layout);
}

async function getRawData(tripId?: number) {
  const GET_DATA = `
      WITH actual_departures AS (
          SELECT scheduled_departure_id AS id, MIN(bus_stops.id) AS "busStopId",
          MIN(timestamp) AS arrival_timestamp, MIN(avl_trip.trip_id) AS trip
              FROM bus_stop_visits
              INNER JOIN avl ON avl.id = bus_stop_visits.avl_id
              INNER JOIN avl_trip ON avl.id = avl_trip.avl_id
              INNER JOIN bus_stops ON bus_stop_visits.bus_stop_id = bus_stops.id
              WHERE NOW()::DATE - timestamp::DATE < 7
              ${tripId ? `AND trip_id = ${tripId}` : ""}
              GROUP BY scheduled_departure_id, timestamp::DATE
      )
  
      SELECT  EXTRACT(hour FROM avl.timestamp) * 60 + EXTRACT(minute FROM avl.timestamp) AS "minuteOfDay",
              actual_departures.*, 
              predicted_timestamp, 
              EXTRACT(epoch FROM predicted_timestamp - arrival_timestamp) AS delta,
              EXTRACT(epoch FROM 
                (predicted_departures.predicted_timestamp - MAKE_INTERVAL(secs => COALESCE(predicted_departures.predicted_delta, 0)))
                - arrival_timestamp)
                AS improved_delta, 
              distance
          FROM predicted_departures
          INNER JOIN actual_departures ON predicted_departures.scheduled_departure_id = actual_departures.id
          INNER JOIN avl ON predicted_departures.avl_id = avl.id
          WHERE actual_departures.arrival_timestamp::DATE = predicted_timestamp::DATE
          AND predicted_delta != 0
          AND predicted_delta IS NOT NULL
          AND ABS(EXTRACT(epoch FROM predicted_timestamp - arrival_timestamp)) < $1
          AND distance < $2
          ORDER BY distance
      `;

  return await database
    .query<any>(GET_DATA, [MAX_DELTA, MAX_DISTANCE])
    .then(results => results.rows);
}
