
"use strict";

/* =========================================
   NAVA CONFIG + DOM + STATE
========================================= */

// API
// Production remains the default. Add ?navi-preview=1 to the site URL
// to route NAVI requests to this branch's isolated Cloudflare Worker Preview.
const NAVI_PRODUCTION_BASE = "https://nava-music-api.honrrpower.workers.dev";
const NAVI_PREVIEW_BASE = "https://navi-frontend-modularization-nava-music-api.honrrpower.workers.dev";
export const NAVI_PREVIEW_MODE =
  new URLSearchParams(window.location.search).get("navi-preview") === "1";
export const NAVI_BASE = NAVI_PREVIEW_MODE
  ? NAVI_PREVIEW_BASE
  : NAVI_PRODUCTION_BASE;

export const NAVI_LOGIN_API = NAVI_BASE + "/navi-login";
export const NAVI_API = NAVI_BASE + "/navi-chat";
export const NAVI_HISTORY_API = NAVI_BASE + "/navi-history";
export const NAVI_MEMORY_API = NAVI_BASE + "/navi-memory";

// Keep Preview and Production sessions separate. A Production token must
// never be reused against the isolated Preview Worker (or vice versa).
export const NAVI_SESSION_KEY = NAVI_PREVIEW_MODE
  ? "nava_navi_session_preview"
  : "nava_navi_session";
export const NAVI_EXPIRY_KEY = NAVI_PREVIEW_MODE
  ? "nava_navi_expiry_preview"
  : "nava_navi_expiry";

// Limits
export const NAVI_MAX_DISPLAY_MESSAGES = 100;
export const NAVI_CONTEXT_MESSAGES = 10;

export const state = {
  naviSessionVersion: 0,
  naviHistory: [],
  naviHistoryLoading: false,
  naviHistoryLoadPromise: null,
  naviMemory: [],
  naviProposals: [],
  naviMemoryLoaded: false,
  naviMemoryLoading: false,
  naviMemoryLoadPromise: null,
  naviMemoryBusy: false
};

// DOM elements — NAVI
export const naviLoginPanel = document.getElementById("naviLoginPanel");
export const naviLoginForm = document.getElementById("naviLoginForm");
export const naviPassword = document.getElementById("naviPassword");
export const naviLoginButton = document.getElementById("naviLoginButton");
export const naviLoginError = document.getElementById("naviLoginError");
export const naviLoginStatus = document.getElementById("naviLoginStatus");
export const naviChatArea = document.getElementById("naviChatArea");
export const naviLogout = document.getElementById("naviLogout");

export const naviStatus = document.getElementById("naviStatus");
export const requestResponse = document.getElementById("requestResponse");
export const serviceSelect = document.getElementById("serviceSelect");
export const userRequest = document.getElementById("userRequest");
export const sendRequest = document.getElementById("sendRequest");

// DOM elements — History
export const naviHistoryList = document.getElementById("naviHistoryList");
export const naviHistoryCount = document.getElementById("naviHistoryCount");
export const naviHistoryRefresh = document.getElementById("naviHistoryRefresh");

// DOM elements — Memory
export const naviMemoryToggle = document.getElementById("naviMemoryToggle");
export const naviMemoryContent = document.getElementById("naviMemoryContent");
export const naviMemoryList = document.getElementById("naviMemoryList");
export const naviMemoryStatus = document.getElementById("naviMemoryStatus");
export const naviMemoryError = document.getElementById("naviMemoryError");
export const naviMemoryRefresh = document.getElementById("naviMemoryRefresh");


/* =========================================
   PAGE NAVIGATION
========================================= */

const navButtons = document.querySelectorAll(".nav-btn");
const pages = document.querySelectorAll(".page");

export function showPage(pageId) {
  pages.forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}



/* NAVA THEME */

export function applyNavaTheme(theme) {
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

export function initNavaTheme() {
  const button = document.getElementById("themeToggle");

  if (!button) return;

  const savedTheme = localStorage.getItem("nava-theme") || "dark";

  applyNavaTheme(savedTheme);

  button.addEventListener("click", function () {
    const isLight = document.body.classList.contains("light");

    applyNavaTheme(isLight ? "dark" : "light");
  });
}



/* =========================================
   GENERAL HELPERS
========================================= */

export function setNaviStatus(message) {
  naviStatus.textContent = message;
}

export function showNaviReply(reply) {
  requestResponse.textContent = String(reply || "");
  requestResponse.classList.add("show");
}

export function showLoginError(message) {
  naviLoginError.textContent = message;
  naviLoginError.classList.add("show");
}

export function clearLoginError() {
  naviLoginError.textContent = "";
  naviLoginError.classList.remove("show");
}

export function showEmptyHistory(message, countText) {
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

export function getNaviToken() {
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

export function saveNaviSession(token, expiresIn) {
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

export function clearNaviSession() {
  state.naviSessionVersion++;

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

  state.naviHistory = [];
  state.naviHistoryLoading = false;
  state.naviHistoryLoadPromise = null;
  state.naviMemory = [];
  state.naviProposals = [];
  state.naviMemoryLoaded = false;
  state.naviMemoryLoading = false;
  state.naviMemoryLoadPromise = null;
  state.naviMemoryBusy = false;

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
  if (naviHistoryRefresh) {
    naviHistoryRefresh.disabled = false;
    naviHistoryRefresh.textContent = "تازه‌سازی تاریخچه";
  }
  if (sendRequest) {
    sendRequest.disabled = false;
    sendRequest.textContent = "ارسال پیام به ناوی";
  }

  if (naviStatus) {
    naviStatus.textContent = "برای شروع گفت‌وگو وارد شو.";
  }

  if (naviMemoryToggle) naviMemoryToggle.setAttribute("aria-expanded", "false");
  if (naviMemoryContent) naviMemoryContent.hidden = true;
  if (naviMemoryList) {
    naviMemoryList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "navi-memory-empty";
    empty.textContent = "برای مشاهده حافظه‌ها وارد ناوی شو.";
    naviMemoryList.appendChild(empty);
  }
  if (naviMemoryStatus) naviMemoryStatus.textContent = "حافظه‌ها بارگذاری نشده‌اند.";
  if (naviMemoryError) naviMemoryError.textContent = "";
  if (naviMemoryRefresh) { naviMemoryRefresh.disabled = false; naviMemoryRefresh.textContent = "تازه‌سازی حافظه‌ها"; }
}

export function showNaviChat() {
  naviLoginPanel.hidden = true;
  naviChatArea.hidden = false;

  clearLoginError();

  naviLoginStatus.textContent = "نشست امن ناوی فعال است.";
  setNaviStatus("در حال بازیابی گفت‌وگوهای قبلی...");
}


/* =========================================
   HISTORY NORMALIZATION
========================================= */


export function initNavigation() {
  navButtons.forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  window.showPage = showPage;
}

export function initTheme() { initNavaTheme(); }
