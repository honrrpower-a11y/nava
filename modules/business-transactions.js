// NAVA BUSINESS — account-scoped sales and expense transactions.
import { json, safeNaviText } from "./shared.js";

const TYPES = new Set(["sale", "expense"]);
const MAX_AMOUNT = 1000000000000;
const clean = (value, max) => safeNaviText(value ?? "", max);
const reply = (data, status, origin) => json({ success: status < 400, ...data }, status, origin);
const fail = (message, status, origin) => reply({ error: message }, status, origin);

export function normalizeBusinessTransactionInput(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "اطلاعات تراکنش معتبر نیست." };
  const value = {};
  if (!partial || Object.hasOwn(input, "transactionType")) {
    const type = String(input.transactionType || "");
    if (!TYPES.has(type)) return { error: "نوع تراکنش باید فروش یا هزینه باشد." };
    value.transaction_type = type;
  }
  if (!partial || Object.hasOwn(input, "title")) {
    value.title = clean(input.title || "", 160);
    if (value.title.length < 2) return { error: "عنوان تراکنش باید حداقل ۲ نویسه باشد." };
  }
  if (!partial || Object.hasOwn(input, "amountToman")) {
    const amount = Number(input.amountToman);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: "مبلغ باید عدد صحیح مثبت به تومان باشد." };
    value.amount_toman = amount;
  }
  if (!partial || Object.hasOwn(input, "transactionDate")) {
    const date = String(input.transactionDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "تاریخ تراکنش معتبر نیست." };
    const parsed = new Date(date + "T00:00:00.000Z");
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { error: "تاریخ تراکنش معتبر نیست." };
    value.transaction_date = date;
  }
  if (!partial || Object.hasOwn(input, "category")) value.category = clean(input.category || "", 80);
  if (!partial || Object.hasOwn(input, "notes")) value.notes = clean(input.notes || "", 1200);
  if (Object.hasOwn(input, "quantity")) {
    if (input.quantity === "" || input.quantity === null) value.quantity = null;
    else {
      const n = Number(input.quantity);
      if (!Number.isSafeInteger(n) || n <= 0 || n > 1000000000) return { error: "تعداد باید عدد صحیح مثبت باشد." };
      value.quantity = n;
    }
  } else if (!partial) value.quantity = null;
  if (Object.hasOwn(input, "unitPriceToman")) {
    if (input.unitPriceToman === "" || input.unitPriceToman === null) value.unit_price_toman = null;
    else {
      const n = Number(input.unitPriceToman);
      if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_AMOUNT) return { error: "قیمت واحد باید عدد صحیح مثبت به تومان باشد." };
      value.unit_price_toman = n;
    }
  } else if (!partial) value.unit_price_toman = null;
  if (value.transaction_type === "expense" && (value.quantity || value.unit_price_toman)) return { error: "برای ثبت هزینه، تعداد و قیمت واحد را خالی بگذار." };
  if (value.transaction_type === "sale" && value.quantity && value.unit_price_toman && value.amount_toman !== undefined && value.amount_toman !== value.quantity * value.unit_price_toman) {
    return { error: "مبلغ کل فروش باید برابر تعداد ضربدر قیمت واحد باشد." };
  }
  if (!Object.keys(value).length) return { error: "هیچ فیلد معتبری برای تغییر ارسال نشده است." };
  return { value };
}

function publicTransaction(row) {
  return {
    id: row.id, transactionType: row.transaction_type, title: row.title,
    amountToman: Number(row.amount_toman), transactionDate: row.transaction_date,
    category: row.category || "", notes: row.notes || "",
    quantity: row.quantity == null ? null : Number(row.quantity),
    unitPriceToman: row.unit_price_toman == null ? null : Number(row.unit_price_toman),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function getOwnedBusiness(db, businessId, ownerId) {
  return db.prepare("SELECT id FROM business_profiles_v1 WHERE id = ? AND owner_id = ? AND status = 'active' LIMIT 1").bind(businessId, ownerId).first();
}

export async function handleBusinessTransactionRoute({ request, env, url, corsOrigin, businessId, transactionId = "", ownerId }) {
  try {
    if (!env.NAVA_DB) return fail("دیتابیس کسب‌وکار در دسترس نیست.", 503, corsOrigin);
    if (!/^biz-[0-9a-f-]{36}$/i.test(businessId || "")) return fail("شناسه کسب‌وکار معتبر نیست.", 400, corsOrigin);
    if (transactionId && !/^txn-[0-9a-f-]{36}$/i.test(transactionId)) return fail("شناسه تراکنش معتبر نیست.", 400, corsOrigin);
    const business = await getOwnedBusiness(env.NAVA_DB, businessId, ownerId);
    if (!business) return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
    if (!transactionId && request.method === "GET") {
      const requested = Number(url.searchParams.get("limit") || 50);
      const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 5000)) : 50;
      const from = String(url.searchParams.get("from") || "");
      const to = String(url.searchParams.get("to") || "");
      const validDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(value + "T00:00:00.000Z");
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if ((from && !validDate(from)) || (to && !validDate(to))) return fail("بازه تاریخ معتبر نیست.", 400, corsOrigin);
      if (from && to && from > to) return fail("تاریخ شروع بازه نباید بعد از تاریخ پایان باشد.", 400, corsOrigin);
      const dateClause = (from ? " AND transaction_date >= ?" : "") + (to ? " AND transaction_date <= ?" : "");
      const dateParams = [businessId, ownerId, ...(from ? [from] : []), ...(to ? [to] : [])];
      const result = await env.NAVA_DB.prepare(
        "SELECT id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, created_at, updated_at FROM business_transactions_v1 WHERE business_id = ? AND owner_id = ?" + dateClause + " ORDER BY transaction_date DESC, created_at DESC LIMIT ?"
      ).bind(...dateParams, limit).all();
      const totals = await env.NAVA_DB.prepare(
        "SELECT COUNT(CASE WHEN transaction_type = 'sale' THEN 1 END) AS sales_count, COUNT(CASE WHEN transaction_type = 'expense' THEN 1 END) AS expenses_count, COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN amount_toman ELSE 0 END), 0) AS sales_toman, COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount_toman ELSE 0 END), 0) AS expenses_toman, COUNT(*) AS transaction_count FROM business_transactions_v1 WHERE business_id = ? AND owner_id = ?" + dateClause
      ).bind(...dateParams).first();
      const trendLimit = from || to ? 24 : 6;
      const trend = await env.NAVA_DB.prepare(
        "SELECT substr(transaction_date, 1, 7) AS month_key, COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN amount_toman ELSE 0 END), 0) AS sales_toman, COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount_toman ELSE 0 END), 0) AS expenses_toman, COUNT(*) AS transaction_count FROM business_transactions_v1 WHERE business_id = ? AND owner_id = ?" + dateClause + " GROUP BY substr(transaction_date, 1, 7) ORDER BY month_key DESC LIMIT ?"
      ).bind(...dateParams, trendLimit).all();
      const summary = {
        salesToman: Number(totals?.sales_toman || 0),
        expensesToman: Number(totals?.expenses_toman || 0),
        salesCount: Number(totals?.sales_count || 0),
        expensesCount: Number(totals?.expenses_count || 0),
        transactionCount: Number(totals?.transaction_count || 0)
      };
      const monthlyTrend = (trend.results || []).reverse().map(row => ({
        month: row.month_key,
        salesToman: Number(row.sales_toman || 0),
        expensesToman: Number(row.expenses_toman || 0),
        transactionCount: Number(row.transaction_count || 0)
      }));
      return reply({ transactions: (result.results || []).map(publicTransaction), summary, monthlyTrend }, 200, corsOrigin);
    }
    if (!transactionId && request.method === "POST") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      const normalized = normalizeBusinessTransactionInput(input);
      if (normalized.error) return fail(normalized.error, 400, corsOrigin);
      const v = normalized.value;
      const id = "txn-" + crypto.randomUUID();
      const result = await env.NAVA_DB.prepare(
        "INSERT INTO business_transactions_v1 (id, business_id, owner_id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
      ).bind(id, businessId, ownerId, v.transaction_type, v.title, v.amount_toman, v.transaction_date, v.category, v.notes, v.quantity, v.unit_price_toman).run();
      if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Transaction insert not confirmed");
      const row = await env.NAVA_DB.prepare(
        "SELECT id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, created_at, updated_at FROM business_transactions_v1 WHERE id = ? AND owner_id = ?"
      ).bind(id, ownerId).first();
      return reply({ transaction: publicTransaction(row), saved: true }, 201, corsOrigin);
    }
    if (transactionId && request.method === "PATCH") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      const normalized = normalizeBusinessTransactionInput(input, true);
      if (normalized.error) return fail(normalized.error, 400, corsOrigin);
      const current = await env.NAVA_DB.prepare(
        "SELECT transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman FROM business_transactions_v1 WHERE id = ? AND business_id = ? AND owner_id = ?"
      ).bind(transactionId, businessId, ownerId).first();
      if (!current) return fail("تراکنش پیدا نشد.", 404, corsOrigin);
      const v = { ...current, ...normalized.value };
      if (v.transaction_type === "expense" && (v.quantity || v.unit_price_toman)) return fail("برای ثبت هزینه، تعداد و قیمت واحد باید خالی باشد.", 400, corsOrigin);
      if (v.transaction_type === "sale" && v.quantity && v.unit_price_toman && v.amount_toman !== v.quantity * v.unit_price_toman) return fail("مبلغ کل فروش باید برابر تعداد ضربدر قیمت واحد باشد.", 400, corsOrigin);
      const keys = Object.keys(normalized.value);
      const assignments = keys.map(key => key + " = ?").join(", ");
      const updated = await env.NAVA_DB.prepare(
        "UPDATE business_transactions_v1 SET " + assignments + ", updated_at = datetime('now') WHERE id = ? AND business_id = ? AND owner_id = ?"
      ).bind(...keys.map(key => v[key]), transactionId, businessId, ownerId).run();
      if (!updated.success || Number(updated.meta?.changes || 0) !== 1) throw new Error("Transaction update not confirmed");
      return reply({ updated: true }, 200, corsOrigin);
    }
    if (transactionId && request.method === "DELETE") {
      const deleted = await env.NAVA_DB.prepare(
        "DELETE FROM business_transactions_v1 WHERE id = ? AND business_id = ? AND owner_id = ?"
      ).bind(transactionId, businessId, ownerId).run();
      if (!deleted.success) throw new Error("Transaction delete not confirmed");
      if (Number(deleted.meta?.changes || 0) !== 1) return fail("تراکنش پیدا نشد یا قبلاً حذف شده است.", 404, corsOrigin);
      return reply({ deleted: true, transactionId }, 200, corsOrigin);
    }
    return fail("روش درخواست برای این مسیر پشتیبانی نمی‌شود.", 405, corsOrigin);
  } catch (error) {
    console.error("[NAVA BUSINESS TRANSACTIONS] Request failed:", error);
    return fail("عملیات تراکنش انجام نشد. اجرای Migration جدید دیتابیس را بررسی کن.", 500, corsOrigin);
  }
}
