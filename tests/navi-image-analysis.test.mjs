import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../navi-image-analysis.js", import.meta.url), "utf8");
const sandbox = { window: {} };
runInNewContext(source, sandbox, { filename: "navi-image-analysis.js" });
const paletteFromBins = sandbox.window.NaviLocalImageAnalysis.paletteFromBins;

test("local image palette converts quantized RGB bins to distinct midpoints", () => {
  const palette = Array.from(paletteFromBins(new Map([
    ["000", 2],
    ["333", 1],
    ["103", 3]
  ])));
  assert.deepEqual(palette, ["6020DF", "202020", "DFDFDF"]);
  assert.equal(new Set(palette).size, 3);
});

test("local image palette never clamps every quantized channel to white", () => {
  const palette = Array.from(paletteFromBins(new Map([
    ["111", 4],
    ["222", 3],
    ["333", 2]
  ])));
  assert.deepEqual(palette, ["606060", "9F9F9F", "DFDFDF"]);
  assert.ok(palette.every(color => color !== "FFFFFF"));
});
