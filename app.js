
"use strict";

/* =========================================
   NAVA CONFIG + DOM + STATE
========================================= */

// API
// Preview mode is opt-in via ?naviPreview=1; normal visitors stay on production.
const NAVI_PREVIEW_MODE = new URLSearchParams(window.location.search).get("naviPreview") === "1";
const NAVI_BASE = NAVI_PREVIEW_MODE
  ? "https://nava-music-api-preview.honrrpower.workers.dev"
  : "https://nava-music-api.honrrpower.workers.dev";
const NAVI_LOGIN_API = NAVI_BASE + "/navi-login";
const NAVI_API = NAVI_BASE + "/navi-chat";
const NAVI_HISTORY_API = NAVI_BASE + "/navi-history";
const NAVI_MEMORY_API = NAVI_BASE + "/navi-memory";

// Session
const NAVI_SESSION_KEY = "nava_navi_session" + (NAVI_PREVIEW_MODE ? "_preview" : "");
const NAVI_EXPIRY_KEY = "nava_navi_expiry" + (NAVI_PREVIEW_MODE ? "_preview" : "");

// Limits
const NAVI_MAX_DISPLAY_MESSAGES = 100;
const NAVI_CONTEXT_MESSAGES = 10;

// Session state
let naviSessionVersion = 0;

// History state
let naviHistory = [];
let naviHistoryLoading = false;
let naviHistoryLoadPromise = null;

// Memory state
let naviMemory = [];
let naviProposals = [];
let naviMemoryLoaded = false;
let naviMemoryLoading = false;
let naviMemoryLoadPromise = null;
let naviMemoryBusy = false;

// DOM elements — NAVI
const naviLoginPanel = document.getElementById("naviLoginPanel");
const naviLoginForm = document.getElementById("naviLoginForm");
const naviPassword = document.getElementById("naviPassword");
const naviLoginButton = document.getElementById("naviLoginButton");
const naviLoginError = document.getElementById("naviLoginError");
const naviLoginStatus = document.getElementById("naviLoginStatus");
const naviChatArea = document.getElementById("naviChatArea");
const naviLogout = document.getElementById("naviLogout");

const naviStatus = document.getElementById("naviStatus");
const requestResponse = document.getElementById("requestResponse");
const serviceSelect = document.getElementById("serviceSelect");
const userRequest = document.getElementById("userRequest");
const sendRequest = document.getElementById("sendRequest");

// DOM elements — History
const naviHistoryToggle = document.getElementById("naviHistoryToggle");
const naviHistoryContent = document.getElementById("naviHistoryContent");
const naviHistoryList = document.getElementById("naviHistoryList");
const naviHistoryCount = document.getElementById("naviHistoryCount");
const naviHistoryRefresh = document.getElementById("naviHistoryRefresh");

// DOM elements — Memory
const naviMemoryToggle = document.getElementById("naviMemoryToggle");
const naviMemoryContent = document.getElementById("naviMemoryContent");
const naviMemoryList = document.getElementById("naviMemoryList");
const naviMemoryProposalList = document.getElementById("naviMemoryProposalList");
const naviMemoryStatus = document.getElementById("naviMemoryStatus");
const naviMemoryError = document.getElementById("naviMemoryError");
const naviMemoryRefresh = document.getElementById("naviMemoryRefresh");

/* NAVI HISTORY — RELIABLE COLLAPSIBLE PANEL CLICK */
document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const toggle = target.closest("#naviHistoryToggle");
  if (!toggle) return;

  const content = document.getElementById("naviHistoryContent");
  if (!content) {
    console.error("NAVI history panel content was not found.");
    return;
  }

  const isOpening = content.hidden;
  content.hidden = !isOpening;
  toggle.setAttribute("aria-expanded", isOpening ? "true" : "false");
}, true);



/* =========================================
   PAGE NAVIGATION
========================================= */

const navButtons = document.querySelectorAll(".nav-btn");
const pages = document.querySelectorAll(".page");

function showPage(pageId) {
  pages.forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

navButtons.forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

/* NAVA THEME */

function applyNavaTheme(theme) {
  const isLight = theme === "light";

  document.body.classList.toggle("light", isLight);

  localStorage.setItem("nava-theme", isLight ? "light" : "dark");

  const button = document.getElementById("themeToggle");

  if (button) {
    button.textContent = isLight ? "🌙" : "☀️";
    button.setAttribute(
      "aria-label",
      isLight ? "فعال‌کردن حالت شب" : "فعال‌کردن حالت روز"
    );
  }
}

function initNavaTheme() {
  const button = document.getElementById("themeToggle");

  if (!button) return;

  const savedTheme = localStorage.getItem("nava-theme") || "dark";

  applyNavaTheme(savedTheme);

  button.addEventListener("click", function () {
    const isLight = document.body.classList.contains("light");

    applyNavaTheme(isLight ? "dark" : "light");
  });
}

initNavaTheme();


/* =========================================
   GENERAL HELPERS
========================================= */

function setNaviStatus(message) {
  naviStatus.textContent = message;
}

function showNaviReply(reply) {
  requestResponse.textContent = String(reply || "");
  requestResponse.classList.add("show");
}

function showLoginError(message) {
  naviLoginError.textContent = message;
  naviLoginError.classList.add("show");
}

function clearLoginError() {
  naviLoginError.textContent = "";
  naviLoginError.classList.remove("show");
}

function showEmptyHistory(message, countText) {
  naviHistoryList.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "navi-history-empty";
  empty.textContent = message;

  naviHistoryList.appendChild(empty);
  naviHistoryCount.textContent = countText || "";
}


/* =========================================
   SESSION MANAGEMENT
========================================= */

function getNaviToken() {
  let token = null;
  let expiry = 0;

  try {
    token = sessionStorage.getItem(NAVI_SESSION_KEY);
    expiry = Number(sessionStorage.getItem(NAVI_EXPIRY_KEY) || 0);
  } catch (error) {
    console.error("NAVI session storage error:", error);
    return null;
  }

  if (!token || !expiry || !Number.isFinite(expiry) || Date.now() >= expiry) {
    clearNaviSession();
    return null;
  }

  return token;
}

function saveNaviSession(token, expiresIn) {
  const duration = Number(expiresIn);

  if (!token || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("اطلاعات نشست دریافتی از سرور معتبر نیست.");
  }

  try {
    sessionStorage.setItem(NAVI_SESSION_KEY, token);
    sessionStorage.setItem(
      NAVI_EXPIRY_KEY,
      String(Date.now() + duration * 1000)
    );
  } catch (error) {
    throw new Error("ذخیره نشست در مرورگر ممکن نیست. فضای ذخیره‌سازی مرورگر را بررسی کن.");
  }
}

function clearNaviSession() {
  naviSessionVersion++;

  try {
    sessionStorage.removeItem(NAVI_SESSION_KEY);
    sessionStorage.removeItem(NAVI_EXPIRY_KEY);
  } catch (error) {
    console.warn("Could not clear local session storage.");
  }

  /*
    فقط نشست محلی پاک می‌شود.
    تاریخچه و حافظه دائمی D1 حذف نمی‌شوند.
  */

  naviHistory = [];
  naviMemory = [];
  naviProposals = [];
  naviMemoryLoaded = false;
  naviMemoryLoading = false;
  naviMemoryLoadPromise = null;
  naviMemoryBusy = false;

  if (naviChatArea) naviChatArea.hidden = true;
  if (naviLoginPanel) naviLoginPanel.hidden = false;
  if (naviPassword) naviPassword.value = "";

  if (requestResponse) {
    requestResponse.textContent = "";
    requestResponse.classList.remove("show");
  }

  if (naviHistoryList) {
    showEmptyHistory("برای دیدن تاریخچه وارد ناوی شو.", "بدون ورود");
  }
  if (naviHistoryContent && naviHistoryToggle) {
    naviHistoryContent.hidden = true;
    naviHistoryToggle.setAttribute("aria-expanded", "false");
  }

  if (naviStatus) {
    naviStatus.textContent = "برای شروع گفت‌وگو وارد شو.";
  }

  resetNaviMemoryPanel();
}

function showNaviChat() {
  naviLoginPanel.hidden = true;
  naviChatArea.hidden = false;

  clearLoginError();

  naviLoginStatus.textContent = "نشست امن ناوی فعال است.";
  setNaviStatus("در حال بازیابی گفت‌وگوهای قبلی...");
}


/* =========================================
   HISTORY NORMALIZATION
========================================= */

function normalizeNaviHistory(data) {
  let source = [];

  if (Array.isArray(data)) {
    source = data;
  } else if (data && Array.isArray(data.messages)) {
    source = data.messages;
  } else if (data && Array.isArray(data.history)) {
    source = data.history;
  } else if (data && data.data && Array.isArray(data.data.messages)) {
    source = data.data.messages;
  } else if (data && data.data && Array.isArray(data.data.history)) {
    source = data.data.history;
  }

  const normalized = source
    .map(item => {
      if (!item || typeof item !== "object") return null;

      const content = String(
        item.content ??
        item.message ??
        item.text ??
        ""
      ).trim();

      if (!content) return null;

      const originalRole = String(item.role || "").toLowerCase();

      let role = "assistant";

      if (originalRole === "user" || originalRole === "human") {
        role = "user";
      } else if (
        originalRole === "assistant" ||
        originalRole === "model" ||
        originalRole === "ai" ||
        originalRole === "navi"
      ) {
        role = "assistant";
      }

      return { role, content };
    })
    .filter(Boolean);

  return normalized.slice(-NAVI_MAX_DISPLAY_MESSAGES);
}


/* =========================================
   HISTORY — SAFE RENDERING
========================================= */

function renderNaviHistory(messages) {
  const safeMessages = Array.isArray(messages)
    ? messages.slice(-NAVI_MAX_DISPLAY_MESSAGES)
    : [];

  naviHistoryList.replaceChildren();

  if (safeMessages.length === 0) {
    showEmptyHistory(
      "هنوز گفت‌وگویی ذخیره نشده است. اولین پیام را برای ناوی بفرست.",
      "۰ پیام"
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  safeMessages.forEach(item => {
    const role = item.role === "user" ? "user" : "assistant";

    const message = document.createElement("div");
    message.className = "navi-message " + role;

    const label = document.createElement("span");
    label.className = "navi-message-label";
    label.textContent = role === "user" ? "شما" : "ناوی";

    const content = document.createElement("div");
    content.textContent = String(item.content || "");

    message.append(label, content);
    fragment.appendChild(message);
  });

  naviHistoryList.appendChild(fragment);
  naviHistoryCount.textContent = safeMessages.length + " پیام";
  naviHistoryList.scrollTop = naviHistoryList.scrollHeight;
}


/* =========================================
   HISTORY — LOAD FROM D1
========================================= */

async function loadNaviHistory() {
  const token = getNaviToken();

  if (!token) return false;

  if (naviHistoryLoading && naviHistoryLoadPromise) {
    return naviHistoryLoadPromise;
  }

  const requestVersion = naviSessionVersion;

  naviHistoryLoading = true;
  naviHistoryRefresh.disabled = true;
  naviHistoryRefresh.textContent = "در حال دریافت...";
  naviHistoryCount.textContent = "در حال بارگذاری...";

  naviHistoryLoadPromise = (async () => {
    try {
      const response = await fetch(NAVI_HISTORY_API, {
        method: "GET",
        headers: { "Authorization": "Bearer " + token ,
        ...NAVI_DB_HEADER
      },
        cache: "no-store"
      });

      let data;

      try {
        data = await response.json();
      } catch (error) {
        throw new Error("پاسخ تاریخچه قابل خواندن نیست.");
      }

      if (
        getNaviToken() !== token ||
        naviSessionVersion !== requestVersion
      ) {
        return false;
      }

      if (response.status === 401 || response.status === 403) {
        clearNaviSession();
        showLoginError("نشست ناوی معتبر نیست یا پایان یافته است. دوباره وارد شو.");
        return false;
      }

      if (!response.ok || (data && data.success === false)) {
        throw new Error(
          (data && (data.error || data.diagnostic)) ||
          "دریافت تاریخچه ناموفق بود."
        );
      }

      naviHistory = normalizeNaviHistory(data);
      renderNaviHistory(naviHistory);

      setNaviStatus(
        naviHistory.length
          ? "گفت‌وگوهای قبلی بازیابی شدند؛ می‌توانی ادامه بدهی."
          : "ناوی آماده شروع اولین گفت‌وگوست."
      );

      return true;

    } catch (error) {
      if (naviSessionVersion !== requestVersion) return false;

      console.error("NAVI history error:", error);

      renderNaviHistory(naviHistory);
      naviHistoryCount.textContent = "حافظه آنلاین در دسترس نیست";

      if (naviHistory.length === 0) {
        showEmptyHistory(
          "دریافت تاریخچه از سرور ممکن نشد.\nمی‌توانی دوباره تلاش کنی.",
          "خطا در دریافت"
        );
      }

      setNaviStatus(
        "اتصال به حافظه ناوی برقرار نشد. پاسخ‌گویی ناوی همچنان قابل استفاده است."
      );

      return false;

    } finally {
      if (naviSessionVersion === requestVersion) {
        naviHistoryLoading = false;
        naviHistoryLoadPromise = null;
        naviHistoryRefresh.disabled = false;
        naviHistoryRefresh.textContent = "تازه‌سازی تاریخچه";
      }
    }
  })();

  return naviHistoryLoadPromise;
}


/* =========================================
   LOCAL HISTORY FALLBACK
========================================= */

function appendLocalNaviMessages(userMessage, assistantMessage) {
  const additions = [];

  if (userMessage) {
    additions.push({
      role: "user",
      content: String(userMessage)
    });
  }

  if (assistantMessage) {
    additions.push({
      role: "assistant",
      content: String(assistantMessage)
    });
  }

  naviHistory = [
    ...naviHistory,
    ...additions
  ].slice(-NAVI_MAX_DISPLAY_MESSAGES);

  renderNaviHistory(naviHistory);
}


/* =========================================
   NAVI MEMORY — HELPERS
========================================= */

function setNaviMemoryStatus(message) {
  naviMemoryStatus.textContent = message;
}

function showNaviMemoryError(message) {
  naviMemoryError.textContent = message || "";
}

function resetNaviMemoryPanel() {
  naviMemoryToggle.setAttribute("aria-expanded", "false");
  naviMemoryContent.hidden = true;

  naviMemoryList.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "navi-memory-empty";
  empty.textContent = "برای مشاهده حافظه‌ها وارد ناوی شو.";

  naviMemoryList.appendChild(empty);

  if (naviMemoryProposalList) {
    naviMemoryProposalList.replaceChildren();
    const proposalEmpty = document.createElement("div");
    proposalEmpty.className = "navi-memory-empty";
    proposalEmpty.textContent = "پیشنهاد تازه‌ای برای بررسی وجود ندارد.";
    naviMemoryProposalList.appendChild(proposalEmpty);
  }

  naviMemoryStatus.textContent = "حافظه‌ها بارگذاری نشده‌اند.";
  naviMemoryError.textContent = "";

  naviMemoryRefresh.disabled = false;
  naviMemoryRefresh.textContent = "تازه‌سازی حافظه‌ها";
}

function formatNaviMemoryDate(value) {
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

function normalizeNaviMemories(data) {
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
      memory_value: String(item.memory_value ?? ""),
      created_at: item.created_at ?? "",
      updated_at: item.updated_at ?? ""
    }))
    .filter(item => Number.isSafeInteger(item.id) && item.id > 0);
}


/* =========================================
   NAVI MEMORY — SAFE RENDERING
========================================= */

function renderNaviMemories(memories) {
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

    const value = document.createElement("div");
    value.className = "navi-memory-value";
    value.textContent = memory.memory_value || "محتوای این حافظه خالی است.";

    const meta = document.createElement("div");
    meta.className = "navi-memory-meta";

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
    card.append(value, meta, actions);
    fragment.appendChild(card);
  });

  naviMemoryList.appendChild(fragment);
}



function normalizeNaviProposals(data) {
  const source = data && Array.isArray(data.proposals)
    ? data.proposals
    : data && data.data && Array.isArray(data.data.proposals)
      ? data.data.proposals
      : [];

  return source
    .filter(item => item && typeof item === "object")
    .map(item => ({
      id: Number(item.id),
      memory_value: String(item.memory_value ?? ""),
      source: String(item.source ?? ""),
      created_at: item.created_at ?? "",
      updated_at: item.updated_at ?? ""
    }))
    .filter(item => Number.isSafeInteger(item.id) && item.id > 0);
}

function showNaviMemoryDialog({
  title = "NAVA",
  message = "",
  confirmText = "متوجه شدم",
  cancelText = "",
  danger = false
} = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "navi-memory-dialog-backdrop";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = "navi-memory-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", title);

    const heading = document.createElement("h3");
    heading.className = "navi-memory-dialog-title";
    heading.textContent = title;

    const body = document.createElement("p");
    body.className = "navi-memory-dialog-message";
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "navi-memory-dialog-actions";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = danger
      ? "navi-memory-dialog-confirm is-danger"
      : "navi-memory-dialog-confirm";
    confirm.textContent = confirmText;

    let cancel = null;
    if (cancelText) {
      cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "navi-memory-dialog-cancel";
      cancel.textContent = cancelText;
    }

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(value);
    };
    const onKeydown = event => {
      if (event.key === "Escape" && cancelText) finish(false);
    };

    confirm.addEventListener("click", () => finish(true));
    if (cancel) cancel.addEventListener("click", () => finish(false));
    overlay.addEventListener("click", event => {
      if (event.target === overlay && cancelText) finish(false);
    });
    document.addEventListener("keydown", onKeydown);

    actions.append(confirm);
    if (cancel) actions.append(cancel);
    dialog.append(heading, body, actions);
    overlay.append(dialog);
    document.body.append(overlay);
    confirm.focus();
  });
}

function renderNaviMemoryProposals(proposals) {
  if (!naviMemoryProposalList) return;

  naviMemoryProposalList.replaceChildren();

  if (!Array.isArray(proposals) || proposals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "navi-memory-empty";
    empty.textContent = "پیشنهاد تازه‌ای برای بررسی وجود ندارد.";
    naviMemoryProposalList.appendChild(empty);
    return;
  }

  proposals.forEach(proposal => {
    const card = document.createElement("article");
    card.className = "navi-memory-card navi-memory-proposal";
    card.dataset.proposalId = String(proposal.id);

    const value = document.createElement("div");
    value.className = "navi-memory-value";
    value.textContent = proposal.memory_value || "متن این پیشنهاد خالی است.";

    const meta = document.createElement("div");
    meta.className = "navi-memory-meta";
    if (proposal.source) {
      const source = document.createElement("span");
      source.textContent = "منبع: " + proposal.source;
      meta.appendChild(source);
    }
    if (proposal.created_at) {
      const date = document.createElement("span");
      date.textContent = "ثبت پیشنهاد: " + formatNaviMemoryDate(proposal.created_at);
      meta.appendChild(date);
    }

    const actions = document.createElement("div");
    actions.className = "navi-memory-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "navi-memory-edit";
    edit.textContent = "بررسی و ویرایش";
    edit.addEventListener("click", () => openNaviProposalEditor(proposal, card));

    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "navi-memory-approve";
    approve.textContent = "تأیید";
    approve.addEventListener("click", () => submitNaviProposalAction(proposal.id, "approve", null, approve));

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "navi-memory-reject";
    reject.textContent = "رد پیشنهاد";
    reject.addEventListener("click", async () => {
      const confirmed = await showNaviMemoryDialog({
        title: "NAVA",
        message: "آیا از رد این پیشنهاد حافظه مطمئن هستی؟",
        confirmText: "بله، رد شود",
        cancelText: "انصراف",
        danger: true
      });
      if (confirmed) {
        submitNaviProposalAction(proposal.id, "reject", null, reject);
      }
    });

    actions.append(edit, approve, reject);
    card.append(value, meta, actions);
    naviMemoryProposalList.appendChild(card);
  });
}

function openNaviProposalEditor(proposal, card) {
  if (naviMemoryBusy) return;
  const previous = naviMemoryList.querySelector(".navi-memory-proposal-editor");
  if (previous) {
    previous.focus();
    return;
  }

  const value = card.querySelector(".navi-memory-value");
  const actions = card.querySelector(".navi-memory-actions");
  if (!value || !actions) return;

  const editor = document.createElement("textarea");
  editor.className = "navi-memory-editor navi-memory-proposal-editor";
  editor.value = proposal.memory_value;
  editor.setAttribute("aria-label", "ویرایش پیشنهاد حافظه");

  const editorActions = document.createElement("div");
  editorActions.className = "navi-memory-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "navi-memory-save";
  save.textContent = "ذخیره ویرایش";
  save.addEventListener("click", async () => {
    const ok = await submitNaviProposalAction(proposal.id, "update_pending", editor.value, save);
    if (ok) {
      editor.remove();
      editorActions.remove();
    }
  });

  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "navi-memory-approve";
  approve.textContent = "تأیید و ذخیره";
  approve.addEventListener("click", () => {
    submitNaviProposalAction(proposal.id, "approve", editor.value, approve);
  });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "navi-memory-cancel";
  cancel.textContent = "انصراف";
  cancel.addEventListener("click", () => {
    editor.remove();
    editorActions.remove();
    value.hidden = false;
    actions.hidden = false;
  });

  value.hidden = true;
  actions.hidden = true;
  card.insertBefore(editor, actions);
  card.insertBefore(editorActions, actions);
  editorActions.append(save, approve, cancel);
  editor.focus();
}

async function submitNaviProposalAction(id, action, memoryValue, button) {
  const token = getNaviToken();
  if (!token) {
    clearNaviSession();
    showLoginError("نشست ناوی پایان یافته است. دوباره وارد شو.");
    return false;
  }
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    showNaviMemoryError("شناسه پیشنهاد معتبر نیست.");
    return false;
  }

  const cleanValue = typeof memoryValue === "string" ? memoryValue.trim() : null;
  if ((action === "update_pending" || (action === "approve" && cleanValue !== null)) && !cleanValue) {
    showNaviMemoryError("متن پیشنهاد نمی‌تواند خالی باشد.");
    return false;
  }
  if (naviMemoryBusy) return false;

  const requestVersion = naviSessionVersion;
  naviMemoryBusy = true;
  if (button) {
    button.disabled = true;
    button.textContent = "در حال انجام...";
  }
  showNaviMemoryError("");
  setNaviMemoryStatus("در حال بررسی پیشنهاد حافظه...");

  try {
    const payload = { action, id: Number(id) };
    if (cleanValue !== null) payload.memory_value = cleanValue;

    const response = await fetch(NAVI_MEMORY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      ,
        ...NAVI_DB_HEADER
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("پاسخ سرور هنگام بررسی پیشنهاد قابل خواندن نیست.");
    }

    if (getNaviToken() !== token || naviSessionVersion !== requestVersion) return false;

    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ناوی معتبر نیست. دوباره وارد شو.");
      throw new Error("دسترسی تأیید نشد. دوباره وارد ناوی شو.");
    }
    if (response.status === 409) {
      await showNaviMemoryDialog({
        title: "NAVA",
        message: "این حافظه قبلاً ثبت شده است؛ مورد تکراری دوباره ذخیره نشد.",
        confirmText: "متوجه شدم"
      });
      return false;
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error((data && (data.error || data.diagnostic)) || "بررسی پیشنهاد ناموفق بود.");
    }

    await loadNaviMemories(true);
    if (naviSessionVersion === requestVersion) {
      setNaviMemoryStatus(
        action === "approve" ? "پیشنهاد با تأیید تو به حافظه اضافه شد."
          : action === "reject" ? "پیشنهاد رد شد."
          : "ویرایش پیشنهاد ذخیره شد."
      );
    }
    return true;
  } catch (error) {
    if (naviSessionVersion !== requestVersion) return false;
    console.error("NAVI proposal review error:", error);
    showNaviMemoryError(error.message || "بررسی پیشنهاد انجام نشد.");
    return false;
  } finally {
    if (naviSessionVersion === requestVersion) {
      naviMemoryBusy = false;
      if (button && button.isConnected) {
        button.disabled = false;
        button.textContent = action === "reject"
          ? "رد پیشنهاد"
          : action === "approve"
            ? "تأیید"
            : "ذخیره ویرایش";
      }
    }
  }
}


/* =========================================
   NAVI MEMORY — LOAD FROM WORKER
========================================= */

async function loadNaviMemories(forceRefresh = false) {
  const token = getNaviToken();

  if (!token) {
    setNaviMemoryStatus("برای مشاهده حافظه‌ها دوباره وارد ناوی شو.");
    return false;
  }

  if (naviMemoryLoading && naviMemoryLoadPromise) {
    return naviMemoryLoadPromise;
  }

  if (naviMemoryLoaded && !forceRefresh) {
    return true;
  }

  const requestVersion = naviSessionVersion;

  naviMemoryLoading = true;
  naviMemoryRefresh.disabled = true;
  naviMemoryRefresh.textContent = "در حال دریافت...";
  setNaviMemoryStatus("در حال دریافت حافظه‌های ناوی...");
  showNaviMemoryError("");

  naviMemoryLoadPromise = (async () => {
    try {
      const response = await fetch(NAVI_MEMORY_API, {
        method: "GET",
        headers: { "Authorization": "Bearer " + token ,
        ...NAVI_DB_HEADER
      },
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
        naviSessionVersion !== requestVersion
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

      naviMemory = normalizeNaviMemories(data);
      naviProposals = normalizeNaviProposals(data);
      naviMemoryLoaded = true;

      renderNaviMemories(naviMemory);
      renderNaviMemoryProposals(naviProposals);

      setNaviMemoryStatus(
        naviMemory.length
          ? "اطلاعات پروفایل با موفقیت به‌روز شد."
          : "هنوز اطلاعاتی برای نمایش در پروفایل ثبت نشده است."
      );

      return true;

    } catch (error) {
      if (naviSessionVersion !== requestVersion) return false;

      console.error("NAVI memory load error:", error);

      showNaviMemoryError(
        error.message || "دریافت حافظه‌ها با خطا مواجه شد."
      );

      if (!naviMemoryLoaded) {
        naviMemoryList.replaceChildren();

        const empty = document.createElement("div");
        empty.className = "navi-memory-empty";
        empty.textContent = "دریافت حافظه‌ها انجام نشد. دوباره تلاش کن.";

        naviMemoryList.appendChild(empty);
      }

      setNaviMemoryStatus("اتصال به بخش حافظه برقرار نشد.");
      return false;

    } finally {
      if (naviSessionVersion === requestVersion) {
        naviMemoryLoading = false;
        naviMemoryLoadPromise = null;
        naviMemoryRefresh.disabled = false;
        naviMemoryRefresh.textContent = "تازه‌سازی حافظه‌ها";
      }
    }
  })();

  return naviMemoryLoadPromise;
}


/* =========================================
   NAVI MEMORY — INLINE EDITOR
========================================= */

function openNaviMemoryEditor(memory, card) {
  if (naviMemoryBusy) return;

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

async function updateNaviMemory(id, memoryValue, button, editor) {
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

  if (naviMemoryBusy) return;

  const requestVersion = naviSessionVersion;

  naviMemoryBusy = true;
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
      ,
        ...NAVI_DB_HEADER
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
      naviSessionVersion !== requestVersion
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
      naviSessionVersion === requestVersion
    ) {
      setNaviMemoryStatus("حافظه با موفقیت به‌روزرسانی شد.");
    }

  } catch (error) {
    if (naviSessionVersion !== requestVersion) return;

    console.error("NAVI memory update error:", error);

    showNaviMemoryError(
      error.message || "ویرایش حافظه انجام نشد."
    );

    if (getNaviToken() === token) {
      button.disabled = false;
      button.textContent = "ذخیره تغییرات";
    }

  } finally {
    if (naviSessionVersion === requestVersion) {
      naviMemoryBusy = false;
    }
  }
}


/* =========================================
   NAVI MEMORY — DELETE
========================================= */

async function deleteNaviMemory(id, button) {
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

  if (naviMemoryBusy) return;

  const confirmed = window.confirm(
    "آیا مطمئنی می‌خواهی این حافظه را حذف کنی؟\nاین عملیات قابل بازگشت نیست."
  );

  if (!confirmed) return;

  const requestVersion = naviSessionVersion;

  naviMemoryBusy = true;
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
      ,
        ...NAVI_DB_HEADER
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
      naviSessionVersion !== requestVersion
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
      naviSessionVersion === requestVersion
    ) {
      setNaviMemoryStatus("حافظه با موفقیت حذف شد.");
    }

  } catch (error) {
    if (naviSessionVersion !== requestVersion) return;

    console.error("NAVI memory delete error:", error);

    showNaviMemoryError(
      error.message || "حذف حافظه انجام نشد."
    );

    if (getNaviToken() === token) {
      button.disabled = false;
      button.textContent = "حذف";
    }

  } finally {
    if (naviSessionVersion === requestVersion) {
      naviMemoryBusy = false;
    }
  }
}


/* =========================================
   NAVI MEMORY — PANEL EVENTS
========================================= */

naviMemoryToggle.addEventListener("click", async () => {
  const isOpening = naviMemoryContent.hidden;

  naviMemoryContent.hidden = !isOpening;
  naviMemoryToggle.setAttribute(
    "aria-expanded",
    isOpening ? "true" : "false"
  );

  if (isOpening && !naviMemoryLoaded) {
    await loadNaviMemories();
  }
});

naviHistoryRefresh.addEventListener("click", () => {
  loadNaviHistory();
});

naviMemoryRefresh.addEventListener("click", () => {
  loadNaviMemories(true);
});


/* =========================================
   RESTORE SESSION ON PAGE OPEN
========================================= */

const existingNaviToken = getNaviToken();

if (existingNaviToken) {
  showNaviChat();
  loadNaviHistory();
} else {
  clearNaviSession();
}


/* =========================================
   NAVI LOGIN
========================================= */

naviLoginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const password = naviPassword.value.trim();

  if (!password) {
    showLoginError("لطفاً رمز ورود را وارد کن.");
    return;
  }

  naviLoginButton.disabled = true;
  naviLoginButton.textContent = "در حال بررسی رمز...";
  clearLoginError();

  try {
    const response = await fetch(NAVI_LOGIN_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      ,
        ...NAVI_DB_HEADER
      },
      body: JSON.stringify({ password })
    });

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("پاسخ سرور ورود قابل خواندن نیست.");
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.diagnostic ||
        "رمز ورود پذیرفته نشد."
      );
    }

    if (!data.token) {
      throw new Error("سرور توکن ورود را ارسال نکرده است.");
    }

    const expiresIn = Number(data.expiresIn || 43200);

    saveNaviSession(data.token, expiresIn);

    naviSessionVersion++;
    naviPassword.value = "";
    naviHistory = [];
    naviMemory = [];
    naviProposals = [];
    naviMemoryLoaded = false;

    showNaviChat();

    const historyLoaded = await loadNaviHistory();

    if (!historyLoaded && getNaviToken()) {
      setNaviStatus(
        "وارد ناوی شدی؛ اما دریافت تاریخچه فعلاً ممکن نیست. می‌توانی دوباره تلاش کنی."
      );
    }

  } catch (error) {
    console.error("NAVI login error:", error);

    showLoginError(
      error.message || "ورود ناموفق بود. دوباره تلاش کن."
    );

  } finally {
    naviLoginButton.disabled = false;
    naviLoginButton.textContent = "ورود به ناوی";
  }
});


/* =========================================
   NAVI LOGOUT
========================================= */

naviLogout.addEventListener("click", () => {
  clearNaviSession();
  clearLoginError();

  naviLoginStatus.textContent = "از نشست ناوی خارج شدی.";
  setNaviStatus("برای شروع گفت‌وگو دوباره وارد شو.");
});


/* =========================================
   NAVI PAGE HELPERS
========================================= */

function chooseService(service) {
  serviceSelect.value = service;
  scrollToRequest();
}

function scrollToRequest() {
  document.getElementById("requestSection").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  window.setTimeout(() => {
    if (!naviChatArea.hidden) {
      userRequest.focus();
    } else {
      naviPassword.focus();
    }
  }, 450);
}




/* =========================================
   NAVI CHAT — AUTHENTICATED REQUEST
========================================= */

async function sendMessageToNavi() {
  const token = getNaviToken();

  if (!token) {
    clearNaviSession();
    showNaviReply("نشست ورودت پایان یافته است. لطفاً دوباره وارد شو.");
    return;
  }

  const message = userRequest.value.trim();

  if (!message) {
    showNaviReply("لطفاً ابتدا پیامت را بنویس.");
    userRequest.focus();
    return;
  }

  const requestVersion = naviSessionVersion;
  const selectedService = serviceSelect.value;

  const finalMessage =
    selectedService && selectedService !== "انتخاب نشده"
      ? "موضوع انتخاب‌شده: " + selectedService +
        "\n\nپیام کاربر: " + message
      : message;

  const pageContext = [
    "عنوان صفحه: " + document.title,
    "مسیر صفحه: " + window.location.pathname,
    "محتوای قابل مشاهده صفحه:",
    document.body.innerText.slice(0, 2500)
  ].join("\n");

  sendRequest.disabled = true;
  sendRequest.textContent = "ناوی در حال پاسخ‌گویی...";

  setNaviStatus("پیامت ارسال شد؛ ناوی در حال بررسی آن است...");
  showNaviReply("در حال دریافت پاسخ از ناوی...");

  try {
    const response = await fetch(NAVI_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      ,
        ...NAVI_DB_HEADER
      },
      body: JSON.stringify({
        message: finalMessage,
        page: window.location.pathname,
        pageContext: pageContext,
        history: naviHistory.slice(-NAVI_CONTEXT_MESSAGES)
      })
    });

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("پاسخ سرور قابل خواندن نیست.");
    }

    if (
      getNaviToken() !== token ||
      naviSessionVersion !== requestVersion
    ) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      clearNaviSession();

      showLoginError(
        "نشست ناوی معتبر نیست یا پایان یافته است. دوباره وارد شو."
      );

      throw new Error("دسترسی تأیید نشد؛ لطفاً دوباره وارد شو.");
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.diagnostic ||
        data.error ||
        "ارتباط با ناوی با مشکل مواجه شد."
      );
    }

    const reply = String(data.reply || "").trim();

    if (!reply) {
      throw new Error("ناوی پاسخ خالی ارسال کرده است.");
    }

    showNaviReply(reply);
    userRequest.value = "";

    setNaviStatus(
      "پاسخ ناوی دریافت شد؛ در حال به‌روزرسانی تاریخچه..."
    );

    const historyUpdated = await loadNaviHistory();

    if (
      getNaviToken() !== token ||
      naviSessionVersion !== requestVersion
    ) {
      return;
    }

    if (historyUpdated) {
      setNaviStatus("پاسخ دریافت شد و تاریخچه گفت‌وگو به‌روز است.");
    } else if (getNaviToken()) {
      appendLocalNaviMessages(finalMessage, reply);

      setNaviStatus(
        "پاسخ ناوی دریافت شد؛ اما اتصال به حافظه آنلاین برقرار نشد. پیام این نوبت فعلاً در همین صفحه حفظ شده است."
      );
    }

    /* =====================================
       AUTOMATIC MEMORY REFRESH + DIAGNOSTICS
       Refresh after every successful reply,
       even if the profile panel was not opened.
    ===================================== */

    const memoryResult = data.memory && typeof data.memory === "object"
      ? data.memory
      : null;

    if (!naviMemoryBusy) {
      const memoryRefreshed = await loadNaviMemories(true);

      if (
        memoryRefreshed &&
        memoryResult &&
        !memoryResult.commandRecognized
      ) {
        if (
          Number(memoryResult.proposalsMergedIntoPending) > 0 ||
          Number(memoryResult.proposalsMergeCandidates) > 0
        ) {
          const mergeMessages = [];

          if (Number(memoryResult.proposalsMergedIntoPending) > 0) {
            mergeMessages.push(
              "اطلاعات مکمل با پیشنهاد قبلی ادغام شد."
            );
          }

          if (Number(memoryResult.proposalsMergeCandidates) > 0) {
            mergeMessages.push(
              "برای تکمیل یک حافظه تأییدشده، پیشنهاد تازه‌ای ساخته شد؛ پس از بررسی آن را تأیید کن."
            );
          }

          setNaviMemoryStatus(
            "ناوی: " + mergeMessages.join(" ")
          );
        } else if (Number(memoryResult.proposalsCreated) > 0) {
          setNaviMemoryStatus(
            "ناوی " + memoryResult.proposalsCreated +
            " پیشنهاد تازه ثبت کرد؛ برای بررسی به بخش پیشنهادها برو."
          );
        } else if (memoryResult.responseStructured === false) {
          setNaviMemoryStatus(
            "این پاسخ ناوی به قالب ساختاریافته حافظه نرسید؛ پیشنهادی ثبت نشد."
          );
        } else if (Number(memoryResult.proposalsReceived) === 0) {
          setNaviMemoryStatus(
            "این بار ناوی اطلاعات ماندگاری برای پیشنهاد تشخیص نداد."
          );
        } else if (Number(memoryResult.proposalsSkippedDuplicate) > 0) {
          setNaviMemoryStatus(
            "پیشنهاد دریافتی تکراری بود و چون قبلاً ثبت شده، مورد تازه‌ای ساخته نشد."
          );
        } else if (Number(memoryResult.proposalsSkippedInvalid) > 0 ||
                   Number(memoryResult.proposalsSkippedSensitive) > 0) {
          setNaviMemoryStatus(
            "پیشنهاد ناوی به دلیل معتبر نبودن یا حساس بودن ذخیره نشد."
          );
        } else if (memoryResult.proposalProcessingFailed) {
          setNaviMemoryStatus(
            "ناوی پیشنهاد تولید کرد، اما ثبت آن در حافظه با خطا روبه‌رو شد."
          );
        }
      } else if (
        memoryRefreshed &&
        memoryResult &&
        memoryResult.commandRecognized &&
        memoryResult.saved
      ) {
        setNaviMemoryStatus(
          "اطلاعات در حافظه تأییدشده ذخیره شد؛ در بخش پیشنهادها قرار نمی‌گیرد."
        );
      }
    }

  } catch (error) {
    if (naviSessionVersion !== requestVersion) return;

    console.error("NAVI connection error:", error);

    if (!getNaviToken()) {
      showNaviReply(
        "نشست ناوی پایان یافته یا معتبر نیست. لطفاً دوباره وارد شو."
      );
    } else {
      showNaviReply(
        "فعلاً نتوانستم پاسخ دریافت کنم.\n\n" +
        "جزئیات خطا: " +
        (error.message || "خطای نامشخص")
      );

      setNaviStatus(
        "ارتباط با ناوی برقرار نشد. می‌توانی دوباره تلاش کنی."
      );
    }

  } finally {
    if (naviSessionVersion === requestVersion) {
      sendRequest.disabled = false;
      sendRequest.textContent = "ارسال پیام به ناوی";
    }
  }
}

sendRequest.addEventListener("click", sendMessageToNavi);

userRequest.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();

    if (!sendRequest.disabled) {
      sendMessageToNavi();
    }
  }
});


/* =========================================
   STORY MAKER
========================================= */

const storyInput = document.getElementById("storyInput");
const previewText = document.getElementById("previewText");
const clearStory = document.getElementById("clearStory");
const copyStory = document.getElementById("copyStory");
const storyMessage = document.getElementById("storyMessage");

storyInput.addEventListener("input", () => {
  const text = storyInput.value.trim();

  previewText.textContent =
    text || "متن استوری تو اینجا نمایش داده می‌شود";

  previewText.classList.toggle("empty", !text);
});

clearStory.addEventListener("click", () => {
  storyInput.value = "";
  previewText.textContent = "متن استوری تو اینجا نمایش داده می‌شود";
  previewText.classList.add("empty");

  storyMessage.textContent = "";
  storyMessage.classList.remove("show");
});

copyStory.addEventListener("click", async () => {
  const text = storyInput.value.trim();

  if (!text) {
    storyMessage.textContent = "ابتدا متنی برای کپی وارد کن.";
    storyMessage.classList.add("show");
    return;
  }

  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard API unavailable");
    }

    await navigator.clipboard.writeText(text);
    storyMessage.textContent = "متن استوری کپی شد.";

  } catch (error) {
    storyMessage.textContent =
      "کپی خودکار در این مرورگر ممکن نیست؛ متن را دستی انتخاب کن.";
  }

  storyMessage.classList.add("show");
});
 
