// NAVA BUSINESS — inventory movements and stock balances.
import { json, safeNaviText } from "./shared.js";

const reply = (data, status, origin) => json({ success: status < 400, ...data }, status, origin);
const fail = (message, status, origin) => reply({ error: message }, status, origin);
const clean = (value, max) => safeNaviText(value ?? "", max);
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

async function ownedBusiness(db, businessId, ownerId) {
  return db.prepare("SELECT id FROM business_profiles_v1 WHERE id = ? AND owner_id = ? AND status = 'active' LIMIT 1")
    .bind(businessId, ownerId).first();
}

export async function handleBusinessInventoryRoute({ request, env, url, corsOrigin, businessId, ownerId }) {
  try {
    const db = env.NAVA_DB;
    if (!db) return fail("دیتابیس کسب‌وکار در دسترس نیست.", 503, corsOrigin);
    if (!/^biz-[0-9a-f-]{36}$/i.test(businessId || "")) return fail("شناسه کسب‌وکار معتبر نیست.", 400, corsOrigin);
    if (!await ownedBusiness(db, businessId, ownerId)) return fail("پرونده کسب‌وکار پیدا نشد.", 404, corsOrigin);

    if (request.method === "GET") {
      const result = await db.prepare(
        "SELECT i.id, i.name, i.sku, i.unit, i.item_type, i.track_inventory, COALESCE(SUM(m.quantity_delta), 0) AS stock_quantity " +
        "FROM business_catalog_items_v1 i LEFT JOIN business_inventory_movements_v1 m ON m.catalog_item_id = i.id AND m.business_id = i.business_id AND m.owner_id = i.owner_id " +
        "WHERE i.business_id = ? AND i.owner_id = ? AND i.item_type = 'product' AND i.track_inventory = 1 " +
        "GROUP BY i.id ORDER BY i.name COLLATE NOCASE"
      ).bind(businessId, ownerId).all();
      const movements = await db.prepare(
        "SELECT m.id, m.catalog_item_id, i.name AS item_name, m.movement_type, m.quantity_delta, m.movement_date, m.notes, m.reference_transaction_id, m.created_at " +
        "FROM business_inventory_movements_v1 m JOIN business_catalog_items_v1 i ON i.id = m.catalog_item_id " +
        "WHERE m.business_id = ? AND m.owner_id = ? ORDER BY m.created_at DESC LIMIT 100"
      ).bind(businessId, ownerId).all();
      const items = (result.results || []).map(row => ({
        id: row.id, name: row.name, sku: row.sku || "", unit: row.unit || "عدد",
        stockQuantity: Number(row.stock_quantity || 0)
      }));
      return reply({ items, movements: (movements.results || []).map(row => ({
        id: row.id, itemId: row.catalog_item_id, itemName: row.item_name,
        movementType: row.movement_type, quantityDelta: Number(row.quantity_delta),
        movementDate: row.movement_date, notes: row.notes || "",
        referenceTransactionId: row.reference_transaction_id || null, createdAt: row.created_at
      })) }, 200, corsOrigin);
    }

    if (request.method === "POST") {
      let input;
      try { input = await request.json(); } catch { return fail("بدنه درخواست معتبر نیست.", 400, corsOrigin); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return fail("اطلاعات ورود یا خروج کالا معتبر نیست.", 400, corsOrigin);
      const itemId = String(input.itemId || "");
      if (!/^item-[0-9a-f-]{36}$/i.test(itemId)) return fail("شناسه محصول معتبر نیست.", 400, corsOrigin);
      const movementType = String(input.movementType || "");
      if (!["opening", "inbound", "outbound", "adjustment"].includes(movementType)) return fail("نوع گردش موجودی معتبر نیست.", 400, corsOrigin);
      const quantity = Number(input.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000000) return fail("تعداد باید عدد صحیح مثبت باشد.", 400, corsOrigin);
      const movementDate = String(input.movementDate || "");
      if (!validDate(movementDate)) return fail("تاریخ گردش موجودی معتبر نیست.", 400, corsOrigin);
      const notes = clean(input.notes || "", 500);
      const item = await db.prepare(
        "SELECT id, item_type, track_inventory FROM business_catalog_items_v1 WHERE id = ? AND business_id = ? AND owner_id = ? AND status = 'active' LIMIT 1"
      ).bind(itemId, businessId, ownerId).first();
      if (!item || item.item_type !== "product" || Number(item.track_inventory) !== 1) {
        return fail("این محصول فعال نیست یا مدیریت موجودی آن روشن نشده است.", 409, corsOrigin);
      }
      if (movementType === "opening") {
        const prior = await db.prepare(
          "SELECT id FROM business_inventory_movements_v1 WHERE catalog_item_id = ? AND business_id = ? AND owner_id = ? LIMIT 1"
        ).bind(itemId, businessId, ownerId).first();
        if (prior) return fail("موجودی اولیه قبلاً ثبت شده است؛ برای تغییر موجودی از اصلاح موجودی استفاده کن.", 409, corsOrigin);
      }
      const delta = movementType === "outbound" ? -quantity : quantity;
      const balance = await db.prepare(
        "SELECT COALESCE(SUM(quantity_delta), 0) AS quantity FROM business_inventory_movements_v1 WHERE catalog_item_id = ? AND business_id = ? AND owner_id = ?"
      ).bind(itemId, businessId, ownerId).first();
      const current = Number(balance?.quantity || 0);
      if (delta < 0 && current < quantity) return fail("موجودی کافی نیست؛ خروج کالا بیشتر از موجودی فعلی مجاز نیست.", 409, corsOrigin);
      if (movementType === "opening" && current !== 0) return fail("موجودی اولیه فقط برای کالای بدون گردش قبلی قابل ثبت است.", 409, corsOrigin);
      const id = "mov-" + crypto.randomUUID();
      const result = await db.prepare(
        "INSERT INTO business_inventory_movements_v1 (id, business_id, owner_id, catalog_item_id, movement_type, quantity_delta, movement_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(id, businessId, ownerId, itemId, movementType, delta, movementDate, notes).run();
      if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Inventory movement insert not confirmed.");
      return reply({ saved: true, movement: { id, itemId, movementType, quantityDelta: delta, movementDate, notes }, stockQuantity: current + delta }, 201, corsOrigin);
    }
    return fail("روش درخواست برای موجودی پشتیبانی نمی‌شود.", 405, corsOrigin);
  } catch (error) {
    console.error("[NAVA BUSINESS INVENTORY] Request failed:", error);
    return fail("عملیات موجودی انجام نشد. اجرای Migration موجودی را بررسی کن.", 500, corsOrigin);
  }
}
