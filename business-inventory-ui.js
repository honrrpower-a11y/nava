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
  const dateInput = $("bizInventoryDate");
  const dateDisplay = $("bizInventoryDateDisplay");
  const calendar = $("bizInventoryCalendar");
  const calendarToggle = $("bizInventoryCalendarToggle");
  const calendarMonthLabel = $("bizInventoryCalendarMonth");
  const calendarDays = $("bizInventoryCalendarDays");
  const persianPartsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC"
  });
  const persianDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
  const persianMonthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", timeZone: "UTC"
  });
  let calendarYear = 0;
  let calendarMonth = 0;

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

  function localToday() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function utcDate(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  function persianParts(iso) {
    const values = {};
    for (const part of persianPartsFormatter.formatToParts(utcDate(iso))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    return { year: values.year, month: values.month, day: values.day };
  }
  function isoFromUtcDate(date) {
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  }
  function formatPersianDate(iso) {
    return iso ? persianDateFormatter.format(utcDate(iso)) : "";
  }
  function findPersianMonthDates(year, month) {
    const matches = [];
    const start = Date.UTC(year + 621, 0, 1);
    const end = Date.UTC(year + 623, 0, 1);
    for (let time = start; time < end; time += 86400000) {
      const date = new Date(time);
      const iso = isoFromUtcDate(date);
      const parts = persianParts(iso);
      if (parts.year === year && parts.month === month) {
        matches.push({ iso, day: parts.day, weekday: (date.getUTCDay() + 1) % 7 });
      }
    }
    return matches;
  }
  function showCalendar(open) {
    if (!calendar || !calendarToggle) return;
    calendar.hidden = !open;
    calendarToggle.setAttribute("aria-expanded", String(open));
    if (open) renderCalendar();
  }
  function renderCalendar() {
    if (!calendarDays || !calendarMonthLabel) return;
    const dates = findPersianMonthDates(calendarYear, calendarMonth);
    if (!dates.length) return;
    calendarMonthLabel.textContent = persianMonthFormatter.format(utcDate(dates[0].iso));
    calendarDays.replaceChildren();
    for (let i = 0; i < dates[0].weekday; i++) {
      const blank = document.createElement("span");
      blank.className = "biz-calendar-empty";
      calendarDays.append(blank);
    }
    for (const date of dates) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = date.day.toLocaleString("fa-IR");
      button.dataset.date = date.iso;
      if (date.iso === dateInput.value) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      }
      button.addEventListener("click", () => {
        setDateValue(date.iso);
        showCalendar(false);
      });
      calendarDays.append(button);
    }
  }
  function setDateValue(iso) {
    if (!dateInput || !dateDisplay) return;
    dateInput.value = iso;
    dateDisplay.value = formatPersianDate(iso);
    const parts = persianParts(iso);
    calendarYear = parts.year;
    calendarMonth = parts.month;
  }
  function moveCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
    renderCalendar();
  }
  calendarToggle?.addEventListener("click", () => {
    if (!dateInput.value) setDateValue(localToday());
    if (calendar.hidden) {
      const parts = persianParts(dateInput.value);
      calendarYear = parts.year;
      calendarMonth = parts.month;
    }
    showCalendar(calendar.hidden);
  });
  $("bizInventoryCalendarPrev")?.addEventListener("click", () => moveCalendarMonth(-1));
  $("bizInventoryCalendarNext")?.addEventListener("click", () => moveCalendarMonth(1));
  document.addEventListener("click", event => {
    if (calendar && !calendar.hidden && !calendar.contains(event.target) &&
        !calendarToggle?.contains(event.target) && !dateDisplay?.contains(event.target)) showCalendar(false);
  });

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
      $("bizInventoryBalances").textContent = "برای مشاهده موجودی، از بخش «کسب‌وکارهای من» در بالای صفحه یک پرونده کسب‌وکار انتخاب کن. اگر هنوز پرونده‌ای نداری، نام کسب‌وکارت را وارد کن و «ایجاد پرونده» را بزن.";
      $("bizInventoryMovements").textContent = "";
      $("bizInventoryItem").replaceChildren(new Option("ابتدا پرونده کسب‌وکار را از بالای صفحه انتخاب کن", ""));
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
    if (!id) { say("ابتدا از بخش «کسب‌وکارهای من» در بالای صفحه یک پرونده کسب‌وکار انتخاب کن.", "error"); return; }
    if (!itemId) { say("حالا محصول دارای کنترل موجودی را از فهرست انتخاب کن.", "error"); return; }
    if (quantity === null || quantity <= 0 || !movementDate) { say("تعداد و تاریخ را درست وارد کن.", "error"); return; }
    const submit = $("bizInventorySubmit");
    submit.disabled = true;
    try {
      await api("/" + encodeURIComponent(id) + "/inventory", "POST", {
        itemId, movementType, quantity, movementDate, notes: $("bizInventoryNotes").value.trim()
      });
      form.reset();
      setDateValue(localToday());
      say("گردش موجودی ثبت شد.", "success");
      await load();
    } catch (error) {
      say(error.message, "error");
    } finally { submit.disabled = false; }
  });
  setDateValue(localToday());
  $("bizProfileSelect")?.addEventListener("change", load);
  window.addEventListener("nava:business-selection-changed", load);
  window.addEventListener("nava:business-auth-changed", load);
  window.addEventListener("nava:business-order-updated", load);
  window.addEventListener("focus", load);
  load();
})();
