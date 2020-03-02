// @flow

import { getScheduledDepartures, getSkippedCount } from "./analysis";

import { plot } from "nodeplotlib";

export default async function plotSkipCount() {
  const { grid, topHeader, leftHeader } = await getScheduledDeparturesGrid();

  const values = [
    leftHeader,
    ...grid.map(row =>
      row.map(cell =>
        cell
          ? `${cell.time.toString().padStart(4, "0")}${
              cell.skippedCount ? `<br><b>${cell.skippedCount * 10}%</b>` : ""
            }`
          : ""
      )
    )
  ];

  const data = [
    {
      type: "table",
      header: { values: topHeader, align: ["center", "center"] },
      cells: {
        values: values,
        align: ["left", "center"],
        height: 30,
        fill: {
          color: [
            ["white"],
            ...grid.map(row =>
              row.map(cell => getCellColor(cell && cell.skippedCount))
            )
          ]
        }
      },
      columnwidth: [
        4,
        ...Array.from({ length: topHeader.length - 1 }, () => 1)
      ],
      rowheight: Array.from({ length: grid[0].length + 1 }, () => 10)
    }
  ];

  const layout = {
    title: {
      text: `Frequency of Skipping Bus Stop`
    },
    autosize: false,
    width: 1600,
    height: 650,
    margin: 0
  };
  plot(data, layout);
}

async function getScheduledDeparturesGrid() {
  const scheduledDepartures = await getScheduledDepartures();
  const skippedCount = await getSkippedCount();
  const tripCount = Math.max(
    ...scheduledDepartures.map(departure => departure.tripId)
  );
  const busStopsCount =
    Math.max(...scheduledDepartures.map(departure => departure.busStopId)) + 1;

  const grid: any[][] = Array.from({ length: tripCount }, () =>
    Array.from({ length: busStopsCount })
  );
  scheduledDepartures.forEach(departure => {
    const data = {
      name: departure.name,
      time:
        Math.floor(departure.minuteOfDay / 60) * 100 +
        (departure.minuteOfDay % 60),
      skippedCount: skippedCount.get(departure.id) ?? 0
    };
    if (!grid[departure.tripId - 1][departure.busStopId - 1]) {
      grid[departure.tripId - 1][departure.busStopId - 1] = data;
    } else {
      grid[departure.tripId - 1][busStopsCount - 1] = data;
    }
  });

  const topHeader = [
    "Trips",
    ...Array.from({ length: tripCount }, (_, i) => i).slice(15)
  ];
  const leftHeader = Array.from({ length: busStopsCount }, (_, i) => {
    const row = grid.find(trip => !!trip[i]);
    const cell = row && row[i];
    return cell && cell.name;
  });
  return { grid: grid.slice(15), topHeader, leftHeader };
}

function getAdjustment(deviation: number) {}

const CELL_MAXIMUM_COLOR = 10;
const MIN_HUE = 193;
const MAX_HUE = 340;

function getCellColor(value: ?number) {
  if (!value) return "white";

  const percentage = Math.max(-1, Math.min(1, value / CELL_MAXIMUM_COLOR));
  const lightness = 1 - Math.abs(percentage) * 0.5;
  const hue = percentage < 0 ? MIN_HUE : MAX_HUE;
  return `hsla(${hue}, 1, ${lightness}, 1)`;
}
