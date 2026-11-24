import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyNaviGeminiError,
  requestGemini,
  shouldRetryNaviGeminiError,
  shouldUseNaviVideoPlanContext,
  shouldUseNaviGeminiFallback
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

test("Gemini provider 5xx failures fall back to the alternate free-tier model", async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    if (String(url).includes("gemini-3.5-flash-lite")) {
      return new Response(JSON.stringify({
        error: { status: "UNAVAILABLE", message: "temporary provider overload" }
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({ reply: "پاسخ از مدل جایگزین" }) }]
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await requestGemini({
    apiKey: "test-key",
    systemInstruction: "Return JSON.",
    contents: [{ role: "user", parts: [{ text: "سلام" }] }],
    fetchImpl
  });

  assert.equal(result.reply, "پاسخ از مدل جایگزین");
  assert.equal(urls.length, 3, "Retry the primary model once, then try the fallback once");
  assert.equal(urls[0], urls[1]);
  assert.match(urls[2], /models\/gemini-3\.8-flash:generateContent$/);
});


test("Gemini tries the second fallback model when the first fallback is also unavailable", async () => {
  const urls = [];
  const fetchImpl = async url => {
    const value = String(url);
    urls.push(value);
    if (value.includes("gemini-3.5-flash-lite")) {
      return new Response(JSON.stringify({
        error: { status: "UNAVAILABLE", message: "primary unavailable" }
      }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    if (value.includes("gemini-3.8-flash")) {
      return new Response(JSON.stringify({
        error: { status: "UNAVAILABLE", message: "first fallback unavailable" }
      }), { status: 503, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ reply: "پاسخ از مدل دوم" }) }] }
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await requestGemini({
    apiKey: "test-key",
    systemInstruction: "Return JSON.",
    contents: [{ role: "user", parts: [{ text: "سلام" }] }],
    fetchImpl
  });

  assert.equal(result.reply, "پاسخ از مدل دوم");
  assert.equal(urls.length, 4);
  assert.match(urls[2], /models\/gemini-3\.8-flash:generateContent$/);
  assert.match(urls[3], /models\/gemini-3\.5-flash:generateContent$/);
});

test("Gemini fallback is limited to upstream 5xx failures", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(shouldUseNaviGeminiFallback({ httpStatus: status }), true);
  }
  for (const status of [400, 401, 403, 404, 429]) {
    assert.equal(shouldUseNaviGeminiFallback({ httpStatus: status }), false);
  }
});

test("Gemini does not call the fallback model for a rejected request", async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    return new Response(JSON.stringify({
      error: { status: "INVALID_ARGUMENT", message: "invalid request" }
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };

  await assert.rejects(
    requestGemini({
      apiKey: "test-key",
      systemInstruction: "Return JSON.",
      contents: [{ role: "user", parts: [{ text: "سلام" }] }],
      fetchImpl
    }),
    error => error.httpStatus === 400
  );
  assert.equal(urls.length, 1);
});


test("video scene-plan context is isolated only for explicit avPage requests", () => {
  assert.equal(shouldUseNaviVideoPlanContext({ videoPlan: true }, "avPage"), true);
  assert.equal(shouldUseNaviVideoPlanContext({ videoPlan: true }, "homePage"), false);
  assert.equal(shouldUseNaviVideoPlanContext({ videoPlan: false }, "avPage"), false);
  assert.equal(shouldUseNaviVideoPlanContext({}, "avPage"), false);
});
