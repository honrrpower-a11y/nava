// NAVA BUSINESS — authenticated multi-business profiles and financial records.
// Business data is deliberately separate from NAVI conversation memory.

import { json, safeNaviText } from "./shared.js";
import { ALLOWED_ORIGIN } from "./config.js";
import { authorizeNaviRequest } from "./navi-auth.js";
import { handleBusinessTransactionRoute } from "./business-transactions.js";
import { handleBusinessCatalogRoute } from "./business-catalog.js";
import { handleBusinessInventoryRoute } from "./business-inventory.js";
import { handleBusinessCrmRoute } from "./business-crm.js";

const BUSINESS_TYPES = new Set(["freelancer", "store", "home_business", "small_company", "idea", "other"]);
const RECORD_TYPES = new Set(["cost_calculation", "break_even", "monthly_budget", "note"]);
const MAX_REPORT_LENGTH = 12000;
const MAX_PAYLOAD_LENGTH = 20000;

function response(data, status, corsOrigin) {
  return json({ success: status < 400, ...data }, status, corsOrigin);
}

function fail(message, status, corsOrigin) {
  return response({ error: message }, status, corsOrigin);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value, max) {
  return safeNaviText(value ?? "", max);
}

export function normalizeBusinessProfileInput(input, partial = false) {
  if (!isPlainObject(input)) return { error: "اطلاعات کسب‌وکار معتبر نیست." };
  const output = {};
  if (!partial || Object.hasOwn(input, "name")) {
    const name = clean(input.name, 120);
    if (name.length < 2) return { error: "نام کسب‌وکار باید حداقل ۲ نویسه باشد." };
    output.name = name;
  }
  if (!partial || Object.hasOwn(input, "businessType")) {
    const type = String(input.businessType || "other");
    if (!BUSINESS_TYPES.has(type)) return { error: "نوع کسب‌وکار معتبر نیست." };
    output.business_type = type;
  }
  if (!partial || Object.hasOwn(input, "industry")) {
    output.industry = clean(input.industry, 120);
  }
  if (!partial || Object.hasOwn(input, "description")) {
    output.description = clean(input.description, 1000);
  }
  if (!partial || Object.hasOwn(input, "currency")) {
    const currency = String(input.currency || "TOMAN").toUpperCase();
    if (currency !== "TOMAN") return { error: "واحد پول پرونده‌های نوا باید تومان باشد." };
    output.currency = currency;
  }
  if (!Object.keys(output).length) return { error: "هیچ فیلد معتبری برای تغییر ارسال نشده است." };
  return { value: output };
}

export function normalizeBusinessRecordInput(input) {
  if (!isPlainObject(input)) return { error: "اطلاعات گزارش معتبر نیست." };
  const recordType = String(input.recordType || "");
  if (!RECORD_TYPES.has(recordType)) return { error: "نوع گزارش معتبر نیست." };
  const title = clean(input.title || "گزارش مالی", 160);
  if (title.length < 2) return { error: "عنوان گزارش معتبر نیست." };
  const reportText = clean(input.reportText || "", MAX_REPORT_LENGTH);
  if (!reportText) return { error: "متن گزارش خالی است." };
  const periodKey = String(input.periodKey || "");
  if (periodKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
    return { error: "دوره گزارش باید به شکل سال-ماه باشد؛ مانند ۱۴۰۵-۰۸." };
  }
  const payload = input.payload === undefined ? {} : input.payload;
  if (!isPlainObject(payload)) return { error: "داده‌های محاسبه باید یک شیء معتبر باشند." };
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > MAX_PAYLOAD_LENGTH) return { error: "داده‌های گزارش بیش از حد بزرگ هستند." };
  return { value: { record_type: recordType, title, period_key: periodKey, report_text: reportText, payload_json: payloadJson } };
}

async function authorize(request, env, origin, corsOrigin) {
  if (origin !== ALLOWED_ORIGIN) {
    return { error: fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin) };
  }
  const auth = await authorizeNaviRequest(request, env);
  if (!auth.valid) {
    return { error: fail(auth.error || "برای دسترسی به پرونده کسب‌وکار وارد حساب شو.", auth.status || 401, corsOrigin) };
  }
  if (!env.NAVA_DB) return { error: fail("دیتابیس کسب‌وکار در دسترس نیست.", 503, corsOrigin) };
  return { user: auth.user };
}

async function ownsBusiness(db, businessId, ownerId) {
  return db.prepare(
    "SELECT id, owner_id, name, business_type, industry, description, currency, status, created_at, updated_at FROM business_profiles_v1 WHERE id = ? AND owner_id = ? LIMIT 1"
  ).bind(businessId, ownerId).first();
}

function publicBusiness(row) {
  return {
    id: row.id, name: row.name, businessType: row.business_type,
    industry: row.industry, description: row.description, currency: row.currency,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function listBusinesses(db, ownerId, corsOrigin) {
  const result = await db.prepare(
    "SELECT id, owner_id, name, business_type, industry, description, currency, status, created_at, updated_at FROM business_profiles_v1 WHERE owner_id = ? AND status = 'active' ORDER BY updated_at DESC, created_at DESC LIMIT 100"
  ).bind(ownerId).all();
  return response({ businesses: (result.results || []).map(publicBusiness) }, 200, corsOrigin);
}

async function createBusiness(db, ownerId, input, corsOrigin) {
  const normalized = normalizeBusinessProfileInput(input);
  if (normalized.error) return fail(normalized.error, 400, corsOrigin);
  const value = normalized.value;
  const id = "biz-" + crypto.randomUUID();
  const result = await db.prepare(
    "INSERT INTO business_profiles_v1 (id, owner_id, name, business_type, industry, description, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))"
  ).bind(id, ownerId, value.name, value.business_type, value.industry, value.description, value.currency).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Business profile insert was not confirmed.");
  const row = await ownsBusiness(db, id, ownerId);
  return response({ business: publicBusiness(row), created: true }, 201, corsOrigin);
}

async function getBusiness(db, ownerId, id, corsOrigin) {
  const row = await ownsBusiness(db, id, ownerId);
  if (!row || row.status !== "active") return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
  return response({ business: publicBusiness(row) }, 200, corsOrigin);
}

async function updateBusiness(db, ownerId, id, input, corsOrigin) {
  const current = await ownsBusiness(db, id, ownerId);
  if (!current || current.status !== "active") return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
  const normalized = normalizeBusinessProfileInput(input, true);
  if (normalized.error) return fail(normalized.error, 400, corsOrigin);
  const value = normalized.value;
  const fields = Object.keys(value);
  const assignments = fields.map(field => field + " = ?").join(", ");
  const result = await db.prepare(
    "UPDATE business_profiles_v1 SET " + assignments + ", updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'active'"
  ).bind(...fields.map(field => value[field]), id, ownerId).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Business profile update was not confirmed.");
  return getBusiness(db, ownerId, id, corsOrigin);
}

async function archiveBusiness(db, ownerId, id, corsOrigin) {
  const result = await db.prepare(
    "UPDATE business_profiles_v1 SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'active'"
  ).bind(id, ownerId).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) return fail("پرونده پیدا نشد یا قبلاً بایگانی شده است.", 404, corsOrigin);
  return response({ archived: true, businessId: id }, 200, corsOrigin);
}

export function buildBusinessAdvisorContext(business, records = []) {
  const typeLabels = {
    freelancer: "فریلنسر",
    store: "فروشگاه",
    home_business: "کسب‌وکار خانگی",
    small_company: "شرکت کوچک",
    idea: "ایده در مرحله راه‌اندازی",
    other: "سایر"
  };
  const recordLabels = {
    cost_calculation: "قیمت تمام‌شده",
    break_even: "نقطه سربه‌سر",
    monthly_budget: "بودجه ماهانه",
    note: "یادداشت مالی"
  };
  const lines = [
    "پرونده کسب‌وکار: " + safeNaviText(business.name || "بدون نام", 120),
    "نوع کسب‌وکار: " + (typeLabels[business.business_type] || "نامشخص"),
    "حوزه فعالیت: " + safeNaviText(business.industry || "ثبت نشده", 120),
    "توضیحات: " + safeNaviText(business.description || "ثبت نشده", 500),
    "واحد پول: تومان",
    "گزارش‌های مالی ذخیره‌شده (جدیدترین موارد):"
  ];
  let used = lines.join("\n").length;
  for (const record of records) {
    const report = safeNaviText(record.report_text || "", 3500);
    const payload = safeNaviText(record.payload_json || "{}", 1800);
    const section = [
      "---",
      "نوع گزارش: " + (recordLabels[record.record_type] || "گزارش مالی"),
      "عنوان: " + safeNaviText(record.title || "بدون عنوان", 120),
      "دوره: " + safeNaviText(record.period_key || "ثبت نشده", 20),
      "تاریخ ثبت: " + safeNaviText(record.created_at || "نامشخص", 40),
      "متن گزارش:",
      report || "متن گزارش موجود نیست.",
      "داده‌های ساختاریافته:",
      payload
    ].join("\n");
    if (used + section.length > 20000) break;
    lines.push(section);
    used += section.length;
  }
  if (!records.length) lines.push("هنوز هیچ گزارش مالی در این پرونده ثبت نشده است.");
  return lines.join("\n");
}

export async function loadNaviBusinessContext(db, ownerId, businessId, options = {}) {
  const business = await ownsBusiness(db, businessId, ownerId);
  if (!business || business.status !== "active") return null;

  const pageTab = String(options.pageTab || "");
  const userMessage = safeNaviText(options.message || "", 12000);
  const wantsCustomerDirectory = pageTab === "customers" ||
    /مشتری|مشتریان|مخاطب(?:ان)?/u.test(userMessage);
  const wantsCustomerContacts = wantsCustomerDirectory &&
    /شماره|تلفن|موبایل|تماس|ایمیل|آدرس|نشانی/u.test(userMessage);
  const wantsOrders = pageTab === "orders" ||
    /سفارش|سفارش‌ها|سفارشات/u.test(userMessage);
  const wantsInventory = pageTab === "inventory" ||
    /موجودی|انبار|ورود کالا|خروج کالا|گردش انبار/u.test(userMessage);

  const records = await db.prepare(
    "SELECT record_type, title, period_key, report_text, payload_json, created_at FROM business_financial_records_v1 WHERE business_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 8"
  ).bind(businessId, ownerId).all();

  let transactions = { results: [] };
  let transactionTotals = null;
  try {
    transactions = await db.prepare(
      "SELECT transaction_type, title, amount_toman, transaction_date, category, notes FROM business_transactions_v1 WHERE business_id = ? AND owner_id = ? ORDER BY transaction_date DESC, created_at DESC LIMIT 30"
    ).bind(businessId, ownerId).all();
    transactionTotals = await db.prepare(
      "SELECT COUNT(*) AS transaction_count, " +
      "COALESCE(SUM(CASE WHEN transaction_type='sale' THEN amount_toman ELSE 0 END),0) AS all_time_sales, " +
      "COALESCE(SUM(CASE WHEN transaction_type='expense' THEN amount_toman ELSE 0 END),0) AS all_time_expenses, " +
      "SUM(CASE WHEN transaction_type='sale' THEN 1 ELSE 0 END) AS sale_count, " +
      "SUM(CASE WHEN transaction_type='expense' THEN 1 ELSE 0 END) AS expense_count " +
      "FROM business_transactions_v1 WHERE business_id=? AND owner_id=?"
    ).bind(businessId, ownerId).first();
  } catch (error) {
    console.warn("[NAVA BUSINESS] Transaction ledger is not available.", error);
  }

  let catalog = { results: [] };
  try {
    catalog = await db.prepare(
      "SELECT c.item_type, c.name, c.sku, c.category, c.unit, c.sale_price_toman, c.cost_price_toman, c.track_inventory, CASE WHEN c.track_inventory = 1 THEN COALESCE((SELECT SUM(m.quantity_delta) FROM business_inventory_movements_v1 m WHERE m.catalog_item_id = c.id AND m.business_id = c.business_id AND m.owner_id = c.owner_id), 0) ELSE NULL END AS stock_quantity FROM business_catalog_items_v1 c WHERE c.business_id = ? AND c.owner_id = ? AND c.status = 'active' ORDER BY c.item_type, c.name COLLATE NOCASE LIMIT 100"
    ).bind(businessId, ownerId).all();
  } catch (error) {
    console.warn("[NAVA BUSINESS] Product/service catalogue is not available.", error);
  }

  const base = buildBusinessAdvisorContext(business, records.results || []);
  let recentSales = 0;
  let recentExpenses = 0;
  const lines = [
    "وضعیت زنده پرونده در زمان همین درخواست (واحد پول همه مبالغ: تومان):",
    "تراکنش‌های واقعی ثبت‌شده؛ جدیدترین حداکثر ۳۰ مورد:"
  ];
  for (const item of transactions.results || []) {
    const amount = Number(item.amount_toman || 0);
    if (item.transaction_type === "sale") recentSales += amount;
    if (item.transaction_type === "expense") recentExpenses += amount;
    lines.push("- " + (item.transaction_type === "sale" ? "فروش" : "هزینه") +
      " | " + safeNaviText(item.title || "", 120) +
      " | " + amount.toLocaleString("en-US") + " تومان" +
      " | تاریخ: " + safeNaviText(item.transaction_date || "", 20) +
      " | دسته: " + safeNaviText(item.category || "", 80) +
      " | توضیح: " + safeNaviText(item.notes || "", 180));
  }
  if (transactionTotals) {
    lines.push("خلاصه کل تاریخچه تراکنش‌ها (تمام رکوردهای ثبت‌شده):");
    lines.push("- تعداد کل تراکنش‌ها: " + Number(transactionTotals.transaction_count || 0).toLocaleString("en-US"));
    lines.push("- تعداد فروش‌ها: " + Number(transactionTotals.sale_count || 0).toLocaleString("en-US"));
    lines.push("- تعداد هزینه‌ها: " + Number(transactionTotals.expense_count || 0).toLocaleString("en-US"));
    lines.push("- مجموع کل فروش ثبت‌شده: " + Number(transactionTotals.all_time_sales || 0).toLocaleString("en-US") + " تومان");
    lines.push("- مجموع کل هزینه ثبت‌شده: " + Number(transactionTotals.all_time_expenses || 0).toLocaleString("en-US") + " تومان");
  } else {
    lines.push("خلاصه کامل تراکنش‌ها در دسترس نبود؛ از ارقام ناقص نتیجه قطعی نگیر.");
  }
  lines.push("- جمع فروش در ۳۰ تراکنش اخیر: " + recentSales.toLocaleString("en-US") + " تومان");
  lines.push("- جمع هزینه در ۳۰ تراکنش اخیر: " + recentExpenses.toLocaleString("en-US") + " تومان");
  if (!(transactions.results || []).length) lines.push("هنوز تراکنش واقعی فروش یا هزینه‌ای ثبت نشده است.");
  lines.push("مهم: این‌ها مبالغ فروش و هزینه ثبت‌شده‌اند؛ وضعیت وصول یا پرداخت را مشخص نمی‌کنند. تفاضل فروش و هزینه به‌تنهایی سود قطعی، مانده نقدی، طلب مشتری یا بدهی تأمین‌کننده نیست.");

  lines.push("", "کاتالوگ فعال محصولات و خدمات:");
  for (const item of catalog.results || []) {
    lines.push("- " + (item.item_type === "product" ? "محصول" : "خدمت") +
      " | " + safeNaviText(item.name || "", 140) +
      " | کد: " + safeNaviText(item.sku || "ثبت نشده", 64) +
      " | دسته: " + safeNaviText(item.category || "ثبت نشده", 80) +
      " | واحد: " + safeNaviText(item.unit || "", 32) +
      " | قیمت فروش: " + Number(item.sale_price_toman || 0).toLocaleString("en-US") + " تومان" +
      " | بهای تمام‌شده: " + (item.cost_price_toman == null ? "ثبت نشده" : Number(item.cost_price_toman).toLocaleString("en-US") + " تومان") +
      (Number(item.track_inventory || 0) === 1 ? " | موجودی انبار: " + Number(item.stock_quantity || 0).toLocaleString("en-US") + " " + safeNaviText(item.unit || "عدد", 32) : " | کنترل موجودی: فعال نیست"));
  }
  if (!(catalog.results || []).length) lines.push("در کاتالوگ هنوز محصول یا خدمت فعالی ثبت نشده است.");
  lines.push("موجودی محصولات دارای کنترل موجودی از گردش‌های ثبت‌شده محاسبه می‌شود؛ محصولات بدون کنترل موجودی تعداد انبار ثبت‌شده ندارند.");

  // CRM summaries are scoped to the authenticated owner and selected business.
  try {
    const customerCounts = await db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) AS archived FROM business_customers_v1 WHERE business_id=? AND owner_id=?"
    ).bind(businessId, ownerId).first();
    lines.push("", "خلاصه زنده مشتریان:");
    lines.push("- کل پرونده‌های مشتری: " + Number(customerCounts?.total || 0).toLocaleString("en-US"));
    lines.push("- مشتریان فعال: " + Number(customerCounts?.active || 0).toLocaleString("en-US"));
    lines.push("- مشتریان بایگانی‌شده: " + Number(customerCounts?.archived || 0).toLocaleString("en-US"));
    if (wantsCustomerDirectory) {
      const customerRows = await db.prepare(
        "SELECT name, phone, email, status, created_at FROM business_customers_v1 WHERE business_id=? AND owner_id=? ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,name COLLATE NOCASE LIMIT 100"
      ).bind(businessId, ownerId).all();
      lines.push("فهرست مشتریان (حداکثر ۱۰۰ پرونده):");
      for (const customer of customerRows.results || []) {
        lines.push("- " + safeNaviText(customer.name || "", 120) +
          " | وضعیت: " + (customer.status === "active" ? "فعال" : "بایگانی‌شده") +
          (wantsCustomerContacts ? " | تلفن: " + safeNaviText(customer.phone || "ثبت نشده", 40) + " | ایمیل: " + safeNaviText(customer.email || "ثبت نشده", 160) : ""));
      }
      if (!(customerRows.results || []).length) lines.push("هنوز مشتری‌ای در این پرونده ثبت نشده است.");
      if (!wantsCustomerContacts) lines.push("برای حفظ حداقل‌گرایی داده، جزئیات تماس مشتریان در این پاسخ بارگذاری نشده است.");
    }
  } catch (error) {
    console.warn("[NAVA BUSINESS] CRM customer context is not available.", error);
    lines.push("", "اطلاعات زنده مشتریان فعلاً قابل خواندن نبود؛ درباره تعداد یا نام مشتریان حدس نزن.");
  }

  try {
    const orderCounts = await db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS drafts, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled, COALESCE(SUM(CASE WHEN status='confirmed' THEN total_toman ELSE 0 END),0) AS confirmed_total FROM business_orders_v1 WHERE business_id=? AND owner_id=?"
    ).bind(businessId, ownerId).first();
    lines.push("", "خلاصه زنده سفارش‌ها:");
    lines.push("- کل سفارش‌ها: " + Number(orderCounts?.total || 0).toLocaleString("en-US"));
    lines.push("- پیش‌نویس‌ها: " + Number(orderCounts?.drafts || 0).toLocaleString("en-US"));
    lines.push("- تأییدشده‌ها: " + Number(orderCounts?.confirmed || 0).toLocaleString("en-US"));
    lines.push("- لغوشده‌ها: " + Number(orderCounts?.cancelled || 0).toLocaleString("en-US"));
    lines.push("- مبلغ سفارش‌های تأییدشده: " + Number(orderCounts?.confirmed_total || 0).toLocaleString("en-US") + " تومان");
    if (wantsOrders) {
      const orderRows = await db.prepare(
        "SELECT o.id,o.status,o.order_date,o.total_toman,c.name AS customer_name," +
        "(SELECT json_group_array(json_object('name',i.item_name,'quantity',i.quantity,'unitPriceToman',i.unit_price_toman,'lineTotalToman',i.line_total_toman)) FROM business_order_items_v1 i WHERE i.order_id=o.id AND i.business_id=o.business_id AND i.owner_id=o.owner_id) AS items_json " +
        "FROM business_orders_v1 o LEFT JOIN business_customers_v1 c ON c.id=o.customer_id AND c.business_id=o.business_id AND c.owner_id=o.owner_id " +
        "WHERE o.business_id=? AND o.owner_id=? ORDER BY o.order_date DESC,o.created_at DESC LIMIT 30"
      ).bind(businessId, ownerId).all();
      lines.push("آخرین سفارش‌ها (حداکثر ۳۰ مورد؛ بدون یادداشت خصوصی):");
      for (const order of orderRows.results || []) {
        let items = [];
        try { items = JSON.parse(order.items_json || "[]"); } catch {}
        const statusLabel = order.status === "draft" ? "پیش‌نویس" : order.status === "confirmed" ? "تأییدشده" : "لغوشده";
        lines.push("- " + safeNaviText(order.id || "", 60) +
          " | مشتری: " + safeNaviText(order.customer_name || "بدون اتصال به مشتری", 120) +
          " | وضعیت: " + statusLabel +
          " | تاریخ: " + safeNaviText(order.order_date || "", 20) +
          " | مبلغ: " + Number(order.total_toman || 0).toLocaleString("en-US") + " تومان" +
          " | اقلام: " + items.slice(0, 20).map(item =>
            safeNaviText(item.name || "", 100) + " × " + Number(item.quantity || 0).toLocaleString("en-US") +
            " (" + Number(item.lineTotalToman || 0).toLocaleString("en-US") + " تومان)"
          ).join("، "));
      }
      if (!(orderRows.results || []).length) lines.push("هنوز سفارشی در این پرونده ثبت نشده است.");
    }
  } catch (error) {
    console.warn("[NAVA BUSINESS] CRM order context is not available.", error);
    lines.push("", "اطلاعات زنده سفارش‌ها فعلاً قابل خواندن نبود؛ درباره سفارش‌ها حدس نزن.");
  }

  if (wantsInventory) {
    try {
      const movementRows = await db.prepare(
        "SELECT i.name,m.movement_type,m.quantity_delta,m.movement_date,m.notes FROM business_inventory_movements_v1 m JOIN business_catalog_items_v1 i ON i.id=m.catalog_item_id AND i.business_id=m.business_id AND i.owner_id=m.owner_id WHERE m.business_id=? AND m.owner_id=? ORDER BY m.created_at DESC LIMIT 25"
      ).bind(businessId, ownerId).all();
      lines.push("", "آخرین گردش‌های انبار (حداکثر ۲۵ مورد):");
      for (const movement of movementRows.results || []) {
        const kind = ({opening:"موجودی اولیه",inbound:"ورود",outbound:"خروج",adjustment:"اصلاح",sale:"خروج بابت فروش"})[movement.movement_type] || movement.movement_type;
        lines.push("- " + safeNaviText(movement.name || "", 120) + " | " + kind +
          " | تغییر تعداد: " + Number(movement.quantity_delta || 0).toLocaleString("en-US") +
          " | تاریخ: " + safeNaviText(movement.movement_date || "", 20) +
          " | توضیح: " + safeNaviText(movement.notes || "", 160));
      }
      if (!(movementRows.results || []).length) lines.push("هنوز گردش انباری ثبت نشده است.");
    } catch (error) {
      console.warn("[NAVA BUSINESS] Inventory movement context is not available.", error);
      lines.push("جزئیات گردش‌های انبار فعلاً قابل خواندن نبود؛ فقط موجودی فعلی کاتالوگ در دسترس است.");
    }
  }

  lines.push("", "قواعد پاسخ‌گویی به داده‌های پرونده:");
  lines.push("- این داده‌ها از دیتابیس زنده و فقط از پرونده فعال همین مالک خوانده شده‌اند.");
  lines.push("- اگر اطلاعاتی در این زمینه وجود ندارد یا یک بخش بارگذاری نشده، صریح بگو در داده‌های فعلی موجود نیست؛ عدد، مشتری، سفارش یا رویدادی نساز.");
  lines.push("- پیش‌نویس سفارش فروش قطعی نیست و موجودی را کم نمی‌کند؛ فقط سفارش تأییدشده به تراکنش فروش تبدیل می‌شود.");
  lines.push("- مبلغ سفارش تأییدشده لزوماً به معنی وجه وصول‌شده نیست؛ سیستم فعلی وضعیت پرداخت/دریافت، بدهی مشتری و مانده حساب را ثبت نمی‌کند.");
  lines.push("- مجموع فروش/هزینه ثبت‌شده را با سود خالص، جریان نقدی، طلب یا بدهی اشتباه نگیر.");
  return (base + "\n" + lines.join("\n")).slice(0, 36000);
}

async function listRecords(db, ownerId, businessId, url, corsOrigin) {
  const business = await ownsBusiness(db, businessId, ownerId);
  if (!business || business.status !== "active") return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
  const requestedLimit = Number(url.searchParams.get("limit") || 30);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 30;
  const result = await db.prepare(
    "SELECT id, record_type, title, period_key, report_text, payload_json, created_at FROM business_financial_records_v1 WHERE business_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT ?"
  ).bind(businessId, ownerId, limit).all();
  const records = (result.results || []).map(row => {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || "{}"); } catch {}
    return { id: row.id, recordType: row.record_type, title: row.title, periodKey: row.period_key, reportText: row.report_text, payload, createdAt: row.created_at };
  });
  return response({ records }, 200, corsOrigin);
}

async function createRecord(db, ownerId, businessId, input, corsOrigin) {
  const business = await ownsBusiness(db, businessId, ownerId);
  if (!business || business.status !== "active") return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
  const normalized = normalizeBusinessRecordInput(input);
  if (normalized.error) return fail(normalized.error, 400, corsOrigin);
  const value = normalized.value;
  const id = "fin-" + crypto.randomUUID();
  const result = await db.prepare(
    "INSERT INTO business_financial_records_v1 (id, business_id, owner_id, record_type, title, period_key, report_text, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).bind(id, businessId, ownerId, value.record_type, value.title, value.period_key, value.report_text, value.payload_json).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Financial record insert was not confirmed.");
  return response({ record: { id, businessId, recordType: value.record_type, title: value.title, periodKey: value.period_key, reportText: value.report_text, createdAt: new Date().toISOString() }, saved: true }, 201, corsOrigin);
}

export async function handleBusinessRoute({ request, env, url, origin, corsOrigin }) {
  const pathname = url.pathname;
  if (!pathname.startsWith("/businesses")) return null;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  try {
    const access = await authorize(request, env, origin, corsOrigin);
    if (access.error) return access.error;
    const { user } = access;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 1 || parts.length > 5 || parts[0] !== "businesses") return fail("مسیر درخواست معتبر نیست.", 404, corsOrigin);
    if (parts.length === 1) {
      if (request.method === "GET") return await listBusinesses(env.NAVA_DB, user.id, corsOrigin);
      if (request.method === "POST") {
        let input;
        try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
        return await createBusiness(env.NAVA_DB, user.id, input, corsOrigin);
      }
      return fail("برای این مسیر فقط دریافت یا ایجاد پرونده مجاز است.", 405, corsOrigin);
    }
    const businessId = parts[1];
    if (!/^biz-[0-9a-f-]{36}$/i.test(businessId)) return fail("شناسه کسب‌وکار معتبر نیست.", 400, corsOrigin);
    if (parts.length === 2) {
      if (request.method === "GET") return await getBusiness(env.NAVA_DB, user.id, businessId, corsOrigin);
      if (request.method === "PATCH") {
        let input;
        try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
        return await updateBusiness(env.NAVA_DB, user.id, businessId, input, corsOrigin);
      }
      if (request.method === "DELETE") return await archiveBusiness(env.NAVA_DB, user.id, businessId, corsOrigin);
      return fail("روش درخواست برای این پرونده مجاز نیست.", 405, corsOrigin);
    }
    if (parts[2] === "transactions") {
      return await handleBusinessTransactionRoute({ request, env, url, corsOrigin, businessId, ownerId: user.id, transactionId: parts[3] || "" });
    }
    if (parts[2] === "items") {
      return await handleBusinessCatalogRoute({ request, env, url, corsOrigin, businessId, ownerId: user.id, itemId: parts[3] || "" });
    }
    if (parts[2] === "inventory" && parts.length === 3) {
      return await handleBusinessInventoryRoute({ request, env, url, corsOrigin, businessId, ownerId: user.id });
    }
    if (parts[2] === "customers" || parts[2] === "orders") {
      return await handleBusinessCrmRoute({ request, env, url, corsOrigin, businessId, ownerId: user.id, resource: parts[2], resourceId: parts[3] || "", action: parts[4] || "" });
    }
    if (parts[2] === "records") {
      if (parts.length === 3) {
        if (request.method === "GET") return await listRecords(env.NAVA_DB, user.id, businessId, url, corsOrigin);
        if (request.method === "POST") {
          let input;
          try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
          return await createRecord(env.NAVA_DB, user.id, businessId, input, corsOrigin);
        }
        return fail("برای سوابق مالی فقط دریافت یا ثبت مجاز است.", 405, corsOrigin);
      }
      if (parts.length === 4 && request.method === "DELETE") {
        const recordId = parts[3];
        if (!/^fin-[0-9a-f-]{36}$/i.test(recordId)) return fail("شناسه گزارش مالی معتبر نیست.", 400, corsOrigin);
        const business = await ownsBusiness(env.NAVA_DB, businessId, user.id);
        if (!business || business.status !== "active") return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
        const deleted = await env.NAVA_DB.prepare(
          "DELETE FROM business_financial_records_v1 WHERE id = ? AND business_id = ? AND owner_id = ?"
        ).bind(recordId, businessId, user.id).run();
        if (!deleted.success) throw new Error("Financial record delete was not confirmed.");
        if (Number(deleted.meta?.changes || 0) !== 1) return fail("گزارش پیدا نشد یا قبلاً حذف شده است.", 404, corsOrigin);
        return response({ deleted: true, recordId }, 200, corsOrigin);
      }
      return fail("مسیر سوابق مالی معتبر نیست.", 404, corsOrigin);
    }
    return fail("مسیر درخواست پیدا نشد.", 404, corsOrigin);
  } catch (error) {
    console.error("[NAVA BUSINESS] Request failed:", error);
    return fail("عملیات کسب‌وکار انجام نشد. وضعیت سرویس و ساختار دیتابیس را بررسی کن.", 500, corsOrigin);
  }
}
