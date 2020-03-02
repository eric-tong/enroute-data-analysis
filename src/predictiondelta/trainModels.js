// @flow

import "../service/config";

import { getModel, trainModel } from "./model";

import { getData } from "./data";
import plotPredictionOnTrainingData from "./plotPredictionOnTrainingData";

const tf = require("@tensorflow/tfjs-node");

export const MODEL_PATH = `file://${__dirname}/models/trip`;
const MODEL_SAMPLE_COUNT = 3;

export async function start() {
  for (let tripId = 1; tripId <= 29; tripId++) {
    await trainAndSaveModel(tripId).catch(console.error);
    await plotPredictionOnTrainingData(tripId);
  }
}

async function trainAndSaveModel(tripId: number) {
  const data = await getData(tripId);

  let model;
  let minLoss = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < MODEL_SAMPLE_COUNT; i++) {
    const testModel = getModel();
    const loss = await trainModel(
      testModel,
      data.training.input,
      data.training.label
    );
    if (loss < minLoss) {
      model = testModel;
      minLoss = loss;
    }
  }
  console.log({ minLoss });
  if (model) model.save(`${MODEL_PATH}-${tripId}`);
}
