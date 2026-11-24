import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNaviVisionImage, normalizeNaviVisionImages } from "../modules/navi-image.js";

const image = data => ({ mimeType: "image/jpeg", data });

test("multi-image validator accepts an empty list and one valid image", () => {
  assert.deepEqual(normalizeNaviVisionImages(undefined), []);
  assert.deepEqual(normalizeNaviVisionImages([]), []);
  assert.equal(normalizeNaviVisionImages([image("AAAA")]).length, 1);
});

test("multi-image validator accepts up to six individually valid images", () => {
  const result = normalizeNaviVisionImages(Array.from({ length: 6 }, () => image("AAAA")));
  assert.equal(result.length, 6);
  assert.ok(result.every(item => item.inlineData.mimeType === "image/jpeg"));
});

test("multi-image validator rejects more than six images", () => {
  assert.throws(() => normalizeNaviVisionImages(Array.from({ length: 7 }, () => image("AAAA"))), /۶ تصویر/);
});

test("multi-image validator rejects invalid entries and mixed empty entries", () => {
  assert.throws(() => normalizeNaviVisionImages([image("AAAA"), { mimeType: "image/png", data: "AAAA" }]), /JPEG/);
  assert.throws(() => normalizeNaviVisionImages([image("AAAA"), null]), /خالی یا نامعتبر/);
});

test("multi-image validator enforces the aggregate payload limit", () => {
  const large = "A".repeat(1500000);
  assert.throws(() => normalizeNaviVisionImages(Array.from({ length: 6 }, () => image(large)).concat(image("AAAA"))), /۶ تصویر/);
  assert.throws(() => normalizeNaviVisionImages([image(large), image(large), image(large), image(large), image(large), image("AAAA")]), /مجموع تصاویر/);
  assert.equal(normalizeNaviVisionImage(image("AAAA")).inlineData.data, "AAAA");
});
