"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const form = $("logoStudioForm");
  if (!form) return;

  const fields = {
    name: $("logoBrandName"), slogan: $("logoSlogan"), industry: $("logoIndustry"),
    audience: $("logoAudience"), symbolIdea: $("logoSymbolIdea"),
    typography: $("logoTypography"), personality: $("logoPersonality"),
    format: $("logoFormat"), palette: $("logoPalette"),
    primary: $("logoPrimaryColor"), background: $("logoDarkColor")
  };
  const results = $("logoConceptResults");
  const status = $("logoStudioStatus");
  const empty = $("logoStudioEmpty");
  const customColors = $("logoCustomColors");
  const submit = form.querySelector('button[type="submit"]');
  let frames = [];

  const palettes = {
    gold: "طلایی و سفید", blue: "آبی و نقره‌ای", green: "سبز و کرم",
    violet: "بنفش و یاسی", mono: "تک‌رنگ", custom: "رنگ اختصاصی"
  };
  const safeName = value => String(value || "nava-logo")
    .trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "nava-logo";

  function readBrief() {
    const option = fields.palette.selectedOptions[0];
    const custom = fields.palette.value === "custom";
    return {
      brandName: fields.name.value.trim(),
      slogan: fields.slogan.value.trim(),
      industry: fields.industry.value.trim(),
      audience: fields.audience.value.trim(),
      symbolIdea: fields.symbolIdea.value.trim(),
      typography: fields.typography.selectedOptions[0]?.textContent.trim() || "",
      typographyValue: fields.typography.value,
      personality: fields.personality.selectedOptions[0]?.textContent.trim() || "",
      personalityValue: fields.personality.value,
      format: fields.format.value,
      formatLabel: fields.format.selectedOptions[0]?.textContent.trim() || "",
      palette: palettes[fields.palette.value] || fields.palette.value,
      primaryColor: custom ? fields.primary.value : (option?.dataset.foreground || "#22252B"),
      darkColor: custom ? fields.background.value : (option?.dataset.background || "#FFFFFF")
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
    frame.srcdoc = previewDocument(concept, brief);
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
    title.textContent = "جهت‌گیری طراحی";
    const core = document.createElement("p");
    core.textContent = planning.brandCore || "";
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
    panel.append(title, core, strategy, details);
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
      feedback.replaceWith(exportFeedback("تصویر با موفقیت آماده شد.", url));
      status.textContent = "خروجی PNG با وضوح ۲۴۰۰ پیکسل آماده شد.";
    } catch (error) {
      feedback.textContent = error?.message || "ساخت خروجی PNG ناموفق بود.";
      status.textContent = feedback.textContent;
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

    const actions = document.createElement("div");
    actions.className = "logo-concept-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-primary";
    button.textContent = "دریافت PNG باکیفیت";
    const feedback = exportFeedback("آماده دریافت خروجی.");
    button.addEventListener("click", () => exportPng(frame, brief, index, feedback, button));
    actions.append(button);
    card.append(preview, copy, actions, feedback);
    return card;
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

  async function generate(event) {
    event?.preventDefault();
    const brief = readBrief();
    if (!brief.brandName) {
      status.textContent = "نام برند را وارد کن.";
      fields.name.focus();
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
      if (!response.ok || !result.success) throw new Error(result.error || "طراحی لوگو انجام نشد.");
      if (!Array.isArray(result.concepts) || result.concepts.length !== 3) {
        throw new Error("پاسخ موتور طراحی کامل نیست؛ سه طرح مستقل دریافت نشد.");
      }
      results.replaceChildren();
      frames = [];
      addStrategy(result.planning);
      result.concepts.forEach((concept, index) => {
        const card = conceptCard(concept, index, brief);
        results.append(card);
      });
      empty.hidden = true;
      status.textContent = "سه مسیر طراحی آماده‌اند. هر طرح را بررسی کن و خروجی PNG بگیر.";
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      status.textContent = error?.message || "ارتباط با موتور طراحی برقرار نشد.";
    } finally {
      submit.disabled = false;
      submit.textContent = "طراحی سه لوگو با نوا";
    }
  }

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
    updatePreviews();
  }, 0));
  form.addEventListener("submit", generate);
})();
