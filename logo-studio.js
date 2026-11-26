"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const form = $("logoStudioForm");
  if (!form) return;

  const fields = {
    name: $("logoBrandName"), slogan: $("logoSlogan"), industry: $("logoIndustry"),
    audience: $("logoAudience"),
    typography: $("logoTypography"), personality: $("logoPersonality"),
    format: $("logoFormat"), palette: $("logoPalette"),
    primary: $("logoPrimaryColor"), background: $("logoDarkColor"),
    ideaPrompt: $("logoIdeaPrompt"), ideaPromptWrap: $("logoIdeaPromptWrap")
  };
  const results = $("logoConceptResults");
  const status = $("logoStudioStatus");
  const empty = $("logoStudioEmpty");
  const customColors = $("logoCustomColors");
  const submit = form.querySelector('button[type="submit"]');
  const ideaModeInputs = Array.from(form.querySelectorAll('input[name="logoIdeaMode"]'));
  const getIdeaMode = () => ideaModeInputs.find(input => input.checked)?.value === "custom" ? "custom" : "navi";
  function updateIdeaMode() {
    const custom = getIdeaMode() === "custom";
    fields.ideaPromptWrap.hidden = !custom;
  }
  let frames = [];
  let selectedConcept = "";

  const palettes = {
    gold: "طلایی و سفید", blue: "آبی و نقره‌ای", green: "سبز و کرم",
    violet: "بنفش و یاسی", mono: "تک‌رنگ", custom: "رنگ اختصاصی"
  };
  const safeName = value => String(value || "nava-logo")
    .trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "nava-logo";
  const isLightCanvas = hex => {
    const value = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!value) return false;
    const channels = [0, 2, 4].map(i => parseInt(value[1].slice(i, i + 2), 16) / 255);
    const linear = channels.map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] >= 0.68;
  };

  function readBrief() {
    const option = fields.palette.selectedOptions[0];
    const custom = fields.palette.value === "custom";
    const requestedCanvas = custom ? fields.background.value : (option?.dataset.background || "#FFFFFF");
    return {
      brandName: fields.name.value.trim(),
      designMode: getIdeaMode(),
      designPrompt: getIdeaMode() === "custom" ? fields.ideaPrompt.value.trim() : "",
      slogan: fields.slogan.value.trim(),
      industry: fields.industry.value.trim(),
      audience: fields.audience.value.trim(),
      typography: fields.typography.selectedOptions[0]?.textContent.trim() || "",
      typographyValue: fields.typography.value,
      personality: fields.personality.selectedOptions[0]?.textContent.trim() || "",
      personalityValue: fields.personality.value,
      format: fields.format.value,
      formatLabel: fields.format.selectedOptions[0]?.textContent.trim() || "",
      palette: palettes[fields.palette.value] || fields.palette.value,
      primaryColor: custom ? fields.primary.value : (option?.dataset.foreground || "#22252B"),
      darkColor: isLightCanvas(requestedCanvas) ? requestedCanvas : "#FFFFFF"
    };
  }

  function previewDocument(concept, brief) {
    const primary = /^#[0-9a-f]{6}$/i.test(brief.primaryColor) ? brief.primaryColor : "#22252B";
    const background = /^#[0-9a-f]{6}$/i.test(brief.darkColor) ? brief.darkColor : "#FFFFFF";
    return [
      "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head>",
      "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
      "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}*,*::before,*::after{box-sizing:border-box}",
      ".logo-art-root{position:relative;width:100%;height:100%;min-height:100%;overflow:hidden;--logo-primary:" + primary + ";--logo-background:" + background + ";}",
      concept.css,
      // Keep the model's 1000×1000 design grid responsive inside phone-sized previews and exports.
      ".logo-art-root{width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:100%!important;max-height:100%!important;position:relative!important;overflow:hidden!important;box-sizing:border-box!important;container-type:size!important;}",
      "</style></head><body><main class=\"logo-art-root\">", concept.html, "</main></body></html>"
    ].join("");
  }

  function makeFrame(concept, brief) {
    const frame = document.createElement("iframe");
    frame.className = "logo-html-css-preview";
    frame.title = "پیش‌نمایش لوگوی " + brief.brandName + "؛ " + concept.title;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("loading", "eager");
    frame.__navaData = { ...brief };
    frame.__navaMarkup = previewDocument(concept, brief);
    return frame;
  }

  function updatePreviews() {
    const current = readBrief();
    frames.forEach(frame => {
      try {
        const root = frame.contentDocument?.querySelector(".logo-art-root");
        if (!root) return;
        const data = frame.__navaData || current;
        root.style.setProperty("--logo-primary", current.primaryColor);
        root.style.setProperty("--logo-background", current.darkColor);
        root.querySelectorAll('[data-logo-role="brand"]').forEach(el => {
          el.textContent = current.brandName;
        });
        root.querySelectorAll('[data-logo-role="slogan"]').forEach(el => {
          el.textContent = current.slogan;
        });
      } catch (_) {}
    });
  }

  function addStrategy(planning) {
    if (!planning) return;
    const panel = document.createElement("section");
    panel.className = "logo-design-brief";
    const title = document.createElement("h3");
    title.textContent = "ایده و جهت‌گیری طراحی";
    const core = document.createElement("p");
    core.textContent = planning.brandCore || "";
    const idea = document.createElement("p");
    idea.className = "logo-design-idea";
    idea.textContent = planning.designIdea || "";
    const strategy = document.createElement("p");
    strategy.textContent = planning.strategy || "";
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "مشاهده بریف تخصصی";
    const brief = document.createElement("p");
    brief.dir = "ltr";
    brief.lang = "en";
    brief.textContent = planning.designBriefEnglish || "";
    details.append(summary, brief);
    panel.append(title);
    if (idea.textContent) panel.append(idea);
    if (core.textContent) panel.append(core);
    if (strategy.textContent) panel.append(strategy);
    panel.append(details);
    results.append(panel);
  }

  function exportFeedback(message, link) {
    const feedback = document.createElement("div");
    feedback.className = "logo-export-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    if (link) {
      feedback.append(document.createTextNode(message + " "));
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.textContent = "بازکردن فایل";
      feedback.append(anchor);
    } else feedback.textContent = message;
    return feedback;
  }

  function showExportLink(feedback, message, link, filename) {
    feedback.replaceChildren();
    feedback.append(document.createTextNode(message + " "));
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.download = filename || "nava-logo.png";
    anchor.rel = "noopener";
    anchor.textContent = "دانلود PNG";
    feedback.append(anchor);
    const open = document.createElement("a");
    open.href = link;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = " · بازکردن تصویر";
    feedback.append(open);
  }

  async function waitForFrame(frame) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const root = frame.contentDocument?.querySelector(".logo-art-root");
      if (root) {
        const rect = root.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return;
      }
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    throw new Error("پیش‌نمایش لوگو در مرورگر آماده نشد.");
  }

  async function exportPng(frame, brief, index, feedback, button) {
    button.disabled = true;
    feedback.textContent = "در حال ساخت PNG با وضوح بالا…";
    try {
      await waitForFrame(frame);
      if (!window.NavaLogoRenderer?.exportPngFromFrame) {
        throw new Error("موتور خروجی PNG بارگذاری نشده است.");
      }
      const filename = safeName(brief.brandName) + "-logo-" + (index + 1) + ".png";
      const url = await window.NavaLogoRenderer.exportPngFromFrame(frame, filename, 2400);
      showExportLink(feedback, "فایل PNG آماده است؛ برای ذخیره روی لینک دریافت بزن.", url, filename);
      status.textContent = "فایل PNG آماده دریافت است.";
    } catch (error) {
      feedback.textContent = error?.message || "ساخت خروجی PNG ناموفق بود.";
      status.textContent = feedback.textContent;
    } finally {
      button.disabled = false;
    }
  }

  function downloadHtml(concept, brief, index, feedback, button) {
    button.disabled = true;
    feedback.textContent = "در حال آماده‌سازی فایل HTML قابل‌ویرایش…";
    try {
      const html = previewDocument(concept, brief);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeName(brief.brandName) + "-logo-" + (index + 1) + ".html";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      feedback.textContent = "فایل مستقل HTML/CSS آماده شد؛ می‌توانی آن را در مرورگر باز و کدش را ویرایش کنی.";
      status.textContent = "سورس قابل‌ویرایش مسیر «" + (concept.title || (index + 1)) + "» دریافت شد.";
    } catch (error) {
      feedback.textContent = error?.message || "ساخت فایل HTML ناموفق بود.";
    } finally {
      button.disabled = false;
    }
  }

  function conceptCard(concept, index, brief) {
    const card = document.createElement("article");
    card.className = "logo-concept-card";
    const preview = document.createElement("div");
    preview.className = "logo-concept-preview";
    const frame = makeFrame(concept, brief);
    frames.push(frame);
    preview.append(frame);

    const copy = document.createElement("div");
    copy.className = "logo-concept-copy";
    const heading = document.createElement("h3");
    heading.textContent = concept.title || "مسیر طراحی " + (index + 1);
    const rationale = document.createElement("p");
    rationale.textContent = concept.rationale || "";
    copy.append(heading, rationale);
    const strategy = document.createElement("div");
    strategy.className = "logo-concept-strategy";
    const strategyRows = [
      ["ایده مرکزی", concept.centralThesis],
      ["ارتباط با درخواست", concept.briefAlignment],
      ["تبدیل ایده به نماد", concept.symbolConstruction],
      ["عناصر اصلی بریف", Array.isArray(concept.briefElements) ? concept.briefElements.join("، ") : ""],
      ["منطق شکل‌گیری", concept.mechanism],
      ["ویژگی متمایز", concept.expressionMove],
      ["تفاوت این مسیر", concept.differsBy],
      ["بازبینی و اصلاح بصری", concept.visualRevisionNotes],
      ["برداشت در نگاه اول", concept.firstRead],
      ["ارزیابی کیفیت بصری", concept.visualQuality ? "تشخیص " + concept.visualQuality.recognitionScore + "/10 · وفاداری به بریف " + concept.visualQuality.briefFidelityScore + "/10 · پرداخت " + concept.visualQuality.craftScore + "/10" : ""],
      ["علت رد اصلاح", concept.visualReviewIssue]
    ];
    strategyRows.forEach(([label, value]) => {
      if (!value) return;
      const line = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = label + " · ";
      line.append(strong, document.createTextNode(value));
      strategy.append(line);
    });
    if (concept.axes && typeof concept.axes === "object") {
      const axes = Object.entries(concept.axes).slice(0, 4)
        .map(([label, value]) => label + ": " + value).join("  ·  ");
      if (axes) {
        const line = document.createElement("p");
        line.className = "logo-concept-axes";
        line.textContent = "جایگاه هویتی: " + axes;
        strategy.append(line);
      }
    }
    if (Array.isArray(concept.defaultsUsed) && concept.defaultsUsed.length) {
      const line = document.createElement("p");
      line.className = "logo-concept-defaults";
      line.textContent = "انتخاب‌های آشنا با دلیل: " + concept.defaultsUsed.join("؛ ");
      strategy.append(line);
    }
    if (strategy.childElementCount) copy.append(strategy);

    const actions = document.createElement("div");
    actions.className = "logo-concept-actions";

    const chooseButton = document.createElement("button");
    chooseButton.type = "button";
    chooseButton.className = "btn-secondary";
    chooseButton.dataset.logoSelect = "true";
    chooseButton.textContent = "انتخاب این مسیر";
    chooseButton.addEventListener("click", () => {
      selectedConcept = concept.id || String(index + 1);
      results.querySelectorAll(".logo-concept-card").forEach(item => {
        const selected = item === card;
        item.classList.toggle("is-selected", selected);
        const control = item.querySelector("[data-logo-select]");
        if (control) control.textContent = selected ? "این مسیر انتخاب شده" : "انتخاب این مسیر";
      });
      status.textContent = "مسیر «" + (concept.title || (index + 1)) + "» انتخاب شد؛ خروجی PNG یا فایل HTML/CSS قابل‌ویرایش آن را دریافت کن.";
    });

    const htmlButton = document.createElement("button");
    htmlButton.type = "button";
    htmlButton.className = "btn-secondary";
    htmlButton.textContent = "دریافت سورس HTML/CSS";
    const feedback = exportFeedback("آماده دریافت خروجی.");
    htmlButton.addEventListener("click", () => downloadHtml(concept, brief, index, feedback, htmlButton));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-primary";
    button.textContent = "دریافت PNG باکیفیت";
    button.addEventListener("click", () => exportPng(frame, brief, index, feedback, button));
    actions.append(chooseButton, htmlButton, button);
    card.append(preview, copy, actions, feedback);
    return card;
  }

  function mountConcepts(concepts, brief, planning) {
    results.replaceChildren();
    frames = [];
    selectedConcept = "";
    addStrategy(planning);
    concepts.forEach((concept, index) => {
      const card = conceptCard(concept, index, brief);
      results.append(card);
      const frame = card.querySelector("iframe.logo-html-css-preview");
      if (frame) {
        const box = frame.parentElement;
        const width = box?.getBoundingClientRect().width || 0;
        if (box && width > 0) box.style.height = Math.round(width) + "px";
        frame.srcdoc = frame.__navaMarkup;
        delete frame.__navaMarkup;
      }
    });
    return frames.slice();
  }

  function getSession() {
    let token = "";
    try {
      token = localStorage.getItem("nava_navi_session") ||
        sessionStorage.getItem("nava_navi_session") || "";
    } catch (_) {}
    let visitorId = "";
    if (!token) {
      try { visitorId = localStorage.getItem("nava_guest_trial_id") || ""; } catch (_) {}
      if (!/^[a-f0-9-]{32,40}$/i.test(visitorId)) {
        visitorId = crypto.randomUUID
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16)),
            b => b.toString(16).padStart(2, "0")).join("");
        try { localStorage.setItem("nava_guest_trial_id", visitorId); } catch (_) {}
      }
    }
    return { token, visitorId };
  }

  async function visuallyRefineConcepts(concepts, brief, reviewToken, headers) {
    if (!reviewToken || !window.NavaLogoRenderer?.capturePreviewDataUrl) {
      throw new Error("مجوز یا ابزار ثبت تصویر برای بازبینی بصری آماده نیست.");
    }
    const activeFrames = frames.slice(0, concepts.length);
    const renderedConcepts = await Promise.all(concepts.map(async (concept, index) => {
      const frame = activeFrames[index];
      if (!frame) throw new Error("یکی از قاب‌های لوگو برای بازبینی پیدا نشد.");
      await waitForFrame(frame);
      const previewImage = await window.NavaLogoRenderer.capturePreviewDataUrl(frame, 640);
      return {
        title: concept.title,
        centralThesis: concept.centralThesis,
        symbolConstruction: concept.symbolConstruction,
        briefElements: concept.briefElements,
        briefAlignment: concept.briefAlignment,
        visualAnchors: concept.visualAnchors,
        anchorMap: concept.anchorMap,
        html: concept.html,
        css: concept.css,
        previewImage
      };
    }));
    // Review one rendered concept per request. A single oversized or malformed
    // batch must not cancel the visual review of every other concept.
    const reviewed = [];
    const rejectionReasons = [];
    let refinedCount = 0;
    for (let index = 0; index < renderedConcepts.length; index += 1) {
      const source = concepts[index];
      let accepted = null;
      let lastCode = "LOGO_REVIEW_REJECTED";
      for (let attempt = 1; attempt <= 2 && !accepted; attempt += 1) {
        try {
          const response = await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate", {
            method: "POST",
            headers,
            cache: "no-store",
            body: JSON.stringify({
              ...brief,
              action: "visual-refine",
              reviewToken,
              revisionAttempt: attempt,
              previousReviewIssue: attempt === 2 ? lastCode : "",
              concepts: [renderedConcepts[index]]
            })
          });
          const result = await response.json();
          if (!response.ok || !result.success ||
              !Array.isArray(result.concepts) || result.concepts.length !== 1) {
            lastCode = result.code || ("HTTP_" + response.status);
            continue;
          }
          const concept = result.concepts[0];
          if (concept.visualReview === "refined") {
            accepted = concept;
            refinedCount += 1;
            break;
          }
          lastCode = concept.visualReviewIssue || "LOGO_REVIEW_REJECTED";
        } catch (error) {
          const match = String(error?.message || "").match(/\[([A-Z0-9_]+)\]/);
          lastCode = match?.[1] || "LOGO_REVIEW_NETWORK_ERROR";
        }
      }
      if (accepted) reviewed.push(accepted);
      else {
        rejectionReasons.push({ index: index + 1, code: lastCode });
        reviewed.push({ ...source, visualReview: "rejected", visualReviewIssue: lastCode });
      }
    }
    return {
      success: true,
      visualReview: { method: "render-review-refine-per-concept", reviewedCount: reviewed.length, refinedCount, rejectionReasons },
      concepts: reviewed
    };
  }

  async function generate(event) {
    event?.preventDefault();
    const brief = readBrief();
    if (!brief.brandName) {
      status.textContent = "نام برند را وارد کن.";
      fields.name.focus();
      return;
    }
    if (brief.designMode === "custom" && !brief.designPrompt) {
      status.textContent = "ایده یا خواسته طراحی خودت را بنویس؛ یا حالت ایده‌پردازی ناوی را انتخاب کن.";
      fields.ideaPrompt.focus();
      return;
    }
    const { token, visitorId } = getSession();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    submit.disabled = true;
    submit.textContent = "در حال طراحی…";
    status.textContent = "نوا در حال بررسی هویت برند، ساخت مسیرهای مفهومی و طراحی سه لوگوی مستقل است.";
    try {
      const response = await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate", {
        method: "POST", headers, cache: "no-store",
        body: JSON.stringify({ ...brief, singleConcept: false, visitorId })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const diagnostic = result.code
          ? " [" + result.code + (result.stage ? " / " + result.stage : "") +
            (result.conceptIndex ? " / طرح " + result.conceptIndex : "") + "]"
          : "";
        throw new Error((result.error || "طراحی لوگو انجام نشد.") + diagnostic);
      }
      if (!Array.isArray(result.concepts) || result.concepts.length < 1 || result.concepts.length > 3) {
        throw new Error("پاسخ موتور طراحی معتبر نیست؛ طرح قابل‌قبولی دریافت نشد.");
      }
      let finalConcepts = result.concepts;
      empty.hidden = false;
      status.textContent = "مرحله ۱ از ۳ · ناوی بریف و ایده‌های بصری را می‌سازد. مرحله ۲ · موتور HTML/CSS طرح‌ها را می‌سازد. مرحله ۳ · ناوی رندر واقعی را می‌بیند و آزمون تشخیص‌پذیری انجام می‌دهد.";
      submit.textContent = "ناوی در حال داوری و اصلاح…";
      try {
        const visualReview = await visuallyRefineConcepts(
          finalConcepts, brief, result.reviewToken, headers
        );
        finalConcepts = visualReview.concepts.filter(concept => concept.visualReview === "refined");
        if (finalConcepts.length) {
          mountConcepts(finalConcepts, brief, result.planning);
          empty.hidden = true;
        } else {
          results.replaceChildren();
          empty.hidden = false;
        }
        const refinedCount = Number(visualReview.visualReview?.refinedCount || 0);
        const rejectionDetails = Array.isArray(visualReview.visualReview?.rejectionReasons)
          ? visualReview.visualReview.rejectionReasons
              .map(item => "طرح " + item.index + ": " + item.code)
              .join("؛ ")
          : "";
        status.textContent = refinedCount > 0
          ? "ناوی " + refinedCount + " طرح را پس از مشاهده رندر واقعی و عبور از آزمون کیفیت تأیید کرد." +
            (finalConcepts.length < 3 ? " طرح‌های مبهم یا ضعیف نمایش داده نشدند." : "") +
            (rejectionDetails ? " ردشده‌ها: " + rejectionDetails : "")
          : "هیچ طرحی از آزمون تشخیص‌پذیری و کیفیت ناوی عبور نکرد؛ طرح خام و مبهم نمایش داده نشد." +
            (rejectionDetails ? " علت دقیق: " + rejectionDetails : "");
      } catch (reviewError) {
        results.replaceChildren();
        empty.hidden = false;
        status.textContent = "بازبینی کیفیت کامل نشد؛ برای جلوگیری از نمایش لوگوی ضعیف، خروجی خام نشان داده نشد. " +
          (reviewError?.message || "خطای نامشخص در بازبینی.");
      }
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      status.textContent = error?.message || "ارتباط با موتور طراحی برقرار نشد.";
    } finally {
      submit.disabled = false;
      submit.textContent = "طراحی سه لوگو با نوا";
    }
  }

  ideaModeInputs.forEach(input => input.addEventListener("change", updateIdeaMode));
  updateIdeaMode();
  fields.palette.addEventListener("change", () => {
    customColors.hidden = fields.palette.value !== "custom";
    updatePreviews();
  });
  [fields.name, fields.slogan, fields.primary, fields.background].forEach(field => {
    field.addEventListener("input", updatePreviews);
    field.addEventListener("change", updatePreviews);
  });
  form.addEventListener("reset", () => setTimeout(() => {
    customColors.hidden = fields.palette.value !== "custom";
    updateIdeaMode();
    updatePreviews();
  }, 0));
  form.addEventListener("submit", generate);
})();
