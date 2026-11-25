import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeNaviNavigation, parseNaviGeminiResponse, buildSystemInstruction } from "../modules/navi.js";

test("homepage routes only to implemented studio pages", () => {
  const cases = [
    ["logoPage", "طراحی لوگو"],
    ["brandPage", "برندینگ"],
    ["contentPage", "تولید محتوا"],
    ["storyPage", "استوری‌ساز"],
    ["articlePage", "مقاله و وبلاگ"],
    ["officePage", "کارهای آفیس"],
    ["composePage", "آهنگ‌سازی و نت‌نویسی"],
    ["avPage", "ویدئو و صدا"],
    ["seoPage", "سئو"],
    ["adsPage", "تبلیغات"],
    ["bizPage", "کسب‌وکار"]
  ];
  for (const [pageId, studioName] of cases) {
    assert.deepEqual(normalizeNaviNavigation({ pageId }, "homePage"), { pageId, studioName });
  }
});

test("routing fails closed for invalid, inactive, or non-home targets", () => {
  assert.equal(normalizeNaviNavigation({ pageId: "musicPage" }, "homePage"), null);
  assert.equal(normalizeNaviNavigation({ pageId: "unknownPage" }, "homePage"), null);
  assert.equal(normalizeNaviNavigation({ pageId: "officePage" }, "officePage"), null);
  assert.equal(normalizeNaviNavigation(null, "homePage"), null);
  assert.equal(normalizeNaviNavigation({ pageId: 12 }, "homePage"), null);
});

test("structured NAVI response preserves only a validated route candidate", () => {
  const parsed = parseNaviGeminiResponse(JSON.stringify({
    reply: "برای این کار استودیوی آفیس مناسب است.",
    officeAction: null,
    navigation: { pageId: "officePage" },
    memoryProposals: []
  }));
  assert.equal(parsed.navigation.pageId, "officePage");
  const invalid = parseNaviGeminiResponse(JSON.stringify({
    reply: "موسیقی به‌زودی فعال می‌شود.",
    officeAction: null,
    navigation: { pageId: "musicPage" },
    memoryProposals: []
  }));
  assert.equal(invalid.navigation, null);
});

test("homepage prompt requires explicit intent and user-controlled navigation", () => {
  const prompt = buildSystemInstruction({
    page: "homePage",
    pageContext: "",
    memoryContext: "",
    conversationContext: "",
    currentUser: { role: "user", display_name: "Test" }
  });
  assert.match(prompt, /HOMEPAGE INTENT ROUTING/);
  assert.match(prompt, /navigation must never happen automatically/i);
});

test("browser renders a navigation CTA only after validating the page allowlist", () => {
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /function renderNaviNavigationSuggestion/);
  assert.match(source, /showPage\(pageId\)/);
  assert.match(source, /renderNaviNavigationSuggestion\(data\.navigation\)/);
});
