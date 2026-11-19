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
    frame.setAttribute("sandbox", "");
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
    return frame;
  }

  function downloadSvg(concept, data, index) {
    const blob = new Blob([concept.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFileName(data.brandName) + "-logo-concept-" + (index + 1) + ".svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status.textContent = "فایل SVG لوگو آماده شد.";
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
    preview.appendChild(createPreview(concept, data));
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
    svgButton.textContent = "دریافت خروجی SVG";
    svgButton.addEventListener("click", () => downloadSvg(concept, data, index));
    actions.appendChild(svgButton);
    card.appendChild(actions);
    return card;
  }

  fields.palette.addEventListener("change", () => {
    customColors.hidden = fields.palette.value !== "custom";
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
      if (result.planning) addStrategySummary(result.planning);
      result.concepts.forEach((concept, index) => {
        results.appendChild(buildCard(concept, index, data));
      });
      empty.hidden = true;
      status.textContent = "سه لوگوی طراحی‌شده توسط NAVI آماده‌اند. هر طرح را بررسی کن و خروجی SVG آن را دریافت کن.";
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
