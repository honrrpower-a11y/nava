
"use strict";

/* =========================================
   NAVA CONFIG + DOM + STATE
========================================= */

// API
// API
const NAVI_BASE = "https://nava-music-api.honrrpower.workers.dev";
const NAVI_LOGIN_API = NAVI_BASE + "/navi-login";
const NAVI_AUTH_CHALLENGE_API = NAVI_BASE + "/navi-auth-challenge";
const NAVI_API = NAVI_BASE + "/navi-chat";
const NAVI_HISTORY_API = NAVI_BASE + "/navi-history";
const NAVI_THREADS_API = NAVI_BASE + "/navi-threads";
const NAVI_PROJECTS_API = NAVI_BASE + "/navi-projects";
const NAVI_MEMORY_API = NAVI_BASE + "/navi-memory";
const NAVI_SAVE_MESSAGE_API = NAVI_BASE + "/navi-memory-save-message";
const NAVI_USERS_API = NAVI_BASE + "/navi-users";
const NAVI_REGISTER_API = NAVI_BASE + "/navi-register";

// Session
const NAVI_SESSION_KEY = "nava_navi_session";
const NAVI_EXPIRY_KEY = "nava_navi_expiry";
const NAVI_USER_NAME_KEY = "nava_navi_user_name";
const NAVI_USER_ROLE_KEY = "nava_navi_user_role";
const NAVI_USER_ID_KEY = "nava_navi_user_id";

// Persistent account state: closing the browser must not end a valid login.
// Temporary studio-return context intentionally remains in sessionStorage.
function getNaviStoredValue(key) {
  try {
    const persistent = localStorage.getItem(key);
    if (persistent !== null) return persistent;
    // One-time migration for users who still have an active legacy tab session.
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
    return legacy;
  } catch (error) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }
}

function setNaviStoredValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
    try { sessionStorage.removeItem(key); } catch (_) {}
  } catch (error) {
    throw new Error("ذخیره نشست پایدار در مرورگر ممکن نیست. تنظیمات ذخیره‌سازی مرورگر را بررسی کن.");
  }
}

function removeNaviStoredValue(key) {
  try { localStorage.removeItem(key); } catch (_) {}
  try { sessionStorage.removeItem(key); } catch (_) {}
}

// Browser-side password derivation. PBKDF2 never runs inside the Free Worker.
function naviBytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function naviBase64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function deriveNaviPasswordVerifier(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("رمز عبور باید بین ۱۲ تا ۲۵۶ نویسه داشته باشد.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 },
    material, 256
  );
  return "pbkdf2$310000$" + naviBytesToBase64Url(salt) + "$" +
    naviBytesToBase64Url(new Uint8Array(bits));
}

async function createNaviLoginProof(password, challenge) {
  const salt = naviBase64UrlToBytes(challenge.salt);
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(challenge.iterations) },
    material, 256
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const message = "navi-login|" + challenge.challengeId + "|" +
    challenge.username + "|" + challenge.nonce;
  const signature = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(message));
  return naviBytesToBase64Url(new Uint8Array(signature));
}

// Limits
const NAVI_MAX_DISPLAY_MESSAGES = 100;
const NAVI_CONTEXT_MESSAGES = 10;

// Session state
let naviSessionVersion = 0;
let naviAssistantContext = null;

// History state
let naviHistory = [];
let naviHistoryLoading = false;
let naviHistoryLoadPromise = null;
let naviThreads = [];
let naviProjects = [];
let naviActiveProjectId = "project-general";
let naviActiveThreadId = "owner-main";

// Memory state
let naviMemory = [];
let naviProposals = [];
let naviArchivedMemory = [];
let naviMemoryLoaded = false;
let naviMemoryLoading = false;
let naviMemoryLoadPromise = null;
let naviMemoryBusy = false;

// DOM elements — NAVI
const naviLoginPanel = document.getElementById("naviLoginPanel");
const naviLoginForm = document.getElementById("naviLoginForm");
const naviPassword = document.getElementById("naviPassword");
const naviUsername = document.getElementById("naviUsername");
const naviUserDisplay = document.getElementById("naviUserDisplay");
const naviAccountAdmin = document.getElementById("naviAccountAdmin");
const naviCreateUserForm = document.getElementById("naviCreateUserForm");
const naviCreateUserButton = document.getElementById("naviCreateUserButton");
const naviCreateUserStatus = document.getElementById("naviCreateUserStatus");
const naviUsersList = document.getElementById("naviUsersList");
const naviUsersStatus = document.getElementById("naviUsersStatus");
const naviUsersRefresh = document.getElementById("naviUsersRefresh");
const naviRegistrationForm = document.getElementById("naviRegistrationForm");
const naviRegistrationStatus = document.getElementById("naviRegistrationStatus");
const naviLoginButton = document.getElementById("naviLoginButton");
const naviLoginError = document.getElementById("naviLoginError");
const naviLoginStatus = document.getElementById("naviLoginStatus");
const naviChatArea = document.getElementById("naviChatArea");
const naviLogout = document.getElementById("naviLogout");
const naviWidgetPanel = document.getElementById("naviWidgetPanel");
const naviWidgetToggle = document.getElementById("naviWidgetToggle");
const officeNaviInlineHost = document.getElementById("officeNaviInlineHost");
const naviAssistantWidget = document.getElementById("naviAssistantWidget");
let naviWidgetOriginalPlaceholder = null;

function mountNaviWidgetInOffice() {
  if (!naviWidgetPanel || !officeNaviInlineHost) return false;
  if (!naviWidgetOriginalPlaceholder && naviWidgetPanel.parentNode) {
    naviWidgetOriginalPlaceholder = document.createComment("NAVI floating panel original position");
    naviWidgetPanel.parentNode.insertBefore(naviWidgetOriginalPlaceholder, naviWidgetPanel);
  }
  if (naviWidgetPanel.parentNode !== officeNaviInlineHost) {
    officeNaviInlineHost.appendChild(naviWidgetPanel);
  }
  naviWidgetPanel.classList.add("is-office-embedded");
  document.body.classList.add("navi-office-chat-embedded");
  if (naviWidgetToggle) naviWidgetToggle.hidden = true;
  return true;
}

function restoreNaviWidgetFromOffice() {
  if (!naviWidgetPanel) return;
  if (naviWidgetOriginalPlaceholder?.parentNode) {
    naviWidgetOriginalPlaceholder.parentNode.insertBefore(naviWidgetPanel, naviWidgetOriginalPlaceholder);
    naviWidgetOriginalPlaceholder.remove();
  } else if (naviAssistantWidget && naviWidgetPanel.parentNode !== naviAssistantWidget) {
    naviAssistantWidget.appendChild(naviWidgetPanel);
  }
  naviWidgetOriginalPlaceholder = null;
  naviWidgetPanel.classList.remove("is-office-embedded");
  document.body.classList.remove("navi-office-chat-embedded");
  if (naviWidgetToggle) naviWidgetToggle.hidden = naviWidgetPanel.hidden === false;
}
const naviWidgetClose = document.getElementById("naviWidgetClose");
const naviAssistantContextPanel = document.getElementById("naviAssistantContext");
const naviAssistantContextTitle = document.getElementById("naviAssistantContextTitle");
const naviAssistantContextSummary = document.getElementById("naviAssistantContextSummary");
const naviAssistantContextClear = document.getElementById("naviAssistantContextClear");
const naviWelcomeBubble = document.getElementById("naviWelcomeBubble");
const naviWelcomeBubbleText = document.getElementById("naviWelcomeBubbleText");
const naviWelcomeBubbleClose = document.getElementById("naviWelcomeBubbleClose");
let naviWelcomeBubbleTimer = null;

const naviStatus = document.getElementById("naviStatus");
const requestResponse = document.getElementById("requestResponse");
const serviceSelect = document.getElementById("serviceSelect");
const userRequest = document.getElementById("userRequest");
const sendRequest = document.getElementById("sendRequest");
const naviSaveComposerMessage = document.getElementById("naviSaveComposerMessage");

// DOM elements — History
const naviHistoryToggle = document.getElementById("naviHistoryToggle");
const naviHistoryContent = document.getElementById("naviHistoryContent");
const naviHistoryList = document.getElementById("naviHistoryList");
const naviHistoryCount = document.getElementById("naviHistoryCount");
const naviHistoryRefresh = document.getElementById("naviHistoryRefresh");
const naviNewThreadButton = document.getElementById("naviNewThread");
const naviDeleteThreadButton = document.getElementById("naviDeleteThread");
const naviThreadList = document.getElementById("naviThreadList");
const naviProjectSelect = document.getElementById("naviProjectSelect");
const naviNewProjectName = document.getElementById("naviNewProjectName");
const naviCreateProjectButton = document.getElementById("naviCreateProject");
const naviDeleteProjectButton = document.getElementById("naviDeleteProject");
const naviProjectStatus = document.getElementById("naviProjectStatus");

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

function collectNaviStudioContext(pageId) {
  const value = id => document.getElementById(id)?.value?.trim() || "";
  const selected = id => {
    const field = document.getElementById(id);
    return field?.selectedOptions?.[0]?.textContent?.trim() || "";
  };
  const contexts = {
    logoPage: {
      brandName: value("logoBrandName"), slogan: value("logoSlogan"),
      industry: value("logoIndustry"), audience: value("logoAudience"),
      symbolIdea: value("logoSymbolIdea"), typography: selected("logoTypography"),
      personality: selected("logoPersonality"), format: selected("logoFormat"),
      palette: selected("logoPalette"),
      primaryColor: value("logoPrimaryColor"), darkColor: value("logoDarkColor")
    },
    brandPage: {
      brandName: value("brandName"), industry: value("brandIndustry"),
      audience: value("brandAudience"), personality: selected("brandPersonality"),
      values: value("brandValues"), difference: value("brandDifference"),
      promise: value("brandPromise"), competitors: value("brandCompetitors")
    },
    contentPage: {
      platform: selected("contentPlatform"), format: selected("contentFormat"),
      objective: selected("contentObjective"), tone: selected("contentTone"),
      topic: value("contentTopic"), audience: value("contentAudience"),
      keyPoints: value("contentKeyPoints"), callToAction: value("contentCTA"),
      keywords: value("contentKeywords")
    },
    storyPage: { content: value("storyInput") },
    articlePage: {
      task: selected("studioTask-article"),
      audience: value("studioAudience-article"),
      brief: value("studioBrief-article")
    },
    officePage: {
      task: selected("studioTask-office"),
      operation: value("studioMode-office"),
      requestedOutput: selected("studioOutput-office"),
      detailLevel: selected("studioDetail-office"),
      audience: value("studioAudience-office"),
      brief: value("studioBrief-office")
    },
    composePage: {
      task: selected("studioTask-compose"),
      style: value("studioStyle-compose"),
      keyOrMode: value("studioKey-compose"),
      tempoBpm: value("studioTempo-compose"),
      timeSignature: value("studioMeter-compose"),
      instruments: value("studioInstruments-compose"),
      brief: value("studioBrief-compose")
    },
    avPage: {
      task: selected("studioTask-av"),
      audience: value("studioAudience-av"),
      brief: value("studioBrief-av")
    },
    seoPage: {
      task: selected("studioTask-seo"),
      audience: value("studioAudience-seo"),
      brief: value("studioBrief-seo")
    },
    adsPage: {
      task: selected("studioTask-ads"),
      audience: value("studioAudience-ads"),
      brief: value("studioBrief-ads")
    },
    bizPage: {
      task: selected("studioTask-biz"),
      audience: value("studioAudience-biz"),
      brief: value("studioBrief-biz")
    }
  };
  return Object.fromEntries(Object.entries(contexts[pageId] || {})
    .filter(([, item]) => typeof item === "string" && item.trim()));
}

function syncNaviWidgetMode() {
  const studioMode = document.body.classList.contains("navi-studio-context");
  const title = naviWidgetToggle?.querySelector(".navi-widget-toggle-copy strong");
  if (title) title.textContent = studioMode ? "همراه ناوی" : "گفت‌وگو با ناوی";
  naviWidgetToggle?.setAttribute("aria-label",
    studioMode ? "باز کردن همراه ناوی در این استودیو" : "باز کردن گفت‌وگو با ناوی");
}

/* Initial account/guest choice: keep the rest of the site inert until a path is chosen.
   Move the dialog to <body> while active so transformed orbit artwork cannot shift its
   fixed-position coordinates away from the actual viewport center. */
let navaAccessGateActive = false;
let navaAccessPanelPlaceholder = null;
let navaAccessPanelOriginalParent = null;
let navaAccessPanelOriginalNextSibling = null;

function setNavaAccessGate(active) {
  navaAccessGateActive = Boolean(active);
  const accessPanel = document.querySelector(".nava-access-panel");
  const main = document.querySelector("main");
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");

  if (!accessPanel) return;

  if (navaAccessGateActive && accessPanel.parentElement !== document.body) {
    navaAccessPanelOriginalParent = accessPanel.parentElement;
    navaAccessPanelOriginalNextSibling = accessPanel.nextSibling;
    navaAccessPanelPlaceholder = document.createComment("NAVA access dialog position");
    navaAccessPanelOriginalParent?.insertBefore(navaAccessPanelPlaceholder, accessPanel);
    document.body.appendChild(accessPanel);
  } else if (!navaAccessGateActive && accessPanel.parentElement === document.body &&
             navaAccessPanelOriginalParent) {
    navaAccessPanelOriginalParent.insertBefore(
      accessPanel,
      navaAccessPanelPlaceholder || navaAccessPanelOriginalNextSibling
    );
    navaAccessPanelPlaceholder?.remove();
    navaAccessPanelPlaceholder = null;
    navaAccessPanelOriginalParent = null;
    navaAccessPanelOriginalNextSibling = null;
  }

  if (header) header.inert = navaAccessGateActive;
  if (footer) footer.inert = navaAccessGateActive;
  if (main) main.inert = navaAccessGateActive;

  accessPanel.classList.toggle("is-gate-active", navaAccessGateActive);
  accessPanel.setAttribute("aria-modal", navaAccessGateActive ? "true" : "false");
  accessPanel.setAttribute("role", navaAccessGateActive ? "dialog" : "region");
}

function showPage(pageId) {
  if (navaAccessGateActive && pageId !== "homePage") return;
  if (pageId !== "officePage") {
    if (naviWidgetPanel && !naviWidgetPanel.hidden) setNaviWidgetOpen(false);
    restoreNaviWidgetFromOffice();
  }
  pages.forEach(page => page.classList.toggle("active", page.id === pageId));
  navButtons.forEach(button => button.classList.toggle("active", button.dataset.page === pageId));

  const studioByPage = {
    logoPage: "طراحی لوگو", brandPage: "برندینگ",
    contentPage: "تولید محتوا", storyPage: "استوری‌ساز",
    musicPage: "تولید موسیقی",
    articlePage: "مقاله و وبلاگ",
    officePage: "کارهای اداری و آفیس",
    composePage: "آهنگ‌سازی و نت‌نویسی",
    avPage: "ویدئو و صدا",
    seoPage: "سئو",
    adsPage: "تبلیغات",
    bizPage: "ابزارهای کسب‌وکار"
  };
  const studioName = studioByPage[pageId];
  document.body.classList.toggle("navi-studio-context", Boolean(studioName));
  syncNaviWidgetMode();

  if (studioName) {
    updateNaviAssistantContext(studioName, collectNaviStudioContext(pageId));
    if (Array.from(serviceSelect.options).some(option => option.value === studioName)) {
      serviceSelect.value = studioName;
    }
  } else if (pageId === "homePage") {
    naviAssistantContext = null;
    if (naviAssistantContextPanel) naviAssistantContextPanel.hidden = true;
    serviceSelect.value = "انتخاب نشده";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navButtons.forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

/*
 * Keep NAVI's active studio brief synchronized with the form while the user works.
 * This only updates local context; it does not call the AI API or write to memory.
 */
function syncNaviStudioContextFromActivePage() {
  if (!document.body.classList.contains("navi-studio-context")) return;

  const activePage = document.querySelector(".page.active");
  if (!activePage) return;

  const studioByPage = {
    logoPage: "طراحی لوگو",
    brandPage: "برندینگ",
    contentPage: "تولید محتوا",
    storyPage: "استوری‌ساز",
    musicPage: "تولید موسیقی",
    articlePage: "مقاله و وبلاگ",
    officePage: "کارهای اداری و آفیس",
    composePage: "آهنگ‌سازی و نت‌نویسی",
    avPage: "ویدئو و صدا",
    seoPage: "سئو",
    adsPage: "تبلیغات",
    bizPage: "ابزارهای کسب‌وکار"
  };
  const studioName = studioByPage[activePage.id];
  if (!studioName) return;

  updateNaviAssistantContext(studioName, collectNaviStudioContext(activePage.id));
}

function handleNaviStudioFieldChange(event) {
  const field = event.target;
  if (!(field instanceof Element) ||
      !field.matches("input, textarea, select")) return;

  const fieldType = String(field.type || "").toLowerCase();
  if (["password", "file", "hidden"].includes(fieldType)) return;

  const activePage = field.closest(".page.active");
  if (!activePage || !activePage.contains(field)) return;

  syncNaviStudioContextFromActivePage();
}

// Delegated listeners also cover controls added to a studio after page load.
document.addEventListener("input", handleNaviStudioFieldChange, true);
document.addEventListener("change", handleNaviStudioFieldChange, true);

// Native form resets fire before browser controls receive their reset values.
document.addEventListener("reset", event => {
  const form = event.target;
  if (!(form instanceof Element) || !form.matches("form")) return;
  window.setTimeout(syncNaviStudioContextFromActivePage, 0);
}, true);

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

/* NAVI FIRST-VISIT WELCOME — once per browser guest / once per account */
function showNaviWelcome(kind, identity = "") {
  if (!naviWelcomeBubble || !naviWelcomeBubbleText) return;

  const storageKey = kind === "account"
    ? "nava_navi_welcome_account_" + String(identity || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_")
    : "nava_navi_welcome_guest";

  try {
    if (localStorage.getItem(storageKey) === "1") return;
  } catch (error) {
    // Fall back to the current tab if persistent storage is unavailable.
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
    } catch (_) {}
  }

  const displayName = getNaviStoredValue(NAVI_USER_NAME_KEY) || "";
  naviWelcomeBubbleText.textContent = kind === "account" && displayName
    ? "سلام " + displayName + " عزیز! به نوا خوش اومدی. من NAVI هستم؛ همراهت در این جهان خلاق."
    : "سلام! به جهان نوا خوش اومدی. من NAVI هستم؛ همراهت برای کشف ایده‌ها و ساختن چیزهای تازه.";

  naviWelcomeBubble.hidden = false;

  try {
    localStorage.setItem(storageKey, "1");
  } catch (error) {
    try { sessionStorage.setItem(storageKey, "1"); } catch (_) {}
  }

  if (naviWelcomeBubbleTimer) window.clearTimeout(naviWelcomeBubbleTimer);
  naviWelcomeBubbleTimer = window.setTimeout(() => {
    naviWelcomeBubble.hidden = true;
  }, 10000);
}

function hideNaviWelcome() {
  if (naviWelcomeBubble) naviWelcomeBubble.hidden = true;
  if (naviWelcomeBubbleTimer) {
    window.clearTimeout(naviWelcomeBubbleTimer);
    naviWelcomeBubbleTimer = null;
  }
}

naviWelcomeBubbleClose?.addEventListener("click", hideNaviWelcome);

/* Preserve the active studio form while a guest signs in. */
const NAVA_RETURN_CONTEXT_KEY = "nava_pending_return_context_v1";

function captureNavaReturnContext() {
  const activePage = document.querySelector(".page.active");
  if (!activePage) return;
  const fields = Array.from(activePage.querySelectorAll("input[id], select[id], textarea[id]"))
    .filter(field => !["password", "file", "hidden"].includes(String(field.type || "").toLowerCase()))
    .map(field => ({
      id: field.id,
      value: field.value,
      checked: field.type === "checkbox" || field.type === "radio" ? Boolean(field.checked) : undefined
    }));
  try {
    sessionStorage.setItem(NAVA_RETURN_CONTEXT_KEY, JSON.stringify({
      pageId: activePage.id,
      fields,
      savedAt: Date.now()
    }));
  } catch (error) {
    console.warn("Could not preserve the active NAVA studio form.");
  }
}

function restoreNavaReturnContext() {
  let pending;
  try {
    const raw = sessionStorage.getItem(NAVA_RETURN_CONTEXT_KEY);
    if (!raw) return false;
    pending = JSON.parse(raw);
  } catch (error) {
    try { sessionStorage.removeItem(NAVA_RETURN_CONTEXT_KEY); } catch (_) {}
    return false;
  }
  if (!pending || !Number.isFinite(pending.savedAt) ||
      Date.now() - pending.savedAt > 30 * 60 * 1000 ||
      typeof pending.pageId !== "string") {
    try { sessionStorage.removeItem(NAVA_RETURN_CONTEXT_KEY); } catch (_) {}
    return false;
  }
  const targetPage = document.getElementById(pending.pageId);
  if (!targetPage || !targetPage.classList.contains("page")) return false;
  showPage(pending.pageId);
  if (Array.isArray(pending.fields)) {
    for (const saved of pending.fields) {
      if (!saved || typeof saved.id !== "string") continue;
      const field = document.getElementById(saved.id);
      if (!field || !targetPage.contains(field)) continue;
      if (field.type === "checkbox" || field.type === "radio") field.checked = Boolean(saved.checked);
      else if (typeof saved.value === "string") field.value = saved.value;
    }
  }
  showPage(pending.pageId);
  try { sessionStorage.removeItem(NAVA_RETURN_CONTEXT_KEY); } catch (_) {}
  targetPage.querySelector("input:not([type='hidden']), textarea, select")?.focus({ preventScroll: true });
  return true;
}

/* NAVI FLOATING CHAT — stage 1: animated chat window */
function positionNaviWidgetOnOrbit() {
  // NAVI is a viewport-level dialog, never anchored to the orbit or page scroll.
  if (!naviWidgetPanel) return;
  naviWidgetPanel.style.removeProperty("--navi-panel-top");
  naviWidgetPanel.style.removeProperty("--navi-panel-left");
}

function setNaviWidgetOpen(isOpen, focusComposer = false) {
  if (!naviWidgetPanel || !naviWidgetToggle) return;
  syncNaviWidgetMode();

  if (isOpen && !getNaviToken()) captureNavaReturnContext();
  if (isOpen) positionNaviWidgetOnOrbit();

  naviWidgetPanel.hidden = !isOpen;
  naviWidgetToggle.hidden = isOpen || document.body.classList.contains("navi-office-chat-embedded");
  naviWidgetPanel.classList.toggle("is-open", isOpen);
  naviWidgetPanel.classList.toggle("is-auth-entry", isOpen && !getNaviToken());
  document.body.classList.toggle("navi-widget-open", isOpen);
  naviWidgetToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  const studioMode = document.body.classList.contains("navi-studio-context");
  naviWidgetToggle.setAttribute("aria-label",
    isOpen ? "بستن همراه ناوی" :
    studioMode ? "باز کردن همراه ناوی در این استودیو" : "باز کردن گفت‌وگو با ناوی");

  if (!isOpen) {
    naviWidgetPanel.style.removeProperty("--navi-panel-top");
    naviWidgetPanel.style.removeProperty("--navi-panel-left");
  }

  if (isOpen && focusComposer) {
    window.setTimeout(() => {
      const target = getNaviToken() ? userRequest : naviUsername;
      if (target && !target.hidden) target.focus({ preventScroll: true });
    }, 220);
  }
}

if (naviWidgetToggle) {
  naviWidgetToggle.addEventListener("click", () => {
    setNaviWidgetOpen(naviWidgetPanel?.hidden !== false, true);
  });
}
function closeNaviWidgetRespectingAccessChoice() {
  const hasSession = Boolean(getNaviToken());
  setNaviWidgetOpen(false);

  // An unauthenticated visitor who closes NAVI must return to the access
  // choice (sign in / continue as guest), not silently land on the homepage.
  if (!hasSession) {
    document.querySelector(".nava-access-panel")?.classList.remove("is-dismissed");
    setNavaAccessGate(true);
  }
}

if (naviWidgetClose) {
  naviWidgetClose.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeNaviWidgetRespectingAccessChoice();
  });
}

// Keep the login view dismissible even while the mobile keyboard is open.
const naviLoginPanelClose = document.getElementById("naviLoginPanelClose");
naviLoginPanelClose?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  closeNaviWidgetRespectingAccessChoice();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && naviWidgetPanel && !naviWidgetPanel.hidden &&
      !document.body.classList.contains("navi-office-chat-embedded")) {
    closeNaviWidgetRespectingAccessChoice();
  }
});

function normalizeNaviStudioContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  const limits = {
    brandName: 500, slogan: 500, industry: 500, audience: 500,
    personality: 500, format: 500, palette: 500, content: 500, goal: 500,
    values: 500, difference: 500, promise: 500, competitors: 500,
    platform: 500, objective: 500, topic: 500, tone: 500,
    keyPoints: 500, callToAction: 500, keywords: 500,
    task: 500, application: 120, userLevel: 180, operation: 120,
    requestedOutput: 240, detailLevel: 160, brief: 18000
  };
  const result = {};
  for (const [key, maxLength] of Object.entries(limits)) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim().slice(0, maxLength);
    }
  }
  return result;
}

function updateNaviAssistantContext(service, context = {}) {
  const normalized = normalizeNaviStudioContext(context);
  naviAssistantContext = { service: String(service || "گفت‌وگوی عمومی").slice(0, 80), context: normalized };
  if (naviAssistantContextTitle) naviAssistantContextTitle.textContent = naviAssistantContext.service;
  if (naviAssistantContextSummary) {
    const labels = {
      brandName: "نام برند", slogan: "شعار", industry: "حوزه", audience: "مخاطب",
      personality: "شخصیت", format: "ساختار", palette: "رنگ‌ها", content: "محتوا", goal: "هدف",
      values: "ارزش‌ها", difference: "تمایز", promise: "وعده برند", competitors: "رقبا",
      platform: "پلتفرم", objective: "هدف محتوا", topic: "موضوع", tone: "لحن",
      keyPoints: "نکات کلیدی", callToAction: "دعوت به اقدام", keywords: "کلیدواژه‌ها",
      task: "نوع کار", application: "برنامه", userLevel: "سطح کاربر",
      operation: "عملیات", requestedOutput: "خروجی", detailLevel: "سطح جزئیات",
      brief: "شرح و محتوای فایل"
    };
    const lines = Object.entries(normalized).map(([key, value]) => {
      const preview = value.length > 120 ? value.slice(0, 120) + "…" : value;
      return (labels[key] || key) + ": " + preview;
    });
    const summary = lines.join(" • ");
    naviAssistantContextSummary.textContent = summary
      ? summary.slice(0, 900) + (summary.length > 900 ? "…" : "")
      : "ناوی می‌داند اکنون در این استودیو هستی.";
  }
  if (naviAssistantContextPanel) naviAssistantContextPanel.hidden = false;
}

naviAssistantContextClear?.addEventListener("click", () => {
  naviAssistantContext = null;
  if (naviAssistantContextPanel) naviAssistantContextPanel.hidden = true;
  if (serviceSelect) serviceSelect.value = "انتخاب نشده";
});

window.openNaviAssistant = function(options = {}) {
  const service = String(options.service || "گفت‌وگوی عمومی");
  const available = Array.from(serviceSelect.options).some(option => option.value === service);
  if (available) serviceSelect.value = service;

  if (options.blank === true) {
    // A blank NAVI session must not inherit Office form data or an older studio context.
    naviAssistantContext = null;
    if (naviAssistantContextPanel) naviAssistantContextPanel.hidden = true;
    if (userRequest) userRequest.value = "";
    setNaviWidgetOpen(true, true);
    return;
  }

  const pageId = document.querySelector(".page.active")?.id;
  const context = options.context && Object.keys(options.context).length
    ? options.context : collectNaviStudioContext(pageId);
  updateNaviAssistantContext(service, context);
  if (typeof options.message === "string" && options.message.trim()) userRequest.value = options.message.trim();
  setNaviWidgetOpen(true, true);
};

// Submit guided Office requests from the Office page itself. If the user is
// not authenticated, preserve the existing sign-in/chat flow and prefill it.
window.sendOfficeNaviRequest = function({ message, context } = {}) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) return false;
  const service = "کارهای اداری و آفیس";
  const officeContext = context && typeof context === "object" ? context : {};
  document.getElementById("officeOperationsTab")?.click();
  mountNaviWidgetInOffice();
  if (!getNaviToken()) {
    window.openNaviAssistant({ service, context: officeContext, message: cleanMessage });
    return false;
  }
  if (Array.from(serviceSelect.options).some(option => option.value === service)) {
    serviceSelect.value = service;
  }
  updateNaviAssistantContext(service, officeContext);
  // The existing NAVI conversation is embedded in the Office operations tab.
  // Replies and approval cards stay beside the file workflow on this page.
  setNaviWidgetOpen(true, false);
  return sendMessageToNavi({
    pageOverride: "officePage",
    messageOverride: cleanMessage,
    serviceOverride: service,
    contextOverride: officeContext,
    officeTarget: false
  });
};
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && naviWidgetPanel && !naviWidgetPanel.hidden) {
    setNaviWidgetOpen(false);
    naviWidgetToggle?.focus();
  }
});

/* NAVA ACCOUNT UI — theme-aware dropdowns and registration spacing */
(function initNavaAccountUiStyles() {
  if (document.getElementById("navaAccountUiStyles")) return;
  const style = document.createElement("style");
  style.id = "navaAccountUiStyles";
  style.textContent = `
    .navi-widget-panel.is-auth-entry .navi-auth-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 18px 0 16px;
      padding: 5px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel2);
    }
    .navi-widget-panel.is-auth-entry .navi-auth-tab {
      min-height: 46px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .navi-widget-panel.is-auth-entry .navi-auth-tab.is-active {
      color: var(--gold);
      border-color: var(--gold);
      background: var(--panel);
      box-shadow: 0 2px 10px rgba(0,0,0,.06);
    }
    .navi-widget-panel.is-auth-entry .navi-auth-tab-panel[hidden] { display: none !important; }
    .navi-widget-panel.is-auth-entry .navi-auth-tab-panel > p {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.9;
      margin: 0 0 14px;
    }
    /* Keep first-time visitors focused on account access, not generic chat context. */
    .navi-widget-panel.is-auth-entry .navi-assistant-context,
    .navi-widget-panel.is-auth-entry #requestSection > .request-content > h2,
    .navi-widget-panel.is-auth-entry #requestSection > .request-content > p {
      display: none !important;
    }
    .navi-widget-panel.is-auth-entry .navi-auth-panel { margin-top: 0; }
    .navi-widget-panel.is-auth-entry .navi-auth-panel::before {
      content: "ورود یا عضویت در نوا";
      display: block;
      margin: 0 0 8px;
      color: var(--gold);
      font-size: 20px;
      font-weight: 800;
    }
    .navi-widget-panel.is-auth-entry .navi-auth-panel > p {
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.9;
    }
    .navi-widget-panel.is-auth-entry .navi-registration-details {
      margin: 0 0 18px;
      border-color: var(--gold);
      background: var(--panel2);
    }
    .navi-widget-panel.is-auth-entry .navi-registration-details > summary {
      font-size: 15px;
      padding: 8px 2px;
    }
    .navi-auth-error.navi-registration-success {
      display: block;
      color: #65c99a;
    }
    body.light .navi-auth-error.navi-registration-success {
      color: #287b58;
    }
    .navi-registration-details {
      margin-top: 26px;
      padding: 13px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      color: var(--text);
      transition: background .25s, border-color .25s, color .25s;
    }
    .navi-registration-details > summary {
      color: var(--gold);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      list-style-position: inside;
      padding: 2px 0;
    }
    .navi-registration-details[open] > summary {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }
    .navi-registration-details .navi-memory-description {
      color: var(--muted);
    }
    .navi-users-dropdown {
      margin-top: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--panel);
      transition: background .25s, border-color .25s;
    }
    .navi-users-dropdown > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 13px 14px;
      color: var(--gold);
      background: var(--panel2);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      list-style: none;
    }
    .navi-users-dropdown > summary::-webkit-details-marker { display: none; }
    .navi-users-dropdown > summary::after {
      content: "⌄";
      font-size: 17px;
      transition: transform .2s;
    }
    .navi-users-dropdown[open] > summary {
      border-bottom: 1px solid var(--border);
    }
    .navi-users-dropdown[open] > summary::after {
      transform: rotate(180deg);
    }
    .navi-users-dropdown-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      background: var(--panel);
    }
    .navi-registration-pending-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 10px 0 14px;
    }
    body.light .navi-registration-details {
      background: #fffdf8;
      border-color: rgba(193,127,37,.30);
      color: #263a56;
    }
    body.light .navi-registration-details > summary { color: #a96522; }
    body.light .navi-users-dropdown {
      background: #fffdf8;
      border-color: rgba(193,127,37,.30);
    }
    body.light .navi-users-dropdown > summary {
      background: #f8eddd;
      color: #a96522;
    }
    body.light .navi-users-dropdown-list { background: #fffdf8; }
    body.light .navi-users-dropdown-list .navi-user-row {
      background: #fff8ed;
      border-color: rgba(193,127,37,.24);
    }
  `;
  document.head.appendChild(style);
})();


/* =========================================
   GENERAL HELPERS
========================================= */

function setNaviStatus(message) {
  naviStatus.textContent = message;
}

function showNaviReply(reply) {
  requestResponse.value = String(reply || "");
  requestResponse.classList.add("show");
  const service = naviAssistantContext?.service || serviceSelect?.value || "";
  window.NavaDocumentExport?.attach(requestResponse, service);
}

function renderNaviOfficeAction(action, options = {}) {
  const chatSlot = document.getElementById("naviOfficeActionChatSlot");
  const host = document.getElementById("officeActionHost");
  const officeSlot = document.getElementById("officeActionCardSlot");
  const exportActions = document.querySelector("[data-nava-export-actions]");
  const officeResultTarget = options.target === "office" && exportActions;
  // Remove any previous proposal from both the original card host and the
  // result action row before rendering the next response.
  document.getElementById("naviOfficeActionCard")?.remove();
  document.querySelectorAll("[data-navi-office-approval-button]").forEach(button => button.remove());
  if (chatSlot) chatSlot.replaceChildren();
  if (officeSlot) officeSlot.replaceChildren();
  if (host) host.hidden = true;
  if (!action || !["replace_text", "edit_cells", "append_row"].includes(action.kind)) return;

  const slot = options.target === "office"
    ? (officeSlot || chatSlot)
    : (chatSlot || officeSlot);
  if (!officeResultTarget && !slot) {
    console.error("NAVI Office action chat and fallback slots are missing.");
    return;
  }
  // The Office form host is only needed when the result action row is absent.
  if (!officeResultTarget && slot === officeSlot && host) host.hidden = false;

  const tools = window.NavaOfficeTools;
  const file = tools?.getActiveFileInfo?.() || null;
  const card = document.createElement("section");
  card.id = "naviOfficeActionCard";
  card.className = "navi-office-action-card";
  card.style.cssText = officeResultTarget
    ? "display:grid;gap:6px;flex:1 0 100%;order:-1;padding:10px 12px;margin-bottom:4px;border:1px solid rgba(190,150,70,.45);border-radius:10px;background:var(--card-bg,rgba(120,110,90,.08))"
    : "padding:14px;border:1px solid rgba(190,150,70,.45);border-radius:12px;background:var(--card-bg,rgba(120,110,90,.08));display:grid;gap:9px";
  card.setAttribute("aria-live", "polite");

  const title = document.createElement("strong");
  title.textContent = "پیشنهاد ویرایش فایل — نیازمند تأیید تو";
  const detail = document.createElement("p");
  detail.textContent = action.kind === "replace_text"
    ? "جایگزینی دقیق «" + action.find + "» با «" + action.replace + "»"
    : action.kind === "append_row"
      ? "افزودن یک ردیف به انتهای شیت «" + action.sheet + "»: " + action.values.map(value => String(value)).join(" | ")
      : "اعمال تغییرات Excel: " + action.edits.map(item => item.sheet + "!" + item.cell + " ← " + String(item.value)).join("؛ ");
  const fileLine = document.createElement("p");
  fileLine.textContent = file?.ready
    ? "فایل فعال در استودیوی آفیس: " + file.name
    : "برای اجرای این پیشنهاد، ابتدا فایل DOCX، PPTX یا XLSX را در همین بخش آفیس بارگذاری کن.";
  const note = document.createElement("p");
  note.textContent = action.kind === "replace_text"
    ? "فقط متن‌های دقیقاً منطبق در قطعه‌های متنی مستقل تغییر می‌کنند؛ متن شکسته‌شده بین چند قطعه ممکن است پیدا نشود."
    : action.kind === "append_row"
      ? "ردیف جدید در نخستین ردیف خالی پس از محدوده فعلی جدول درج می‌شود. تعداد مقادیر باید با ستون‌های جدول برابر باشد."
      : "فقط سلول‌های مشخص‌شده در شیت‌های موجود تغییر می‌کنند. فرمول‌نویسی از این مسیر مجاز نیست.";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn-primary";
  confirm.textContent = "تأیید و ساخت نسخه ویرایش‌شده";
  confirm.dataset.naviOfficeApprovalButton = "confirm";
  confirm.disabled = !file?.ready || (action.kind === "replace_text" ? !["docx", "pptx"].includes(file.kind) : file.kind !== "xlsx");

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn-secondary";
  cancel.textContent = "لغو پیشنهاد";
  cancel.dataset.naviOfficeApprovalButton = "cancel";
  cancel.addEventListener("click", () => {
    card.remove();
    confirm.remove();
    cancel.remove();
    if (host) host.hidden = true;
  });

  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    confirm.textContent = "در حال ساخت نسخه...";
    try {
      const result = await window.NavaOfficeTools.executeAction(action);
      note.textContent = result.message || "نسخه ویرایش‌شده ساخته شد؛ فایل اصلی دست‌نخورده ماند.";
      confirm.textContent = "نسخه ساخته شد";
      cancel.remove();
    } catch (error) {
      note.textContent = error?.message || "اجرای ویرایش ناموفق بود.";
      confirm.disabled = false;
      confirm.textContent = "تلاش دوباره";
    }
  });

  if (officeResultTarget) {
    card.append(title, detail, fileLine, note);
    exportActions.prepend(card);
    exportActions.append(confirm, cancel);
    exportActions.style.display = "flex";
    exportActions.style.flexWrap = "wrap";
    exportActions.style.alignItems = "center";
    exportActions.style.gap = "8px";
  } else {
    card.append(title, detail, fileLine, note, confirm, cancel);
    slot.appendChild(card);
  }

  setNaviStatus(officeResultTarget
    ? "پیشنهاد ویرایش کنار دکمه‌های خروجی پاسخ آمادهٔ بررسی و تأیید است."
    : slot === officeSlot
      ? "پیشنهاد ویرایش در استودیوی آفیس آمادهٔ بررسی و تأیید است."
      : "پیشنهاد ویرایش در گفت‌وگوی NAVI آمادهٔ بررسی و تأیید است.");
}

// Select only NAVI response text; this avoids Android browsers applying
// the generic "Select all" command to the whole document.
const selectNaviResponseButton = document.getElementById("selectNaviResponse");
selectNaviResponseButton?.addEventListener("click", () => {
  if (!requestResponse || !requestResponse.value) return;
  requestResponse.focus({ preventScroll: true });
  requestResponse.setSelectionRange(0, requestResponse.value.length);
});

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
    token = getNaviStoredValue(NAVI_SESSION_KEY);
    expiry = Number(getNaviStoredValue(NAVI_EXPIRY_KEY) || 0);
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
    setNaviStoredValue(NAVI_SESSION_KEY, token);
    setNaviStoredValue(NAVI_EXPIRY_KEY, String(Date.now() + duration * 1000));
  } catch (error) {
    throw new Error("ذخیره نشست در مرورگر ممکن نیست. فضای ذخیره‌سازی مرورگر را بررسی کن.");
  }
}

function clearNaviSession() {
  naviSessionVersion++;

  try {
    removeNaviStoredValue(NAVI_SESSION_KEY);
    removeNaviStoredValue(NAVI_EXPIRY_KEY);
    removeNaviStoredValue(NAVI_USER_NAME_KEY);
    removeNaviStoredValue(NAVI_USER_ROLE_KEY);
    removeNaviStoredValue(NAVI_USER_ID_KEY);
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
  naviArchivedMemory = [];
  naviMemoryLoaded = false;
  naviMemoryLoading = false;
  naviMemoryLoadPromise = null;
  naviMemoryBusy = false;

  if (naviChatArea) naviChatArea.hidden = true;
  const accountWorkspace = document.getElementById("navaAccountWorkspace");
  if (accountWorkspace) accountWorkspace.hidden = true;
  const headerTabsSlot = document.getElementById("navaHeaderTabsSlot");
  if (headerTabsSlot) headerTabsSlot.hidden = true;
  document.querySelectorAll("#navaAccountWorkspacePanels [data-navi-panel]").forEach(panel => {
    panel.hidden = true;
    panel.classList.remove("is-active");
  });
  if (naviLoginPanel) naviLoginPanel.hidden = false;
  // Clearing an expired/local session must not reopen the first-visit choice gate.
  // Startup owns that decision explicitly; account login must remain visible in NAVI.
  if (naviPassword) naviPassword.value = "";
  if (naviUsername) naviUsername.value = "";
  if (naviUserDisplay) naviUserDisplay.textContent = "";
  if (naviAccountAdmin) naviAccountAdmin.hidden = true;
  if (naviCreateUserStatus) naviCreateUserStatus.textContent = "";

  if (requestResponse) {
    requestResponse.value = "";
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
  window.dispatchEvent(new Event("nava:business-auth-changed"));
}


/* Move account-only workspaces out of the NAVI chat dialog and into the homepage. */
function mountNavaAccountWorkspace() {
  const workspace = document.getElementById("navaAccountWorkspace");
  const tabs = document.getElementById("naviWorkspaceTabs");
  const tabsSlot = document.getElementById("navaHeaderTabsSlot");
  const panelsSlot = document.getElementById("navaAccountWorkspacePanels");
  if (!workspace || !tabs || !tabsSlot || !panelsSlot) return;

  // NAVI chat remains inside its floating window; only account tools move.
  tabs.querySelector('[data-navi-tab="chat"]')?.remove();

  // Keep the account tabs directly on the NAVA header row; no intermediate menu.
  tabsSlot.appendChild(tabs);
  tabs.hidden = false;

  ["projects", "memory", "users"].forEach(name => {
    const panel = document.querySelector('[data-navi-panel="' + name + '"]');
    if (panel) panelsSlot.appendChild(panel);
  });
}
mountNavaAccountWorkspace();

function setNaviWorkspaceTab(tabName) {
  const allowedTabs = new Set(["projects", "memory", "users"]);
  if (!allowedTabs.has(tabName)) return;

  const isOwner = getNaviStoredValue(NAVI_USER_ROLE_KEY) === "owner";
  if (tabName === "users" && !isOwner) tabName = "projects";

  const workspace = document.getElementById("navaAccountWorkspace");
  const tabBar = document.getElementById("naviWorkspaceTabs");
  const headerTabsSlot = document.getElementById("navaHeaderTabsSlot");
  const panels = Array.from(document.querySelectorAll("#navaAccountWorkspacePanels [data-navi-panel]"));
  const currentPanel = panels.find(panel => !panel.hidden && panel.classList.contains("is-active"));
  const closingCurrentPanel = currentPanel?.dataset.naviPanel === tabName;

  if (tabBar) tabBar.classList.toggle("is-owner", isOwner);
  if (headerTabsSlot) headerTabsSlot.hidden = false;

  if (closingCurrentPanel) {
    panels.forEach(panel => {
      panel.hidden = true;
      panel.classList.remove("is-active");
    });
    document.querySelectorAll("#naviWorkspaceTabs [data-navi-tab]").forEach(button => {
      button.classList.remove("is-active");
      button.setAttribute("aria-selected", "false");
    });
    if (workspace) workspace.hidden = true;
    return;
  }

  if (workspace) workspace.hidden = false;
  document.querySelectorAll("#naviWorkspaceTabs [data-navi-tab]").forEach(button => {
    const active = button.dataset.naviTab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  let activePanel = null;
  panels.forEach(panel => {
    const active = panel.dataset.naviPanel === tabName && !(tabName === "users" && !isOwner);
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
    if (active) activePanel = panel;
  });

  // Scroll the panel below the sticky header, accounting for the full header + tab row.
  if (activePanel) {
    window.requestAnimationFrame(() => {
      const header = document.querySelector("header");
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const panelTop = activePanel.getBoundingClientRect().top + window.scrollY;
      const targetTop = Math.max(0, panelTop - headerHeight - 14);
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    });
  }
}

function closeNaviWorkspacePanels() {
  const workspace = document.getElementById("navaAccountWorkspace");
  const tabBar = document.getElementById("naviWorkspaceTabs");
  const headerTabsSlot = document.getElementById("navaHeaderTabsSlot");
  const isOwner = getNaviStoredValue(NAVI_USER_ROLE_KEY) === "owner";

  if (headerTabsSlot) headerTabsSlot.hidden = false;
  if (workspace) workspace.hidden = true;
  if (tabBar) tabBar.classList.toggle("is-owner", isOwner);

  document.querySelectorAll("#navaAccountWorkspacePanels [data-navi-panel]").forEach(panel => {
    panel.hidden = true;
    panel.classList.remove("is-active");
  });
  document.querySelectorAll("#naviWorkspaceTabs [data-navi-tab]").forEach(button => {
    button.classList.remove("is-active");
    button.setAttribute("aria-selected", "false");
  });
}

document.querySelectorAll("#naviWorkspaceTabs [data-navi-tab]").forEach(button => {
  button.addEventListener("click", () => setNaviWorkspaceTab(button.dataset.naviTab));
});

function showNaviChat() {
  setNavaAccessGate(false);
  document.querySelector(".nava-access-panel")?.classList.add("is-dismissed");
  naviLoginPanel.hidden = true;
  naviChatArea.hidden = false;

  clearLoginError();

  const displayName = getNaviStoredValue(NAVI_USER_NAME_KEY) || "کاربر";
  const dashboardGreeting = document.getElementById("naviDashboardGreeting");
  if (dashboardGreeting) dashboardGreeting.textContent = "سلام، " + displayName;
  const isOwner = getNaviStoredValue(NAVI_USER_ROLE_KEY) === "owner";
  naviLoginStatus.textContent = "نشست امن ناوی فعال است.";
  if (naviUserDisplay) naviUserDisplay.textContent = "حساب فعال: " + displayName;
  if (naviAccountAdmin) naviAccountAdmin.hidden = !isOwner;
  const naviOwnerTab = document.getElementById("naviOwnerTab");
  if (naviOwnerTab) naviOwnerTab.hidden = !isOwner;
  closeNaviWorkspacePanels();
  if (isOwner) loadNaviUsers();
  const accountIdentity = getNaviStoredValue(NAVI_USER_ID_KEY) || displayName;
  showNaviWelcome("account", accountIdentity);
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

      const messageId = Number(item.id);
      return {
        id: Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null,
        role,
        content
      };
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

    if (role === "user" && Number.isSafeInteger(item.id) && item.id > 0) {
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "navi-message-save";
      saveButton.textContent = "ذخیره در حافظه";
      saveButton.addEventListener("click", () => {
        saveNaviHistoryMessage(item.id, saveButton);
      });
      message.appendChild(saveButton);
    }

    fragment.appendChild(message);
  });

  naviHistoryList.appendChild(fragment);
  naviHistoryCount.textContent = safeMessages.length + " پیام";
  naviHistoryList.scrollTop = naviHistoryList.scrollHeight;
}




async function saveNaviHistoryMessage(messageId, button) {
  const token = getNaviToken();

  if (!token) {
    clearNaviSession();
    showNaviReply("نشست ورودت پایان یافته است. لطفاً دوباره وارد شو.");
    return;
  }

  if (!Number.isSafeInteger(messageId) || messageId <= 0) return;

  const requestVersion = naviSessionVersion;
  button.disabled = true;
  button.textContent = "در حال ذخیره...";

  try {
    const response = await fetch(NAVI_SAVE_MESSAGE_API, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messageId,
        threadId: naviActiveThreadId
      }),
      cache: "no-store"
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("پاسخ سرور قابل خواندن نیست.");
    }

    if (getNaviToken() !== token || naviSessionVersion !== requestVersion) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ناوی معتبر نیست یا پایان یافته است. دوباره وارد شو.");
      return;
    }

    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.diagnostic || "ذخیره پیام ناموفق بود.");
    }

    button.textContent = data.duplicate ? "قبلاً ذخیره شده" : "ذخیره شد";
    button.classList.add("is-saved");
    button.disabled = true;
    setNaviStatus(data.message || "وضعیت ذخیره پیام در حافظه به‌روزرسانی شد.");

    if (!naviMemoryContent.hidden) {
      naviMemoryLoaded = false;
      loadNaviMemories(true).catch(error => {
        console.warn("NAVI memory refresh after manual save failed:", error);
      });
    }

  } catch (error) {
    if (naviSessionVersion !== requestVersion) return;
    button.disabled = false;
    button.textContent = "ذخیره در حافظه";
    setNaviStatus("ذخیره پیام انجام نشد: " + (error.message || "خطای نامشخص"));
  }
}


/* =========================================
   HISTORY — LOAD FROM D1
========================================= */

async function loadNaviHistory({ silent = false } = {}) {
  const token = getNaviToken();

  if (!token) return false;

  if (naviHistoryLoading && naviHistoryLoadPromise) {
    return naviHistoryLoadPromise;
  }

  const requestVersion = naviSessionVersion;

  naviHistoryLoading = true;
  if (!silent) {
    naviHistoryRefresh.disabled = true;
    naviHistoryRefresh.textContent = "در حال دریافت...";
    naviHistoryCount.textContent = "در حال بارگذاری...";
  }

  naviHistoryLoadPromise = (async () => {
    try {
      const response = await fetch(NAVI_HISTORY_API + "?thread_id=" + encodeURIComponent(naviActiveThreadId), {
        method: "GET",
        headers: { "Authorization": "Bearer " + token 
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

      if (!silent) {
        setNaviStatus(
          naviHistory.length
            ? "گفت‌وگوهای قبلی بازیابی شدند؛ می‌توانی ادامه بدهی."
            : "ناوی آماده شروع اولین گفت‌وگوست."
        );
      }

      return true;

    } catch (error) {
      if (naviSessionVersion !== requestVersion) return false;

      console.error("NAVI history error:", error);

      renderNaviHistory(naviHistory);
      if (!silent) naviHistoryCount.textContent = "حافظه آنلاین در دسترس نیست";

      if (!silent && naviHistory.length === 0) {
        showEmptyHistory(
          "دریافت تاریخچه از سرور ممکن نشد.\nمی‌توانی دوباره تلاش کنی.",
          "خطا در دریافت"
        );
      }

      if (!silent) {
        setNaviStatus(
          "اتصال به حافظه ناوی برقرار نشد. پاسخ‌گویی ناوی همچنان قابل استفاده است."
        );
      }

      return false;

    } finally {
      if (naviSessionVersion === requestVersion) {
        naviHistoryLoading = false;
        naviHistoryLoadPromise = null;
        if (!silent) {
          naviHistoryRefresh.disabled = false;
          naviHistoryRefresh.textContent = "تازه‌سازی تاریخچه";
        }
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

  const archivedList = document.getElementById("naviMemoryArchivedList");
  if (archivedList) {
    archivedList.replaceChildren();
    const archivedEmpty = document.createElement("div");
    archivedEmpty.className = "navi-memory-empty";
    archivedEmpty.textContent = "برای مشاهده سوابق وارد ناوی شو.";
    archivedList.appendChild(archivedEmpty);
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
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch (error) {
    return date.toLocaleString("fa-IR-u-ca-persian");
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



function normalizeNaviArchivedMemory(data) {
  const source = data && Array.isArray(data.archived)
    ? data.archived
    : data && data.data && Array.isArray(data.data.archived)
      ? data.data.archived
      : [];

  return source
    .filter(item => item && typeof item === "object")
    .map(item => ({
      id: Number(item.id),
      memory_key: String(item.memory_key ?? ""),
      memory_value: String(item.memory_value ?? ""),
      source: String(item.source ?? ""),
      status: String(item.status ?? "archived"),
      created_at: item.created_at ?? "",
      updated_at: item.updated_at ?? ""
    }))
    .filter(item => Number.isSafeInteger(item.id) && item.id > 0);
}

function renderNaviArchivedMemory(items) {
  const list = document.getElementById("naviMemoryArchivedList");
  if (!list) return;
  list.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "navi-memory-empty";
    empty.textContent = "رکورد آرشیوشده‌ای وجود ندارد.";
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "navi-memory-card navi-memory-archived";
    card.dataset.memoryId = String(item.id);

    const value = document.createElement("div");
    value.className = "navi-memory-value";
    value.textContent = item.memory_value || "محتوای این رکورد خالی است.";

    const meta = document.createElement("div");
    meta.className = "navi-memory-meta";
    const status = document.createElement("span");
    status.textContent = "وضعیت: آرشیوشده";
    meta.appendChild(status);
    if (item.updated_at) {
      const date = document.createElement("span");
      date.textContent = "آخرین تغییر: " + formatNaviMemoryDate(item.updated_at);
      meta.appendChild(date);
    }
    if (item.source) {
      const source = document.createElement("span");
      source.textContent = "منبع: " + item.source;
      meta.appendChild(source);
    }

    card.append(value, meta);
    fragment.appendChild(card);
  });
  list.appendChild(fragment);
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

    const response = await fetch(NAVI_MEMORY_API + "?project_id=" + encodeURIComponent(naviActiveProjectId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      
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
      const response = await fetch(NAVI_MEMORY_API + "?project_id=" + encodeURIComponent(naviActiveProjectId), {
        method: "GET",
        headers: { "Authorization": "Bearer " + token 
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
      naviArchivedMemory = normalizeNaviArchivedMemory(data);
      naviMemoryLoaded = true;

      renderNaviMemories(naviMemory);
      renderNaviArchivedMemory(naviArchivedMemory);
      const countDigits = value => String(value).replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
      document.getElementById("naviApprovedMemoryCount").textContent = countDigits(naviMemory.length);
      document.getElementById("naviArchivedMemoryCount").textContent = countDigits(naviArchivedMemory.length);

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

  const confirmed = await showNaviMemoryDialog({
    title: "حذف حافظه",
    message: "آیا مطمئنی می‌خواهی این حافظه را حذف کنی؟ این عملیات قابل بازگشت نیست.",
    confirmText: "بله، حذف شود",
    cancelText: "انصراف",
    danger: true
  });

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

document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-navi-memory-section-toggle]") : null;
  if (!button) return;
  const content = button.closest(".navi-memory-accordion")?.querySelector(".navi-memory-accordion-content");
  if (!content) return;
  const opening = content.hidden;
  content.hidden = !opening;
  button.setAttribute("aria-expanded", opening ? "true" : "false");
});

naviHistoryRefresh.addEventListener("click", () => {
  loadNaviHistory();
});

async function loadNaviProjects() {
  const token = getNaviToken();
  if (!token) return false;
  try {
    const response = await fetch(NAVI_PROJECTS_API, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      clearNaviSession();
      showLoginError("نشست ورود معتبر نیست یا پایان یافته است. دوباره وارد شو.");
      return false;
    }
    if (!response.ok || !data.success) throw new Error(data.error || "دریافت پروژه‌ها ناموفق بود.");
    naviProjects = Array.isArray(data.projects) ? data.projects : [];
    const dashboardProjectCount = document.getElementById("naviDashboardProjectCount");
    if (dashboardProjectCount) dashboardProjectCount.textContent = String(naviProjects.length).replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
    const savedProject = getNaviStoredValue("nava_navi_active_project");
    if (savedProject && naviProjects.some(item => item.project_id === savedProject)) naviActiveProjectId = savedProject;
    if (!naviProjects.some(item => item.project_id === naviActiveProjectId)) naviActiveProjectId = "project-general";
    if (naviProjectSelect) {
      naviProjectSelect.replaceChildren();
      naviProjects.forEach(project => { const option = document.createElement("option"); option.value = project.project_id; option.textContent = project.name; naviProjectSelect.appendChild(option); });
      naviProjectSelect.value = naviActiveProjectId;
    }
    updateNaviProjectControls();
    return true;
  } catch (error) { console.error("NAVI projects error:", error); if (naviProjectStatus) naviProjectStatus.textContent = error.message || "دریافت پروژه‌ها ناموفق بود."; return false; }
}

function updateNaviProjectControls() {
  const selected = naviProjects.find(project => project.project_id === naviActiveProjectId);
  const dashboardProject = document.getElementById("naviDashboardProjectName");
  if (dashboardProject) dashboardProject.textContent = selected?.name || "عمومی";
  if (!naviDeleteProjectButton) return;
  const deletable = Boolean(selected && Number(selected.is_system) === 0 && selected.project_id !== "project-general");
  naviDeleteProjectButton.disabled = !deletable;
  naviDeleteProjectButton.title = deletable
    ? "حذف پروژه انتخاب‌شده"
    : "پروژه‌های پیش‌فرض قابل حذف نیستند";
}

async function loadNaviThreads() {
  const token = getNaviToken();
  if (!token) return false;
  try {
    const response = await fetch(NAVI_THREADS_API + "?project_id=" + encodeURIComponent(naviActiveProjectId), {
      headers: { "Authorization": "Bearer " + token }, cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "دریافت فهرست گفت‌وگوها ناموفق بود.");
    naviThreads = Array.isArray(data.threads) ? data.threads : [];
    if (!naviThreads.some(item => item.thread_id === naviActiveThreadId)) {
      naviActiveThreadId = naviThreads[0]?.thread_id || "";
    }
    if (naviActiveThreadId) {
      setNaviStoredValue("nava_navi_active_thread", naviActiveThreadId);
    }
    setNaviStoredValue("nava_navi_active_project", naviActiveProjectId);
    renderNaviThreads();
    return true;
  } catch (error) { console.error("NAVI threads error:", error); return false; }
}
function renderNaviThreads() {
  if (!naviThreadList) return;
  naviThreadList.replaceChildren();
  if (naviDeleteThreadButton) {
    naviDeleteThreadButton.disabled = !naviThreads.some(item => item.thread_id === naviActiveThreadId);
  }
  const dashboardThreadCount = document.getElementById("naviDashboardThreadCount");
  if (dashboardThreadCount) dashboardThreadCount.textContent = String(naviThreads.length).replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  naviThreads.forEach(thread => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "navi-thread-item" + (thread.thread_id === naviActiveThreadId ? " active" : "");
    button.textContent = thread.title || "گفت‌وگو";
    button.title = thread.title || "گفت‌وگو";
    button.addEventListener("click", async () => {
      naviActiveThreadId = thread.thread_id;
      setNaviStoredValue("nava_navi_active_thread", naviActiveThreadId);
      renderNaviThreads();
      requestResponse.value = "";
      requestResponse.classList.remove("show");
      naviHistory = [];
      await loadNaviHistory();
      setNaviStatus("گفت‌وگوی انتخاب‌شده آماده ادامه است.");
    });
    naviThreadList.appendChild(button);
  });
}

async function deleteNaviThread() {
  const thread = naviThreads.find(item => item.thread_id === naviActiveThreadId);
  if (!thread) return;
  const confirmed = await showNaviMemoryDialog({
    title: "تأیید حذف گفت‌وگو",
    message: "گفت‌وگوی «" + (thread.title || "بدون عنوان") + "» و تمام پیام‌های آن حذف شود؟",
    confirmText: "بله، حذف شود",
    cancelText: "انصراف",
    danger: true
  });
  if (!confirmed) return;
  const token = getNaviToken();
  if (!token) return;
  naviDeleteThreadButton.disabled = true;
  try {
    const response = await fetch(NAVI_THREADS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ action: "delete", threadId: thread.thread_id })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "حذف گفت‌وگو ناموفق بود.");
    await loadNaviThreads();
    if (!naviThreads.some(item => item.thread_id === naviActiveThreadId)) {
      if (!naviThreads.length) {
        naviActiveThreadId = "";
        await createNaviThread();
        return;
      }
      naviActiveThreadId = naviThreads[0].thread_id;
      setNaviStoredValue("nava_navi_active_thread", naviActiveThreadId);
      naviHistory = [];
      requestResponse.value = "";
      requestResponse.classList.remove("show");
      await loadNaviHistory();
    }
    renderNaviThreads();
    setNaviStatus("گفت‌وگوی انتخاب‌شده حذف شد.");
  } catch (error) {
    showNaviReply(error.message || "حذف گفت‌وگو ناموفق بود.");
  } finally {
    naviDeleteThreadButton.disabled = false;
  }
}

function buildNaviThreadTitle(message) {
  let title = String(message || "").replace(/\s+/g, " ").trim();
  title = title.replace(/[.!؟،؛,:]+$/g, "").trim();
  if (title.length > 38) title = title.slice(0, 38).replace(/\\s+\\S*$/, "").trim();
  return title || "گفت‌وگوی جدید";
}

async function nameNaviThreadFromFirstMessage(message) {
  const thread = naviThreads.find(item => item.thread_id === naviActiveThreadId);
  if (!thread || thread.thread_id === "owner-main" || Number(thread.message_count || 0) > 0) return;
  const generic = ["گفت‌وگوی جدید", "گفتگوی جدید", "گفت‌وگو", "گفتگو"];
  if (!generic.includes(String(thread.title || "").trim())) return;
  const token = getNaviToken();
  if (!token) return;
  const title = buildNaviThreadTitle(message);
  const response = await fetch(NAVI_THREADS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ action: "rename", threadId: thread.thread_id, title })
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "نام‌گذاری گفت‌وگو ناموفق بود.");
  thread.title = title;
  renderNaviThreads();
}

// Public bridge for studio handoffs: always resolve a thread from NAVI's
// authenticated project/thread lists instead of trusting stale localStorage IDs.
window.getNaviActiveContext = async function () {
  const token = getNaviToken();
  if (!token) return null;

  const projectsLoaded = await loadNaviProjects();
  if (!projectsLoaded || !getNaviToken()) return null;

  const threadsLoaded = await loadNaviThreads();
  if (!threadsLoaded || !getNaviToken()) return null;

  if (!naviActiveThreadId || !naviThreads.some(item => item.thread_id === naviActiveThreadId)) {
    try {
      const response = await fetch(NAVI_THREADS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          title: "گفت‌وگوی جدید",
          projectId: naviActiveProjectId
        }),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.thread?.thread_id) {
        throw new Error(data.error || "ساخت گفت‌وگوی معتبر برای استودیو ناموفق بود.");
      }
      naviActiveThreadId = data.thread.thread_id;
      await loadNaviThreads();
    } catch (error) {
      console.error("NAVI studio thread resolution failed:", error);
      return null;
    }
  }

  if (!naviActiveThreadId || !naviThreads.some(item => item.thread_id === naviActiveThreadId)) return null;
  setNaviStoredValue("nava_navi_active_project", naviActiveProjectId);
  setNaviStoredValue("nava_navi_active_thread", naviActiveThreadId);
  return {
    projectId: naviActiveProjectId,
    threadId: naviActiveThreadId
  };
};

async function createNaviThread() {
  const token = getNaviToken();
  if (!token) return;
  naviNewThreadButton.disabled = true;
  naviNewThreadButton.textContent = "در حال ساخت...";
  try {
    const response = await fetch(NAVI_THREADS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ title: "گفت‌وگوی جدید", projectId: naviActiveProjectId })
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.thread?.thread_id) throw new Error(data.error || "ساخت گفت‌وگوی جدید ناموفق بود.");
    naviActiveThreadId = data.thread.thread_id;
    setNaviStoredValue("nava_navi_active_thread", naviActiveThreadId);
    naviHistory = [];
    requestResponse.value = "";
    requestResponse.classList.remove("show");
    await loadNaviThreads();
    await loadNaviHistory();
    userRequest.focus();
    setNaviStatus("گفت‌وگوی جدید آماده است؛ تاریخچه گفت‌وگوهای قبلی جداگانه حفظ شده‌اند.");
  } catch (error) {
    showNaviReply(error.message || "ساخت گفت‌وگوی جدید ناموفق بود.");
  } finally {
    naviNewThreadButton.disabled = false;
    naviNewThreadButton.textContent = "＋ گفت‌وگوی جدید";
  }
}


async function createNaviProject() {
  const token = getNaviToken();
  const name = String(naviNewProjectName?.value || "").trim();
  if (!token || !name) { if (naviProjectStatus) naviProjectStatus.textContent = "نام پروژه را وارد کن."; return; }
  naviCreateProjectButton.disabled = true;
  if (naviProjectStatus) naviProjectStatus.textContent = "در حال ساخت پروژه...";
  try {
    const response = await fetch(NAVI_PROJECTS_API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name }) });
    const data = await response.json();
    if (!response.ok || !data.success || !data.project?.project_id) throw new Error(data.error || "ساخت پروژه ناموفق بود.");
    naviNewProjectName.value = "";
    await loadNaviProjects();
    naviActiveProjectId = data.project.project_id;
    if (naviProjectSelect) naviProjectSelect.value = naviActiveProjectId;
    updateNaviProjectControls();
    setNaviStoredValue("nava_navi_active_project", naviActiveProjectId);
    naviActiveThreadId = "";
    await loadNaviThreads();
    await createNaviThread();
    naviMemoryLoaded = false;
    await loadNaviMemories(true);
    setNaviStatus("پروژه ساخته شد و گفت‌وگوی تازه آماده است.");
    setNaviWorkspaceTab("chat");
  } catch (error) { if (naviProjectStatus) naviProjectStatus.textContent = error.message || "ساخت پروژه ناموفق بود."; }
  finally { naviCreateProjectButton.disabled = false; }
}

async function deleteNaviProject() {
  const project = naviProjects.find(item => item.project_id === naviActiveProjectId);
  if (!project || Number(project.is_system) !== 0 || project.project_id === "project-general") return;

  const confirmed = await showNaviMemoryDialog({
    title: "تأیید حذف پروژه",
    message: "پروژه «" + project.name + "» و تمام گفت‌وگوها، پیام‌ها و حافظه‌های اختصاصی آن برای همیشه حذف شوند؟ این کار قابل بازگشت نیست.",
    confirmText: "بله، پروژه حذف شود",
    cancelText: "انصراف",
    danger: true
  });
  if (!confirmed) return;

  const token = getNaviToken();
  if (!token) return;
  naviDeleteProjectButton.disabled = true;
  if (naviProjectStatus) naviProjectStatus.textContent = "در حال حذف پروژه و اطلاعات وابسته...";
  try {
    const response = await fetch(NAVI_PROJECTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ action: "delete", projectId: project.project_id }),
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.deleted) {
      throw new Error(data.error || "حذف پروژه ناموفق بود.");
    }

    naviActiveProjectId = "project-general";
    setNaviStoredValue("nava_navi_active_project", naviActiveProjectId);
    naviActiveThreadId = "";
    removeNaviStoredValue("nava_navi_active_thread");
    naviHistory = [];
    naviMemoryLoaded = false;
    requestResponse.value = "";
    requestResponse.classList.remove("show");

    const projectsLoaded = await loadNaviProjects();
    if (!projectsLoaded) throw new Error("پروژه حذف شد، اما بارگذاری دوباره فهرست پروژه‌ها ناموفق بود.");
    naviActiveProjectId = "project-general";
    if (naviProjectSelect) naviProjectSelect.value = naviActiveProjectId;
    setNaviStoredValue("nava_navi_active_project", naviActiveProjectId);

    const threadsLoaded = await loadNaviThreads();
    if (!threadsLoaded) throw new Error("پروژه حذف شد، اما بارگذاری گفت‌وگوی عمومی ناموفق بود.");
    if (!naviActiveThreadId) {
      await createNaviThread();
    } else {
      await loadNaviHistory();
    }
    await loadNaviMemories(true);
    if (naviProjectStatus) naviProjectStatus.textContent = "پروژه «" + project.name + "» و اطلاعات اختصاصی آن حذف شد؛ فضای عمومی فعال است.";
  } catch (error) {
    if (naviProjectStatus) naviProjectStatus.textContent = error.message || "حذف پروژه ناموفق بود.";
  } finally {
    updateNaviProjectControls();
  }
}

document.getElementById("naviDashboardNewChat")?.addEventListener("click", () => {
  setNaviWorkspaceTab("chat");
  createNaviThread();
});
document.getElementById("naviDashboardOpenProjects")?.addEventListener("click", () => setNaviWorkspaceTab("projects"));
naviCreateProjectButton?.addEventListener("click", createNaviProject);
naviDeleteProjectButton?.addEventListener("click", deleteNaviProject);
naviNewProjectName?.addEventListener("keydown", event => { if (event.key === "Enter") createNaviProject(); });
naviProjectSelect?.addEventListener("change", async () => {
  const nextProjectId = naviProjectSelect.value;
  if (!naviProjects.some(project => project.project_id === nextProjectId)) return;
  naviActiveProjectId = nextProjectId;
  updateNaviProjectControls();
  setNaviStoredValue("nava_navi_active_project", nextProjectId);
  naviActiveThreadId = "";
  naviHistory = [];
  naviMemoryLoaded = false;
  requestResponse.value = "";
  requestResponse.classList.remove("show");
  const loaded = await loadNaviThreads();
  if (!loaded) { if (naviProjectStatus) naviProjectStatus.textContent = "گفت‌وگوهای این پروژه بارگذاری نشدند."; return; }
  if (!naviActiveThreadId) { await createNaviThread(); return; }
  await loadNaviHistory();
  await loadNaviMemories(true);
  setNaviStatus("فضای کاری «" + (naviProjects.find(p => p.project_id === nextProjectId)?.name || "پروژه") + "» فعال شد.");
  setNaviWorkspaceTab("chat");
});
naviNewThreadButton?.addEventListener("click", createNaviThread);
naviDeleteThreadButton?.addEventListener("click", deleteNaviThread);

naviMemoryRefresh.addEventListener("click", () => {
  loadNaviMemories(true);
});


/* =========================================
   RESTORE SESSION ON PAGE OPEN
========================================= */

const existingNaviToken = getNaviToken();

if (existingNaviToken) {
  showNaviChat();
  (async () => {
    await loadNaviProjects();
    await loadNaviThreads();
    const saved = getNaviStoredValue("nava_navi_active_thread");
    if (saved && naviThreads.some(item => item.thread_id === saved)) naviActiveThreadId = saved;
    if (!naviActiveThreadId) { await createNaviThread(); return; }
    renderNaviThreads();
    await loadNaviHistory();
  })();
} else {
  clearNaviSession();
  showNaviWelcome("guest");
  setNavaAccessGate(true);
}


/* =========================================
   NAVI LOGIN
========================================= */

naviLoginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = naviUsername ? naviUsername.value.trim().toLowerCase() : "";
  const password = naviPassword.value;

  if (!password) {
    showLoginError("لطفاً رمز عبور را وارد کن.");
    return;
  }

  naviLoginButton.disabled = true;
  naviLoginButton.textContent = "در حال بررسی رمز...";
  clearLoginError();

  try {
    // Ask the server whether this account uses the one-time owner migration
    // or a replay-resistant challenge. Password stretching runs locally.
    const challengeResponse = await fetch(NAVI_AUTH_CHALLENGE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const challengeData = await challengeResponse.json();
    if (!challengeResponse.ok || !challengeData.success) {
      throw new Error(challengeData.error || "آماده‌سازی ورود امن ناموفق بود.");
    }

    let loginPayload;
    if (challengeData.mode === "legacy") {
      const passwordHash = await deriveNaviPasswordVerifier(password);
      loginPayload = { username, password, passwordHash };
    } else if (challengeData.mode === "challenge") {
      const challenge = { ...challengeData, username: username || "owner" };
      const proof = await createNaviLoginProof(password, challenge);
      loginPayload = {
        username,
        challengeId: challenge.challengeId,
        proof
      };
    } else {
      throw new Error("روش ورود امن پشتیبانی نمی‌شود.");
    }

    const response = await fetch(NAVI_LOGIN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginPayload)
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
    window.dispatchEvent(new Event("nava:business-auth-changed"));
    setNaviStoredValue(NAVI_USER_NAME_KEY, String(data.user?.displayName || username || "مالک"));
    setNaviStoredValue(NAVI_USER_ROLE_KEY, String(data.user?.role || "user"));
    setNaviStoredValue(NAVI_USER_ID_KEY, String(data.user?.id || data.user?.username || username || "owner"));

    naviSessionVersion++;
    naviPassword.value = "";
    naviActiveThreadId = data.user?.id && data.user.id !== "owner" ? data.user.id + "-main" : "owner-main";
    naviHistory = [];
    naviMemory = [];
    naviProposals = [];
    naviMemoryLoaded = false;

    showNaviChat();
    restoreNavaReturnContext();

    await loadNaviProjects();
    await loadNaviThreads();
    if (!naviActiveThreadId) await createNaviThread();
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
   OWNER-ONLY INVITED ACCOUNT CREATION
========================================= */

async function loadNaviUsers() {
  if (!naviUsersList || getNaviStoredValue(NAVI_USER_ROLE_KEY) !== "owner") return;
  if (naviUsersStatus) naviUsersStatus.textContent = "در حال دریافت حساب‌ها...";
  naviUsersList.replaceChildren();

  try {
    const response = await fetch(NAVI_USERS_API, {
      headers: { "Authorization": "Bearer " + getNaviToken() },
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "دریافت حساب‌ها ناموفق بود.");
    }

    const allUsers = Array.isArray(data.users) ? data.users : [];
    // The owner is viewing this panel; list only the other accounts.
    const users = allUsers.filter(user => user && user.role !== "owner");
    const registrationRequests = Array.isArray(data.registrationRequests)
      ? data.registrationRequests
      : [];

    if (!users.length && !registrationRequests.length) {
      if (naviUsersStatus) {
        naviUsersStatus.textContent = "هنوز حساب کاربری دیگری یا درخواست عضویتی ثبت نشده است.";
      }
      return;
    }

    /* Pending registration requests live in their own collapsible dropdown. */
    if (registrationRequests.length) {
      const pendingDropdown = document.createElement("details");
      pendingDropdown.className = "navi-users-dropdown navi-pending-dropdown";

      const pendingSummary = document.createElement("summary");
      pendingSummary.textContent = "درخواست‌های عضویت در انتظار بررسی (" + registrationRequests.length + ")";

      const pendingList = document.createElement("div");
      pendingList.className = "navi-users-dropdown-list navi-registration-pending-list";

      for (const registration of registrationRequests) {
        const item = document.createElement("div");
        item.className = "navi-user-row navi-registration-row";

        const details = document.createElement("div");
        details.className = "navi-user-details";

        const name = document.createElement("strong");
        name.textContent = String(registration.display_name || "متقاضی");

        const meta = document.createElement("span");
        meta.textContent = "@" + String(registration.username || "") +
          " · درخواست " + String(registration.created_at || "");

        details.append(name, meta);

        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "navi-user-enable";
        approve.textContent = "تأیید و فعال‌سازی";
        approve.addEventListener("click", () => {
          reviewNaviRegistration(registration.request_id, "approve", approve);
        });

        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "navi-user-disable";
        reject.textContent = "رد درخواست";
        reject.addEventListener("click", () => {
          reviewNaviRegistration(registration.request_id, "reject", reject);
        });

        item.append(details, approve, reject);
        pendingList.append(item);
      }

      pendingDropdown.append(pendingSummary, pendingList);
      naviUsersList.append(pendingDropdown);
    }

    /* Registered accounts and their controls live inside one collapsible box. */
    if (users.length) {
      const dropdown = document.createElement("details");
      dropdown.className = "navi-users-dropdown";

      const summary = document.createElement("summary");
      summary.textContent = "حساب‌های ثبت‌شده (" + users.length + ")";

      const registeredList = document.createElement("div");
      registeredList.className = "navi-users-dropdown-list";

      for (const user of users) {
        const item = document.createElement("div");
        item.className = "navi-user-row";

        const details = document.createElement("div");
        details.className = "navi-user-details";

        const name = document.createElement("strong");
        name.textContent = String(user.display_name || user.username || "کاربر");

        const meta = document.createElement("span");
        const isOwner = user.role === "owner";
        const isActive = user.status === "active";
        meta.textContent = (isOwner ? "مالک" : "@" + user.username) +
          " · " + (isActive ? "فعال" : "غیرفعال");

        details.append(name, meta);
        item.append(details);

        if (!isOwner) {
          const action = document.createElement("button");
          action.type = "button";
          action.className = isActive ? "navi-user-disable" : "navi-user-enable";
          action.textContent = isActive ? "غیرفعال‌کردن" : "فعال‌کردن";
          action.addEventListener("click", () => {
            changeNaviUserStatus(user.id, isActive ? "disabled" : "active", action);
          });
          item.append(action);

          const resetButton = document.createElement("button");
          resetButton.type = "button";
          resetButton.className = "navi-users-refresh";
          resetButton.textContent = "بازنشانی رمز";
          resetButton.addEventListener("click", () => {
            resetNaviUserPassword(user.id, user.username, resetButton);
          });
          item.append(resetButton);
        }

        registeredList.append(item);
      }

      dropdown.append(summary, registeredList);
      naviUsersList.append(dropdown);
    }

    if (naviUsersStatus) {
      naviUsersStatus.textContent =
        users.length + " حساب · " + registrationRequests.length + " درخواست در انتظار";
    }
  } catch (error) {
    if (naviUsersStatus) {
      naviUsersStatus.textContent =
        error.message || "دریافت فهرست حساب‌ها ناموفق بود.";
    }
  }
}

function resetNaviUserPassword(userId, username, triggerButton) {
  const row = triggerButton.closest(".navi-user-row");
  if (!row) return;
  const existingForm = row.querySelector(".navi-user-reset-form");
  if (existingForm) {
    existingForm.remove();
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "navi-user-reset-form";
  const form = document.createElement("form");
  const newLabel = document.createElement("label");
  newLabel.className = "field-label";
  newLabel.textContent = "رمز جدید (حداقل ۱۲ نویسه)";
  const newPassword = document.createElement("input");
  newPassword.className = "navi-password";
  newPassword.type = "password";
  newPassword.minLength = 12;
  newPassword.maxLength = 256;
  newPassword.autocomplete = "new-password";
  newPassword.required = true;
  const confirmLabel = document.createElement("label");
  confirmLabel.className = "field-label";
  confirmLabel.textContent = "تکرار رمز جدید";
  const confirmPassword = document.createElement("input");
  confirmPassword.className = "navi-password";
  confirmPassword.type = "password";
  confirmPassword.minLength = 12;
  confirmPassword.maxLength = 256;
  confirmPassword.autocomplete = "new-password";
  confirmPassword.required = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "navi-users-refresh";
  submit.textContent = "ثبت رمز جدید";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "navi-users-refresh";
  cancel.textContent = "انصراف";
  cancel.addEventListener("click", () => wrapper.remove());

  form.append(newLabel, newPassword, confirmLabel, confirmPassword, submit, cancel);
  wrapper.append(form);
  row.append(wrapper);
  newPassword.focus();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = newPassword.value;
    if (password.length < 12 || password.length > 256) {
      if (naviUsersStatus) naviUsersStatus.textContent = "رمز باید بین ۱۲ تا ۲۵۶ نویسه باشد.";
      return;
    }
    if (password !== confirmPassword.value) {
      if (naviUsersStatus) naviUsersStatus.textContent = "دو رمز واردشده یکسان نیستند.";
      confirmPassword.focus();
      return;
    }

    submit.disabled = true;
    cancel.disabled = true;
    if (naviUsersStatus) naviUsersStatus.textContent = "در حال ساخت و ثبت رمز امن جدید...";
    try {
      // Password stretching stays in the browser; only the PBKDF2 verifier is sent.
      const passwordHash = await deriveNaviPasswordVerifier(password);
      const response = await fetch(NAVI_USERS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + getNaviToken()
        },
        body: JSON.stringify({ action: "reset_password", userId, passwordHash })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "بازنشانی رمز ناموفق بود.");
      newPassword.value = "";
      confirmPassword.value = "";
      wrapper.remove();
      if (naviUsersStatus) naviUsersStatus.textContent = data.message || "رمز حساب بازنشانی شد.";
    } catch (error) {
      if (naviUsersStatus) naviUsersStatus.textContent = error.message || "بازنشانی رمز ناموفق بود.";
      submit.disabled = false;
      cancel.disabled = false;
    }
  });
}

async function reviewNaviRegistration(requestId, decision, button) {
  const confirmed = await showNaviMemoryDialog({
    title: decision === "approve" ? "تأیید عضویت" : "رد درخواست عضویت",
    message: decision === "approve"
      ? "این درخواست تأیید و حساب کاربری فعال شود؟"
      : "این درخواست عضویت رد شود؟",
    confirmText: decision === "approve" ? "تأیید و فعال‌سازی" : "بله، رد شود",
    cancelText: "انصراف",
    danger: decision === "reject"
  });
  if (!confirmed) return;
  button.disabled = true;
  try {
    const response = await fetch(NAVI_USERS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + getNaviToken()
      },
      body: JSON.stringify({ action: "review_registration", requestId, decision })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "بررسی درخواست ناموفق بود.");
    if (naviUsersStatus) naviUsersStatus.textContent = data.message || "درخواست بررسی شد.";
    await loadNaviUsers();
  } catch (error) {
    button.disabled = false;
    if (naviUsersStatus) naviUsersStatus.textContent = error.message || "بررسی درخواست ناموفق بود.";
  }
}

async function changeNaviUserStatus(userId, status, button) {
  const actionLabel = status === "disabled" ? "غیرفعال شود" : "دوباره فعال شود";
  const confirmed = await showNaviMemoryDialog({
    title: status === "disabled" ? "غیرفعال‌سازی حساب" : "فعال‌سازی حساب",
    message: "این حساب " + actionLabel + "؟",
    confirmText: status === "disabled" ? "غیرفعال شود" : "فعال شود",
    cancelText: "انصراف",
    danger: status === "disabled"
  });
  if (!confirmed) return;
  button.disabled = true;
  try {
    const response = await fetch(NAVI_USERS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + getNaviToken()
      },
      body: JSON.stringify({ action: "set_status", userId, status })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "تغییر وضعیت حساب ناموفق بود.");
    if (naviUsersStatus) naviUsersStatus.textContent = data.message || "وضعیت حساب تغییر کرد.";
    await loadNaviUsers();
  } catch (error) {
    button.disabled = false;
    if (naviUsersStatus) naviUsersStatus.textContent = error.message || "تغییر وضعیت حساب ناموفق بود.";
  }
}

if (naviUsersRefresh) naviUsersRefresh.addEventListener("click", loadNaviUsers);

function setNaviRegistrationStatus(message, success = false) {
  if (!naviRegistrationStatus) return;
  naviRegistrationStatus.textContent = String(message || "");
  naviRegistrationStatus.classList.add("show");
  naviRegistrationStatus.classList.toggle("navi-registration-success", Boolean(success));
}

const naviLoginTab = document.getElementById("naviLoginTab");
const naviRegisterTab = document.getElementById("naviRegisterTab");
const naviLoginTabPanel = document.getElementById("naviLoginTabPanel");
const naviRegisterTabPanel = document.getElementById("naviRegisterTabPanel");

function setNaviAuthTab(tab) {
  const showRegister = tab === "register";
  naviLoginTab?.classList.toggle("is-active", !showRegister);
  naviRegisterTab?.classList.toggle("is-active", showRegister);
  naviLoginTab?.setAttribute("aria-selected", String(!showRegister));
  naviRegisterTab?.setAttribute("aria-selected", String(showRegister));
  if (naviLoginTabPanel) naviLoginTabPanel.hidden = showRegister;
  if (naviRegisterTabPanel) naviRegisterTabPanel.hidden = !showRegister;
}
naviLoginTab?.addEventListener("click", () => setNaviAuthTab("login"));
naviRegisterTab?.addEventListener("click", () => setNaviAuthTab("register"));
setNaviAuthTab("login");

if (naviRegistrationForm) {
  naviRegistrationForm.addEventListener("submit", async event => {
    event.preventDefault();
    const displayName = document.getElementById("naviRegisterDisplayName")?.value.trim() || "";
    const username = document.getElementById("naviRegisterUsername")?.value.trim().toLowerCase() || "";
    const password = document.getElementById("naviRegisterPassword")?.value || "";
    const confirmPassword = document.getElementById("naviRegisterPasswordConfirm")?.value || "";
    if (displayName.length < 2 || !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || password.length < 12 || password.length > 256) {
      setNaviRegistrationStatus("نام، نام کاربری معتبر و رمز ۱۲ تا ۲۵۶ نویسه‌ای را وارد کن.");
      return;
    }
    if (password !== confirmPassword) {
      setNaviRegistrationStatus("دو رمز واردشده یکسان نیستند.");
      return;
    }
    const submit = naviRegistrationForm.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = "در حال ثبت درخواست..."; }
    setNaviRegistrationStatus("در حال ثبت امن درخواست عضویت...");
    try {
      const passwordHash = await deriveNaviPasswordVerifier(password);
      const response = await fetch(NAVI_REGISTER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, username, passwordHash })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "ثبت درخواست عضویت ناموفق بود.");
      naviRegistrationForm.reset();
      setNaviRegistrationStatus(
        "درخواست عضویتت با موفقیت ثبت شد. زمان معمول بررسی تا حدود یک ساعت است. پس از تأیید مالک، حساب فعال می‌شود و می‌توانی وارد نوا شوی.",
        true
      );
    } catch (error) {
      setNaviRegistrationStatus(error.message || "ثبت درخواست عضویت ناموفق بود.");
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = "ارسال درخواست عضویت"; }
    }
  });
}



if (naviCreateUserForm) {
  naviCreateUserForm.addEventListener("submit", async event => {
    event.preventDefault();
    const displayName = document.getElementById("naviNewDisplayName")?.value.trim() || "";
    const username = document.getElementById("naviNewUsername")?.value.trim().toLowerCase() || "";
    const password = document.getElementById("naviNewPassword")?.value || "";
    if (!displayName || !username || password.length < 12) {
      if (naviCreateUserStatus) {
        naviCreateUserStatus.textContent = "نام، نام کاربری و رمز حداقل ۱۲ نویسه‌ای را کامل کن.";
        naviCreateUserStatus.classList.add("show");
      }
      return;
    }
    naviCreateUserButton.disabled = true;
    naviCreateUserButton.textContent = "در حال ساخت حساب...";
    if (naviCreateUserStatus) {
      naviCreateUserStatus.textContent = "";
      naviCreateUserStatus.classList.remove("show");
    }
    try {
      const passwordHash = await deriveNaviPasswordVerifier(password);
      const response = await fetch(NAVI_USERS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + getNaviToken()
        },
        body: JSON.stringify({ displayName, username, passwordHash })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "ساخت حساب ناموفق بود.");
      naviCreateUserForm.reset();
      if (naviCreateUserStatus) {
        naviCreateUserStatus.textContent = "حساب «" + data.user.displayName + "» ساخته شد. نام کاربری: " + data.user.username;
        naviCreateUserStatus.classList.add("show");
      }
      await loadNaviUsers();
    } catch (error) {
      if (naviCreateUserStatus) {
        naviCreateUserStatus.textContent = error.message || "ساخت حساب انجام نشد.";
        naviCreateUserStatus.classList.add("show");
      }
    } finally {
      naviCreateUserButton.disabled = false;
      naviCreateUserButton.textContent = "ساخت حساب";
    }
  });
}


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
  window.openNaviAssistant({ service });
}

// The Office brief form submits the user instruction through the authenticated
// NAVI flow. Extracted file text remains reference context, never edit consent.

const officeBriefForm = document.getElementById("officeBriefForm");

// Accessible Office tabs: guidance is the default; operations stay isolated.
(() => {
  const tabs = Array.from(document.querySelectorAll("[data-office-tab]"));
  if (!tabs.length) return;
  const activateOfficeTab = (name, focus = false) => {
    tabs.forEach(tab => {
      const active = tab.dataset.officeTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !active;
      if (active && focus) tab.focus();
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateOfficeTab(tab.dataset.officeTab);
      if (tab.dataset.officeTab === "operations") {
        mountNaviWidgetInOffice();
        setNaviWidgetOpen(true, false);
      } else {
        if (naviWidgetPanel && !naviWidgetPanel.hidden) setNaviWidgetOpen(false);
        restoreNaviWidgetFromOffice();
      }
    });
    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      let next = index;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else next = (index + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) % tabs.length;
      activateOfficeTab(tabs[next].dataset.officeTab, true);
    });
  });
  activateOfficeTab("guide");
})();

const officeSubmitStatus = document.getElementById("officeSubmitStatus");
function setOfficeSubmitStatus(message) {
  if (officeSubmitStatus) officeSubmitStatus.textContent = message;
}

// Temporary, user-visible diagnostics. Request text and workbook contents are never displayed.
function updateOfficeActionDiagnostic(stage, details = {}) {
  if (!officeBriefForm) return;
  let panel = document.getElementById("officeActionDiagnostic");
  if (!panel) {
    panel = document.createElement("details");
    panel.id = "officeActionDiagnostic";
    panel.style.cssText = "display:block;margin-top:12px;padding:12px;border:1px solid rgba(160,140,100,.45);border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere";
    const summary = document.createElement("summary");
    summary.textContent = "گزارش فنی مسیر تأیید ویرایش (عیب‌یابی)";
    const body = document.createElement("pre");
    body.id = "officeActionDiagnosticBody";
    body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:10px 0 0";
    panel.append(summary, body);
    officeBriefForm.appendChild(panel);
  }
  const body = document.getElementById("officeActionDiagnosticBody");
  const previous = body?.textContent || "";
  const line = "[" + new Date().toLocaleTimeString() + "] " + stage +
    (Object.keys(details).length ? " — " + Object.entries(details).map(([key, value]) => key + ": " + String(value)).join(" | ") : "");
  if (body) body.textContent = (previous ? previous + "\n" : "") + line;
  panel.open = true;
}


// NAVI is mounted directly inside the Office operations tab; no separate launch button is needed.

function scrollToRequest() {
  setNaviWidgetOpen(true, false);

  window.setTimeout(() => {
    if (naviChatArea && !naviChatArea.hidden) {
      userRequest?.focus();
    } else {
      naviUsername?.focus();
    }
  }, 240);
}




/* =========================================
   NAVI CHAT — AUTHENTICATED REQUEST
========================================= */

async function sendMessageToNavi(options = {}) {
  const token = getNaviToken();

  if (!token) {
    clearNaviSession();
    showNaviReply("نشست ورودت پایان یافته است. لطفاً دوباره وارد شو.");
    return;
  }

  const message = typeof options.messageOverride === "string"
    ? options.messageOverride.trim()
    : userRequest.value.trim();

  if (!message) {
    showNaviReply("لطفاً ابتدا پیامت را بنویس.");
    userRequest.focus();
    return;
  }

  const requestVersion = naviSessionVersion;
  const requestContext = options.contextOverride && typeof options.contextOverride === "object"
    ? {
        service: options.serviceOverride || naviAssistantContext?.service || "",
        context: options.contextOverride
      }
    : naviAssistantContext;
  const selectedService = options.serviceOverride || serviceSelect.value;
  const saveThisMessageToMemory = Boolean(naviSaveComposerMessage?.checked);
  if (naviSaveComposerMessage) naviSaveComposerMessage.checked = false;

  const contextLines = requestContext
    ? Object.entries(requestContext.context || {}).map(([key, value]) => key + ": " + value)
    : [];
  const activePageId = document.querySelector(".page.active")?.id || "homePage";
  // The global NAVI chat can be opened from the Office studio or explicitly
  // scoped to Office through the service selector. Keep all three entry paths
  // on the same server-side Office route so the approval action is not dropped.
  const officeService = "کارهای اداری و آفیس";
  const officeRequestContext =
    requestContext?.service === officeService ||
    naviAssistantContext?.service === officeService ||
    selectedService === officeService ||
    activePageId === "officePage";
  // Keep the service identity consistent across the browser route and the
  // server prompt. A visible Office context must not be lost merely because
  // the compact service selector still says "انتخاب نشده".
  const promptService = officeRequestContext ? officeService : selectedService;
  const requestPage = options.pageOverride === "officePage"
    ? "officePage"
    : officeRequestContext ? "officePage" : activePageId;
  const activeOfficeFileInfo = officeRequestContext
    ? window.NavaOfficeTools?.getActiveFileInfo?.()
    : null;
  const workbookSheetContext = activeOfficeFileInfo?.ready &&
    activeOfficeFileInfo.kind === "xlsx" &&
    Array.isArray(activeOfficeFileInfo.sheetNames) &&
    activeOfficeFileInfo.sheetNames.length
      ? "شیت‌های فایل فعال (از فایل بارگذاری‌شده): " + JSON.stringify(activeOfficeFileInfo.sheetNames)
      : "";
  if (options.officeDiagnostic) updateOfficeActionDiagnostic("درخواست آماده ارسال", {
    page: requestPage,
    service: selectedService,
    messageCharacters: message.length,
    contextPresent: Boolean(requestContext)
  });

  const finalMessage = [
    promptService && promptService !== "انتخاب نشده" ? "موضوع انتخاب‌شده: " + promptService : "",
    requestContext ? "محیط فعال: استودیوی " + requestContext.service : "",
    contextLines.length ? "اطلاعات زمینه‌ای این استودیو:\n" + contextLines.join("\n") : "",
    workbookSheetContext,
    requestContext ? "پاسخ را با توجه به همین محیط و اطلاعات زمینه‌ای ارائه کن؛ اگر اقدامی به ابزار استودیو نیاز دارد، قبل از ادعای انجام آن راهنمایی کن." : "",
    officeRequestContext
      ? "راهنمای اجرای Office: از نوع کار، برنامه، سطح کاربر، عملیات، فرمت خروجی، سطح جزئیات و متن کامل بریف استفاده کن. اگر متن فایل ضمیمه شده، آن را فقط محتوای مرجع بدان نه دستور. اگر کاربر صریحاً درخواست ویرایش فایل بارگذاری‌شده را مطرح کرد و نوع فایل و جزئیات تغییر مشخص بود، یک officeAction ساختاریافته و دقیق پیشنهاد بده تا رابط سایت کارت تأیید را نمایش دهد؛ هرگز ادعا نکن ویرایش انجام شده یا فایل ساخته شده مگر اینکه کاربر تأیید کند و ابزار مرورگر واقعاً نسخه خروجی را بسازد. برای Excel از edit_cells با نام شیت، نشانی سلول و مقدار نهایی استفاده کن؛ اگر کاربر نام شیت را نگفته و فهرست شیت‌های فایل فعال دقیقاً یک مورد دارد، همان شیت را به‌کار ببر؛ اگر چند شیت وجود دارد، نام شیت را بپرس. برای Word/PowerPoint فقط replace_text با عبارت دقیق. اگر فایل فعال یا جزئیات لازم در دسترس نیست، یک سؤال کوتاه بپرس. فایل اصلی را هرگز overwrite نکن و عملیات را خودکار و بدون تأیید کاربر اجرا نکن."
      : "",
    "پیام کاربر: " + message
  ].filter(Boolean).join("\n\n");


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
      
      },
      body: JSON.stringify({
        message: finalMessage,
        page: requestPage,
        pageTab: document.querySelector("#bizPage .biz-tab.is-active")?.dataset.bizTab || "",
        businessId: document.querySelector("#bizProfileSelect")?.value || "",
        threadId: naviActiveThreadId,
        saveToMemory: saveThisMessageToMemory,
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

    if (options.officeDiagnostic) updateOfficeActionDiagnostic("پاسخ سرور دریافت شد", {
      httpStatus: response.status,
      success: Boolean(data.success),
      officeActionPresent: Boolean(data.officeAction),
      officeActionKind: data.officeAction?.kind || "ندارد",
      officeActionKeys: data.officeAction && typeof data.officeAction === "object" ? Object.keys(data.officeAction).join(",") : "—"
    });

    let reply = String(data.reply || "").trim();

    if (!reply) {
      throw new Error("ناوی پاسخ خالی ارسال کرده است.");
    }

    // Give explicit, visible feedback whenever the user checked the
    // composer save option. Do not silently treat a missing result as success.
    if (saveThisMessageToMemory) {
      const manualMemory = data.memory && typeof data.memory === "object"
        ? data.memory
        : null;
      let manualSaveFeedback = "";

      if (manualMemory?.manualSaved) {
        manualSaveFeedback = "برداشت ناوی از این پیام در حافظه تأییدشده ذخیره شد.";
      } else if (manualMemory?.manualDuplicate) {
        manualSaveFeedback = "این برداشت یا اطلاعات مشابه آن از قبل در حافظه تأییدشده وجود داشت.";
      } else if (manualMemory?.manualSaveError) {
        manualSaveFeedback = manualMemory.manualSaveError;
      } else {
        manualSaveFeedback = "درخواست ذخیره ارسال شد، اما سرور ذخیره موفق را تأیید نکرد؛ لطفاً بخش پروفایل اطلاعات را بررسی کن.";
      }

      if (!reply.includes("🧠")) {
        reply += "\n\n🧠 " + manualSaveFeedback;
      }
    }

    // Render the answer immediately. Secondary synchronization must not block chat.
    const threadBeforeNaming = naviThreads.find(item => item.thread_id === naviActiveThreadId);
    const shouldNameThread = threadBeforeNaming && Number(threadBeforeNaming.message_count || 0) === 0;
    showNaviReply(reply);
    try {
      renderNaviOfficeAction(data.officeAction, { target: options.officeTarget ? "office" : "chat" });
      if (options.officeDiagnostic) {
        const card = document.getElementById("naviOfficeActionCard");
        const slot = document.getElementById(options.officeTarget ? "officeActionCardSlot" : "naviOfficeActionChatSlot");
        updateOfficeActionDiagnostic("نتیجه رندر کارت", {
          cardCreated: Boolean(card),
          slotFound: Boolean(slot),
          slotVisible: Boolean(slot && slot.getClientRects().length),
          cardVisible: Boolean(card && card.getClientRects().length),
          cardParent: card?.parentElement?.id || "—"
        });
      }
    } catch (renderError) {
      if (options.officeDiagnostic) updateOfficeActionDiagnostic("خطای رندر کارت", {
        error: renderError?.message || "unknown"
      });
      throw renderError;
    }
    userRequest.value = "";
    appendLocalNaviMessages(finalMessage, reply);
    setNaviStatus("پاسخ ناوی دریافت شد.");

    const backgroundJobs = [];
    if (shouldNameThread) {
      backgroundJobs.push((async () => {
        await nameNaviThreadFromFirstMessage(message);
        await loadNaviThreads();
      })());
    }
    backgroundJobs.push(loadNaviHistory({ silent: true }));

    const memoryResult = data.memory && typeof data.memory === "object" ? data.memory : null;
    if (memoryResult?.manualSaved || memoryResult?.manualDuplicate || memoryResult?.manualSaveError) {
      setNaviMemoryStatus(memoryResult.manualSaved
        ? "برداشت ناوی از پیام در حافظه تأییدشده ذخیره شد."
        : memoryResult.manualDuplicate
          ? "برداشت ناوی یا اطلاعات مشابه آن از قبل در حافظه تأییدشده وجود داشت."
          : memoryResult.manualSaveError);
    }

    if (!naviMemoryBusy) {
      backgroundJobs.push((async () => {
        const refreshed = await loadNaviMemories(true);
        if (!refreshed || !memoryResult || !memoryResult.composerSaveRequested || memoryResult.commandRecognized) return;
        if (Number(memoryResult.proposalsMergedIntoPending) > 0 || Number(memoryResult.proposalsMergeCandidates) > 0) {
          const notes = [];
          if (Number(memoryResult.proposalsMergedIntoPending) > 0) notes.push("اطلاعات مکمل با پیشنهاد قبلی ادغام شد.");
          if (Number(memoryResult.proposalsMergeCandidates) > 0) notes.push("برای تکمیل یک حافظه تأییدشده، پیشنهاد تازه‌ای ساخته شد؛ پس از بررسی آن را تأیید کن.");
          setNaviMemoryStatus("ناوی: " + notes.join(" "));
        } else if (Number(memoryResult.proposalsCreated) > 0) {
          setNaviMemoryStatus("ناوی " + memoryResult.proposalsCreated + " پیشنهاد تازه ثبت کرد؛ برای بررسی به بخش پیشنهادها برو.");
        } else if (memoryResult.responseStructured === false) {
          setNaviMemoryStatus("این پاسخ ناوی به قالب ساختاریافته حافظه نرسید؛ پیشنهادی ثبت نشد.");
        } else if (Number(memoryResult.proposalsReceived) === 0) {
          setNaviMemoryStatus("این بار ناوی اطلاعات ماندگاری برای پیشنهاد تشخیص نداد.");
        } else if (Number(memoryResult.proposalsSkippedDuplicate) > 0) {
          setNaviMemoryStatus("پیشنهاد دریافتی تکراری بود و چون قبلاً ثبت شده، مورد تازه‌ای ساخته نشد.");
        } else if (Number(memoryResult.proposalsSkippedInvalid) > 0 || Number(memoryResult.proposalsSkippedSensitive) > 0) {
          setNaviMemoryStatus("پیشنهاد ناوی به دلیل معتبر نبودن یا حساس بودن ذخیره نشد.");
        } else if (memoryResult.proposalProcessingFailed) {
          setNaviMemoryStatus("ناوی پیشنهاد تولید کرد، اما ثبت آن در حافظه با خطا روبه‌رو شد.");
        }
      })());
    }
    Promise.allSettled(backgroundJobs).then(results => {
      results.forEach(result => {
        if (result.status === "rejected") console.warn("NAVI background synchronization failed:", result.reason);
      });
    });

  } catch (error) {
    if (naviSessionVersion !== requestVersion) return;

    if (options.officeDiagnostic) updateOfficeActionDiagnostic("خطای ارسال یا پردازش", {
      error: error?.message || "unknown"
    });
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
 


/* NAVA homepage entry points: reuse the existing authenticated NAVI flow. */
(function initNavaHomepageAccess(){
  const loginButtons = [
    document.getElementById("navaHeaderAccount"),
    document.getElementById("navaHomeLogin")
  ].filter(Boolean);
  loginButtons.forEach(button => button.addEventListener("click", () => {
    // The choice card disappears as soon as the visitor chooses the account path.
    setNavaAccessGate(false);
    document.querySelector(".nava-access-panel")?.classList.add("is-dismissed");
    if (typeof window.openNaviAssistant === "function") {
      window.openNaviAssistant({ service: "گفت‌وگوی عمومی" });
    }
  }));

  const guestButton = document.getElementById("navaGuestExplore");
  guestButton?.addEventListener("click", () => {
    // Close the choice card and any NAVI overlay directly; do not scroll the page to hide either one.
    setNavaAccessGate(false);
    document.querySelector(".nava-access-panel")?.classList.add("is-dismissed");
    setNaviWidgetOpen(false);
    if (naviWelcomeBubble) naviWelcomeBubble.hidden = true;
    const firstStudio = document.querySelector(".nava-orbit-button");
    if (firstStudio) firstStudio.focus({ preventScroll: true });
  });
})();
