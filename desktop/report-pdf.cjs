"use strict";
const { BrowserWindow, session } = require("electron");
const markdown = require("markdown-it")({
  html: false,
  linkify: false,
}).disable(["link", "image", "autolink"]);
async function printReport(report, signal) {
  if (signal.aborted) throw Error("Task cancelled.");
  const isolated = session.fromPartition("saa-report-render");
  isolated.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  isolated.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !details.url.startsWith("data:text/html") }),
  );
  const window = new BrowserWindow({
    show: false,
    focusable: false,
    skipTaskbar: true,
    width: 900,
    height: 1000,
    webPreferences: {
      session: isolated,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      webSecurity: true,
    },
  });
  window.setContentProtection(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  const abort = () => {
    if (!window.isDestroyed()) window.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const html =
      '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>@page{size:A4;margin:20mm}body{font:11pt/1.6 system-ui,sans-serif;color:#17252a}h1{font-size:20pt}h2{font-size:15pt}h3{font-size:12pt}h1,h2,h3{break-after:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f4;padding:10px;font:9pt/1.5 monospace}table{border-collapse:collapse;width:100%;font-size:9pt}th,td{border:1px solid #c6d0d3;padding:6px;text-align:left}tr{break-inside:avoid}footer{font-size:8pt;color:#53676c;border-top:1px solid #ddd;padding-top:8px}</style>' +
      markdown.render(report) +
      "<footer>Generated from the files selected for this task. Review AI-generated conclusions against the sources.</footer>";
    await window.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    if (signal.aborted) throw Error("Task cancelled.");
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
  }
}
module.exports = { printReport };
