/* NAVA BUSINESS — product and service catalogue UI. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("bizCatalogForm");
  const list = $("bizCatalogList");
  if (!form || !list) return;

  const API = "https://nava-music-api.honrrpower.workers.dev/businesses";
  const ACTIVE_KEY = "nava_business_active_id";
  const SESSION_KEY = "nava_navi_session";
  const EXPIRY_KEY = "nava_navi_expiry";
  let items = [];
  let busy = false;

  const money = value => Number(value || 0).toLocaleString("fa-IR") + " تومان";
  const setStatus = (message, state = "") => {
    const node = $("bizCatalogStatus");
    if (node) {
      node.textContent = message;
      node.dataset.state = state;
    }
  };
  function token() {
    try {
      const value = localStorage.getItem(SESSION_KEY) || "";
      const expiry = Number(localStorage.getItem(EXPIRY_KEY) || 0);
      return expiry > Date.now() ? value : "";
    } catch { return ""; }
  }
  function businessId() {
    return $("bizProfileSelect")?.value || localStorage.getItem(ACTIVE_KEY) || "";
  }
  async function api(path, method = "GET", body) {
    const auth = token();
    if (!auth) throw new Error("برای مدیریت محصولات و خدمات ابتدا وارد حساب نوا شو.");
    const response = await fetch(API + path, {
      method,
      headers: {
        Authorization: "Bearer " + auth,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "درخواست کاتالوگ انجام نشد.");
    return data;
  }
  function resetForm() {
    form.reset();
    $("bizCatalogItemId").value = "";
    $("bizCatalogItemType").value = "product";
    $("bizCatalogUnit").value = "عدد";
    $("bizCatalogSalePrice").value = "0";
    $("bizCatalogSubmit").textContent = "ثبت در کاتالوگ";
    $("bizCatalogFormStep").textContent = "ثبت مورد جدید";
    $("bizCatalogFormTitle").textContent = "اطلاعات محصول یا خدمت";
    $("bizCatalogCancelEdit").hidden = true;
  }
  function editItem(item) {
    $("bizCatalogItemId").value = item.id;
    $("bizCatalogItemType").value = item.itemType;
    $("bizCatalogName").value = item.name;
    $("bizCatalogSku").value = item.sku;
    $("bizCatalogCategory").value = item.category;
    $("bizCatalogUnit").value = item.unit;
    $("bizCatalogSalePrice").value = String(item.salePriceToman);
    $("bizCatalogCostPrice").value = item.costPriceToman == null ? "" : String(item.costPriceToman);
    $("bizCatalogDescription").value = item.description;
    $("bizCatalogSubmit").textContent = "ذخیره تغییرات";
    $("bizCatalogFormStep").textContent = "ویرایش مورد";
    $("bizCatalogFormTitle").textContent = "اصلاح اطلاعات";
    $("bizCatalogCancelEdit").hidden = false;
    setStatus("در حال ویرایش «" + item.name + "» هستی.");
    $("bizCatalogName").focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function render() {
    const type = $("bizCatalogTypeFilter").value;
    const status = $("bizCatalogStatusFilter").value;
    const visible = items.filter(item =>
      (type === "all" || item.itemType === type) &&
      (status === "all" || item.status === status)
    );
    const activeCount = items.filter(item => item.status === "active").length;
    $("bizCatalogCount").textContent = activeCount.toLocaleString("fa-IR") + " مورد فعال";
    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "biz-catalog-empty";
      empty.textContent = status === "archived"
        ? "مورد بایگانی‌شده‌ای در این فیلتر وجود ندارد."
        : "هنوز محصول یا خدمتی ثبت نشده است. از فرم کنار صفحه اولین مورد را اضافه کن.";
      list.append(empty);
      return;
    }
    for (const item of visible) {
      const card = document.createElement("article");
      card.className = "biz-catalog-item";
      card.dataset.status = item.status;

      const top = document.createElement("div");
      top.className = "biz-catalog-item-top";
      const title = document.createElement("div");
      title.className = "biz-catalog-item-title";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "biz-catalog-item-meta";
      const chips = [
        item.itemType === "product" ? "محصول" : "خدمت",
        item.sku ? "کد: " + item.sku : "",
        item.category,
        "واحد: " + item.unit,
        item.status === "archived" ? "بایگانی‌شده" : "فعال"
      ].filter(Boolean);
      for (const value of chips) {
        const chip = document.createElement("span");
        chip.className = "biz-catalog-chip";
        chip.textContent = value;
        meta.append(chip);
      }
      title.append(name, meta);
      top.append(title);

      const prices = document.createElement("div");
      prices.className = "biz-catalog-prices";
      const sale = document.createElement("span");
      sale.textContent = "قیمت فروش: ";
      const saleValue = document.createElement("strong");
      saleValue.textContent = money(item.salePriceToman);
      sale.append(saleValue);
      prices.append(sale);
      const cost = document.createElement("span");
      cost.textContent = "بهای تمام‌شده: ";
      const costValue = document.createElement("strong");
      costValue.textContent = item.costPriceToman == null ? "ثبت نشده" : money(item.costPriceToman);
      cost.append(costValue);
      prices.append(cost);

      card.append(top, prices);
      if (item.description) {
        const description = document.createElement("p");
        description.className = "biz-catalog-description";
        description.textContent = item.description;
        card.append(description);
      }
      const actions = document.createElement("div");
      actions.className = "biz-catalog-item-actions";
      if (item.status === "active") {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.dataset.action = "edit";
        edit.textContent = "ویرایش";
        edit.addEventListener("click", () => editItem(item));
        const archive = document.createElement("button");
        archive.type = "button";
        archive.dataset.action = "archive";
        archive.textContent = "بایگانی";
        archive.addEventListener("click", async () => {
          if (!window.confirm("«" + item.name + "» بایگانی شود؟ اطلاعات آن حذف دائمی نمی‌شود.")) return;
          archive.disabled = true;
          try {
            await api("/" + encodeURIComponent(businessId()) + "/items/" + encodeURIComponent(item.id), "DELETE");
            if ($("bizCatalogItemId").value === item.id) resetForm();
            setStatus("مورد بایگانی شد؛ اطلاعات آن حفظ شده است.", "success");
            await load();
          } catch (error) {
            setStatus(error.message, "error");
            archive.disabled = false;
          }
        });
        actions.append(edit, archive);
      }
      card.append(actions);
      list.append(card);
    }
  }
  async function load() {
    const id = businessId();
    if (!id) {
      items = [];
      render();
      list.textContent = "برای مشاهده کاتالوگ، یک پرونده فعال انتخاب کن.";
      setStatus("برای مدیریت کاتالوگ، یک پرونده فعال انتخاب کن.");
      return;
    }
    try {
      const data = await api("/" + encodeURIComponent(id) + "/items?status=all");
      items = Array.isArray(data.items) ? data.items : [];
      render();
      setStatus(items.length ? "کاتالوگ پرونده بارگذاری شد." : "کاتالوگ خالی است؛ اولین محصول یا خدمت را ثبت کن.", "success");
    } catch (error) {
      items = [];
      render();
      setStatus(error.message, "error");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const id = businessId();
    if (!id) { setStatus("ابتدا یک پرونده کسب‌وکار انتخاب کن.", "error"); return; }
    const name = $("bizCatalogName").value.trim();
    const salePriceToman = Number($("bizCatalogSalePrice").value);
    const costRaw = $("bizCatalogCostPrice").value.trim();
    const costPriceToman = costRaw === "" ? null : Number(costRaw);
    if (name.length < 2 || !Number.isSafeInteger(salePriceToman) || salePriceToman < 0 ||
        (costPriceToman !== null && (!Number.isSafeInteger(costPriceToman) || costPriceToman < 0))) {
      setStatus("نام و قیمت فروش معتبر را وارد کن؛ بهای تمام‌شده نیز باید عدد صحیح صفر یا بیشتر باشد.", "error");
      return;
    }
    const body = {
      itemType: $("bizCatalogItemType").value,
      name,
      sku: $("bizCatalogSku").value.trim(),
      category: $("bizCatalogCategory").value.trim(),
      unit: $("bizCatalogUnit").value.trim() || ($("bizCatalogItemType").value === "service" ? "خدمت" : "عدد"),
      salePriceToman,
      costPriceToman,
      description: $("bizCatalogDescription").value.trim()
    };
    const itemId = $("bizCatalogItemId").value;
    busy = true;
    $("bizCatalogSubmit").disabled = true;
    try {
      await api("/" + encodeURIComponent(id) + "/items" + (itemId ? "/" + encodeURIComponent(itemId) : ""), itemId ? "PATCH" : "POST", body);
      resetForm();
      setStatus(itemId ? "تغییرات با موفقیت ذخیره شد." : "محصول یا خدمت به کاتالوگ اضافه شد.", "success");
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
      $("bizCatalogSubmit").disabled = false;
    }
  });

  $("bizCatalogCancelEdit").addEventListener("click", () => {
    resetForm();
    setStatus("ویرایش لغو شد.");
  });
  $("bizCatalogTypeFilter").addEventListener("change", render);
  $("bizCatalogStatusFilter").addEventListener("change", render);
  $("bizCatalogItemType").addEventListener("change", () => {
    const unit = $("bizCatalogUnit");
    if (!unit.value || unit.value === "عدد" || unit.value === "خدمت") {
      unit.value = $("bizCatalogItemType").value === "service" ? "خدمت" : "عدد";
    }
  });
  $("bizProfileSelect")?.addEventListener("change", () => {
    resetForm();
    load();
  });
  window.addEventListener("nava:business-selection-changed", () => {
    resetForm();
    load();
  });
  window.addEventListener("nava:business-auth-changed", load);
  window.addEventListener("focus", load);
  load();
})();
