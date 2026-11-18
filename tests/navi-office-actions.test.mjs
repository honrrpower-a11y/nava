import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeNaviOfficeAction,
  parseNaviGeminiResponse,
  isExplicitOfficeEditRequest,
  extractNaviExplicitExcelEditAction
} from "../modules/navi.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const fileReader = readFileSync(new URL("../office-file-tools.js", import.meta.url), "utf8");

test("NAVI accepts only bounded exact text replacement actions", () => {
  assert.deepEqual(normalizeNaviOfficeAction({
    kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید"
  }), { kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید" });
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"",replace:"x"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x".repeat(501),replace:"y"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x",replace:"y".repeat(501)}), null);
});

test("NAVI accepts only bounded plain Excel cell edits", () => {
  const valid = {kind:"edit_cells",edits:[{sheet:"فروش",cell:"B5",value:200},{sheet:"فروش",cell:"C5",value:"پرداخت شد"}]};
  assert.deepEqual(normalizeNaviOfficeAction(valid), valid);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:Array.from({length:21},(_,i)=>({sheet:"S",cell:"A"+(i+1),value:i}))}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:"=SUM(A1:A2)"}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A0",value:1}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:1},{sheet:"S",cell:"A1",value:2}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:"x".repeat(501)}]}), null);
});

test("NAVI accepts only bounded plain append-row actions", () => {
  const action = {kind:"append_row",sheet:"آزمایش NAVI",values:["مسئول پروژه","مدیر آزمایش"]};
  assert.deepEqual(normalizeNaviOfficeAction(action), action);
  assert.equal(normalizeNaviOfficeAction({kind:"append_row",sheet:"",values:["x"]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"append_row",sheet:"S",values:[]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"append_row",sheet:"S",values:["=SUM(A1:A2)"]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"append_row",sheet:"S",values:Array(21).fill("x")}), null);
});

test("unknown action kinds and executable payloads are rejected", () => {
  assert.equal(normalizeNaviOfficeAction({kind:"run_javascript",code:"alert(1)"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"delete_file",path:"/"}), null);
});

test("Gemini parser exposes only normalized Office actions", () => {
  const parsed = parseNaviGeminiResponse(JSON.stringify({
    reply:"پیشنهاد آماده است.",
    memoryProposals:[],
    officeAction:{kind:"replace_text",find:"قدیمی",replace:"جدید"}
  }));
  assert.deepEqual(parsed.officeAction,{kind:"replace_text",find:"قدیمی",replace:"جدید"});
  const rejected = parseNaviGeminiResponse(JSON.stringify({
    reply:"پاسخ",
    officeAction:{kind:"execute_code",code:"bad"}
  }));
  assert.equal(rejected.officeAction,null);
  assert.equal(parseNaviGeminiResponse(JSON.stringify({reply:"پاسخ"})).officeAction,null);
});

test("only explicit edit language in the current user message passes the intent gate", () => {
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: در سلول B5 عدد ۲۰۰ را قرار بده"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: عبارت قدیمی را با عبارت جدید عوض کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: این فایل را خلاصه کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: لطفاً درباره فرمول SUM توضیح بده"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: ویرایش این سند چیست؟"), false);
});

test("append-row approvals are rendered and only execute after confirmation", () => {
  const render = app.slice(app.indexOf("function renderNaviOfficeAction"), app.indexOf("// Select only NAVI response text"));
  assert.match(render, /"append_row"/);
  assert.match(render, /action\.values\.map/);
  assert.match(editor, /action\?\.kind==="append_row"/);
  assert.match(editor, /sheet\["!ref"\]=XLSX\.utils\.encode_range/);
  assert.match(editor, /download\(new Blob\(\[bytes\]/);
});

test("browser never executes an action while rendering; execution is click-confirmed", () => {
  const render = app.slice(app.indexOf("function renderNaviOfficeAction"), app.indexOf("// Select only NAVI response text"));
  assert.match(render, /confirm\.addEventListener\("click"/);
  assert.match(render, /window\.NavaOfficeTools\.executeAction\(action\)/);
  assert.ok(render.indexOf('confirm.addEventListener("click"') < render.indexOf("executeAction(action)"));
  assert.match(render, /confirm\.disabled\s*=\s*!file\?\.ready/);
});

test("local editor binds actions to the same active file and preserves the original", () => {
  assert.match(editor, /selected!==sourceFile/);
  assert.match(editor, /window\.NavaOfficeTools\s*=\s*\{/);
  assert.match(editor, /download\(new Blob\(\[bytes\]/);
  assert.match(editor, /فایل اصلی دست‌نخورده ماند/);
  assert.match(editor, /if\(!count\)throw new Error/);
});

test("NAVI does not seed a fabricated B3 edit example in its Office prompt", () => {
  const worker = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /IMPORTANT POSITIVE EXAMPLE/);
  assert.doesNotMatch(worker, /"sheet": "آزمایش NAVI", "cell": "B3", "value": "تأیید شد"/);
});

test("NAVI suppresses model-written edit confirmations without current-user authorization", async () => {
  const { guardNaviOfficeReply } = await import("../modules/navi.js");
  const fabricated = "درخواست ویرایش سلول B3 در شیت «آزمایش NAVI» به «تست موفق» آماده است. برای اعمال تغییرات در فایل اکسل، لطفاً کارت تأیید را بررسی کنید.";
  const guarded = guardNaviOfficeReply(fabricated, false);
  assert.match(guarded, /درخواست مشخصی برای تغییر سلول وجود ندارد/);
  assert.doesNotMatch(guarded, /B3|تست موفق|کارت تأیید/);
  assert.equal(guardNaviOfficeReply("سلام، چطور می‌توانم کمک کنم؟", false), "سلام، چطور می‌توانم کمک کنم؟");
  assert.equal(guardNaviOfficeReply(fabricated, true), fabricated);
});


test("explicit Excel edit instruction gets a deterministic action when Gemini omits it", () => {
  const message = "پیام کاربر: در شیت «آزمایش NAVI»، مقدار سلول B3 را از «در حال بررسی» به «تأیید شد» تغییر بده.";
  assert.deepEqual(extractNaviExplicitExcelEditAction(message), {
    kind: "edit_cells",
    edits: [{ sheet: "آزمایش NAVI", cell: "B3", value: "تأیید شد" }]
  });
});

test("natural Persian Excel edit variants create a proposal only with an explicit sheet, cell and quoted value", () => {
  const expected = (value) => ({
    kind: "edit_cells",
    edits: [{ sheet: "آزمایش NAVI", cell: "B3", value }]
  });
  assert.deepEqual(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «آزمایش NAVI»، سلول B3 را به «تأیید شد» تغییر بده."),
    expected("تأیید شد")
  );
  assert.deepEqual(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «آزمایش NAVI» مقدار سلول B3 را «تأیید شد» قرار بده."),
    expected("تأیید شد")
  );
  assert.deepEqual(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «آزمایش NAVI»، سلول B3 را روی «تأیید شد» تنظیم کن."),
    expected("تأیید شد")
  );
  assert.equal(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «آزمایش NAVI»، سلول B3 را به تأیید شد تغییر بده."),
    null
  );
  assert.equal(
    extractNaviExplicitExcelEditAction("پیام کاربر: سلول B3 را به «تأیید شد» تغییر بده."),
    null
  );
});

test("concise Persian Excel edits accept explicit numeric values and common wording", () => {
  const expected = {
    kind: "edit_cells",
    edits: [{ sheet: "فروش", cell: "B2", value: 250 }]
  };
  const message = "پیام کاربر: در شیت «فروش» سلول B2 رو ۲۵۰ کن";
  assert.equal(isExplicitOfficeEditRequest(message), true);
  assert.deepEqual(extractNaviExplicitExcelEditAction(message), expected);

  assert.deepEqual(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «فروش» مقدار سلول C3 را به 125.5 تغییر بده"),
    { kind: "edit_cells", edits: [{ sheet: "فروش", cell: "C3", value: 125.5 }] }
  );
  assert.equal(
    extractNaviExplicitExcelEditAction("پیام کاربر: در شیت «فروش» سلول B2 رو متن جدید کن"),
    null
  );
});

test("an explicit Persian append-row request creates a bounded approval action for the unique workbook sheet", () => {
  const message = [
    "شیت‌های فایل فعال (از فایل بارگذاری‌شده): [\"آزمایش NAVI\"]",
    "پیام کاربر: افزودن ردیف «مسئول پروژه» / «مدیر آزمایش» به انتهای جدول"
  ].join("\n");
  assert.equal(isExplicitOfficeEditRequest(message), true);
  assert.deepEqual(extractNaviExplicitExcelEditAction(message), {
    kind: "append_row",
    sheet: "آزمایش NAVI",
    values: ["مسئول پروژه", "مدیر آزمایش"]
  });
  const ambiguous = [
    "شیت‌های فایل فعال (از فایل بارگذاری‌شده): [\"اول\",\"دوم\"]",
    "پیام کاربر: افزودن ردیف «مسئول پروژه» / «مدیر آزمایش» به انتهای جدول"
  ].join("\n");
  assert.equal(extractNaviExplicitExcelEditAction(ambiguous), null);
});

test("the exact Persian B3 edit instruction creates the expected Office approval action", () => {
  const message = "پیام کاربر: در شیت «آزمایش NAVI»، مقدار سلول B3 را به «تست موفق» تغییر بده.";
  assert.equal(isExplicitOfficeEditRequest(message), true);
  assert.deepEqual(extractNaviExplicitExcelEditAction(message), {
    kind: "edit_cells",
    edits: [{ sheet: "آزمایش NAVI", cell: "B3", value: "تست موفق" }]
  });
});

test("Excel edits with the cell and value before the sheet create an approval action in NAVI chat", () => {
  const expected = { kind: "edit_cells", edits: [{ sheet: "آزمایش NAVI", cell: "B3", value: "تست موفق" }] };
  const variants = [
    "پیام کاربر: مقدار سلول B3 را به «تست موفق» در شیت «آزمایش NAVI» تغییر بده.",
    "پیام کاربر: سلول B3 را به «تست موفق» در شیت «آزمایش NAVI» تغییر بده.",
  ];
  for (const message of variants) assert.deepEqual(extractNaviExplicitExcelEditAction(message), expected);
});

test("assistant-style proposal text is not treated as user authorization", () => {
  const proposal = "پیشنهاد تغییر مقدار سلول B3 در شیت «آزمایش NAVI» به «تأیید شد» آماده است. برای اعمال این تغییر روی فایل، آن را تأیید کن.";
  assert.equal(extractNaviExplicitExcelEditAction(proposal), null);
  assert.equal(extractNaviExplicitExcelEditAction("متن فایل: در شیت «آزمایش NAVI»، مقدار سلول B3 را از «در حال بررسی» به «تأیید شد» تغییر بده."), null);
  assert.equal(extractNaviExplicitExcelEditAction("پیام کاربر: این فایل را خلاصه کن."), null);
});


test("Office-context requests are sent to the Office route even from the global NAVI chat", () => {
  assert.match(app, /const officeRequestContext =\s*requestContext\?\.service === officeService\s*\|\|\s*naviAssistantContext\?\.service === officeService\s*\|\|\s*selectedService === officeService\s*\|\|\s*activePageId === "officePage"/);
  assert.match(app, /const requestPage = options\.pageOverride === "officePage"[\s\S]*?\? "officePage"[\s\S]*?: officeRequestContext \? "officePage" : activePageId/);
  assert.match(app, /page: requestPage,/);
});

test("Office form submissions route approval cards to NAVI chat while direct chat keeps its chat slot", () => {
  assert.match(app, /const chatSlot = document\.getElementById\("naviOfficeActionChatSlot"\)/);
  assert.match(app, /const slot = options\.target === "office"[\s\S]*?\? \(officeSlot \|\| chatSlot\)/);
  assert.match(html, /id="naviOfficeActionChatSlot"/);
  assert.match(app, /renderNaviOfficeAction\(data\.officeAction,\s*\{\s*target:\s*options\.officeTarget\s*\?\s*"office"\s*:\s*"chat"\s*\}\)/);
  assert.doesNotMatch(app, /if \(data\.officeAction && requestPage === "officePage"[\s\S]{0,220}showPage\("officePage"\)/);
});

test("deterministic Excel proposals are derived on every NAVI chat page while model text replacement stays Office-only", () => {
  const worker = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.ok(worker.includes('const currentUserTurn = "پیام کاربر: " + message;'));
  assert.match(worker, /const deterministicOfficeAction = extractNaviExplicitExcelEditAction\(currentUserTurn\);/);
  assert.match(worker, /const explicitOfficeEdit = page === "officePage" && isExplicitOfficeEditRequest\(currentUserTurn\);/);
  assert.ok(worker.includes('let officeAction = deterministicOfficeAction ||'));
  assert.ok(worker.includes('parsed.officeAction?.kind === "replace_text"'));
  assert.match(worker, /guardNaviOfficeReply\(\s*parsed\.reply,\s*Boolean\(officeAction\)\s*\)/);
});


test("Office context in the global NAVI chat consistently selects the Office route and prompt", () => {
  assert.match(app, /const officeRequestContext =\s*requestContext\?\.service === officeService\s*\|\|\s*naviAssistantContext\?\.service === officeService\s*\|\|\s*selectedService === officeService\s*\|\|\s*activePageId === "officePage"/);
  assert.match(app, /const promptService = officeRequestContext \? officeService : selectedService/);
  assert.match(app, /officeRequestContext\s*\? "راهنمای اجرای Office:/);
  assert.match(app, /const requestPage = options\.pageOverride === "officePage"[\s\S]*?\? "officePage"[\s\S]*?: officeRequestContext \? "officePage" : activePageId/);
  assert.match(app, /page: requestPage,/);
});

test("Office approval card can render in NAVI chat without requiring the hidden Office host", () => {
  const render = app.slice(app.indexOf("function renderNaviOfficeAction"), app.indexOf("// Select only NAVI response text"));
  assert.ok(render.includes("? (officeSlot || chatSlot)"));
  assert.ok(render.includes("if (!officeResultTarget && !slot)"));
  assert.ok(!render.includes("if (!officeResultTarget && (!host || !slot))"));
  assert.ok(render.includes("if (!officeResultTarget && !slot)"));
});


test("the Worker adds the current-user delimiter before authorizing an Office edit", () => {
  const worker = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.match(worker, /const currentUserTurn = "پیام کاربر: " \+ message/);
  assert.match(worker, /isExplicitOfficeEditRequest\(currentUserTurn\)/);
  assert.match(worker, /extractNaviExplicitExcelEditAction\(currentUserTurn\)/);
});

test("Excel parser checks the marked current turn before parsing its extracted user text", () => {
  const worker = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.match(worker, /if \(!isExplicitOfficeEditRequest\(text\)\) return null/);
});


test("guided Office requests submit directly and keep approval cards in the NAVI conversation", () => {
  const guide = readFileSync(new URL("../office-navi-guide.js", import.meta.url), "utf8");
  assert.match(guide, /window\.sendOfficeNaviRequest\(\{ message, context \}\)/);
  assert.doesNotMatch(guide, /window\.openNaviAssistant\(/);
  assert.match(app, /window\.sendOfficeNaviRequest = function/);
  assert.doesNotMatch(app, /document\.getElementById\("officeOperationsTab"\)\?\.click\(\)/);
  assert.match(app, /pageOverride: "officePage"/);
  assert.match(app, /officeTarget: false/);
  assert.match(app, /target:\s*options\.officeTarget\s*\?\s*"office"\s*:\s*"chat"/);
  assert.match(app, /if \(!getNaviToken\(\)\)[\s\S]*?window\.openNaviAssistant\(\{ service, context: officeContext, message: cleanMessage \}\)/);
});


test("single-sheet workbook metadata resolves the user's exact sheetless Persian B3 request", () => {
  const message = 'شیت‌های فایل فعال (از فایل بارگذاری‌شده): ["آزمایش NAVI"]\n\nپیام کاربر: در فایل آزمایشی NAVI مقدار سلول B3 را به تایید شد تغییر بده';
  assert.deepEqual(extractNaviExplicitExcelEditAction(message), {
    kind: "edit_cells",
    edits: [{ sheet: "آزمایش NAVI", cell: "B3", value: "تایید شد" }]
  });
});

test("sheetless Excel requests stay unapproved when workbook sheet metadata is missing or ambiguous", () => {
  const request = "پیام کاربر: در فایل آزمایشی NAVI مقدار سلول B3 را به تایید شد تغییر بده";
  assert.equal(extractNaviExplicitExcelEditAction(request), null);
  assert.equal(
    extractNaviExplicitExcelEditAction('شیت‌های فایل فعال (از فایل بارگذاری‌شده): ["آزمایش NAVI","گزارش"]\n\n' + request),
    null
  );
});

test("active Office file metadata exposes only real workbook sheet names", () => {
  assert.match(readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8"),
    /sheetNames:ready&&kind==="xlsx"&&Array\.isArray\(workbook\?\.SheetNames\)\?\[\.\.\.workbook\.SheetNames\]:\[\]/);
  assert.match(app, /activeOfficeFileInfo\.sheetNames/);
  assert.match(app, /شیت‌های فایل فعال \(از فایل بارگذاری‌شده\):/);
});


test("Office operations contains the real NAVI chat inline and removes the separate blank-chat button", () => {
  assert.match(html, /class="office-assistant-column"[\s\S]*?id="officeNaviInlineMount"/);
  assert.doesNotMatch(html, /id="officeOperationsPane"[\s\S]*?id="officeNaviInlineMount"/);
  assert.match(html, /id="officeNaviInlineMount"[^>]*aria-live="polite"/);
  assert.doesNotMatch(html, /id="officeOpenBlankNavi"/);
  assert.match(html, /id="naviWidgetHomeSlot"/);
  assert.match(app, /function syncNaviWidgetPlacement\(pageId\)/);
  assert.match(app, /mount\.appendChild\(naviWidgetPanel\)/);
  assert.match(app, /homeSlot\.parentNode\.insertBefore\(naviWidgetPanel, homeSlot\.nextSibling\)/);
  assert.match(app, /naviWidgetPanel\.classList\.contains\("is-inline"\)/);
  assert.match(html, /app\.js\?v=office-inline-navi-chat-20261118-1/);
  assert.match(css, /\.navi-widget-panel\.is-inline/);
});

test("Office chat preserves NAVI authentication, chat route, and approval card rendering", () => {
  assert.match(app, /window\.sendOfficeNaviRequest = function/);
  assert.match(app, /pageOverride: "officePage"/);
  assert.match(app, /officeTarget: false/);
  assert.match(app, /naviWidgetPanel\.hidden = !isOpen/);
  assert.match(app, /officeReopen\.hidden = !inlineOffice \|\| isOpen/);
  assert.match(app, /document\.body\.classList\.toggle\("navi-widget-open", isOpen && !inlineOffice\)/);
  assert.doesNotMatch(app, /officeBriefForm\?\.addEventListener\("submit"/);
});


test("Office is split into separate accessible guidance and operations tabs", () => {
  assert.match(html, /role="tablist"[^>]*aria-label="بخش‌های استودیوی آفیس"/);
  assert.match(html, /id="officeGuideTab"[^>]*aria-selected="true"[^>]*aria-controls="officeGuidePane"/);
  assert.match(html, /id="officeOperationsTab"[^>]*aria-selected="false"[^>]*aria-controls="officeOperationsPane"/);
  assert.match(html, /id="officeGuidePane" role="tabpanel"[^>]*aria-labelledby="officeGuideTab"/);
  assert.match(html, /id="officeOperationsPane" role="tabpanel"[^>]*hidden/);
  assert.match(html, /id="officeGuidePane"[\s\S]*?id="officeNaviGuideTitle"/);
  assert.match(html, /id="officeOperationsPane"[\s\S]*?id="officeBriefForm"/);
  assert.match(html, /id="officeOperationsPane"[\s\S]*?id="officeNaviInlineMount"/);
  assert.doesNotMatch(html, /id="officeOpenBlankNavi"/);
  assert.match(app, /const activateOfficeTab = \(name, focus = false\)/);
  assert.match(app, /activateOfficeTab\("guide"\)/);
  assert.match(app, /event\.key !== "ArrowLeft" && event\.key !== "ArrowRight"/);
});
