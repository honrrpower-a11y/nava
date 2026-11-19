import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../office-preview.js", import.meta.url), "utf8");
const start = source.indexOf("  const NAVA_RTL_TEXT =");
const end = source.indexOf("  const renderPptx =", start);
assert.ok(start >= 0 && end > start, "RTL compatibility implementation must exist");

test("Persian and Arabic runs are drawn as one shaped Canvas string", () => {
  const calls = [];
  class CanvasGraphicsAdapter {
    constructor() {
      this._context = {
        fillStyle: "#000",
        textBaseline: "alphabetic",
        direction: "ltr",
        textAlign: "start",
        save() { calls.push(["save"]); },
        restore() { calls.push(["restore"]); },
        fillText(...args) { calls.push(["fillText", ...args, this.direction, this.textAlign]); },
        measureText(text) {
          calls.push(["measureText", text]);
          return { width: 42, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 };
        }
      };
      this.brush = { Color1: { R: 1, G: 2, B: 3, A: 255 } };
      this.bIsBreak = false;
    }
    colorToRgb() { return "rgb(1, 2, 3)"; }
    t(text, x, y, isBounds) {
      calls.push(["original", text, x, y, isBounds]);
      return "original-result";
    }
  }

  const window = { CanvasGraphicsAdapter };
  const context = vm.createContext({ window });
  vm.runInContext(
    source.slice(start, end) + "\nglobalThis.installPatch = installPptxRtlCompatibility;",
    context
  );
  assert.equal(context.installPatch(), true);

  const adapter = new window.CanvasGraphicsAdapter();
  const bounds = adapter.t("سلام دنیا", 100, 50, true);
  assert.deepEqual(bounds, { x: 100, y: 41, r: 142, b: 53 });
  assert.equal(calls.filter(call => call[0] === "fillText").length, 1);
  assert.deepEqual(calls.find(call => call[0] === "fillText"), [
    "fillText", "سلام دنیا", 100, 50, "rtl", "left"
  ]);
  assert.equal(adapter._context.fillStyle, "#000");
  assert.equal(adapter._context.direction, "ltr");
  assert.equal(adapter._context.textAlign, "start");

  const before = calls.length;
  assert.equal(adapter.t("English", 10, 20, false), "original-result");
  assert.equal(calls.slice(before).some(call => call[0] === "original"), true);
  assert.equal(context.installPatch(), true, "patch installation must be idempotent");
});

test("the preview installs the adapter patch after the ESM module loads", () => {
  assert.match(source, /await import\(["']https:\/\/cdn\.jsdelivr\.net\/npm\/pptxviewjs@/);
  assert.match(source, /installPptxRtlCompatibility\(\);[\s\S]*?new Viewer/);
});
