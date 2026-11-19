import test from "node:test";
import assert from "node:assert/strict";

import {
  guardNaviOfficeReply,
  isExplicitOfficeEditRequest,
  normalizeNaviOfficeAction
} from "../modules/navi.js";

test("PowerPoint paragraph rewrite accepts exact slide targets and complete replacement text", () => {
  const action = normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [
      { slide: 2, find: "Original paragraph", replace: "متن ترجمه‌شده" },
      { slide: 4, find: "Second paragraph", replace: "بازنویسی دوم" }
    ]
  });
  assert.deepEqual(action, {
    kind: "edit_slide_text",
    edits: [
      { slide: 2, find: "Original paragraph", replace: "متن ترجمه‌شده" },
      { slide: 4, find: "Second paragraph", replace: "بازنویسی دوم" }
    ]
  });
});

test("PowerPoint paragraph rewrite rejects invalid slides, empty targets and oversized batches", () => {
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [{ slide: 0, find: "Text", replace: "ترجمه" }]
  }), null);
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [{ slide: 1, find: " ", replace: "ترجمه" }]
  }), null);
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: Array.from({ length: 11 }, (_, index) => ({
      slide: index + 1, find: "Text " + index, replace: "متن " + index
    }))
  }), null);
});

test("PowerPoint translation and rewriting requests require the current user-turn marker", () => {
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن اسلاید ۲ را به فارسی ترجمه کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: این پاراگراف را بازنویسی کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن این بخش را فارسی کن"), true);
  assert.equal(isExplicitOfficeEditRequest("متن اسلاید ۲ را به فارسی ترجمه کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید ۲ را فقط بررسی کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن اسلاید دوم رو جایگزین کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید دوم رو با متن جدید عوض کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: لطفاً جایگزینی متن اسلاید دوم رو انجام بده"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: جایگزینی متن اسلاید دوم یعنی چه؟"), false);
});


test("Office edit guard uses format-neutral wording when a proposal is not authorized", () => {
  const reply = guardNaviOfficeReply("کارت تأیید ویرایش پاورپوینت آماده است.", false);
  assert.match(reply, /جزئیات کافی برای ساخت عملیات ویرایش/);
  assert.doesNotMatch(reply, /سلول|اکسل|شیت/);
});

test("Office edit guard preserves an authorized PowerPoint approval response", () => {
  const reply = "کارت تأیید ویرایش پاورپوینت آماده است.";
  assert.equal(guardNaviOfficeReply(reply, true), reply);
});
