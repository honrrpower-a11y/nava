/* NAVA Office — local PowerPoint and Excel extraction.
   Files are parsed in the browser; only extracted text is added to the NAVI brief. */
(() => {
  "use strict";
  const MAX_OUTPUT = 12000;
  const MAX_EXCEL_SCANNED_CELLS = 20000;
  const MAX_EXCEL_SCANNED_ROWS = 5000;
  const loadScript = (src, globalName) => new Promise((resolve, reject) => {
    if (window[globalName]) return resolve(window[globalName]);
    const existing = document.querySelector('script[data-office-structured="' + globalName + '"]');
    if (existing) {
      existing.addEventListener("load", () => window[globalName] ? resolve(window[globalName]) : reject(new Error("بارگذاری ابزار فایل ناموفق بود.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("بارگذاری ابزار فایل ناموفق بود.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src; script.async = true; script.dataset.officeStructured = globalName;
    script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error("کتابخانه فایل در دسترس نیست."));
    script.onerror = () => reject(new Error("دریافت ابزار خواندن فایل ناموفق بود؛ اتصال اینترنت را بررسی کن."));
    document.head.appendChild(script);
  });
  const trimOutput = value => String(value || "").replace(/\u0000/g, "").trim().slice(0, MAX_OUTPUT);
  async function readPowerPoint(file) {
    const JSZip = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    if (!names.length) throw new Error("اسلاید قابل‌خواندنی در این فایل پاورپوینت پیدا نشد.");
    const output = ["نوع فایل: PowerPoint", "تعداد اسلایدهای متنی: " + names.length];
    for (let i=0; i<names.length; i++) {
      const xml = await zip.files[names[i]].async("text");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.querySelector("parsererror")) continue;
      const paragraphs = Array.from(doc.getElementsByTagName("*")).filter(node => node.localName === "p");
      const lines = paragraphs.map(p => Array.from(p.getElementsByTagName("*")).filter(node => node.localName === "t").map(node => node.textContent || "").join("")).map(line => line.trim()).filter(Boolean);
      output.push("\nاسلاید " + (i+1) + ":\n" + lines.join("\n"));
      if (output.join("\n").length >= MAX_OUTPUT) break;
    }
    const notes = Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).sort((a,b) => Number(a.match(/notesSlide(\d+)/)[1]) - Number(b.match(/notesSlide(\d+)/)[1]));
    if (notes.length) {
      output.push("\nیادداشت‌های ارائه:");
      for (let i=0; i<notes.length && output.join("\n").length < MAX_OUTPUT; i++) {
        const doc = new DOMParser().parseFromString(await zip.files[notes[i]].async("text"), "application/xml");
        const lines = Array.from(doc.getElementsByTagName("*")).filter(node => node.localName === "t").map(node => (node.textContent || "").trim()).filter(Boolean);
        if (lines.length) output.push("یادداشت " + (i+1) + ": " + lines.join(" "));
      }
    }
    return trimOutput(output.join("\n"));
  }
  async function readExcel(file) {
    const XLSX = await loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js", "XLSX");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, cellText: true, dense: false });
    const output = ["نوع فایل: Excel", "شیت‌ها: " + workbook.SheetNames.join("، ")];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      output.push("\nشیت: " + sheetName);
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
      output.push("ابعاد محدوده استفاده‌شده: " + (range.e.r+1) + " ردیف × " + (range.e.c+1) + " ستون");
      let count = 0, scannedCells = 0, scannedRows = 0, scanLimited = false;
      for (let row=range.s.r; row<=range.e.r && output.join("\n").length<MAX_OUTPUT; row++) {
        if (scannedRows >= MAX_EXCEL_SCANNED_ROWS || scannedCells >= MAX_EXCEL_SCANNED_CELLS) {
          scanLimited = true;
          break;
        }
        scannedRows++;
        const cells=[];
        for (let col=range.s.c; col<=range.e.c; col++) {
          if (scannedCells >= MAX_EXCEL_SCANNED_CELLS) { scanLimited = true; break; }
          scannedCells++;
          const address=XLSX.utils.encode_cell({r:row,c:col}), cell=sheet[address];
          if (!cell || (cell.v===undefined && !cell.f)) continue;
          let value=cell.w !== undefined ? cell.w : String(cell.v ?? "");
          if (cell.f) value += " [فرمول: " + cell.f + "]";
          cells.push(address + "=" + value);
        }
        if (cells.length) { output.push(cells.join(" | ")); count++; }
        if (scanLimited || count>=250) {
          output.push("[برای محدودماندن حجم، ادامه محدوده این شیت در این مرحله استخراج نشد.]");
          break;
        }
      }
    }
    return trimOutput(output.join("\n"));
  }
  window.NavaOfficeStructured = Object.freeze({ read: async file => {
    const ext=(file.name.split(".").pop() || "").toLowerCase();
    if (ext==="pptx") return readPowerPoint(file);
    if (ext==="xlsx") return readExcel(file);
    throw new Error("این نوع فایل آفیس پشتیبانی نمی‌شود.");
  }});
})();