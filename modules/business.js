// NAVA BUSINESS — authenticated multi-business profiles and financial records.
// Business data is deliberately separate from NAVI conversation memory.

import { json, safeNaviText } from "./shared.js";
import { ALLOWED_ORIGIN } from "./config.js";
import { authorizeNaviRequest } from "./navi-auth.js";

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
    const currency = String(input.currency || "IRR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return { error: "واحد پول معتبر نیست." };
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
    if (parts.length < 1 || parts.length > 3 || parts[0] !== "businesses") return fail("مسیر درخواست معتبر نیست.", 404, corsOrigin);
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
    if (parts[2] === "records") {
      if (request.method === "GET") return await listRecords(env.NAVA_DB, user.id, businessId, url, corsOrigin);
      if (request.method === "POST") {
        let input;
        try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
        return await createRecord(env.NAVA_DB, user.id, businessId, input, corsOrigin);
      }
      return fail("برای سوابق مالی فقط دریافت یا ثبت مجاز است.", 405, corsOrigin);
    }
    return fail("مسیر درخواست پیدا نشد.", 404, corsOrigin);
  } catch (error) {
    console.error("[NAVA BUSINESS] Request failed:", error);
    return fail("عملیات کسب‌وکار انجام نشد. وضعیت سرویس و ساختار دیتابیس را بررسی کن.", 500, corsOrigin);
  }
}
