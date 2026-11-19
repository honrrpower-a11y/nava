/* NAVA Office — private, in-browser visual previews for Office files. */
(() => {
  "use strict";
  const input = document.getElementById("officeSourceFile");
  const panel = document.getElementById("officePreviewPanel");
  const stage = document.getElementById("officePreviewStage");
  const status = document.getElementById("officePreviewStatus");
  const previous = document.getElementById("officePreviewPrevious");
  const next = document.getElementById("officePreviewNext");
  const pageLabel = document.getElementById("officePreviewPage");
  const sheetSelect = document.getElementById("officePreviewSheet");
  const zoomOut = document.getElementById("officePreviewZoomOut");
  const zoomIn = document.getElementById("officePreviewZoomIn");
  const zoomValue = document.getElementById("officePreviewZoomValue");
  const fullscreen = document.getElementById("officePreviewFullscreen");
  if (!input || !panel || !stage || !status) return;

  const scripts = Object.create(null);
  const allowedHtml = new Set(["P","BR","STRONG","B","EM","I","U","S","H1","H2","H3","H4","H5","H6","UL","OL","LI","TABLE","THEAD","TBODY","TR","TH","TD","BLOCKQUOTE","HR","PRE","CODE","SPAN","DIV","A","IMG"]);
  let activeFile = null, activeBlob = null, activeKind = "", generation = 0;
  let pptxViewer = null, pdfDocument = null, pdfPage = 1, pdfScale = 1;
  let workbook = null, workbookSheet = "", zoom = 1, currentCanvas = null, objectUrl = "";

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.dataset.state = error ? "error" : "success";
  };
  const loadScript = (src, globalName) => {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (scripts[globalName]) return scripts[globalName];
    scripts[globalName] = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(item => item.src === src);
      const script = existing || document.createElement("script");
      const done = () => window[globalName] ? resolve(window[globalName]) : reject(new Error("کتابخانه پیش‌نمایش بارگذاری نشد."));
      script.addEventListener("load", done, { once: true });
      script.addEventListener("error", () => reject(new Error("دریافت ابزار پیش‌نمایش ناموفق بود؛ اتصال اینترنت را بررسی کن.")), { once: true });
      if (!existing) { script.src = src; script.async = true; document.head.appendChild(script); }
      else if (script.dataset.officePreviewLoaded === "true") done();
    }).catch(error => { delete scripts[globalName]; throw error; });
    return scripts[globalName];
  };
  const clearStage = () => {
    if (pptxViewer?.destroy) { try { pptxViewer.destroy(); } catch (_) {} }
    pptxViewer = null;
    if (pdfDocument) { try { pdfDocument.destroy(); } catch (_) {} }
    pdfDocument = null;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ""; }
    stage.replaceChildren();
    currentCanvas = null;
    workbook = null;
    sheetSelect.hidden = true;
    sheetSelect.replaceChildren();
    previous.disabled = true;
    next.disabled = true;
    pageLabel.textContent = "";
    zoom = 1;
    syncZoom();
  };
  const canvas = () => {
    const element = document.createElement("canvas");
    element.className = "office-preview-canvas";
    element.setAttribute("aria-label", "پیش‌نمایش صفحه یا اسلاید");
    stage.append(element);
    currentCanvas = element;
    return element;
  };
  const syncZoom = () => {
    if (zoomValue) zoomValue.textContent = Math.round(zoom * 100) + "٪";
    if (currentCanvas) {
      currentCanvas.style.width = Math.round(zoom * 100) + "%";
      currentCanvas.style.maxWidth = zoom > 1 ? "none" : "100%";
    }
  };
  const updateNavigation = (index, count, unit) => {
    pageLabel.textContent = unit + " " + (index + 1) + " از " + count;
    previous.disabled = index <= 0;
    next.disabled = index >= count - 1;
  };
  const safeHtmlInto = (source, target) => {
    const parsed = new DOMParser().parseFromString(String(source || ""), "text/html");
    const copy = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.nodeValue || "")); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || !allowedHtml.has(node.tagName)) {
        if (node.childNodes) Array.from(node.childNodes).forEach(child => copy(child, parent));
        return;
      }
      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "IMG") {
        const src = node.getAttribute("src") || "";
        if (src.startsWith("data:image/")) element.src = src;
        element.alt = node.getAttribute("alt") || "";
      }
      if (node.tagName === "A") {
        const href = node.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) { element.href = href; element.target = "_blank"; element.rel = "noopener noreferrer"; }
      }
      Array.from(node.childNodes).forEach(child => copy(child, element));
      parent.append(element);
    };
    Array.from(parsed.body.childNodes).forEach(node => copy(node, target));
  };
  const renderPdfPage = async (token) => {
    if (!pdfDocument || token !== generation) return;
    const page = await pdfDocument.getPage(pdfPage);
    if (token !== generation) return;
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(1.5, Math.max(.45, (stage.clientWidth || 760) / base.width));
    const viewport = page.getViewport({ scale: fit });
    const target = currentCanvas || canvas();
    const context = target.getContext("2d", { alpha: false });
    target.width = Math.ceil(viewport.width);
    target.height = Math.ceil(viewport.height);
    target.style.width = Math.round(zoom * 100) + "%";
    target.style.maxWidth = zoom > 1 ? "none" : "100%";
    await page.render({ canvasContext: context, viewport }).promise;
    if (token !== generation) return;
    updateNavigation(pdfPage - 1, pdfDocument.numPages, "صفحه");
    setStatus("PDF در پیش‌نمایش محلی نمایش داده می‌شود؛ " + pdfDocument.numPages + " صفحه.");
  };
  const renderWorkbook = () => {
    if (!workbook) return;
    const sheet = workbook.Sheets[workbookSheet];
    const range = window.XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const firstRow = range.s.r, lastRow = Math.min(range.e.r, firstRow + 39);
    const firstCol = range.s.c, lastCol = Math.min(range.e.c, firstCol + 11);
    const wrap = document.createElement("div");
    wrap.className = "office-preview-table-wrap";
    const table = document.createElement("table");
    table.className = "office-preview-table";
    const head = document.createElement("tr");
    const corner = document.createElement("th"); corner.textContent = "ردیف"; head.append(corner);
    for (let col = firstCol; col <= lastCol; col++) {
      const th = document.createElement("th"); th.textContent = window.XLSX.utils.encode_col(col); head.append(th);
    }
    table.append(head);
    for (let row = firstRow; row <= lastRow; row++) {
      const tr = document.createElement("tr");
      const number = document.createElement("th"); number.textContent = String(row + 1); tr.append(number);
      for (let col = firstCol; col <= lastCol; col++) {
        const td = document.createElement("td");
        const cell = sheet[window.XLSX.utils.encode_cell({ r: row, c: col })];
        td.textContent = cell ? String(cell.w ?? cell.v ?? (cell.f ? "=" + cell.f : "")) : "";
        tr.append(td);
      }
      table.append(tr);
    }
    wrap.append(table);
    stage.replaceChildren(wrap);
    const limited = range.e.r - firstRow + 1 > 40 || range.e.c - firstCol + 1 > 12;
    setStatus("شیت «" + workbookSheet + "»؛ " + (range.e.r - range.s.r + 1) + " ردیف و " + (range.e.c - range.s.c + 1) + " ستون." + (limited ? " برای سرعت، حداکثر ۴۰ ردیف و ۱۲ ستون نمایش داده می‌شود." : ""));
    pageLabel.textContent = workbook.SheetNames.length + " شیت";
    previous.disabled = true; next.disabled = true;
  };
  const renderPptx = async (file, token) => {
    await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip");
    const packageZip = await window.JSZip.loadAsync(file);
    const hasCharts = Object.keys(packageZip.files).some(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name));
    if (hasCharts) await loadScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js", "Chart");
    await loadScript("https://cdn.jsdelivr.net/npm/pptxviewjs@1.1.9/dist/PptxViewJS.min.js", "PptxViewJS");
    if (token !== generation) return;
    const target = canvas();
    target.width = 1280; target.height = 720;
    pptxViewer = new window.PptxViewJS.PPTXViewer({ canvas: target });
    pptxViewer.on?.("slideChanged", index => {
      const count = pptxViewer?.getSlideCount?.() || 0;
      updateNavigation(index, count, "اسلاید");
    });
    await pptxViewer.loadFile(file);
    if (token !== generation) return;
    await pptxViewer.render();
    if (token !== generation) return;
    const count = pptxViewer.getSlideCount();
    updateNavigation(pptxViewer.getCurrentSlideIndex?.() || 0, count, "اسلاید");
    setStatus("پاورپوینت در پیش‌نمایش محلی نمایش داده می‌شود؛ " + count + " اسلاید.");
  };
  const renderPdf = async (file, token) => {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjsLib");
    if (token !== generation) return;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    pdfDocument = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    if (token !== generation) return;
    pdfPage = 1; canvas();
    await renderPdfPage(token);
  };
  const renderWord = async (file, token) => {
    const mammoth = await loadScript("https://unpkg.com/mammoth@1.9.1/mammoth.browser.min.js", "mammoth");
    if (token !== generation) return;
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    if (token !== generation) return;
    const article = document.createElement("article");
    article.className = "office-preview-word";
    safeHtmlInto(result.value || "<p>متنی برای نمایش پیدا نشد.</p>", article);
    stage.replaceChildren(article);
    setStatus("پیش‌نمایش Word آماده است. نمایش، محتوای سند را تغییر نمی‌دهد.");
  };
  const renderExcel = async (file, token) => {
    await loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js", "XLSX");
    if (token !== generation) return;
    workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, cellStyles: true });
    if (token !== generation) return;
    sheetSelect.replaceChildren(...workbook.SheetNames.map(name => {
      const option = document.createElement("option"); option.value = name; option.textContent = name; return option;
    }));
    workbookSheet = workbook.SheetNames[0] || "";
    sheetSelect.value = workbookSheet;
    sheetSelect.hidden = workbook.SheetNames.length < 2;
    renderWorkbook();
  };
  const renderText = async (file, token) => {
    const pre = document.createElement("pre");
    pre.className = "office-preview-text";
    pre.textContent = await file.text();
    if (token !== generation) return;
    stage.replaceChildren(pre);
    setStatus("پیش‌نمایش متن ساده آماده است.");
  };
  const renderImage = file => {
    const image = document.createElement("img");
    image.className = "office-preview-image";
    objectUrl = URL.createObjectURL(file);
    image.src = objectUrl; image.alt = "پیش‌نمایش تصویر بارگذاری‌شده";
    stage.replaceChildren(image);
    setStatus("تصویر به‌صورت محلی نمایش داده می‌شود.");
  };
  async function renderFile(file, blob = null) {
    const token = ++generation;
    clearStage();
    activeFile = file; activeBlob = blob; activeKind = (file.name.split(".").pop() || "").toLowerCase();
    panel.hidden = false;
    panel.querySelector("[data-office-preview-name]").textContent = file.name;
    setStatus("در حال آماده‌سازی پیش‌نمایش روی دستگاه شما...");
    try {
      if (activeKind === "pptx") await renderPptx(file, token);
      else if (activeKind === "pdf") await renderPdf(file, token);
      else if (activeKind === "xlsx") await renderExcel(file, token);
      else if (activeKind === "docx") await renderWord(file, token);
      else if (activeKind === "txt") await renderText(file, token);
      else if (["png","jpg","jpeg","webp"].includes(activeKind)) renderImage(file);
      else throw new Error("برای این نوع فایل پیش‌نمایش تصویری در دسترس نیست.");
      if (token === generation) { panel.hidden = false; return true; }
      return false;
    } catch (error) {
      if (token !== generation) return;
      clearStage();
      setStatus((error.message || "نمایش فایل ناموفق بود.") + " فایل اصلی و ابزارهای ویرایش تغییری نکرده‌اند.", true);
      return false;
    }
  }
  const refreshFromEditor = async () => {
    if (!activeFile || !window.NavaOfficeTools?.createPreviewBlob) return false;
    try {
      const blob = await window.NavaOfficeTools.createPreviewBlob();
      if (!blob) return false;
      const updated = new File([blob], activeFile.name, { type: activeFile.type || "application/octet-stream", lastModified: Date.now() });
      const rendered = await renderFile(updated, blob);
      if (!rendered) return false;
      setStatus("پیش‌نمایش با نسخه ویرایش‌شده به‌روز شد. فایل اصلی همچنان بدون تغییر است.");
      return true;
    } catch (error) {
      setStatus("ویرایش انجام شد، اما به‌روزرسانی پیش‌نمایش ناموفق بود: " + (error.message || "خطای نامشخص"), true);
      return false;
    }
  };

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) renderFile(file);
    else { generation++; clearStage(); panel.hidden = true; activeFile = null; activeBlob = null; }
  });
  input.closest("form")?.addEventListener("reset", () => {
    queueMicrotask(() => {
      if (!input.files?.length) { generation++; clearStage(); panel.hidden = true; activeFile = null; activeBlob = null; activeKind = ""; }
    });
  });
  document.getElementById("officeClearFile")?.addEventListener("click", () => {
    generation++; clearStage(); panel.hidden = true; activeFile = null; activeBlob = null; activeKind = "";
  });
  previous.addEventListener("click", async () => {
    try {
      if (activeKind === "pptx" && pptxViewer) await pptxViewer.previousSlide();
      else if (activeKind === "pdf" && pdfDocument && pdfPage > 1) { pdfPage--; await renderPdfPage(generation); }
    } catch (error) { setStatus(error.message || "رفتن به صفحه قبل ناموفق بود.", true); }
  });
  next.addEventListener("click", async () => {
    try {
      if (activeKind === "pptx" && pptxViewer) await pptxViewer.nextSlide();
      else if (activeKind === "pdf" && pdfDocument && pdfPage < pdfDocument.numPages) { pdfPage++; await renderPdfPage(generation); }
    } catch (error) { setStatus(error.message || "رفتن به صفحه بعد ناموفق بود.", true); }
  });
  sheetSelect.addEventListener("change", () => { workbookSheet = sheetSelect.value; renderWorkbook(); });
  zoomOut.addEventListener("click", async () => {
    zoom = Math.max(.6, Math.round((zoom - .1) * 10) / 10); syncZoom();
    if (activeKind === "pdf" && pdfDocument) await renderPdfPage(generation);
  });
  zoomIn.addEventListener("click", async () => {
    zoom = Math.min(1.6, Math.round((zoom + .1) * 10) / 10); syncZoom();
    if (activeKind === "pdf" && pdfDocument) await renderPdfPage(generation);
  });
  fullscreen.addEventListener("click", () => {
    if (panel.requestFullscreen) panel.requestFullscreen().catch(() => setStatus("حالت تمام‌صفحه در این مرورگر در دسترس نیست.", true));
  });
  window.NavaOfficePreview = Object.freeze({ refreshFromEditor, reset() { generation++; clearStage(); panel.hidden = true; activeFile = null; activeBlob = null; activeKind = ""; } });
})();
