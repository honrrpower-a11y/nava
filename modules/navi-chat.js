import { NAVI_API, NAVI_CONTEXT_MESSAGES, state, getNaviToken, clearNaviSession, showNaviReply, showLoginError, setNaviStatus, naviChatArea, naviPassword, serviceSelect, userRequest, sendRequest } from "./navi-core.js";
import { loadNaviHistory, appendLocalNaviMessages } from "./navi-history.js";
import { loadNaviMemories } from "./navi-memory-ui.js";

export function chooseService(service) {
  serviceSelect.value = service;
  scrollToRequest();
}

export function scrollToRequest() {
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


// Keep existing inline HTML navigation controls working with module scope.


/* NAVI CHAT */

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

  const requestVersion = state.naviSessionVersion;
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
      },
      body: JSON.stringify({
        message: finalMessage,
        page: window.location.pathname,
        pageContext: pageContext,
        history: state.naviHistory.slice(-NAVI_CONTEXT_MESSAGES)
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
      state.naviSessionVersion !== requestVersion
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
      state.naviSessionVersion !== requestVersion
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
       NEW: AUTOMATIC MEMORY REFRESH
       After every successful NAVI response,
       refresh memory if the panel was loaded.
    ===================================== */

    if (state.naviMemoryLoaded && !state.naviMemoryBusy) {
      await loadNaviMemories(true);
    }

  } catch (error) {
    if (state.naviSessionVersion !== requestVersion) return;

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
    if (state.naviSessionVersion === requestVersion) {
      sendRequest.disabled = false;
      sendRequest.textContent = "ارسال پیام به ناوی";
    }
  }
}



export function initNaviChat() {
  window.chooseService = chooseService;
  window.scrollToRequest = scrollToRequest;
  sendRequest.addEventListener("click", sendMessageToNavi);
  userRequest.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !sendRequest.disabled) {
      event.preventDefault();
      sendMessageToNavi();
    }
  });
}
