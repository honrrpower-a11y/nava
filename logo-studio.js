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
    frame.srcdoc = documentHtml;
    frame.addEventListener("load", syncLiveEdits);
    return frame;
  }

  function createVectorExport(frame, data) {
    if (!window.NavaLogoRenderer) throw new Error("موتور بازسازی برداری بارگذاری نشده است.");
    return window.NavaLogoRenderer.buildSvg(frame, {
      brandName: fields.name.value.trim() || data.brandName,
      width: 1200,
      height: 1200
    });
  }

  function reportExportWarnings(warnings) {
    if (warnings && warnings.length) {
      status.textContent = "خروجی برداری ساخته شد؛ نکته: " + warnings.join(" ");
    }
  }

  function downloadSvg(concept, frame, data, index) {
    try {
      status.textContent = "در حال بازسازی هندسه و تایپوگرافی به SVG برداری...";
      const result = createVectorExport(frame, data);
      const blob = new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" });
      window.NavaLogoRenderer.downloadBlob(
        blob,
        safeFileName(fields.name.value || data.brandName) + "-logo-concept-" + (index + 1) + ".svg"
      );
      reportExportWarnings(result.warnings);
      if (!result.warnings.length) status.textContent = "فایل SVG برداری و بدون foreignObject آماده شد.";
    } catch (error) {
      const details = error.details && error.details.length ? " " + error.details.join(" ") : "";
      status.textContent = (error.message || "بازسازی SVG ناموفق بود.") + details;
    }
  }

  async function downloadPng(concept, frame, data, index) {
    try {
      status.textContent = "در حال ساخت PNG با وضوح ۲۴۰۰ پیکسل...";
      const result = createVectorExport(frame, data);
      await window.NavaLogoRenderer.exportPng(
        result.svg,
        safeFileName(fields.name.value || data.brandName) + "-logo-concept-" + (index + 1) + ".png",
        2400
      );
      reportExportWarnings(result.warnings);
      if (!result.warnings.length) status.textContent = "فایل PNG با وضوح ۲۴۰۰ پیکسل آماده شد.";
    } catch (error) {
      const details = error.details && error.details.length ? " " + error.details.join(" ") : "";
      status.textContent = (error.message || "ساخت PNG ناموفق بود.") + details;
    }
  }

  function syncLiveEdits() {
    const current = readData();
    activeFrames.forEach(frame => {
      try {
        const doc = frame.contentDocument;
        const root = doc && doc.querySelector(".logo-art-root");
        if (!root) return;
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

    const copy = document.createElement("div");
    copy.className = "logo-concept-copy";
    const title = document.createElement("h3");
    title.textContent = concept.title || "مسیر طراحی " + (index + 1);
    const rationale = document.createElement("p");
    rationale.textContent = concept.rationale || "این لوگو بر اساس بریف برند طراحی شده است.";
    copy.append(title, rationale);
    card.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "logo-concept-actions";
    const svgButton = document.createElement("button");
    svgButton.type = "button";
    svgButton.className = "btn-primary";
    svgButton.textContent = "دریافت SVG برداری";
    svgButton.addEventListener("click", () => downloadSvg(concept, frame, data, index));
    const pngButton = document.createElement("button");
    pngButton.type = "button";
    pngButton.className = "btn-secondary";
    pngButton.textContent = "دریافت PNG باکیفیت";
    pngButton.addEventListener("click", () => downloadPng(concept, frame, data, index));
    actions.append(svgButton, pngButton);
    card.appendChild(actions);
    return card;
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
  }, 0));

  async function requestLogoDesign() {
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
    status.textContent = "NAVI ابتدا بریف تخصصی انگلیسی را می‌نویسد و سپس سه لوگو را با HTML و CSS طراحی می‌کند. این کار ممکن است کمی زمان ببرد.";

    try {
      const response = await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate", {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({ ...data, visitorId })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "طراحی لوگو انجام نشد.");
      }
      if (!Array.isArray(result.concepts) || result.concepts.length !== 3) {
        throw new Error("خروجی طراحی کامل نیست؛ دوباره تلاش کن.");
      }
      results.replaceChildren();
      activeFrames = [];
      if (result.planning) addStrategySummary(result.planning);
      result.concepts.forEach((concept, index) => {
        results.appendChild(buildCard(concept, index, data));
      });
      empty.hidden = true;
      status.textContent = "سه طرح آماده‌اند. نام، شعار و رنگ‌ها را از فرم تغییر بده تا پیش‌نمایش‌ها زنده به‌روزرسانی شوند؛ سپس SVG برداری یا PNG بگیر.";
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      status.textContent = error.message || "ارتباط با موتور طراحی برقرار نشد؛ کمی بعد دوباره تلاش کن.";
    } finally {
      submit.disabled = false;
      submit.textContent = "طراحی سه لوگو با NAVI";
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    requestLogoDesign();
  });
})();
