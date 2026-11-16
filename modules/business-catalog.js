// NAVA BUSINESS — account-scoped product and service catalogue.
import { json, safeNaviText } from "./shared.js";

const ITEM_TYPES = new Set(["product", "service"]);
const MAX_PRICE = 1000000000000;
const clean = (value, max) => safeNaviText(value ?? "", max);
const reply = (data, status, origin) => json({ success: status < 400, ...data }, status, origin);
const fail = (message, status, origin) => reply({ error: message }, status, origin);

export function normalizeBusinessCatalogItem(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "اطلاعات محصول یا خدمت معتبر نیست." };
  const value = {};
  if (!partial || Object.hasOwn(input, "itemType")) {
    const itemType = String(input.itemType || "");
    if (!ITEM_TYPES.has(itemType)) return { error: "نوع مورد باید محصول یا خدمت باشد." };
    value.item_type = itemType;
  }
  if (!partial || Object.hasOwn(input, "name")) {
    value.name = clean(input.name || "", 140);
    if (value.name.length < 2) return { error: "نام محصول یا خدمت باید حداقل ۲ نویسه باشد." };
  }
  if (!partial || Object.hasOwn(input, "sku")) {
    value.sku = clean(input.sku || "", 64).replace(/\s+/g, "-");
    if (value.sku && !/^[\p{L}\p{N}._/-]+$/u.test(value.sku)) return { error: "کد کالا فقط می‌تواند شامل حروف، اعداد و نشانه‌های . _ / - باشد." };
  }
  if (!partial || Object.hasOwn(input, "category")) value.category = clean(input.category || "", 80);
  if (!partial || Object.hasOwn(input, "description")) value.description = clean(input.description || "", 1200);
  if (!partial || Object.hasOwn(input, "unit")) {
    value.unit = clean(input.unit || (value.item_type === "service" ? "خدمت" : "عدد"), 32);
    if (!value.unit) value.unit = value.item_type === "service" ? "خدمت" : "عدد";
  }
  if (!partial || Object.hasOwn(input, "salePriceToman")) {
    const price = Number(input.salePriceToman);
    if (!Number.isSafeInteger(price) || price < 0 || price > MAX_PRICE) return { error: "قیمت فروش باید عدد صحیح صفر یا بیشتر به تومان باشد." };
    value.sale_price_toman = price;
  }
  if (!partial || Object.hasOwn(input, "costPriceToman")) {
    if (input.costPriceToman === "" || input.costPriceToman === null || input.costPriceToman === undefined) {
      value.cost_price_toman = null;
    } else {
      const cost = Number(input.costPriceToman);
      if (!Number.isSafeInteger(cost) || cost < 0 || cost > MAX_PRICE) return { error: "بهای تمام‌شده باید عدد صحیح صفر یا بیشتر به تومان باشد." };
      value.cost_price_toman = cost;
    }
  }
  if (!partial || Object.hasOwn(input, "trackInventory")) {
    const enabled = input.trackInventory === true || input.trackInventory === 1 || input.trackInventory === "1";
    value.track_inventory = enabled ? 1 : 0;
    if (enabled && value.item_type === "service") return { error: "مدیریت موجودی فقط برای محصولات فیزیکی فعال می‌شود." };
  }
  if (!Object.keys(value).length) return { error: "هیچ فیلد معتبری برای تغییر ارسال نشده است." };
  return { value };
}

function publicItem(row) {
  return {
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    sku: row.sku || "",
    category: row.category || "",
    description: row.description || "",
    unit: row.unit || (row.item_type === "service" ? "خدمت" : "عدد"),
    salePriceToman: Number(row.sale_price_toman || 0),
    costPriceToman: row.cost_price_toman == null ? null : Number(row.cost_price_toman),
    trackInventory: Number(row.track_inventory || 0) === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ownedBusiness(db, businessId, ownerId) {
  return db.prepare("SELECT id FROM business_profiles_v1 WHERE id = ? AND owner_id = ? AND status = 'active' LIMIT 1")
    .bind(businessId, ownerId).first();
}

async function ownedItem(db, businessId, ownerId, itemId) {
  return db.prepare(
    "SELECT id, business_id, owner_id, item_type, name, sku, category, description, unit, sale_price_toman, cost_price_toman, track_inventory, status, created_at, updated_at FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ? LIMIT 1"
  ).bind(itemId, businessId, ownerId).first();
}

async function listItems(db, businessId, ownerId, url, corsOrigin) {
  const status = String(url.searchParams.get("status") || "active");
  if (!["active", "archived", "all"].includes(status)) return fail("فیلتر وضعیت معتبر نیست.", 400, corsOrigin);
  const type = String(url.searchParams.get("type") || "all");
  if (!["all", "product", "service"].includes(type)) return fail("فیلتر نوع معتبر نیست.", 400, corsOrigin);
  const clauses = ["business_id = ?", "owner_id = ?"];
  const params = [businessId, ownerId];
  if (status !== "all") { clauses.push("status = ?"); params.push(status); }
  if (type !== "all") { clauses.push("item_type = ?"); params.push(type); }
  const result = await db.prepare(
    "SELECT id, business_id, owner_id, item_type, name, sku, category, description, unit, sale_price_toman, cost_price_toman, track_inventory, status, created_at, updated_at FROM business_catalog_items_v1 WHERE " +
    clauses.join(" AND ") + " ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, name COLLATE NOCASE ASC LIMIT 500"
  ).bind(...params).all();
  return reply({ items: (result.results || []).map(publicItem) }, 200, corsOrigin);
}

async function createItem(db, businessId, ownerId, input, corsOrigin) {
  const normalized = normalizeBusinessCatalogItem(input);
  if (normalized.error) return fail(normalized.error, 400, corsOrigin);
  const value = normalized.value;
  if (value.sku) {
    const duplicate = await db.prepare(
      "SELECT id FROM business_catalog_items_v1 WHERE business_id = ? AND owner_id = ? AND sku = ? COLLATE NOCASE LIMIT 1"
    ).bind(businessId, ownerId, value.sku).first();
    if (duplicate) return fail("این کد کالا قبلاً در همین پرونده ثبت شده است.", 409, corsOrigin);
  }
  const id = "item-" + crypto.randomUUID();
  const result = await db.prepare(
    "INSERT INTO business_catalog_items_v1 (id, business_id, owner_id, item_type, name, sku, category, description, unit, sale_price_toman, cost_price_toman, track_inventory, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))"
  ).bind(id, businessId, ownerId, value.item_type, value.name, value.sku, value.category, value.description, value.unit, value.sale_price_toman, value.cost_price_toman, value.track_inventory).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Catalogue item insert not confirmed.");
  const row = await ownedItem(db, businessId, ownerId, id);
  return reply({ item: publicItem(row), created: true }, 201, corsOrigin);
}

async function updateItem(db, businessId, ownerId, itemId, input, corsOrigin) {
  const current = await ownedItem(db, businessId, ownerId, itemId);
  if (!current || current.status !== "active") return fail("محصول یا خدمت فعال پیدا نشد.", 404, corsOrigin);
  const normalized = normalizeBusinessCatalogItem(input, true);
  if (normalized.error) return fail(normalized.error, 400, corsOrigin);
  const value = normalized.value;
  if (value.track_inventory === 1 && (value.item_type || current.item_type) !== "product") return fail("مدیریت موجودی فقط برای محصولات فیزیکی فعال می‌شود.", 400, corsOrigin);
  if (Object.hasOwn(value, "sku") && value.sku) {
    const duplicate = await db.prepare(
      "SELECT id FROM business_catalog_items_v1 WHERE business_id = ? AND owner_id = ? AND sku = ? COLLATE NOCASE AND id <> ? LIMIT 1"
    ).bind(businessId, ownerId, value.sku, itemId).first();
    if (duplicate) return fail("این کد کالا برای مورد دیگری در همین پرونده ثبت شده است.", 409, corsOrigin);
  }
  const keys = Object.keys(value);
  const result = await db.prepare(
    "UPDATE business_catalog_items_v1 SET " + keys.map(key => key + " = ?").join(", ") +
    ", updated_at = datetime('now') WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active'"
  ).bind(...keys.map(key => value[key]), itemId, businessId, ownerId).run();
  if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Catalogue item update not confirmed.");
  const row = await ownedItem(db, businessId, ownerId, itemId);
  return reply({ item: publicItem(row), updated: true }, 200, corsOrigin);
}

async function archiveItem(db, businessId, ownerId, itemId, corsOrigin) {
  const result = await db.prepare(
    "UPDATE business_catalog_items_v1 SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active'"
  ).bind(itemId, businessId, ownerId).run();
  if (!result.success) throw new Error("Catalogue item archive not confirmed.");
  if (Number(result.meta?.changes || 0) !== 1) return fail("محصول یا خدمت پیدا نشد یا قبلاً بایگانی شده است.", 404, corsOrigin);
  return reply({ archived: true, itemId }, 200, corsOrigin);
}

export async function handleBusinessCatalogRoute({ request, env, url, corsOrigin, businessId, itemId = "", ownerId }) {
  try {
    if (!env.NAVA_DB) return fail("دیتابیس کسب‌وکار در دسترس نیست.", 503, corsOrigin);
    if (!/^biz-[0-9a-f-]{36}$/i.test(businessId || "")) return fail("شناسه کسب‌وکار معتبر نیست.", 400, corsOrigin);
    if (itemId && !/^item-[0-9a-f-]{36}$/i.test(itemId)) return fail("شناسه محصول یا خدمت معتبر نیست.", 400, corsOrigin);
    const business = await ownedBusiness(env.NAVA_DB, businessId, ownerId);
    if (!business) return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);
    if (!itemId && request.method === "GET") return await listItems(env.NAVA_DB, businessId, ownerId, url, corsOrigin);
    if (!itemId && request.method === "POST") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      return await createItem(env.NAVA_DB, businessId, ownerId, input, corsOrigin);
    }
    if (itemId && request.method === "PATCH") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      return await updateItem(env.NAVA_DB, businessId, ownerId, itemId, input, corsOrigin);
    }
    if (itemId && request.method === "DELETE") return await archiveItem(env.NAVA_DB, businessId, ownerId, itemId, corsOrigin);
    return fail("روش درخواست برای این مسیر پشتیبانی نمی‌شود.", 405, corsOrigin);
  } catch (error) {
    console.error("[NAVA BUSINESS CATALOG] Request failed:", error);
    return fail("عملیات محصولات و خدمات انجام نشد. اجرای Migration کاتالوگ را بررسی کن.", 500, corsOrigin);
  }
}
