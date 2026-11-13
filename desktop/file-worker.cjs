"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const tools = require("./file-tools.cjs");
(async () => {
  try {
    if (!["extractFiles", "makeZip", "readZip"].includes(workerData.action))
      throw Error("Unknown file tool.");
    const result = await tools[workerData.action](workerData.input);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error.message });
  }
})();
