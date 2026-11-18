/* NAVI guided Office onboarding — submits through the authenticated Office route. */
(() => {
  "use strict";

  const app = document.getElementById("officeGuideApp");
  const level = document.getElementById("officeGuideLevel");
  const question = document.getElementById("officeGuideQuestion");
  const ask = document.getElementById("officeGuideAskNavi");
  const status = document.getElementById("officeGuideStatus");
  const operationsNaviButton = document.getElementById("officeOperationsGoToNavi");

  const scrollToNaviAnswers = () => {
    const assistantColumn = document.querySelector(".office-assistant-column");
    if (!assistantColumn) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    assistantColumn.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start"
    });
  };

  operationsNaviButton?.addEventListener("click", scrollToNaviAnswers);
  if (!app || !level || !question || !ask) return;

  document.querySelectorAll(".office-guide-preset").forEach(button => {
    button.addEventListener("click", () => {
      app.value = button.dataset.app || "عمومی";
      question.value = button.dataset.question || "";
      question.focus();
      status.textContent = "نمونه درخواست آماده شد؛ می‌توانی آن را تغییر بدهی یا برای ناوی بفرستی.";
    });
  });

  ask.addEventListener("click", async () => {
    const task = question.value.trim();
    if (!task) {
      status.textContent = "اول بنویس در چه کاری کمک می‌خواهی یا یکی از نمونه‌ها را انتخاب کن.";
      question.focus();
      return;
    }
    if (typeof window.sendOfficeNaviRequest !== "function") {
      status.textContent = "ارتباط با ناوی هنوز آماده نیست؛ صفحه را تازه‌سازی کن و دوباره تلاش کن.";
      return;
    }

    const taskField = document.getElementById("studioTask-office");
    const operation = document.getElementById("studioMode-office");
    if (taskField) taskField.value = "راهنمای انجام یک کار در Word یا Excel یا PowerPoint";
    if (operation) operation.value = "guide";

    const context = {
      task: "راهنمایی گام‌به‌گام کاربر در Office",
      application: app.value,
      userLevel: level.value,
      operation: "guide",
      requestedOutput: "راهنمای متنی و مثال عملی؛ در صورت نیاز فایل پیشنهادی",
      detailLevel: "متناسب با سطح آشنایی کاربر",
      brief: task
    };
    const message = "می‌خواهم در بخش Office نوا راهنمایی‌ام کنی. برنامه: " + app.value +
      ". سطح من: " + level.value + ". درخواست: " + task +
      "\n\nلطفاً ابتدا هدفم را روشن کن، سپس ساده و مرحله‌به‌مرحله راهنمایی کن. هر مرحله را کوتاه و قابل اجرا بنویس، اصطلاحات را توضیح بده و برای داده‌ها یا فرمول‌ها مثال واقعی ارائه کن. اگر برای انجام کار به فایل یا اطلاعاتی نیاز داری، دقیق بگو چه چیزی لازم است. هیچ‌وقت ادعا نکن فایل دستگاه من را تغییر داده‌ای مگر اینکه واقعاً خروجی قابل دریافت ساخته شده باشد.";

    ask.disabled = true;
    const originalLabel = ask.textContent;
    ask.textContent = "در حال ارسال درخواست...";
    try {
      // Start the request first so the inline assistant is opened, then bring
      // its answer area into view (especially important on narrow/mobile screens).
      const sendPromise = window.sendOfficeNaviRequest({ message, context });
      scrollToNaviAnswers();
      const sent = await sendPromise;
      status.textContent = sent === false
        ? "برای ارسال درخواست، ابتدا در NAVI وارد حساب شو؛ دستیار در همین فضای آفیس باز می‌ماند."
        : "درخواست ارسال شد. پاسخ NAVI و کارت تأیید، در ستون دستیار همین صفحه نمایش داده می‌شوند.";
    } catch (error) {
      status.textContent = error?.message || "ارسال درخواست با مشکل مواجه شد؛ دوباره تلاش کن.";
    } finally {
      ask.disabled = false;
      ask.textContent = originalLabel;
    }
  });
})();
