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
  if (Object.hasOwn(input, "customerId")) {
    const customerId = String(input.customerId || "").trim();
    if (!customerId) value.customer_id = null;
    else if (!/^customer-[0-9a-f-]{36}$/i.test(customerId)) return { error: "شناسه مشتری معتبر نیست." };
    else value.customer_id = customerId;
  } else if (!partial) value.customer_id = null;
  if (Object.hasOwn(input, "supplierId")) {
    const supplierId = String(input.supplierId || "").trim();
    if (!supplierId) value.supplier_id = null;
    else if (!/^supplier-[0-9a-f-]{36}$/i.test(supplierId)) return { error: "شناسه تأمین‌کننده معتبر نیست." };
    else value.supplier_id = supplierId;
  } else if (!partial) value.supplier_id = null;
  if (Object.hasOwn(input, "catalogItemId")) {
    const itemId = String(input.catalogItemId || "").trim();
    if (!itemId) value.catalog_item_id = null;
    else if (!/^item-[0-9a-f-]{36}$/i.test(itemId)) return { error: "شناسه محصول یا خدمت معتبر نیست." };
    else value.catalog_item_id = itemId;
  } else if (!partial) value.catalog_item_id = null;
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
  if (value.transaction_type === "expense" && value.customer_id) return { error: "اتصال مشتری فقط برای فروش مجاز است." };
  if (value.transaction_type === "sale" && value.supplier_id) return { error: "اتصال تأمین‌کننده فقط برای هزینه مجاز است." };
  if (value.transaction_type === "expense" && (value.quantity || value.unit_price_toman || value.catalog_item_id)) return { error: "برای ثبت هزینه، محصول، تعداد و قیمت واحد را انتخاب نکن." };
  if (value.transaction_type === "sale" && value.quantity && value.unit_price_toman && value.amount_toman !== undefined && value.amount_toman !== value.quantity * value.unit_price_toman) {
    return { error: "مبلغ کل فروش باید برابر تعداد ضربدر قیمت واحد باشد." };
  }
  if (!Object.keys(value).length) return { error: "هیچ فیلد معتبری برای تغییر ارسال نشده است." };
  return { value };
}

function publicTransaction(row) {
  return {
    id: row.id, transactionType: row.transaction_type, title: row.title, catalogItemId: row.catalog_item_id || null, customerId: row.customer_id || null, supplierId: row.supplier_id || null,
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
      const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 50;
      const requestedOffset = Number(url.searchParams.get("offset") || 0);
      const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 1000000)) : 0;
      if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 1000000) {
        return fail("شماره صفحه معتبر نیست.", 400, corsOrigin);
      }
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
        "SELECT id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, catalog_item_id, customer_id, supplier_id, created_at, updated_at FROM business_transactions_v1 WHERE business_id = ? AND owner_id = ?" + dateClause + " ORDER BY transaction_date DESC, created_at DESC LIMIT ? OFFSET ?"
      ).bind(...dateParams, limit, offset).all();
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
      if (v.catalog_item_id) {
        if (v.transaction_type !== "sale" || !v.quantity || !v.unit_price_toman) {
          return fail("برای ثبت فروش از کاتالوگ، تعداد و قیمت واحد را کامل کن.", 400, corsOrigin);
        }
        const item = await env.NAVA_DB.prepare(
          "SELECT id, item_type, track_inventory FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.catalog_item_id, businessId, ownerId).first();
        if (!item) return fail("محصول یا خدمت انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
        if (Number(item.track_inventory) === 1 && item.item_type !== "product") return fail("مدیریت موجودی فقط برای محصولات فیزیکی مجاز است.", 409, corsOrigin);
      }
      if (v.supplier_id) {
        if (v.transaction_type !== "expense") return fail("اتصال تأمین‌کننده فقط برای هزینه مجاز است.", 400, corsOrigin);
        const supplier = await env.NAVA_DB.prepare(
          "SELECT id, status FROM business_suppliers_v1 WHERE id = ? AND business_id = ? AND owner_id = ? LIMIT 1"
        ).bind(v.supplier_id, businessId, ownerId).first();
        if (!supplier) return fail("تأمین‌کننده انتخاب‌شده به این پرونده تعلق ندارد.", 404, corsOrigin);
        if (supplier.status !== "active" && v.supplier_id !== current.supplier_id) {
          return fail("برای اتصال هزینه، تأمین‌کننده باید فعال باشد.", 409, corsOrigin);
        }
      }
      if (v.customer_id) {
        if (v.transaction_type !== "sale") return fail("اتصال مشتری فقط برای فروش مجاز است.", 400, corsOrigin);
        const customer = await env.NAVA_DB.prepare(
          "SELECT id FROM business_customers_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.customer_id, businessId, ownerId).first();
        if (!customer) return fail("مشتری انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
      }
      if (v.supplier_id) {
        if (v.transaction_type !== "expense") return fail("اتصال تأمین‌کننده فقط برای هزینه مجاز است.", 400, corsOrigin);
        const supplier = await env.NAVA_DB.prepare(
          "SELECT id FROM business_suppliers_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.supplier_id, businessId, ownerId).first();
        if (!supplier) return fail("تأمین‌کننده انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
      }
      const id = "txn-" + crypto.randomUUID();
      let inventoryTracked = false;
      if (v.catalog_item_id) {
        const item = await env.NAVA_DB.prepare(
          "SELECT item_type, track_inventory FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.catalog_item_id, businessId, ownerId).first();
        inventoryTracked = Boolean(item && item.item_type === "product" && Number(item.track_inventory) === 1);
      }
      if (inventoryTracked) {
        const movementId = "mov-" + crypto.randomUUID();
        const results = await env.NAVA_DB.batch([
          env.NAVA_DB.prepare(
            "INSERT INTO business_inventory_movements_v1 (id, business_id, owner_id, catalog_item_id, movement_type, quantity_delta, movement_date, notes, reference_transaction_id, created_at) " +
            "SELECT ?, ?, ?, ?, 'sale', ?, ?, ?, ?, datetime('now') " +
            "WHERE (SELECT COALESCE(SUM(quantity_delta), 0) FROM business_inventory_movements_v1 WHERE catalog_item_id = ? AND business_id = ? AND owner_id = ?) >= ?"
          ).bind(movementId, businessId, ownerId, v.catalog_item_id, -v.quantity, v.transaction_date, "خروج خودکار بابت فروش: " + v.title, id, v.catalog_item_id, businessId, ownerId, v.quantity),
          env.NAVA_DB.prepare(
            "INSERT INTO business_transactions_v1 (id, business_id, owner_id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, catalog_item_id, customer_id, created_at, updated_at) " +
            "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now') " +
            "WHERE EXISTS (SELECT 1 FROM business_inventory_movements_v1 WHERE id = ? AND reference_transaction_id = ?)"
          ).bind(id, businessId, ownerId, v.transaction_type, v.title, v.amount_toman, v.transaction_date, v.category, v.notes, v.quantity, v.unit_price_toman, v.catalog_item_id, v.customer_id, movementId, id)
        ]);
        if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
          return fail("موجودی این محصول کافی نیست؛ فروش ثبت نشد و موجودی تغییری نکرد.", 409, corsOrigin);
        }
        if (Number(results?.[1]?.meta?.changes || 0) !== 1) throw new Error("Inventory-linked transaction insert not confirmed");
      } else {
        const result = await env.NAVA_DB.prepare(
          "INSERT INTO business_transactions_v1 (id, business_id, owner_id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, catalog_item_id, customer_id, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
        ).bind(id, businessId, ownerId, v.transaction_type, v.title, v.amount_toman, v.transaction_date, v.category, v.notes, v.quantity, v.unit_price_toman, v.catalog_item_id, v.customer_id, v.supplier_id).run();
        if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Transaction insert not confirmed");
      }
      const row = await env.NAVA_DB.prepare(
        "SELECT id, transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, catalog_item_id, customer_id, supplier_id, created_at, updated_at FROM business_transactions_v1 WHERE id = ? AND owner_id = ?"
      ).bind(id, ownerId).first();
      return reply({ transaction: publicTransaction(row), saved: true }, 201, corsOrigin);
    }
    if (transactionId && request.method === "PATCH") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      const normalized = normalizeBusinessTransactionInput(input, true);
      if (normalized.error) return fail(normalized.error, 400, corsOrigin);
      const current = await env.NAVA_DB.prepare(
        "SELECT transaction_type, title, amount_toman, transaction_date, category, notes, quantity, unit_price_toman, catalog_item_id, customer_id, supplier_id FROM business_transactions_v1 WHERE id = ? AND business_id = ? AND owner_id = ?"
      ).bind(transactionId, businessId, ownerId).first();
      if (!current) return fail("تراکنش پیدا نشد.", 404, corsOrigin);
      const linkedOrder = await env.NAVA_DB.prepare(
        "SELECT id FROM business_orders_v1 WHERE converted_transaction_id = ? AND business_id = ? AND owner_id = ? LIMIT 1"
      ).bind(transactionId, businessId, ownerId).first();
      if (linkedOrder) return fail("فروش حاصل از سفارش تأییدشده از این بخش قابل ویرایش نیست؛ سوابق سفارش و فاکتور باید هماهنگ بمانند.", 409, corsOrigin);
      if (current.catalog_item_id) {
        const linked = await env.NAVA_DB.prepare(
          "SELECT track_inventory FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ?"
        ).bind(current.catalog_item_id, businessId, ownerId).first();
        if (Number(linked?.track_inventory || 0) === 1) return fail("فروش متصل به موجودی برای جلوگیری از مغایرت انبار قابل ویرایش نیست؛ برای اصلاح، از گردش موجودی جداگانه استفاده کن.", 409, corsOrigin);
      }
      const v = { ...current, ...normalized.value };
      if (v.supplier_id) {
        if (v.transaction_type !== "expense") return fail("اتصال تأمین‌کننده فقط برای هزینه مجاز است.", 400, corsOrigin);
        const supplier = await env.NAVA_DB.prepare(
          "SELECT id FROM business_suppliers_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.supplier_id, businessId, ownerId).first();
        if (!supplier) return fail("تأمین‌کننده انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
      }
      if (v.customer_id) {
        if (v.transaction_type !== "sale") return fail("اتصال مشتری فقط برای فروش مجاز است.", 400, corsOrigin);
        const customer = await env.NAVA_DB.prepare(
          "SELECT id FROM business_customers_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.customer_id, businessId, ownerId).first();
        if (!customer) return fail("مشتری انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
      }
      if (v.transaction_type === "expense" && (v.quantity || v.unit_price_toman || v.catalog_item_id)) return fail("برای ثبت هزینه، محصول، تعداد و قیمت واحد باید خالی باشد.", 400, corsOrigin);
      if (v.transaction_type === "sale" && v.supplier_id) return fail("اتصال تأمین‌کننده فقط برای هزینه مجاز است.", 400, corsOrigin);
      if (current.transaction_type === "expense") {
        const paymentHistory = await env.NAVA_DB.prepare(
          "SELECT COUNT(*) AS payment_count, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_toman ELSE 0 END), 0) AS paid_toman FROM business_expense_payments_v1 WHERE transaction_id = ? AND business_id = ? AND owner_id = ?"
        ).bind(transactionId, businessId, ownerId).first();
        const paid = Number(paymentHistory?.paid_toman || 0);
        if (Number(paymentHistory?.payment_count || 0) > 0 && v.transaction_type !== "expense") {
          return fail("هزینه‌ای که سابقه پرداخت دارد را نمی‌توان به فروش تبدیل کرد.", 409, corsOrigin);
        }
        if (v.transaction_type === "expense" && Number(v.amount_toman) < paid) {
          return fail("مبلغ هزینه نمی‌تواند از مجموع پرداخت‌های ثبت‌شده کمتر باشد؛ ابتدا پرداخت مرتبط را باطل کن.", 409, corsOrigin);
        }
      }
      if (v.transaction_type === "sale" && v.quantity && v.unit_price_toman && v.amount_toman !== v.quantity * v.unit_price_toman) return fail("مبلغ کل فروش باید برابر تعداد ضربدر قیمت واحد باشد.", 400, corsOrigin);
      if (Object.hasOwn(normalized.value, "catalog_item_id") && v.catalog_item_id) {
        if (v.transaction_type !== "sale" || !v.quantity || !v.unit_price_toman) {
          return fail("برای اتصال محصول به فروش، تعداد و قیمت واحد را کامل کن.", 400, corsOrigin);
        }
        const item = await env.NAVA_DB.prepare(
          "SELECT id FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
        ).bind(v.catalog_item_id, businessId, ownerId).first();
        if (!item) return fail("محصول یا خدمت انتخاب‌شده فعال نیست یا به این پرونده تعلق ندارد.", 404, corsOrigin);
      }
      const keys = Object.keys(normalized.value);
      const assignments = keys.map(key => key + " = ?").join(", ");
      const updated = await env.NAVA_DB.prepare(
        "UPDATE business_transactions_v1 SET " + assignments + ", updated_at = datetime('now') WHERE id = ? AND business_id = ? AND owner_id = ?"
      ).bind(...keys.map(key => v[key]), transactionId, businessId, ownerId).run();
      if (!updated.success || Number(updated.meta?.changes || 0) !== 1) throw new Error("Transaction update not confirmed");
      return reply({ updated: true }, 200, corsOrigin);
    }
    if (transactionId && request.method === "DELETE") {
      const orderLink = await env.NAVA_DB.prepare(
        "SELECT id FROM business_orders_v1 WHERE converted_transaction_id = ? AND business_id = ? AND owner_id = ? LIMIT 1"
      ).bind(transactionId, businessId, ownerId).first();
      if (orderLink) return fail("فروش حاصل از سفارش تأییدشده قابل حذف نیست؛ برای حفظ سوابق، سفارش و فاکتور را از مسیر مربوط مدیریت کن.", 409, corsOrigin);
      const expensePaymentHistory = await env.NAVA_DB.prepare(
        "SELECT COUNT(*) AS payment_count FROM business_expense_payments_v1 WHERE transaction_id = ? AND business_id = ? AND owner_id = ?"
      ).bind(transactionId, businessId, ownerId).first();
      if (Number(expensePaymentHistory?.payment_count || 0) > 0) {
        return fail("هزینه‌ای که سابقه پرداخت دارد قابل حذف نیست؛ برای اصلاح، پرداخت‌ها را باطل و مبلغ هزینه را ویرایش کن.", 409, corsOrigin);
      }
      const linkedSale = await env.NAVA_DB.prepare(
        "SELECT t.catalog_item_id, i.track_inventory FROM business_transactions_v1 t LEFT JOIN business_catalog_items_v1 i ON i.id = t.catalog_item_id WHERE t.id = ? AND t.business_id = ? AND t.owner_id = ? LIMIT 1"
      ).bind(transactionId, businessId, ownerId).first();
      if (Number(linkedSale?.track_inventory || 0) === 1) return fail("فروش متصل به موجودی قابل حذف نیست؛ برای برگشت کالا باید گردش مرجوعی ثبت شود.", 409, corsOrigin);
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
