
/* NAVA BRAND + CONTENT STUDIOS
   Local brief builders. No external API calls; the authenticated NAVI assistant
   receives the completed brief only after the user presses the handoff button.
*/
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const read = id => ($(id)?.value || "").trim();

  function handoff(service, context, message) {
    const assistant = $("userRequest");
    const selector = $("serviceSelect");
    if (typeof window.openNaviAssistant === "function") {
      window.openNaviAssistant({ service, context, message });
      return;
    }
    if (assistant) assistant.value = message;
    if (selector) selector.value = service;
    if (typeof window.chooseService === "function") {
      window.chooseService(service);
    } else {
      $("naviWidgetToggle")?.click();
    }
  }

  function status(id, text, isError = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? "#e28b82" : "";
  }

  $("brandStrategyForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const context = {
      brandName: read("brandName"),
      industry: read("brandIndustry"),
      audience: read("brandAudience"),
      values: read("brandValues"),
      personality: $("brandPersonality")?.selectedOptions?.[0]?.textContent?.trim() || "",
      difference: read("brandDifference"),
      promise: read("brandPromise"),
      competitors: read("brandCompetitors")
    };
    if (!context.brandName || !context.industry || !context.audience) {
      status("brandStudioStatus", "نام برند، حوزه فعالیت و مخاطب اصلی را کامل کن.", true);
      return;
    }
    const message = [
      "می‌خواهم برای برند زیر یک استراتژی هویت برند کاربردی و منسجم تدوین کنیم.",
      "ابتدا اطلاعات را تحلیل کن و اگر تناقض یا کمبود مهمی وجود دارد، قبل از نتیجه‌گیری سؤال بپرس.",
      "خروجی پس از تکمیل اطلاعات شامل جایگاه‌یابی، ارزش پیشنهادی، شخصیت و لحن کلامی، پیام محوری، ستون‌های پیام برند، پیشنهاد شعار و جهت‌گیری هویت بصری باشد.",
      "هیچ داده یا مزیت رقابتی را بدون شواهد من نساز.",
      "اطلاعات بریف:\n" + Object.entries(context).map(([k,v]) => k + ": " + (v || "مشخص نشده")).join("\n")
    ].join("\n\n");
    status("brandStudioStatus", "بریف آماده شد؛ پنجره ناوی باز می‌شود تا بررسی و تدوین استراتژی را ادامه بدهی.");
    handoff("برندینگ", context, message);
  });

  $("contentStudioForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const context = {
      platform: $("contentPlatform")?.selectedOptions?.[0]?.textContent?.trim() || "",
      format: $("contentFormat")?.selectedOptions?.[0]?.textContent?.trim() || "",
      objective: $("contentObjective")?.selectedOptions?.[0]?.textContent?.trim() || "",
      topic: read("contentTopic"),
      audience: read("contentAudience"),
      tone: $("contentTone")?.selectedOptions?.[0]?.textContent?.trim() || "",
      keyPoints: read("contentKeyPoints"),
      callToAction: read("contentCTA"),
      keywords: read("contentKeywords")
    };
    if (!context.topic || !context.audience) {
      status("contentStudioStatus", "موضوع محتوا و مخاطب هدف را وارد کن.", true);
      return;
    }
    const message = [
      "برای من بر اساس بریف زیر محتوای حرفه‌ای و قابل انتشار طراحی کن.",
      "ابتدا اگر اطلاعات ضروری کم است سؤال بپرس. از ادعاهای بی‌پشتوانه، تیتر گمراه‌کننده و تکرار کلیشه‌ای پرهیز کن.",
      "خروجی را متناسب با پلتفرم و قالب انتخاب‌شده آماده کن؛ شامل ایده و زاویه محتوا، ساختار، متن نهایی، پیشنهاد شروع جذاب و دعوت به اقدام.",
      "اگر محتوای شبکه اجتماعی است، نسخه کپشن و هشتگ‌های مرتبط را هم ارائه بده؛ اگر مقاله است، تیترها و ساختار سئو را اضافه کن.",
      "بریف محتوا:\n" + Object.entries(context).map(([k,v]) => k + ": " + (v || "مشخص نشده")).join("\n")
    ].join("\n\n");
    status("contentStudioStatus", "بریف آماده شد؛ ناوی برای تولید محتوا باز می‌شود.");
    handoff("تولید محتوا", context, message);
  });

  $("brandStudioReset")?.addEventListener("click", () => {
    $("brandStrategyForm")?.reset();
    status("brandStudioStatus", "فرم برند پاک شد.");
  });
  $("contentStudioReset")?.addEventListener("click", () => {
    $("contentStudioForm")?.reset();
    status("contentStudioStatus", "فرم محتوا پاک شد.");
  });
})();
