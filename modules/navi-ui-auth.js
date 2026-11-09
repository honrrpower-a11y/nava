import { NAVI_LOGIN_API, state, getNaviToken, saveNaviSession, clearNaviSession, showNaviChat, showLoginError, clearLoginError, setNaviStatus, naviLoginForm, naviPassword, naviLoginButton, naviLoginStatus, naviLogout } from "./navi-core.js";
import { loadNaviHistory } from "./navi-history.js";

/* NAVI LOGIN */

function handleNaviLogin(event) {
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

    state.naviSessionVersion++;
    naviPassword.value = "";
    state.naviHistory = [];
    state.naviMemory = [];
    state.naviMemoryLoaded = false;

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
}

function handleNaviLogout() {
  clearNaviSession();
  clearLoginError();

  naviLoginStatus.textContent = "از نشست ناوی خارج شدی.";
  setNaviStatus("برای شروع گفت‌وگو دوباره وارد شو.");
}

export function initNaviAuth() {
  const existingNaviToken = getNaviToken();
  if (existingNaviToken) { showNaviChat(); loadNaviHistory(); }
  else clearNaviSession();
  naviLoginForm.addEventListener("submit", handleNaviLogin);
  naviLogout.addEventListener("click", handleNaviLogout);
}
