import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyNaviGeminiError,
  shouldRetryNaviGeminiError
} from "../modules/navi.js";

test("Gemini retries transient HTTP failures only", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(shouldRetryNaviGeminiError({ httpStatus: status }), true);
  }
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(shouldRetryNaviGeminiError({ httpStatus: status }), false);
  }
});

test("Gemini retries network and timeout failures", () => {
  assert.equal(shouldRetryNaviGeminiError(new TypeError("network")), true);
  const timeout = new Error("timeout");
  timeout.name = "AbortError";
  assert.equal(shouldRetryNaviGeminiError(timeout), true);
  assert.equal(shouldRetryNaviGeminiError(new Error("unknown")), false);
});

test("Gemini failure classification gives actionable Persian messages without raw provider details", () => {
  assert.equal(classifyNaviGeminiError({ name: "AbortError" }).code, "GEMINI_TIMEOUT");
  assert.equal(classifyNaviGeminiError({ httpStatus: 429 }).code, "GEMINI_RATE_LIMIT");
  assert.equal(classifyNaviGeminiError({ httpStatus: 503 }).code, "GEMINI_PROVIDER_UNAVAILABLE");
  assert.equal(classifyNaviGeminiError({ httpStatus: 401 }).code, "GEMINI_AUTH_CONFIG");
  assert.equal(classifyNaviGeminiError(new TypeError("secret text")).code, "GEMINI_NETWORK_ERROR");
  assert.doesNotMatch(classifyNaviGeminiError(new TypeError("secret text")).message, /secret text/);
});
