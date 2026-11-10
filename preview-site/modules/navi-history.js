import { NAVI_HISTORY_API, NAVI_MAX_DISPLAY_MESSAGES, NAVI_CONTEXT_MESSAGES, state, getNaviToken, clearNaviSession, showLoginError, setNaviStatus, showEmptyHistory, naviHistoryList, naviHistoryCount, naviHistoryRefresh } from "./navi-core.js";

export function normalizeNaviHistory(data) {
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

export function renderNaviHistory(messages) {
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

export async function loadNaviHistory() {
  const token = getNaviToken();

  if (!token) return false;

  if (state.naviHistoryLoading && state.naviHistoryLoadPromise) {
    return state.naviHistoryLoadPromise;
  }

  const requestVersion = state.naviSessionVersion;

  state.naviHistoryLoading = true;
  naviHistoryRefresh.disabled = true;
  naviHistoryRefresh.textContent = "در حال دریافت...";
  naviHistoryCount.textContent = "در حال بارگذاری...";

  state.naviHistoryLoadPromise = (async () => {
    try {
      const response = await fetch(NAVI_HISTORY_API, {
        method: "GET",
        headers: { "Authorization": "Bearer " + token },
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
        state.naviSessionVersion !== requestVersion
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

      state.naviHistory = normalizeNaviHistory(data);
      renderNaviHistory(state.naviHistory);

      setNaviStatus(
        state.naviHistory.length
          ? "گفت‌وگوهای قبلی بازیابی شدند؛ می‌توانی ادامه بدهی."
          : "ناوی آماده شروع اولین گفت‌وگوست."
      );

      return true;

    } catch (error) {
      if (state.naviSessionVersion !== requestVersion) return false;

      console.error("NAVI history error:", error);

      renderNaviHistory(state.naviHistory);
      naviHistoryCount.textContent = "حافظه آنلاین در دسترس نیست";

      if (state.naviHistory.length === 0) {
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
      if (state.naviSessionVersion === requestVersion) {
        state.naviHistoryLoading = false;
        state.naviHistoryLoadPromise = null;
        naviHistoryRefresh.disabled = false;
        naviHistoryRefresh.textContent = "تازه‌سازی تاریخچه";
      }
    }
  })();

  return state.naviHistoryLoadPromise;
}


/* =========================================
   LOCAL HISTORY FALLBACK
========================================= */

export function appendLocalNaviMessages(userMessage, assistantMessage) {
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

  state.naviHistory = [
    ...state.naviHistory,
    ...additions
  ].slice(-NAVI_MAX_DISPLAY_MESSAGES);

  renderNaviHistory(state.naviHistory);
}

export function initHistory() {
  naviHistoryRefresh.addEventListener("click", () => loadNaviHistory());
}
