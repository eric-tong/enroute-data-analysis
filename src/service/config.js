// @flow

import { Settings } from "luxon";
import { nodeFileSystemRouter } from "./NodeFileSystem";

const tf = require("@tensorflow/tfjs");

Settings.defaultLocale = "en-GB";
Settings.defaultZoneName = "Europe/London";

require("dotenv").config();

// Register the model saving and loading handlers for the 'file://' URL scheme.
tf.io.registerLoadRouter(nodeFileSystemRouter);
tf.io.registerSaveRouter(nodeFileSystemRouter);
