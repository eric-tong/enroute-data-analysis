// @flow

import { MAX_DELTA, MAX_DISTANCE, getData } from "./data";

import { MODEL_PATH } from "./trainModels";
import { plot } from "nodeplotlib";

const tf = require("@tensorflow/tfjs");

export default async function plotPredictionOnTrainingData(tripId: number) {
  const data = await getData(tripId);
  const model = await loadModel(`${MODEL_PATH}-${tripId}`);

  const testTensor = tf.linspace(0, 1, 100).reshape([100, 1]);
  const prediction = await model.predict(testTensor);

  const predictedDelta = prediction
    .mul(MAX_DELTA)
    .div(60)
    .dataSync();
  const distance = testTensor.mul(MAX_DISTANCE).dataSync();

  const trainingPlot = {
    x: Array.from(data.training.input.mul(MAX_DISTANCE).dataSync()),
    y: Array.from(
      data.training.label
        .mul(MAX_DELTA)
        .div(60)
        .dataSync()
    ),
    type: "scatter",
    mode: "markers",
    name: "Training"
  };
  const predictionPlot = {
    x: Array.from(distance),
    y: Array.from(predictedDelta),
    type: "scatter",
    mode: "markers",
    name: "Prediction"
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

  plot([trainingPlot, predictionPlot], layout);
}

async function loadModel(path: string) {
  return await tf.loadLayersModel(path + "/model.json");
}
