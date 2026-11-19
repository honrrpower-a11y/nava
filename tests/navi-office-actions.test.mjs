import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeNaviOfficeAction,
  parseNaviGeminiResponse,
  isExplicitOfficeEditRequest,
  extractNaviExplicitExcelEditAction,
  buildSystemInstruction
} from "../modules/navi.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const officeCss = readFileSync(new URL("../office-workspace.css", import.meta.url), "utf8");
const fileReader = readFileSync(new URL("../office-file-tools.js", import.meta.url), "utf8");
const documentExport = readFileSync(new URL("../document-export.js", import.meta.url), "utf8");

test("NAVI accepts only bounded exact text replacement actions", () => {
  assert.deepEqual(normalizeNaviOfficeAction({
    kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید"
  }), { kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید" });
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"",replace:"x"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x".repeat(501),replace:"y"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x",replace:"y".repeat(501)}), null);
});

test("NAVI accepts only explicit bounded PowerPoint deletion actions", () => {
  assert.deepEqual(normalizeNaviOfficeAction({kind:"delete_slide",slide:3}), {kind:"delete_slide",slide:3});
  assert.deepEqual(normalizeNaviOfficeAction({kind:"delete_slide_text",slide:2,find:"متن کامل پاراگراف"}), {kind:"delete_slide_text",slide:2,find:"متن کامل پاراگراف"});
  assert.equal(normalizeNaviOfficeAction({kind:"delete_slide",slide:0}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"delete_slide",slide:501}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"delete_slide_text",slide:2,find:""}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"delete_slide_text",slide:2,find:"x".repeat(3001)}), null);
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
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن اسلاید دوم رو بازنویسیش کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: لطفاً متن این فایل رو با عبارت جدید جایگزین کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: این پاراگراف رو یه مقدار اصلاح کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: کلمه جایگزین در این متن یعنی چه؟"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: تغییرات فایل را برایم توضیح بده"), false);
});

test("append-row approvals are rendered and only execute after confirmation", () => {
  const render = app.slice(app.indexOf("function renderNaviOfficeAction"), app.indexOf("// Select only NAVI response text"));
  assert.match(render, /"append_row"/);
  assert.match(render, /action\.values\.map/);
  assert.match(editor, /action\?\.kind==="append_row"/);
  assert.match(editor, /sheet\["!ref"\]=XLSX\.utils\.encode_range/);
  assert.match(editor, /download\(blob,/);
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
  assert.match(editor, /download\(blob,/);
  assert.match(editor, /نسخه اصلی بدون تغییر باقی ماند/);
  assert.match(editor, /if\(!count\)\{/);
});

test("NAVI Excel cell edits expand the worksheet range when writing outside the existing used cells", () => {
  const editBlock = editor.slice(editor.indexOf('if(action?.kind==="edit_cells")'), editor.indexOf('if(action?.kind==="append_row")'));
  assert.match(editBlock, /XLSX\.utils\.decode_range\(sheet\["!ref"\]\|\|item\.cell\)/);
  assert.match(editBlock, /XLSX\.utils\.decode_cell\(item\.cell\)/);
  assert.match(editBlock, /range\.e\.r=Math\.max\(range\.e\.r,target\.r\)/);
  assert.match(editBlock, /range\.e\.c=Math\.max\(range\.e\.c,target\.c\)/);
  assert.match(editBlock, /sheet\["!ref"\]=XLSX\.utils\.encode_range\(range\)/);
});

test("Office prompt defines safe PowerPoint slide and text deletion actions", () => {
  const prompt = buildSystemInstruction({
    page: "officePage", pageContext: "فایل پاورپوینت فعال", memoryContext: "",
    conversationContext: "", currentUser: { role: "owner", display_name: "مالک" }
  });
  assert.match(prompt, /"kind": "delete_slide"[\s\S]*?"slide": 2/);
  assert.match(prompt, /"kind": "delete_slide_text"[\s\S]*?"find": "Exact complete source paragraph/);
  assert.match(prompt, /Deleting the last remaining/);
});

test("Office prompt defines a non-null structured PowerPoint action schema", () => {
  const worker = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.match(worker, /"kind": "edit_slide_text"[\s\S]*?"slide": 2[\s\S]*?"find": "Exact complete source paragraph[\s\S]*?"replace": "Complete translated or rewritten paragraph"/);
  assert.match(worker, /return a valid edit_slide_text object; do NOT return officeAction:null/);
  assert.match(worker, /officeAction:null is for requests that do not authorize an edit/);
});

test("PowerPoint slide and paragraph deletion requests require explicit current-turn authorization", () => {
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید سوم را حذف کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن پاراگراف دوم اسلاید سوم را حذف کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: چطور می‌توانم یک اسلاید را حذف کنم؟"), false);
});

test("PowerPoint deletion reads XML attribute values from the first capture group", () => {
  assert.match(editor, /return match\?match\[1\]:"";/);
});

test("PowerPoint deletion actions are supported by the approval card and local editor", () => {
  assert.match(app, /"delete_slide", "delete_slide_text"/);
  assert.match(app, /حذف کامل اسلاید شماره/);
  assert.match(app, /فقط پاراگراف کامل و دقیق مشخص‌شده حذف می‌شود/);
  assert.match(editor, /action\?\.kind==="delete_slide"\|\|action\?\.kind==="delete_slide_text"/);
  assert.match(editor, /برای جلوگیری از ساخت ارائه خالی، حذف آخرین اسلاید مجاز نیست/);
  assert.match(editor, /متن کامل و دقیق در اسلاید/);
});

test("PowerPoint translation preview is not edit authorization, but explicit replacement follow-up is", () => {
  assert.equal(
    isExplicitOfficeEditRequest("پیام کاربر: اسلاید دوم را به فارسی ترجمه کن و نشانم بده"),
    false
  );
  assert.equal(
    isExplicitOfficeEditRequest("پیام کاربر: متن فارسی را جایگزین متن اصلی کن"),
    true
  );
  assert.equal(
    isExplicitOfficeEditRequest("پیام کاربر: این ترجمه را جایگزین متن اصلی کن"),
    true
  );
  assert.equal(
    isExplicitOfficeEditRequest("پیام کاربر: ترجمه اسلاید دوم را برای فهمیدن نشانم بده"),
    false
  );
});

test("PowerPoint prompt uses prior translation only to resolve an explicitly authorized replacement", () => {
  const prompt = buildSystemInstruction({
    page: "officePage",
    pageContext: "فایل پاورپوینت فعال",
    memoryContext: "",
    conversationContext: "[پیام قبلی کاربر] اسلاید دوم را به فارسی ترجمه کن و نشانم بده\\n[پاسخ قبلی ناوی] ترجمه اسلاید دوم...",
    currentUser: { role: "owner", display_name: "مالک" }
  });
  assert.match(prompt, /اسلاید دوم را به فارسی ترجمه کن و نشانم بده/);
  assert.match(prompt, /متن فارسی را جایگزین متن اصلی کن/);
  assert.match(prompt, /current replacement/);
  assert.match(prompt, /instruction is the authorization/);
  assert.match(prompt, /currently attached/);
  assert.match(prompt, /officeAction:null/);
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
  assert.match(guarded, /جزئیات کافی برای ساخت عملیات ویرایش وجود ندارد/);
  assert.doesNotMatch(guarded, /سلول|اکسل|شیت/);
  assert.doesNotMatch(guarded, /B3|تست موفق|کارت تأیید/);
  assert.equal(guardNaviOfficeReply("سلام، چطور می‌توانم کمک کنم؟", false), "سلام، چطور می‌توانم کمک کنم؟");
  const falseSlideClaim = "ترجمه متن اسلاید دوم به زبان فارسی آماده شد. با تأیید کارت زیر، تغییرات مورد نظر روی فایل اعمال خواهد شد.";
  assert.match(guardNaviOfficeReply(falseSlideClaim, false), /جزئیات کافی برای ساخت عملیات ویرایش وجود ندارد/);
  assert.equal(guardNaviOfficeReply(falseSlideClaim, true), falseSlideClaim);
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
  assert.match(worker, /\["replace_text", "edit_slide_text", "delete_slide", "delete_slide_text"\]\.includes\(parsed\.officeAction\?\.kind\)/);
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
  const operationsStart = html.indexOf('id="officeOperationsPane"');
  const assistantStart = html.indexOf('<aside class="office-assistant-column"');
  assert.ok(assistantStart > operationsStart);
  assert.match(html.slice(operationsStart, assistantStart), /<\/div>\s*<\/div>\s*<\/div>\s*$/);
  assert.match(html, /id="officeNaviInlineMount"[^>]*aria-live="polite"/);
  assert.doesNotMatch(html, /id="officeOpenBlankNavi"/);
  assert.match(html, /id="naviWidgetHomeSlot"/);
  assert.match(app, /function syncNaviWidgetPlacement\(pageId\)/);
  assert.match(app, /mount\.appendChild\(naviWidgetPanel\)/);
  assert.match(app, /homeSlot\.parentNode\.insertBefore\(naviWidgetPanel, homeSlot\.nextSibling\)/);
  assert.match(app, /naviWidgetPanel\.classList\.contains\("is-inline"\)/);
  assert.match(html, /app\.js\?v=office-pptx-paragraph-edit-20261119-3/);
  assert.match(html, /office-workspace\.css\?v=office-back-to-top-20261118-1/);
  assert.match(officeCss, /\.office-workspace-layout/);
  assert.match(officeCss, /body\.navi-studio-context \.office-assistant-column \.navi-widget-panel\.is-inline/);
  assert.match(officeCss, /@media\(max-width:600px\)/);
});

test("Office chat preserves NAVI authentication, chat route, and approval card rendering", () => {
  assert.match(app, /window\.sendOfficeNaviRequest = function/);
  assert.match(app, /pageOverride: "officePage"/);
  assert.match(app, /officeTarget: false/);
  assert.match(app, /naviWidgetPanel\.hidden = !isOpen/);
  assert.match(app, /officeReopen\.hidden = !inlineOffice \|\| isOpen/);
  assert.match(html, /id="officeNaviReopen"[^>]*hidden/);
  assert.match(app, /if \(!hasSession && !inlineOffice\)/);
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
  assert.match(html, /class="office-assistant-column"[\s\S]*?id="officeNaviInlineMount"/);
  const operationsStart = html.indexOf('id="officeOperationsPane"');
  const assistantStart = html.indexOf('<aside class="office-assistant-column"');
  assert.ok(assistantStart > operationsStart);
  assert.match(html.slice(operationsStart, assistantStart), /<\/div>\s*<\/div>\s*<\/div>\s*$/);
  assert.doesNotMatch(html, /id="officeOpenBlankNavi"/);
  assert.match(app, /const activateOfficeTab = \(name, focus = false\)/);
  assert.match(app, /activateOfficeTab\("guide"\)/);
  assert.match(app, /event\.key !== "ArrowLeft" && event\.key !== "ArrowRight"/);
});


test("Office visual preview is mounted in the Office workflow and loads after the existing editors", () => {
  const preview = readFileSync(new URL("../office-preview.js", import.meta.url), "utf8");
  assert.match(html, /id="officePreviewPanel"[^>]*hidden/);
  assert.match(html, /id="officePreviewStage"/);
  assert.match(html, /id="officePreviewPrevious"/);
  assert.match(html, /id="officePreviewNext"/);
  assert.match(html, /id="officePreviewSheet"/);
  assert.match(html, /office-preview\.css\?v=office-visual-preview-/);
  assert.match(html, /office-preview\.js\?v=[^"]+/);
  assert.ok(html.indexOf('office-edit-tools.js?') < html.indexOf('office-preview.js?'));
  assert.match(preview, /renderPptx/);
  assert.match(preview, /PPTXViewer/);
  assert.match(preview, /renderPdf/);
  assert.match(preview, /pdfjsLib/);
  assert.match(preview, /renderExcel/);
  assert.match(preview, /renderWord/);
  assert.match(preview, /mammoth\.convertToHtml/);
  assert.match(preview, /safeHtmlInto/);
});

test("Office preview stays client-side and can refresh from the edited local Office model", () => {
  const preview = readFileSync(new URL("../office-preview.js", import.meta.url), "utf8");
  assert.match(preview, /URL\.createObjectURL/);
  assert.match(preview, /refreshFromEditor/);
  assert.match(editor, /async createPreviewBlob\(\)/);
  assert.match(editor, /window\.NavaOfficePreview\?\.refreshFromEditor\?\.\(\)/);
  assert.doesNotMatch(preview, /fetch\s*\(/);
  assert.doesNotMatch(preview, /XMLHttpRequest/);
});


test("PowerPoint preview imports the viewer as an ES module and resolves its named or default constructor", () => {
  const preview = readFileSync(new URL("../office-preview.js", import.meta.url), "utf8");
  assert.ok(preview.includes('await import("https://cdn.jsdelivr.net/npm/pptxviewjs@1.1.9/+esm?office-preview=20261119-4")'));
  assert.ok(preview.includes("pptxModule.PPTXViewer"));
  assert.ok(preview.includes("pptxModule.default?.PPTXViewer"));
  assert.ok(preview.includes('find(candidate => typeof candidate === "function")'));
  assert.ok(preview.includes("new Viewer({ canvas: target })"));
  assert.ok(preview.includes("await pptxViewer.loadFile(file)"));
  assert.ok(preview.includes("await pptxViewer.render()"));
  assert.doesNotMatch(preview, /pptxViewer\.render\(target\)/);
  assert.ok(preview.includes("office-preview=20261119-4"));
});


test("PowerPoint export checks the documented PptxGenJS browser global", () => {
  assert.match(documentExport, /loadExternal\("https:\/\/cdn\.jsdelivr\.net\/npm\/pptxgenjs@3\.12\.0\/dist\/pptxgen\.bundle\.js",\s*"PptxGenJS"\)/);
  assert.match(documentExport, /const PptxGenJS=await loadExternal\([\s\S]*?\);\s*const pptx=new PptxGenJS\(\)/);
  assert.doesNotMatch(documentExport, /pptxgen\.bundle\.js",\s*"pptxgen"/);
});
