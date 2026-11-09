import { NAVI_MEMORY_API, state, getNaviToken, clearNaviSession, showLoginError, naviMemoryToggle, naviMemoryContent, naviMemoryList, naviMemoryStatus, naviMemoryError, naviMemoryRefresh } from "./navi-core.js";

export function setNaviMemoryStatus(message) {
  naviMemoryStatus.textContent = message;
}

export function showNaviMemoryError(message) {
  naviMemoryError.textContent = message || "";
}

export function resetNaviMemoryPanel() {
  naviMemoryToggle.setAttribute("aria-expanded", "false");
  naviMemoryContent.hidden = true;

  naviMemoryList.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "navi-memory-empty";
  empty.textContent = "برای مشاهده حافظه‌ها وارد ناوی شو.";

  naviMemoryList.appendChild(empty);

  naviMemoryStatus.textContent = "حافظه‌ها بارگذاری نشده‌اند.";
  naviMemoryError.textContent = "";

  naviMemoryRefresh.disabled = false;
  naviMemoryRefresh.textContent = "تازه‌سازی حافظه‌ها";
}

export function formatNaviMemoryDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

export function normalizeNaviMemories(data) {
  let source = [];

  if (Array.isArray(data)) {
    source = data;
  } else if (data && Array.isArray(data.memories)) {
    source = data.memories;
  } else if (data && data.data && Array.isArray(data.data.memories)) {
    source = data.data.memories;
  }

  return source
    .filter(item => item && typeof item === "object")
    .map(item => ({
      id: Number(item.id),
      memory_key: String(item.memory_key ?? "بدون عنوان"),
      memory_value: String(item.memory_value ?? ""),
      source: String(item.source ?? ""),
      created_at: item.created_at ?? "",
      updated_at: item.updated_at ?? ""
    }))
    .filter(item => Number.isSafeInteger(item.id) && item.id > 0);
}


/* =========================================
   NAVI MEMORY — SAFE RENDERING
========================================= */

export function renderApprovedNaviMemories(memories) {
  naviMemoryList.replaceChildren();

  if (!Array.isArray(memories) || memories.length === 0) {
    const empty = document.createElement("div");
    empty.className = "navi-memory-empty";
    empty.textContent = "در حال حاضر حافظه‌ای برای نمایش وجود ندارد.";
    naviMemoryList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  memories.forEach(memory => {
    const card = document.createElement("article");
    card.className = "navi-memory-card";
    card.dataset.memoryId = String(memory.id);

    const key = document.createElement("div");
    key.className = "navi-memory-key";
    key.textContent = memory.memory_key;

    const value = document.createElement("div");
    value.className = "navi-memory-value";
    value.textContent = memory.memory_value || "محتوای این حافظه خالی است.";

    const meta = document.createElement("div");
    meta.className = "navi-memory-meta";

    if (memory.source) {
      const source = document.createElement("span");
      source.textContent = "منبع: " + memory.source;
      meta.appendChild(source);
    }

    const dateValue = memory.updated_at || memory.created_at;

    if (dateValue) {
      const date = document.createElement("span");
      date.textContent = "آخرین ثبت: " + formatNaviMemoryDate(dateValue);
      meta.appendChild(date);
    }

    const actions = document.createElement("div");
    actions.className = "navi-memory-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "navi-memory-edit";
    editButton.textContent = "ویرایش";

    editButton.addEventListener("click", () => {
      openNaviMemoryEditor(memory, card);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "navi-memory-delete";
    deleteButton.textContent = "حذف";

    deleteButton.addEventListener("click", () => {
      deleteNaviMemory(memory.id, deleteButton);
    });

    actions.append(editButton, deleteButton);
    card.append(key, value, meta, actions);
    fragment.appendChild(card);
  });

  naviMemoryList.appendChild(fragment);
}


export function renderNaviMemories(memories, proposals = []) {
  renderApprovedNaviMemories(memories);

  if ((!Array.isArray(memories) || memories.length === 0) &&
      Array.isArray(proposals) && proposals.length > 0) {
    const emptyState = naviMemoryList.querySelector(".navi-memory-empty");
    if (emptyState) emptyState.remove();
  }

  if (!Array.isArray(proposals) || proposals.length === 0) return;

  const heading = document.createElement("div");
  heading.className = "navi-memory-section-title";
  heading.textContent = "پیشنهادهای در انتظار تأیید (" + proposals.length + ")";
  naviMemoryList.appendChild(heading);

  proposals.forEach(proposal => {
    const card = document.createElement("article");
    card.className = "navi-memory-card navi-memory-proposal";
    card.dataset.proposalId = String(proposal.id);

    const key = document.createElement("div");
    key.className = "navi-memory-key";
    key.textContent = proposal.memory_key || "پیشنهاد ناوی";

    const value = document.createElement("div");
    value.className = "navi-memory-value";
    value.textContent = proposal.memory_value || "";

    const meta = document.createElement("div");
    meta.className = "navi-memory-meta";
    const pendingLabel = document.createElement("span");
    pendingLabel.textContent = "در انتظار تأیید تو";
    meta.appendChild(pendingLabel);
    if (proposal.created_at) {
      const date = document.createElement("span");
      date.textContent = "تاریخ پیشنهاد: " + formatNaviMemoryDate(proposal.created_at);
      meta.appendChild(date);
    }

    const editor = document.createElement("textarea");
    editor.className = "navi-memory-editor";
    editor.value = proposal.memory_value || "";
    editor.setAttribute("aria-label", "ویرایش پیشنهاد حافظه");
    editor.hidden = true;

    const actions = document.createElement("div");
    actions.className = "navi-memory-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "navi-memory-edit";
    editButton.textContent = "ویرایش";
    editButton.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      editButton.textContent = editor.hidden ? "ویرایش" : "بستن ویرایش";
      if (!editor.hidden) editor.focus();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "navi-memory-save";
    saveButton.textContent = "ذخیره ویرایش";
    saveButton.addEventListener("click", () => {
      manageNaviProposal(proposal.id, "update_pending", editor.value, saveButton);
    });

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "navi-memory-approve";
    approveButton.textContent = "تأیید و ذخیره";
    approveButton.addEventListener("click", () => {
      const edited = editor.hidden ? null : editor.value;
      manageNaviProposal(proposal.id, "approve", edited, approveButton);
    });

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.className = "navi-memory-reject";
    rejectButton.textContent = "رد پیشنهاد";
    rejectButton.addEventListener("click", () => {
      if (window.confirm("این پیشنهاد بایگانی شود؟")) {
        manageNaviProposal(proposal.id, "reject", null, rejectButton);
      }
    });

    actions.append(editButton, saveButton, approveButton, rejectButton);
    card.append(key, value, meta, editor, actions);
    naviMemoryList.appendChild(card);
  });
}

export async function manageNaviProposal(id, action, memoryValue, button) {
  const token = getNaviToken();
  if (!token) {
    clearNaviSession();
    showLoginError("نشست ناوی پایان یافته است. دوباره وارد شو.");
    return;
  }
  if (state.naviMemoryBusy) return;
  if ((action === "update_pending" || (action === "approve" && memoryValue !== null)) &&
      !String(memoryValue || "").trim()) {
    showNaviMemoryError("متن پیشنهاد نمی‌تواند خالی باشد.");
    return;
  }

  const requestVersion = state.naviSessionVersion;
  state.naviMemoryBusy = true;
  button.disabled = true;
  const oldLabel = button.textContent;
  button.textContent = "در حال انجام...";
  showNaviMemoryError("");

  try {
    const payload = { action, id: Number(id) };
    if (memoryValue !== null && memoryValue !== undefined) {
      payload.memory_value = String(memoryValue).trim();
    }

    const response = await fetch(NAVI_MEMORY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (getNaviToken() !== token || state.naviSessionVersion !== requestVersion) return;
    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ناوی معتبر نیست. دوباره وارد شو.");
      throw new Error("دسترسی تأیید نشد؛ دوباره وارد شو.");
    }
    if (!response.ok || data.success === false) {
      throw new Error(data.error || data.diagnostic || "عملیات روی پیشنهاد انجام نشد.");
    }

    await loadNaviMemories(true);
    if (getNaviToken() === token && state.naviSessionVersion === requestVersion) {
      setNaviMemoryStatus(
        action === "approve" ? "پیشنهاد تأیید و به حافظه منتقل شد." :
        action === "reject" ? "پیشنهاد رد و بایگانی شد." :
        "پیشنهاد ویرایش و ذخیره شد."
      );
    }
  } catch (error) {
    if (state.naviSessionVersion === requestVersion) {
      showNaviMemoryError(error.message || "عملیات ناموفق بود.");
      button.disabled = false;
      button.textContent = oldLabel;
    }
  } finally {
    if (state.naviSessionVersion === requestVersion) state.naviMemoryBusy = false;
  }
}


/* =========================================
   NAVI MEMORY — LOAD FROM WORKER
========================================= */

export async function loadNaviMemories(forceRefresh = false) {
  const token = getNaviToken();

  if (!token) {
    setNaviMemoryStatus("برای مشاهده حافظه‌ها دوباره وارد ناوی شو.");
    return false;
  }

  if (state.naviMemoryLoading && state.naviMemoryLoadPromise) {
    return state.naviMemoryLoadPromise;
  }

  if (state.naviMemoryLoaded && !forceRefresh) {
    return true;
  }

  const requestVersion = state.naviSessionVersion;

  state.naviMemoryLoading = true;
  naviMemoryRefresh.disabled = true;
  naviMemoryRefresh.textContent = "در حال دریافت...";
  setNaviMemoryStatus("در حال دریافت حافظه‌های ناوی...");
  showNaviMemoryError("");

  state.naviMemoryLoadPromise = (async () => {
    try {
      const response = await fetch(NAVI_MEMORY_API, {
        method: "GET",
        headers: { "Authorization": "Bearer " + token },
        cache: "no-store"
      });

      let data;

      try {
        data = await response.json();
      } catch (error) {
        throw new Error("پاسخ حافظه‌ها از سرور قابل خواندن نیست.");
      }

      if (
        getNaviToken() !== token ||
        state.naviSessionVersion !== requestVersion
      ) {
        return false;
      }

      if (response.status === 401 || response.status === 403) {
        clearNaviSession();
        showLoginError("نشست ناوی معتبر نیست یا پایان یافته است. دوباره وارد شو.");
        throw new Error("دسترسی به حافظه تأیید نشد. دوباره وارد ناوی شو.");
      }

      if (!response.ok || (data && data.success === false)) {
        throw new Error(
          (data && (data.error || data.diagnostic)) ||
          "دریافت حافظه‌های ناوی ناموفق بود."
        );
      }

      state.naviMemory = normalizeNaviMemories(data);
      state.naviProposals = Array.isArray(data.proposals)
        ? data.proposals
            .filter(item => item && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0)
            .map(item => ({
              id: Number(item.id),
              memory_key: String(item.memory_key || "پیشنهاد ناوی"),
              memory_value: String(item.memory_value || ""),
              source: String(item.source || ""),
              created_at: item.created_at || "",
              updated_at: item.updated_at || ""
            }))
        : [];
      state.naviMemoryLoaded = true;

      renderNaviMemories(state.naviMemory, state.naviProposals);

      setNaviMemoryStatus(
        state.naviMemory.length + " حافظه تأییدشده" +
        (state.naviProposals.length ? " · " + state.naviProposals.length + " پیشنهاد در انتظار تأیید" : "")
      );

      return true;

    } catch (error) {
      if (state.naviSessionVersion !== requestVersion) return false;

      console.error("NAVI memory load error:", error);

      showNaviMemoryError(
        error.message || "دریافت حافظه‌ها با خطا مواجه شد."
      );

      if (!state.naviMemoryLoaded) {
        naviMemoryList.replaceChildren();

        const empty = document.createElement("div");
        empty.className = "navi-memory-empty";
        empty.textContent = "دریافت حافظه‌ها انجام نشد. دوباره تلاش کن.";

        naviMemoryList.appendChild(empty);
      }

      setNaviMemoryStatus("اتصال به بخش حافظه برقرار نشد.");
      return false;

    } finally {
      if (state.naviSessionVersion === requestVersion) {
        state.naviMemoryLoading = false;
        state.naviMemoryLoadPromise = null;
        naviMemoryRefresh.disabled = false;
        naviMemoryRefresh.textContent = "تازه‌سازی حافظه‌ها";
      }
    }
  })();

  return state.naviMemoryLoadPromise;
}


/* =========================================
   NAVI MEMORY — INLINE EDITOR
========================================= */

export function openNaviMemoryEditor(memory, card) {
  if (state.naviMemoryBusy) return;

  /*
    اگر ویرایشگر دیگری باز است، همان را نگه می‌داریم.
    دیگر refresh انجام نمی‌شود تا متن ویرایش قبلی از بین نرود.
  */
  const previousEditor = naviMemoryList.querySelector(".navi-memory-editor");

  if (previousEditor) {
    previousEditor.focus();
    return;
  }

  const valueElement = card.querySelector(".navi-memory-value");
  const actions = card.querySelector(".navi-memory-actions");

  if (!valueElement || !actions) return;

  const editor = document.createElement("textarea");
  editor.className = "navi-memory-editor";
  editor.value = memory.memory_value;
  editor.setAttribute("aria-label", "ویرایش محتوای حافظه");

  const editorActions = document.createElement("div");
  editorActions.className = "navi-memory-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "navi-memory-save";
  saveButton.textContent = "ذخیره تغییرات";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "navi-memory-cancel";
  cancelButton.textContent = "انصراف";

  saveButton.addEventListener("click", () => {
    updateNaviMemory(memory.id, editor.value, saveButton, editor);
  });

  cancelButton.addEventListener("click", () => {
    editor.remove();
    editorActions.remove();
    valueElement.hidden = false;
    actions.hidden = false;
  });

  valueElement.hidden = true;
  actions.hidden = true;

  card.insertBefore(editor, actions);
  card.insertBefore(editorActions, actions);
  editorActions.append(saveButton, cancelButton);

  editor.focus();
}


/* =========================================
   NAVI MEMORY — UPDATE
========================================= */

export async function updateNaviMemory(id, memoryValue, button, editor) {
  const token = getNaviToken();

  if (!token) {
    clearNaviSession();
    showLoginError("نشست ناوی پایان یافته است. دوباره وارد شو.");
    return;
  }

  const cleanValue = String(memoryValue || "").trim();

  if (!cleanValue) {
    showNaviMemoryError("محتوای حافظه نمی‌تواند خالی باشد.");
    editor.focus();
    return;
  }

  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    showNaviMemoryError("شناسه این حافظه معتبر نیست.");
    return;
  }

  if (state.naviMemoryBusy) return;

  const requestVersion = state.naviSessionVersion;

  state.naviMemoryBusy = true;
  button.disabled = true;
  button.textContent = "در حال ذخیره...";
  showNaviMemoryError("");
  setNaviMemoryStatus("در حال ذخیره تغییرات حافظه...");

  try {
    const response = await fetch(NAVI_MEMORY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        action: "update",
        id: Number(id),
        memory_value: cleanValue
      })
    });

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("پاسخ سرور هنگام ذخیره حافظه قابل خواندن نیست.");
    }

    if (
      getNaviToken() !== token ||
      state.naviSessionVersion !== requestVersion
    ) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ناوی معتبر نیست. دوباره وارد شو.");
      throw new Error("دسترسی تأیید نشد. دوباره وارد ناوی شو.");
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(
        (data && (data.error || data.diagnostic)) ||
        "ذخیره تغییرات حافظه ناموفق بود."
      );
    }

    setNaviMemoryStatus("تغییرات ذخیره شد؛ در حال دریافت نسخه به‌روز...");
    await loadNaviMemories(true);

    if (
      getNaviToken() === token &&
      state.naviSessionVersion === requestVersion
    ) {
      setNaviMemoryStatus("حافظه با موفقیت به‌روزرسانی شد.");
    }

  } catch (error) {
    if (state.naviSessionVersion !== requestVersion) return;

    console.error("NAVI memory update error:", error);

    showNaviMemoryError(
      error.message || "ویرایش حافظه انجام نشد."
    );

    if (getNaviToken() === token) {
      button.disabled = false;
      button.textContent = "ذخیره تغییرات";
    }

  } finally {
    if (state.naviSessionVersion === requestVersion) {
      state.naviMemoryBusy = false;
    }
  }
}


/* =========================================
   NAVI MEMORY — DELETE
========================================= */

export async function deleteNaviMemory(id, button) {
  const token = getNaviToken();

  if (!token) {
    clearNaviSession();
    showLoginError("نشست ناوی پایان یافته است. دوباره وارد شو.");
    return;
  }

  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    showNaviMemoryError("شناسه این حافظه معتبر نیست.");
    return;
  }

  if (state.naviMemoryBusy) return;

  const confirmed = window.confirm(
    "آیا مطمئنی می‌خواهی این حافظه را حذف کنی؟\nاین عملیات قابل بازگشت نیست."
  );

  if (!confirmed) return;

  const requestVersion = state.naviSessionVersion;

  state.naviMemoryBusy = true;
  button.disabled = true;
  button.textContent = "در حال حذف...";
  showNaviMemoryError("");
  setNaviMemoryStatus("در حال حذف حافظه...");

  try {
    const response = await fetch(NAVI_MEMORY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        action: "delete",
        id: Number(id)
      })
    });

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("پاسخ سرور هنگام حذف حافظه قابل خواندن نیست.");
    }

    if (
      getNaviToken() !== token ||
      state.naviSessionVersion !== requestVersion
    ) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ناوی معتبر نیست. دوباره وارد شو.");
      throw new Error("دسترسی تأیید نشد. دوباره وارد ناوی شو.");
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(
        (data && (data.error || data.diagnostic)) ||
        "حذف حافظه ناموفق بود."
      );
    }

    setNaviMemoryStatus("حافظه حذف شد؛ در حال تازه‌سازی فهرست...");
    await loadNaviMemories(true);

    if (
      getNaviToken() === token &&
      state.naviSessionVersion === requestVersion
    ) {
      setNaviMemoryStatus("حافظه با موفقیت حذف شد.");
    }

  } catch (error) {
    if (state.naviSessionVersion !== requestVersion) return;

    console.error("NAVI memory delete error:", error);

    showNaviMemoryError(
      error.message || "حذف حافظه انجام نشد."
    );

    if (getNaviToken() === token) {
      button.disabled = false;
      button.textContent = "حذف";
    }

  } finally {
    if (state.naviSessionVersion === requestVersion) {
      state.naviMemoryBusy = false;
    }
  }
}


/* =========================================
   NAVI MEMORY — PANEL EVENTS
========================================= */



export function initMemoryUI() {
  naviMemoryToggle.addEventListener("click", async () => {
    const isOpening = naviMemoryContent.hidden;
    naviMemoryContent.hidden = !isOpening;
    naviMemoryToggle.setAttribute("aria-expanded", isOpening ? "true" : "false");
    if (isOpening && !state.naviMemoryLoaded) await loadNaviMemories();
  });
  naviMemoryRefresh.addEventListener("click", () => loadNaviMemories(true));
}
