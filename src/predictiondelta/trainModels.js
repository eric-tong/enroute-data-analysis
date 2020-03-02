// @flow

import "../service/config";

import { getModel, trainModel } from "./model";

import { getData } from "./data";
import plotPredictionOnTrainingData from "./plotPredictionOnTrainingData";

const tf = require("@tensorflow/tfjs-node");

export const MODEL_PATH = `file://${__dirname}/models/trip`;

export async function start() {
  for (let tripId = 1; tripId <= 29; tripId++) {
    await trainAndSaveModel(tripId);
    await plotPredictionOnTrainingData(tripId);
  }
}

async function trainAndSaveModel(tripId: number) {
  const data = await getData(tripId);
  const model = getModel();
  await trainModel(model, data.training.input, data.training.label);
  model.save(`${MODEL_PATH}-${tripId}`);
}
