"use strict";
(function initNavaLogoStudio() {
  const $ = id => document.getElementById(id);
  const form = $("logoStudioForm");
  if (!form) return;

  const fields = {
    name: $("logoBrandName"), slogan: $("logoSlogan"), industry: $("logoIndustry"),
    audience: $("logoAudience"), symbolIdea: $("logoSymbolIdea"),
    personality: $("logoPersonality"), typography: $("logoTypography"),
    format: $("logoFormat"), palette: $("logoPalette"),
    primaryColor: $("logoPrimaryColor"), darkColor: $("logoDarkColor")
  };
  const results = $("logoConceptResults");
  const status = $("logoStudioStatus");
  const empty = $("logoStudioEmpty");
  const customColors = $("logoCustomColors");
  let activeFrames = [];
  const paletteNames = {
    gold: "طلایی و سرمه‌ای", blue: "آبی و نقره‌ای", green: "سبز و کرم",
    violet: "بنفش و یاسی", mono: "تک‌رنگ", custom: "رنگ اختصاصی"
  };
  const safeFileName = value => String(value || "nava-logo").trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "nava-logo";

  function readData() {
    const paletteKey = fields.palette.value;
    return {
      brandName: fields.name.value.trim(),
      slogan: fields.slogan.value.trim(),
      industry: fields.industry.value.trim(),
      audience: fields.audience.value.trim(),
      symbolIdea: fields.symbolIdea.value.trim(),
      personality: fields.personality.selectedOptions[0]?.textContent.trim() || "",
      personalityValue: fields.personality.value,
      typography: fields.typography.selectedOptions[0]?.textContent.trim() || "",
      typographyValue: fields.typography.value,
      format: fields.format.value,
      formatLabel: fields.format.selectedOptions[0]?.textContent.trim() || "",
      palette: paletteNames[paletteKey] || paletteKey,
      primaryColor: paletteKey === "custom"
        ? fields.primaryColor.value
        : (fields.palette.selectedOptions[0]?.dataset.foreground || ""),
      darkColor: paletteKey === "custom"
        ? fields.darkColor.value
        : (fields.palette.selectedOptions[0]?.dataset.background || "")
    };
  }

  function createPreview(concept, data) {
    const frame = document.createElement("iframe");
    frame.className = "logo-html-css-preview";
    frame.title = "پیش‌نمایش لوگوی " + data.brandName + "؛ " + concept.title;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("loading", "eager");
    frame.style.display = "block";
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.minHeight = "0";
    frame.style.border = "0";
    const documentHtml = [
      "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head>",
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
      "<style>",
      "html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}",
      "*,*::before,*::after{box-sizing:border-box}",
      ".logo-art-root{width:100%;height:100%;min-height:100%;position:relative;overflow:hidden;--logo-primary:" + data.primaryColor + ";--logo-background:" + data.darkColor + ";}",
      concept.css,
      "</style></head><body><main class=\"logo-art-root\">",
      concept.html,
      "</main></body></html>"
    ].join("");
    let resolvePreviewReady;
    frame.__navaPreviewReady = new Promise(resolve => { resolvePreviewReady = resolve; });
    frame.addEventListener("load", () => {
      // Do not use doc.URL to identify srcdoc: browser engines can expose
      // different about: URLs while the iframe navigates. The artboard itself
      // is the authoritative readiness signal.
      try {
        const doc = frame.contentDocument;
        const root = doc && doc.querySelector(".logo-art-root");
        if (!root) return; // Ignore the iframe's initial empty-document load.
        syncLiveEdits();
        const rect = root.getBoundingClientRect();
        const hasPaint = element => {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) return false;
          const style = doc.defaultView.getComputedStyle(element);
          const before = doc.defaultView.getComputedStyle(element, "::before");
          const after = doc.defaultView.getComputedStyle(element, "::after");
          const painted = value => value && value !== "none" && value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
          return !!element.textContent.trim() || painted(style.backgroundColor) || painted(style.backgroundImage) ||
            (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none") ||
            painted(before.backgroundColor) || painted(before.backgroundImage) || painted(after.backgroundColor) || painted(after.backgroundImage);
        };
        // Include the artboard itself: many polished CSS marks are composed
        // entirely from its background and ::before/::after pseudo-elements.
        const visibleContent = hasPaint(root) || Array.from(root.querySelectorAll("*")).some(hasPaint);
        if (!rect.width || !rect.height) {
          frame.__navaPreviewError = "بوم طراحی ابعاد معتبر ندارد.";
          status.textContent = "پیش‌نمایش بارگذاری شد، اما بوم طراحی ابعاد معتبر ندارد. طرح برای بررسی فنی نگه داشته شد.";
        } else if (!visibleContent && !root.textContent.trim()) {
          frame.__navaPreviewError = "هیچ عنصر قابل‌مشاهده‌ای در HTML/CSS طرح پیدا نشد.";
          status.textContent = "کد طرح دریافت شد، اما عناصر بصری آن نمایش داده نمی‌شوند؛ این طرح خالی است و باید اصلاح شود.";
        } else {
          frame.__navaPreviewError = "";
        }
      } catch (_) {
        frame.__navaPreviewError = "دسترسی به محتوای پیش‌نمایش ایزوله ممکن نشد.";
        status.textContent = "مرورگر نتوانست محتوای ایزوله پیش‌نمایش را بخواند.";
      } finally {
        // Resolve only after this iframe has navigated to a document containing
        // the actual artboard. waitForPreview independently verifies its layout.
        if (frame.contentDocument && frame.contentDocument.querySelector(".logo-art-root")) {
          resolvePreviewReady();
        }
      }
    });
    // Register the load handler before assigning srcdoc so fast mobile WebViews
    // cannot complete the document before readiness diagnostics are attached.
    frame.__navaDocumentHtml = documentHtml;
    return frame;
  }

  function showExportFallback(feedback, url, filename) {
    if (!feedback || !url) return;
    const message = document.createElement("span");
    message.textContent = "اگر فایل خودکار ذخیره نشد، از این پیوند استفاده کن: ";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "بازکردن فایل " + filename;
    link.style.color = "var(--gold)";
    link.style.textDecoration = "underline";
    feedback.replaceChildren(message, link);
  }

  async function waitForPreview(frame) {
    if (!frame) throw new Error("قاب پیش‌نمایش لوگو ساخته نشده است.");
    // Chrome and Firefox may dispatch iframe load events at slightly different
    // points around srcdoc navigation. Poll the actual document and artboard
    // geometry instead of treating a single load event as proof of readiness.
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      let doc = null;
      let root = null;
      try {
        doc = frame.contentDocument;
        root = doc && doc.querySelector(".logo-art-root");
        if (root) {
          const rect = root.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            if (frame.__navaPreviewError) throw new Error(frame.__navaPreviewError);
            return;
          }
        }
      } catch (error) {
        if (error && error.message && error.message !== "Cannot read properties of null (reading 'getBoundingClientRect')") {
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("بوم لوگو در iframe پس از ۱۲ ثانیه آماده نشد؛ سند یا اندازه بوم در مرورگر قابل‌دسترسی نیست.");
  }

  async function downloadPng(concept, frame, data, index, feedback) {
    try {
      status.textContent = "در حال آماده‌سازی تصویر با وضوح ۲۴۰۰ پیکسل...";
      await waitForPreview(frame);
      if (frame.__navaPreviewError) throw new Error(frame.__navaPreviewError);
      const filename = safeFileName(fields.name.value || data.brandName) + "-logo-concept-" + (index + 1) + ".png";
      if (!window.NavaLogoRenderer || typeof window.NavaLogoRenderer.exportPngFromFrame !== "function") {
        throw new Error("موتور خروجی مستقیم PNG بارگذاری نشده است.");
      }
      // PNG is the sole deliverable and captures the browser-rendered HTML/CSS artboard.
      const url = await window.NavaLogoRenderer.exportPngFromFrame(frame, filename, 2400);
      showExportFallback(feedback, url, filename);
      status.textContent = "فایل PNG با وضوح ۲۴۰۰ پیکسل از پیش‌نمایش واقعی HTML/CSS ساخته شد.";
    } catch (error) {
      const details = error.details && error.details.length ? " " + error.details.join(" ") : "";
      const message = (error.message || "ساخت PNG ناموفق بود.") + details;
      status.textContent = message;
      if (feedback) feedback.textContent = message;
    }
  }

  function syncLiveEdits() {
    const current = readData();
    activeFrames.forEach(frame => {
      try {
        const doc = frame.contentDocument;
        const root = doc && doc.querySelector(".logo-art-root");
        if (!root) return;
        const frameData = frame.__navaData || current;
        root.style.setProperty("--logo-primary", frameData.primaryColor || current.primaryColor);
        root.style.setProperty("--logo-background", frameData.darkColor || current.darkColor);
        root.querySelectorAll('[data-logo-role="brand"]').forEach(el => {
          el.textContent = frameData.brandName ?? current.brandName;
        });
        root.querySelectorAll('[data-logo-role="slogan"]').forEach(el => {
          el.textContent = frameData.slogan ?? current.slogan;
        });
      } catch (_) {}
    });
  }

  function addStrategySummary(planning) {
    const panel = document.createElement("section");
    panel.className = "logo-ai-strategy-summary";
    const heading = document.createElement("h3");
    heading.textContent = "بریف و تصمیم طراحی NAVI";
    const core = document.createElement("p");
    core.textContent = planning.brandCore || "";
    const strategy = document.createElement("p");
    strategy.textContent = planning.strategy || "";
    const details = document.createElement("details");
    details.className = "logo-english-brief";
    const summary = document.createElement("summary");
    summary.textContent = "مشاهده بریف تخصصی انگلیسی NAVI";
    const brief = document.createElement("p");
    brief.dir = "ltr";
    brief.lang = "en";
    brief.textContent = planning.designBriefEnglish || "";
    details.append(summary, brief);
    panel.append(heading, core, strategy, details);
    results.appendChild(panel);
  }

  function buildCard(concept, index, data) {
    const card = document.createElement("article");
    card.className = "logo-concept-card logo-html-css-card";
    const preview = document.createElement("div");
    preview.className = "logo-concept-preview logo-html-css-preview";
    const frame = createPreview(concept, data);
    frame.__navaData = { brandName: data.brandName, slogan: data.slogan };
    activeFrames.push(frame);
    preview.appendChild(frame);
    card.appendChild(preview);
    // The caller mounts the complete card in #logoConceptResults first, then
    // assigns srcdoc. This guarantees the iframe has a real square viewport.
    const copy = document.createElement("div");
    copy.className = "logo-concept-copy";
    const title = document.createElement("h3");
    title.textContent = concept.title || "مسیر طراحی " + (index + 1);
    const rationale = document.createElement("p");
    rationale.textContent = concept.rationale || "این لوگو بر اساس بریف برند طراحی شده است.";
    copy.append(title, rationale);
    card.appendChild(copy);

    const feedback = document.createElement("div");
    feedback.className = "logo-export-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "logo-concept-actions";
    const pngButton = document.createElement("button");
    pngButton.type = "button";
    pngButton.className = "btn-primary";
    pngButton.textContent = "دریافت PNG باکیفیت";
    pngButton.addEventListener("click", () => downloadPng(concept, frame, data, index, feedback));
    actions.append(pngButton);
    card.appendChild(actions);
    card.appendChild(feedback);
    return card;
  }


  function installNoQuotaDiagnostic() {
    const button = $("logoNoQuotaDiagnostic");
    if (!button) return;
    button.addEventListener("click", runNoQuotaDiagnostic);
  }

  async function runNoQuotaDiagnostic() {
    // This button now exercises the real NAVI design engine with the supplied
    // Awaye Nava brief; it is no longer a hard-coded rendering sample.
    fields.name.value = "Awaye Nava";
    fields.slogan.value = "";
    fields.industry.value = "Modern music and art brand";
    fields.audience.value = "People who appreciate contemporary music and art";
    fields.symbolIdea.value = "A fluid abstract wave intertwined with a sleek, solid musical note; create one distinctive unified silhouette.";
    fields.personality.value = "elegant";
    fields.typography.value = "elegant";
    fields.format.value = "combination";
    fields.palette.value = "custom";
    fields.primaryColor.value = "#101B30";
    fields.darkColor.value = "#FFFFFF";
    customColors.hidden = false;
    syncLiveEdits();

    const designPrompt = "A minimalist, elegant vector logo for a modern music and art brand named 'Awaye Nava'. The symbol is a creative, fluid abstract wave intertwined with a sleek, solid musical note, symbolizing fresh acoustic sound. Clean lines, sophisticated deep navy blue and matte gold color palette, balanced composition, high-end branding style, flat vector art on a clean white background --no realistic details, complex gradients, or clutter";
    const button = $("logoNoQuotaDiagnostic");
    if (button) button.disabled = true;
    try {
      await requestLogoDesign({ singleConcept: true, designPrompt });
    } finally {
      if (button) button.disabled = false;
    }
  }

  fields.palette.addEventListener("change", () => {
    customColors.hidden = fields.palette.value !== "custom";
    syncLiveEdits();
  });
  [fields.name, fields.slogan, fields.primaryColor, fields.darkColor].forEach(field => {
    field.addEventListener("input", syncLiveEdits);
    field.addEventListener("change", syncLiveEdits);
  });
  form.addEventListener("reset", () => setTimeout(() => {
    customColors.hidden = fields.palette.value !== "custom";
    syncLiveEdits();
  }, 0));

  // Keep every artboard square when the phone rotates or the layout changes.
  window.addEventListener("resize", () => {
    activeFrames.forEach(frame => {
      const previewBox = frame.parentElement;
      const width = previewBox && previewBox.getBoundingClientRect().width;
      if (width > 0) previewBox.style.height = Math.round(width) + "px";
    });
  });

  async function requestLogoDesign(options = {}) {
    const data = readData();
    if (!data.brandName) {
      status.textContent = "نام برند را وارد کن.";
      fields.name.focus();
      return;
    }

    let token = "";
    try {
      token = localStorage.getItem("nava_navi_session") ||
        sessionStorage.getItem("nava_navi_session") || "";
    } catch (_) {}

    let visitorId = "";
    if (!token) {
      try { visitorId = localStorage.getItem("nava_guest_trial_id") || ""; } catch (_) {}
      if (!/^[a-f0-9-]{32,40}$/i.test(visitorId)) {
        visitorId = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16)),
            byte => byte.toString(16).padStart(2, "0")).join("");
        try { localStorage.setItem("nava_guest_trial_id", visitorId); } catch (_) {}
      }
    }

    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "NAVI در حال طراحی لوگو...";
    status.textContent = "NAVI سه ایده مستقل را طراحی می‌کند و هرکدام را با HTML و CSS از پایه می‌سازد. این کار ممکن است کمی زمان ببرد.";

    try {
      const response = await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate", {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({ ...data, singleConcept: options.singleConcept === true, designPrompt: options.designPrompt || "", visitorId })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "طراحی لوگو انجام نشد.");
      }
      const expectedConcepts = options.singleConcept === true ? 1 : 3;
      if (!Array.isArray(result.concepts) || result.concepts.length !== expectedConcepts) {
        throw new Error("خروجی طراحی کامل نیست؛ دوباره تلاش کن.");
      }
      results.replaceChildren();
      activeFrames = [];
      if (result.planning) addStrategySummary(result.planning);
      result.concepts.forEach((concept, index) => {
        const card = buildCard(concept, index, data);
        results.appendChild(card);
        // Do not initialize srcdoc while the card is detached. Mobile browsers
        // can otherwise lay out the iframe at 0x0 and keep that invalid canvas.
        const frame = card.querySelector("iframe.logo-html-css-preview");
        if (frame && frame.__navaDocumentHtml) {
          // Force a real square layout before the mobile WebView creates the
          // srcdoc browsing context. Appending the card alone is not enough:
          // some WebViews defer aspect-ratio layout until the next paint.
          const previewBox = frame.parentElement;
          const previewWidth = previewBox ? previewBox.getBoundingClientRect().width : 0;
          if (previewBox && previewWidth > 0) {
            previewBox.style.height = Math.round(previewWidth) + "px";
            frame.getBoundingClientRect(); // synchronously flush iframe geometry
          } else if (previewBox) {
            previewBox.style.height = "320px";
          }
          frame.srcdoc = frame.__navaDocumentHtml;
          delete frame.__navaDocumentHtml;
        }
      });
      empty.hidden = true;
      status.textContent = options.singleConcept === true ? "یک طرح اختصاصی بر اساس پرامپت نمونه NAVI آماده شد؛ پیش‌نمایش و خروجی PNG را بررسی کن." : "سه طرح آماده‌اند. نام، شعار و رنگ‌ها را از فرم تغییر بده تا پیش‌نمایش‌ها زنده به‌روزرسانی شوند؛ سپس PNG باکیفیت بگیر.";
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      status.textContent = error.message || "ارتباط با موتور طراحی برقرار نشد؛ کمی بعد دوباره تلاش کن.";
    } finally {
      submit.disabled = false;
      submit.textContent = "طراحی سه لوگو با NAVI";
    }
  }

  installNoQuotaDiagnostic();

  form.addEventListener("submit", event => {
    event.preventDefault();
    requestLogoDesign();
  });
})();
