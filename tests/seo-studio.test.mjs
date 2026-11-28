import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const studio = readFileSync(new URL("../seo-studio.js", import.meta.url), "utf8");

test("SEO audit accepts a bare domain before native form validation", () => {
  const input = html.match(/<input[^>]*id="seoAuditUrl"[^>]*>/)?.[0] || "";
  assert.match(input, /type="text"/);
  assert.match(input, /inputmode="url"/);
  assert.doesNotMatch(input, /type="url"/);

  const normalizeAt = studio.indexOf('if (!value.includes("://")) value = "https://" + value;');
  const validateAt = studio.indexOf("if (!form.reportValidity())");
  assert.notEqual(normalizeAt, -1, "URL normalization must exist");
  assert.notEqual(validateAt, -1, "form validity check must exist");
  assert.ok(normalizeAt < validateAt, "normalization must happen before form validity check");
});

test("SEO audit keeps explicit HTTP and HTTPS URL validation", () => {
  assert.match(studio, /new URL\(value\)/);
  assert.match(studio, /\["http:", "https:"\]\.includes\(parsedUrl\.protocol\)/);
});

test("SEO audit does not launch the generic NAVI composer when the session is missing", () => {
  const authBranch = studio.indexOf('if (!token) {', studio.indexOf('const token = config?.getToken?.();'));
  const nextBranch = studio.indexOf('auditBusy = true;', authBranch);
  assert.notEqual(authBranch, -1, "SEO authentication guard must exist");
  assert.notEqual(nextBranch, -1, "authenticated audit path must remain available");
  const guard = studio.slice(authBranch, nextBranch);
  assert.match(guard, /برای شروع تحلیل فنی، ابتدا از دکمه/);
  assert.doesNotMatch(guard, /openNaviAssistant/);
  assert.match(guard, /return;/);
});

test("SEO form remains an independent URL-only form", () => {
  const seoForm = html.match(/<form id="seoAuditForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.ok(seoForm, "SEO audit form must exist");
  assert.match(seoForm, /id="seoAuditUrl"/);
  assert.doesNotMatch(seoForm, /studioBrief|userRequest|navi/i);
  assert.match(studio, /fetch\(config\.apiBase \+ "\/seo-audit"/);
});
