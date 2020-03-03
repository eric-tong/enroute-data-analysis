// @flow

import "../service/config";

import { getModel, trainModel } from "./model";

import { getData } from "./data";

const tf = require("@tensorflow/tfjs");

export const MODEL_PATH = `file://${__dirname}/models/trip`;
const MODEL_SAMPLE_COUNT = 3;

export async function start() {
  console.log(new Date().toUTCString(), "Start training models.");
  for (let tripId = 1; tripId <= 29; tripId++) {
    await trainAndSaveModel(tripId).catch(console.error);
  }
  console.log(new Date().toUTCString(), "Complete training models.");
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
    ).catch(error => {
      console.error(error);
      return null;
    });
    if (!loss) continue;
    if (loss < minLoss) {
      model = testModel;
      minLoss = loss;
    }
  }
  if (model) {
    model.save(`${MODEL_PATH}-${tripId}`);
    console.log(`Trip ${tripId} model trained.`, `Loss: ${minLoss}`);
  } else {
    console.log(`Trip ${tripId} training failed.`);
  }
}
