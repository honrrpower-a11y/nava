/* NAVA BUSINESS — inventory workspace UI. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizInventoryForm");
  if (!form) return;
  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const token = () => {
    try {
      const expiry = Number(localStorage.getItem("nava_navi_expiry") || 0);
      const value = localStorage.getItem("nava_navi_session") || "";
      return expiry > Date.now() ? value : "";
    } catch { return ""; }
  };
  const businessId = () => $("bizProfileSelect")?.value || "";
  const moneyQty = value => Number(value || 0).toLocaleString("fa-IR");
  const normalizeDigits = value => String(value || "")
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const parseInteger = value => {
    const normalized = normalizeDigits(value).replace(/[٬,،\s]/g, "");
    if (!/^\d+$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isSafeInteger(number) ? number : null;
  };
  const say = (message, state = "") => {
    const node = $("bizInventoryStatus");
    if (node) { node.textContent = message; node.dataset.state = state; }
  };
  async function api(path, method = "GET", body) {
    const auth = token();
    if (!auth) throw new Error("برای مدیریت انبار ابتدا وارد حساب نوا شو.");
    const response = await fetch(API + path, {
      method,
      headers: { Authorization: "Bearer " + auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "عملیات موجودی انجام نشد.");
    return data;
  }
  function renderBalances(items) {
    const root = $("bizInventoryBalances");
    root.replaceChildren();
    if (!items.length) {
      root.textContent = "هنوز محصولی با مدیریت موجودی فعال وجود ندارد. از کاتالوگ، کنترل موجودی یک محصول را روشن کن.";
      return;
    }
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "biz-inventory-balance";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("small");
      meta.textContent = (item.sku ? "کد: " + item.sku + " · " : "") + "واحد: " + item.unit;
      const quantity = document.createElement("b");
      quantity.textContent = moneyQty(item.stockQuantity) + " " + item.unit;
      card.append(name, meta, quantity);
      root.append(card);
    }
    const select = $("bizInventoryItem");
    const previous = select.value;
    select.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "انتخاب محصول دارای کنترل موجودی";
    select.append(empty);
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name + " — موجودی: " + moneyQty(item.stockQuantity) + " " + item.unit;
      select.append(option);
    }
    if (items.some(item => item.id === previous)) select.value = previous;
  }
  function movementLabel(type) {
    return ({ opening: "موجودی اولیه", inbound: "ورود کالا", outbound: "خروج دستی", adjustment: "اصلاح افزایشی", sale: "فروش", return: "مرجوعی" })[type] || "گردش موجودی";
  }
  function renderMovements(movements) {
    const root = $("bizInventoryMovements");
    root.replaceChildren();
    if (!movements.length) { root.textContent = "هنوز گردش موجودی ثبت نشده است."; return; }
    for (const item of movements) {
      const row = document.createElement("article");
      row.className = "biz-inventory-movement";
      const title = document.createElement("strong");
      title.textContent = item.itemName + " · " + movementLabel(item.movementType);
      const detail = document.createElement("small");
      detail.textContent = item.movementDate + (item.notes ? " · " + item.notes : "");
      const amount = document.createElement("b");
      amount.textContent = (item.quantityDelta > 0 ? "+" : "−") + moneyQty(Math.abs(item.quantityDelta));
      amount.dataset.direction = item.quantityDelta > 0 ? "in" : "out";
      row.append(title, detail, amount);
      root.append(row);
    }
  }
  async function load() {
    const id = businessId();
    if (!id) {
      $("bizInventoryBalances").textContent = "برای مشاهده موجودی، یک پرونده فعال انتخاب کن.";
      $("bizInventoryMovements").textContent = "";
      $("bizInventoryItem").replaceChildren(new Option("ابتدا پرونده را انتخاب کن", ""));
      return;
    }
    try {
      const data = await api("/" + encodeURIComponent(id) + "/inventory");
      renderBalances(data.items || []);
      renderMovements(data.movements || []);
      say("موجودی و گردش‌های انبار بارگذاری شد.", "success");
    } catch (error) {
      say(error.message, "error");
      $("bizInventoryBalances").textContent = "بارگذاری موجودی انجام نشد.";
    }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = businessId();
    const itemId = $("bizInventoryItem").value;
    const quantity = parseInteger($("bizInventoryQuantity").value);
    const movementType = $("bizInventoryMovementType").value;
    const movementDate = $("bizInventoryDate").value;
    if (!id || !itemId) { say("ابتدا پرونده و محصول را انتخاب کن.", "error"); return; }
    if (quantity === null || quantity <= 0 || !movementDate) { say("تعداد و تاریخ را درست وارد کن.", "error"); return; }
    const submit = $("bizInventorySubmit");
    submit.disabled = true;
    try {
      await api("/" + encodeURIComponent(id) + "/inventory", "POST", {
        itemId, movementType, quantity, movementDate, notes: $("bizInventoryNotes").value.trim()
      });
      form.reset();
      $("bizInventoryDate").value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      say("گردش موجودی ثبت شد.", "success");
      await load();
    } catch (error) {
      say(error.message, "error");
    } finally { submit.disabled = false; }
  });
  $("bizInventoryDate").value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("bizProfileSelect")?.addEventListener("change", load);
  window.addEventListener("nava:business-selection-changed", load);
  window.addEventListener("nava:business-auth-changed", load);
  window.addEventListener("focus", load);
  load();
})();
