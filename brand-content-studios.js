
/* NAVA BRAND + CONTENT STUDIOS
   Studio requests use the authenticated NAVI endpoint and render the answer
   inside the current studio workspace. The floating chat remains user-controlled.
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

  async function requestStudioOutput(service, context, message, target, button, onSuccess) {
    const originalLabel = button?.textContent || "";
    if (button) { button.disabled = true; button.textContent = "در حال تولید خروجی..."; }
    target.textContent = "در حال آماده‌سازی درخواست برای NAVI...";
    target.dataset.state = "loading";

    try {
      const token = typeof getNaviToken === "function" ? getNaviToken() : null;
      if (!token) throw new Error("برای استفاده از خروجی مستقیم، ابتدا وارد حساب NAVI شو.");
      if (typeof window.getNaviActiveContext !== "function") {
        throw new Error("اتصال ناوی آماده نیست؛ صفحه را تازه‌سازی و دوباره تلاش کن.");
      }

      // Resolve the active thread inside the guarded flow. This can reject
      // while NAVI is restoring a session; it must never become an unhandled
      // promise or leave the submit button stuck.
      const naviContext = await window.getNaviActiveContext();
      if (!naviContext?.threadId) {
        throw new Error("گفت‌وگوی معتبر ناوی پیدا نشد. پنل ناوی را باز کن و دوباره تلاش کن.");
      }

      target.textContent = "درخواست به NAVI ارسال شد؛ پاسخ در همین فضای پروژه نمایش داده می‌شود...";
      const response = await fetch("https://nava-music-api.honrrpower.workers.dev/navi-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({
          message,
          page: window.location.pathname + "#studio-" + service,
          threadId: naviContext.threadId,
          saveToMemory: false
        })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new Error("نشست NAVI معتبر نیست یا پایان یافته است. دوباره وارد حساب شو.");
      }
      if (!response.ok || !data.success || !String(data.reply || "").trim()) {
        throw new Error(data.error || data.diagnostic || "دریافت خروجی از NAVI ناموفق بود.");
      }

      target.textContent = String(data.reply).trim();
      target.dataset.state = "success";
      if (window.NavaDocumentExport) window.NavaDocumentExport.attach(target, service);
      if (typeof onSuccess === "function") onSuccess(target.textContent);
    } catch (error) {
      target.textContent = error?.message || "ارتباط با NAVI برقرار نشد. دوباره تلاش کن.";
      target.dataset.state = "error";
    } finally {
      if (button) { button.disabled = false; button.textContent = originalLabel; }
    }
  }

  function studioOutput(page, service) {
    const aside = page.querySelector(".studio-output-card");
    if (!aside) return null;
    let output = aside.querySelector("[data-studio-live-output]");
    if (!output) {
      const heading = document.createElement("div");
      heading.className = "studio-live-output-heading";
      heading.textContent = "خروجی NAVI";
      output = document.createElement("div");
      output.dataset.studioLiveOutput = service;
      output.className = "studio-live-output";
      output.setAttribute("role", "status");
      output.setAttribute("aria-live", "polite");
      output.textContent = "پس از ارسال بریف، نتیجه در همین قسمت نمایش داده می‌شود.";
      const placeholder = aside.querySelector(".studio-output-placeholder");
      if (placeholder) placeholder.replaceWith(heading, output);
      else aside.append(heading, output);
    }
    return output;
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
    status("brandStudioStatus", "درخواست ارسال شد؛ خروجی در فضای همین استودیو نمایش داده می‌شود.");
    const output = document.querySelector("#brandPage .nava-strategy-layout");
    let result = document.querySelector("#brandStudioOutput");
    if (!result && output) { result = document.createElement("div"); result.id = "brandStudioOutput"; result.className = "studio-live-output"; output.append(result); }
    if (result) requestStudioOutput("برندینگ", context, message, result, document.querySelector("#brandStrategyForm button[type='submit']"));
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
    status("contentStudioStatus", "درخواست ارسال شد؛ خروجی در فضای همین استودیو نمایش داده می‌شود.");
    const output = document.querySelector("#contentPage .nava-strategy-layout");
    let result = document.querySelector("#contentStudioOutput");
    if (!result && output) { result = document.createElement("div"); result.id = "contentStudioOutput"; result.className = "studio-live-output"; output.append(result); }
    if (result) requestStudioOutput("تولید محتوا", context, message, result, document.querySelector("#contentStudioForm button[type='submit']"));
  });

  $("improveStoryWithNavi")?.addEventListener("click", () => {
    const story = read("storyInput");
    if (!story) {
      status("storyMessage", "ابتدا متن یا ایده استوری را بنویس.", true);
      $("storyInput")?.focus();
      return;
    }
    const context = { draft: story };
    const message = [
      "در استودیوی استوری‌ساز نوا هستیم. متن یا ایده زیر را به یک استوری مؤثر و آماده انتشار تبدیل کن.",
      "ابتدا هدف و مخاطب را از متن تشخیص بده؛ اگر ابهام تعیین‌کننده‌ای وجود دارد فقط یک سؤال ضروری بپرس.",
      "خروجی را کاربردی و فارسی ارائه کن: نسخه نهایی کوتاه و خوانا، تقسیم‌بندی پیشنهادی در چند اسلاید در صورت نیاز، تأکیدهای بصری و پیشنهاد CTA.",
      "معنای اصلی را حفظ کن، متن را بی‌دلیل طولانی نکن و ادعای تأییدنشده اضافه نکن.",
      "متن اولیه:\n" + story
    ].join("\n\n");
    status("درخواست ارسال شد؛ نسخه پیشنهادی در پیش‌نمایش استوری نمایش داده می‌شود.");
    const preview = $("previewText");
    if (preview) { preview.textContent = "در حال دریافت نسخه بازطراحی‌شده..."; preview.classList.remove("empty"); }
    const output = $("storyMessage");
    requestStudioOutput(
      "استوری‌ساز",
      context,
      message,
      output,
      $("improveStoryWithNavi"),
      reply => {
        if (preview) preview.textContent = reply;
      }
    );
  });

  $("brandStudioReset")?.addEventListener("click", () => {
    $("brandStrategyForm")?.reset();
    status("brandStudioStatus", "فرم برند پاک شد.");
  });
  $("contentStudioReset")?.addEventListener("click", () => {
    $("contentStudioForm")?.reset();
    status("contentStudioStatus", "فرم محتوا پاک شد.");
  });

  // Task-specific handoff for the remaining brief-based studios.
  // These workflows use NAVI to create usable, copy-ready work products;
  // they do not claim to perform external research, render files, or publish content.
  const assistedStudios = {
    articlePage: {
      service: "مقاله و وبلاگ",
      ids: ["studioTask-article", "studioAudience-article", "studioBrief-article"],
      labels: ["نوع خروجی", "مخاطب مقاله", "شرح درخواست"],
      instruction: "در نقش دبیر و نویسنده حرفه‌ای فارسی عمل کن. ابتدا اگر موضوع، هدف یا اطلاعات منبع برای نوشتن دقیق کافی نیست، فقط مهم‌ترین سؤال ضروری را بپرس. سپس عنوان‌های پیشنهادی، زاویه مقاله، ساختار H1/H2/H3، مقدمه، متن کامل، جمع‌بندی و توضیحات متای پیشنهادی را آماده کن. کلیدواژه یا آمار ساختگی نساز و اگر تحقیق زنده یا منبع لازم است، محدودیت را شفاف بگو."
    },
    officePage: {
      service: "کارهای اداری و آفیس",
      ids: ["studioTask-office", "studioAudience-office", "studioBrief-office"],
      labels: ["نوع سند یا کار", "مخاطب یا دریافت‌کننده", "شرح درخواست"],
      instruction: "در نقش کارشناس حرفه‌ای امور اداری و تهیه اسناد سازمانی عمل کن. نوع سند انتخاب‌شده را دقیق رعایت کن: برای نامه، موضوع، خطاب، متن رسمی و محل امضا؛ برای گزارش، خلاصه مدیریتی، هدف، یافته‌ها، پیشنهادها و جمع‌بندی؛ برای صورت‌جلسه، تاریخ و محل، حاضران، دستور جلسه، مصوبات، مسئول هر اقدام و مهلت؛ برای رزومه، بخش‌بندی استاندارد و دستاوردهای قابل سنجش فقط بر پایه اطلاعات کاربر؛ برای برنامه اجرایی، فعالیت، مسئول، زمان‌بندی، وابستگی و شاخص پیگیری؛ برای دستورالعمل، دامنه، پیش‌نیازها، مراحل شماره‌دار و کنترل نهایی را آماده کن. پیش از نوشتن فقط اگر یک داده ضروری مانع تهیه سند است سؤال بپرس؛ اطلاعات، نام‌ها، تاریخ‌ها، اعداد، سوابق و تعهدات را جعل نکن و موارد نامعلوم را با جای‌خالی مشخص کن. متن را فارسی و راست‌چین‌پسند، با عنوان‌های روشن و پاراگراف‌های کوتاه ارائه بده. جدول پیچیده یا فایل Excel/PowerPoint را وانمود نکن که ساخته‌ای؛ اگر درخواست به آن‌ها نیاز دارد، ساختار داده را به شکل ساده و قابل کپی پیشنهاد کن. در پایان نسخه نهایی یکپارچه و آماده انتقال به Word ارائه بده."
    },
    composePage: {
      service: "آهنگ‌سازی و نت‌نویسی",
      ids: ["studioTask-compose", "studioStyle-compose", "studioKey-compose", "studioTempo-compose", "studioMeter-compose", "studioInstruments-compose", "studioBrief-compose"],
      labels: ["کار درخواستی", "سبک یا فضای موسیقی", "گام یا مُد", "تمپو", "میزان‌نما", "سازها", "شرح ایده"],
      instruction: "در نقش دستیار آهنگ‌ساز و تنظیم‌کننده عمل کن. ایده را از نظر فرم، ملودی، ریتم، هارمونی و سازبندی توسعه بده. اگر داده کافی نیست یک سؤال تعیین‌کننده بپرس. خروجی را مرحله‌بندی و تا حد ممکن اجرایی ارائه کن؛ برای ملودی از نام نت‌ها، کشش‌ها و میزان‌بندی متنی استفاده کن. ادعا نکن که فایل صوتی، پارتیتور گرافیکی یا MIDI ساخته‌ای؛ این استودیو فعلاً همراهی متنی و طراحی موسیقایی است."
    },
    avPage: {
      service: "ویدئو و صدا",
      ids: ["studioTask-av", "studioAudience-av", "studioBrief-av"],
      labels: ["نوع پروژه", "مخاطب نهایی", "شرح درخواست"],
      instruction: "در نقش تهیه‌کننده و طراح محتوای صوتی‌تصویری عمل کن. متناسب با درخواست، سناریو، ساختار زمانی، شات‌لیست یا استوری‌بورد متنی، متن گویندگی، پیشنهاد صدا و موسیقی و چک‌لیست تولید ارائه بده. مدت، پلتفرم و امکانات واقعی را رعایت کن؛ اگر چیزی مشخص نیست فقط سؤال ضروری را بپرس. ادعا نکن فایل ویدئو یا صوت رندر کرده‌ای."
    },
    seoPage: {
      service: "سئو",
      ids: ["studioTask-seo", "studioAudience-seo", "studioBrief-seo"],
      labels: ["هدف یا خروجی سئو", "مخاطب و بازار هدف", "شرح درخواست"],
      instruction: "در نقش متخصص سئوی محتوا و وب‌سایت عمل کن. بر اساس اطلاعات ارائه‌شده، پیشنهادهای ساختار صفحه، نیت جست‌وجو، خوشه موضوعی، عنوان و توضیحات متا، هدینگ‌ها و چک‌لیست فنی/محتوایی را تفکیک کن. بدون دسترسی و بررسی واقعی سایت، ادعای ممیزی یا رتبه و حجم جست‌وجو نکن؛ داده‌های حدسی را به‌عنوان واقعیت ننویس."
    },
    adsPage: {
      service: "تبلیغات",
      ids: ["studioTask-ads", "studioAudience-ads", "studioBrief-ads"],
      labels: ["نوع کمپین یا تبلیغ", "مخاطب هدف", "شرح درخواست"],
      instruction: "در نقش استراتژیست تبلیغات عمل کن. هدف، مخاطب، پیشنهاد ارزش، پیام محوری، ایده خلاق، چند نسخه متن تبلیغ، CTA، کانال‌های مناسب و شاخص‌های سنجش را طراحی کن. بودجه یا نتیجه تضمینی نساز؛ اگر اطلاعات محصول یا مزیت رقابتی کافی نیست سؤال بپرس و از ادعاهای تأییدنشده پرهیز کن."
    },
    bizPage: {
      service: "ابزارهای کسب‌وکار",
      ids: ["studioTask-biz", "studioAudience-biz", "studioBrief-biz"],
      labels: ["نوع مسئله یا ابزار", "کاربر یا ذی‌نفع اصلی", "شرح درخواست"],
      instruction: "در نقش مشاور عملیاتی کسب‌وکار عمل کن. مسئله را به هدف، فرض‌ها، مراحل اجرا، منابع موردنیاز، ریسک‌ها و شاخص‌های سنجش تبدیل کن. اگر مناسب است جدول، چک‌لیست، برنامه اجرایی یا الگوی قابل کپی بساز. اعداد مالی و داده‌های بازار را بدون منبع قطعی اعلام نکن و فرض‌ها را از واقعیت جدا نگه دار."
    }
  };

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-business-tool-form]")) return;
    // The business profile form is handled by business-workspace.js, not the generic NAVI advisor.
    if (form.id === "bizProfileCreateForm") return;
    const page = form.closest(".page");
    const config = page && assistedStudios[page.id];
    if (!config) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const values = {};
    config.ids.forEach((id, index) => {
      const field = $(id);
      const value = field?.tagName === "SELECT"
        ? (field.selectedOptions?.[0]?.textContent || "").trim()
        : (field?.value || "").trim();
      if (value) values[config.labels[index]] = value;
    });

    const isCompose = page.id === "composePage";
    const required = isCompose
      ? Boolean(values["شرح ایده"] || values["کار درخواستی"] !== "پیشنهاد مناسب را NAVI انتخاب کند")
      : Boolean(values["شرح درخواست"]);
    if (!required) {
      let note = form.querySelector("[data-nava-studio-status]");
      if (!note) {
        note = document.createElement("p");
        note.dataset.navaStudioStatus = "true";
        note.className = "studio-note";
        note.setAttribute("role", "status");
        form.append(note);
      }
      note.textContent = "لطفاً شرح درخواست یا ایده‌ات را وارد کن تا ناوی بتواند خروجی مشخصی آماده کند.";
      $(config.ids[config.ids.length - 1])?.focus();
      return;
    }

    if (page.id === "bizPage" && window.NavaBusinessTools?.getReport()) {
      values["گزارش محاسبه‌گر نوا"] = window.NavaBusinessTools.getReport();
    }
    const context = { ...values };
    const message = [
      "در استودیوی «" + config.service + "» نوا هستیم.",
      config.instruction,
      "درخواست و اطلاعات ثبت‌شده:",
      Object.entries(values).map(([key, value]) => key + ": " + value).join("\n"),
      "خروجی را به فارسی، منظم و قابل استفاده مستقیم ارائه کن. اگر محدودیت ابزار یا داده‌ای مانع انجام بخشی است، صریح بگو و آن را انجام‌شده جلوه نده."
    ].join("\n\n");

    let note = form.querySelector("[data-nava-studio-status]");
    if (!note) {
      note = document.createElement("p");
      note.dataset.navaStudioStatus = "true";
      note.className = "studio-note";
      note.setAttribute("role", "status");
      form.append(note);
    }
    note.textContent = "درخواست ارسال شد؛ خروجی در فضای همین پروژه نمایش داده می‌شود.";
    const output = studioOutput(page, config.service);
    const submitButton = form.querySelector('button[type="submit"]');
    if (output) requestStudioOutput(config.service, context, message, output, submitButton);
  }, true);

})();
