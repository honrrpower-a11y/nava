/* NAVI controlled HTML/CSS -> native SVG reconstruction.
 * No foreignObject, raster screenshots, remote assets, or hidden fallbacks.
 * The browser lays out the sandboxed HTML/CSS; this module rebuilds supported
 * primitives as native SVG geometry and editable SVG text.
 */
(function installNavaLogoRenderer(global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const SVG_TAGS = new Set(["svg","g","path","circle","rect","line","polygon","polyline","ellipse","defs","lineargradient","radialgradient","stop","clippath","text","tspan"]);
  const ATTRS = ["id","class","viewBox","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","d","points","offset","stop-color","stop-opacity","fill","fill-rule","fill-opacity","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset","stroke-opacity","opacity","transform","text-anchor","dominant-baseline","font-size","font-weight","letter-spacing","direction","gradientUnits","gradientTransform","spreadMethod","preserveAspectRatio"];
  const TRANSPARENT = "rgba(0, 0, 0, 0)";
  const round = n => Math.round(Number(n) * 1000) / 1000;
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
  function node(name, attrs, parent) {
    const el = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(key => {
      if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== "") el.setAttribute(key, String(attrs[key]));
    });
    if (parent) parent.appendChild(el);
    return el;
  }
  function computedStyle(element, pseudo) {
    return element.ownerDocument.defaultView.getComputedStyle(element, pseudo || null);
  }
  function colorIsVisible(color) { return !!color && color !== TRANSPARENT && color !== "transparent"; }
  function splitCssList(value) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") depth = Math.max(0, depth - 1);
      else if (value[i] === "," && depth === 0) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(value.slice(start).trim());
    return parts;
  }

  function normalizeStops(parts) {
    const stops = [];
    for (const part of parts) {
      const match = /^(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s*(?:(\d+(?:\.\d+)?%)\s*)?$/i.exec(part);
      if (!match) return null;
      stops.push({ color: match[1], offset: match[2] ? Number.parseFloat(match[2]) : null });
    }
    if (stops.length < 2) return null;
    if (stops[0].offset === null) stops[0].offset = 0;
    if (stops[stops.length - 1].offset === null) stops[stops.length - 1].offset = 100;
    let previous = 0;
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i].offset !== null) {
        stops[i].offset = Math.max(previous, Math.max(0, Math.min(100, stops[i].offset)));
        previous = stops[i].offset;
        continue;
      }
      let next = i + 1;
      while (next < stops.length && stops[next].offset === null) next += 1;
      const from = stops[i - 1].offset;
      const to = stops[next].offset;
      const span = next - i + 1;
      for (let j = i; j < next; j += 1) {
        stops[j].offset = from + (to - from) * (j - i + 1) / span;
      }
      i = next - 1;
      previous = stops[i].offset;
    }
    return stops;
  }

  function parseGradient(value, id, defs, bounds) {
    const match = /^(linear|radial)-gradient\((.*)\)$/i.exec(value || "");
    if (!match || !bounds || !bounds.width || !bounds.height) return null;
    const type = match[1].toLowerCase();
    const parts = splitCssList(match[2]);
    let angle = 180;
    if (type === "linear") {
      if (/^(to\s|[-\d.]+deg)/i.test(parts[0])) {
        const direction = parts.shift().toLowerCase();
        if (/deg$/.test(direction)) angle = Number.parseFloat(direction);
        else if (/to right/.test(direction)) angle = 90;
        else if (/to left/.test(direction)) angle = 270;
        else if (/to top right|to right top/.test(direction)) angle = 45;
        else if (/to bottom right|to right bottom/.test(direction)) angle = 135;
        else if (/to bottom left|to left bottom/.test(direction)) angle = 225;
        else if (/to top left|to left top/.test(direction)) angle = 315;
        else if (/to top/.test(direction)) angle = 0;
        else if (/to bottom/.test(direction)) angle = 180;
        else return null;
      }
    } else {
      // The first native implementation deliberately supports only a centered
      // CSS circle with the default farthest-corner radius. Other radial
      // geometries are rejected rather than approximated.
      if (/^circle(?:\s+at\s+(?:center|50%\s+50%))?$/i.test(parts[0])) {
        parts.shift();
      } else if (!/^(?:rgba?\(|#[0-9a-f]|[a-z])/i.test(parts[0])) {
        return null;
      } else {
        return null;
      }
    }

    const stops = normalizeStops(parts);
    if (!stops) return null;
    const x = bounds.x, y = bounds.y, width = bounds.width, height = bounds.height;
    let gradient;
    if (type === "radial") {
      gradient = node("radialGradient", {
        id, gradientUnits: "userSpaceOnUse",
        cx: round(x + width / 2), cy: round(y + height / 2),
        r: round(Math.hypot(width / 2, height / 2))
      }, defs);
    } else {
      const radians = angle * Math.PI / 180;
      const vx = Math.sin(radians), vy = -Math.cos(radians);
      const halfLength = Math.abs(vx) * width / 2 + Math.abs(vy) * height / 2;
      const cx = x + width / 2, cy = y + height / 2;
      gradient = node("linearGradient", {
        id, gradientUnits: "userSpaceOnUse",
        x1: round(cx - vx * halfLength), y1: round(cy - vy * halfLength),
        x2: round(cx + vx * halfLength), y2: round(cy + vy * halfLength)
      }, defs);
    }
    stops.forEach(stop => node("stop", {
      offset: round(stop.offset) + "%",
      "stop-color": stop.color
    }, gradient));
    return "url(#" + id + ")";
  }

  function parseShadow(value, id, defs) {
    if (!value || value === "none") return null;
    const colorFirst = value.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?/i);
    const valuesFirst = value.match(/(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?\s+(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i);
    const m = colorFirst || valuesFirst;
    if (!m) return null;
    const dx=Number(colorFirst ? m[2] : m[1]),dy=Number(colorFirst ? m[3] : m[2]);
    const blur=Number(colorFirst ? m[4]||0 : m[3]||0),spread=Number(colorFirst ? m[5]||0 : m[4]||0);
    const color=colorFirst ? m[1] : m[5];
    if (spread !== 0 || /inset/i.test(value) || (value.match(/,/g)||[]).length > 3) return null;
    const filter=node("filter",{id,x:"-40%",y:"-40%",width:"180%",height:"180%","color-interpolation-filters":"sRGB"},defs);
    node("feGaussianBlur",{in:"SourceAlpha",stdDeviation:round(blur/2)},filter);
    node("feOffset",{dx:round(dx),dy:round(dy),result:"offsetblur"},filter);
    node("feFlood",{"flood-color":color,"flood-opacity":"1",result:"shadowcolor"},filter);
    node("feComposite",{in:"shadowcolor",in2:"offsetblur",operator:"in",result:"shadow"},filter);
    const merge=node("feMerge",{},filter);
    node("feMergeNode",{in:"shadow"},merge);
    node("feMergeNode",{in:"SourceGraphic"},merge);
    return "url(#"+id+")";
  }
  function styleAttrs(style) {
    return {
      fill: style.color || "#111111",
      "font-family": style.fontFamily || "Arial, sans-serif",
      "font-size": style.fontSize || "16px",
      "font-weight": style.fontWeight || "400",
      "font-style": style.fontStyle || "normal",
      "letter-spacing": style.letterSpacing || "normal",
      "text-anchor": style.textAlign === "center" ? "middle" : (style.textAlign === "right" ? "end" : "start"),
      direction: style.direction || "ltr",
      opacity: style.opacity === "1" ? null : style.opacity
    };
  }
  function textSegments(value) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), item => ({
        segment: item.segment, index: item.index
      }));
    }
    const output = [];
    let index = 0;
    for (const segment of Array.from(value)) {
      output.push({ segment, index });
      index += segment.length;
    }
    return output;
  }

  function appendText(textNode, parent, rootRect, scale, warnings) {
    const raw = textNode.nodeValue || "";
    if (!raw.trim()) return;
    const element = textNode.parentElement;
    if (!element) return;
    const doc = textNode.ownerDocument;
    const style = computedStyle(element);
    if (style.textDecorationLine && style.textDecorationLine !== "none") {
      warnings.add("زیرخط یا خط‌خوردگی متن در خروجی برداری پشتیبانی نمی‌شود.");
    }
    if (style.writingMode && style.writingMode !== "horizontal-tb") {
      warnings.add("نوشتار عمودی در خروجی برداری پشتیبانی نمی‌شود.");
    }
    if (style.textAlign === "justify" || style.textAlign === "justify-all") {
      warnings.add("تراز justify متن در خروجی برداری پشتیبانی نمی‌شود.");
    }
    if (style.textOverflow && style.textOverflow !== "clip") {
      warnings.add("متن کوتاه‌شده با ellipsis در خروجی برداری پشتیبانی نمی‌شود.");
    }
    if (style.textTransform && !["none", "uppercase", "lowercase"].includes(style.textTransform)) {
      warnings.add("این نوع text-transform در خروجی برداری پشتیبانی نمی‌شود.");
    }

    const sourceSegments = textSegments(raw);
    const range = doc.createRange();
    const visualSegments = [];
    sourceSegments.forEach(item => {
      const start = item.index;
      const end = start + item.segment.length;
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      let glyph = item.segment;
      if (style.textTransform === "uppercase") glyph = glyph.toLocaleUpperCase();
      if (style.textTransform === "lowercase") glyph = glyph.toLocaleLowerCase();
      visualSegments.push({ glyph, rect });
    });
    if (!visualSegments.length) return;

    const lines = [];
    visualSegments.forEach(item => {
      let line = lines.find(candidate => Math.abs(candidate.top - item.rect.top) <= 1.5);
      if (!line) {
        line = { top: item.rect.top, left: item.rect.left, right: item.rect.right, glyphs: [] };
        lines.push(line);
      }
      line.left = Math.min(line.left, item.rect.left);
      line.right = Math.max(line.right, item.rect.right);
      line.glyphs.push(item.glyph);
    });
    lines.sort((a, b) => a.top - b.top);

    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const rtl = style.direction === "rtl";
    const align = style.textAlign;
    const anchor = align === "center" ? "middle"
      : (align === "right" || align === "end" || (align === "start" && rtl) ? "end" : "start");
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(" ");

    lines.forEach(line => {
      const content = line.glyphs.join("");
      if (!content.trim()) return;
      const x = anchor === "middle" ? (line.left + line.right) / 2
        : (anchor === "end" ? line.right : line.left);
      const measured = context ? context.measureText(content) : null;
      const ascent = measured && measured.actualBoundingBoxAscent
        ? measured.actualBoundingBoxAscent : fontSize * 0.82;
      const y = line.top - rootRect.top + ascent;
      const width = line.right - line.left;
      const text = node("text", Object.assign(styleAttrs(style), {
        x: round((x - rootRect.left) * scale),
        y: round(y * scale),
        "text-anchor": anchor,
        direction: rtl ? "rtl" : "ltr",
        "unicode-bidi": "plaintext",
        "xml:space": "preserve",
        textLength: round(width * scale),
        lengthAdjust: "spacingAndGlyphs"
      }), parent);
      text.textContent = content;
    });
  }

  function copySvgElement(source, parent, warnings) {
    const tag=source.localName.toLowerCase();
    if (!SVG_TAGS.has(tag)) { warnings.add("یک عنصر SVG پشتیبانی‌نشده شناسایی شد: "+tag); return; }
    const target=node(tag==="lineargradient"?"linearGradient":tag==="radialgradient"?"radialGradient":tag==="clippath"?"clipPath":tag,{},parent);
    ATTRS.forEach(attr=>{ if(source.hasAttribute(attr)) target.setAttribute(attr,source.getAttribute(attr)); });
    const style=computedStyle(source);
    ["fill","fill-rule","fill-opacity","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset","stroke-opacity","opacity","font-size","font-weight","letter-spacing","text-anchor","dominant-baseline"].forEach(attr=>{
      const value=style.getPropertyValue(attr); if(value && value!=="none" && value!=="normal") target.setAttribute(attr,value);
    });
    Array.from(source.childNodes).forEach(child=>{
      if(child.nodeType===Node.ELEMENT_NODE) copySvgElement(child,target,warnings);
      else if(child.nodeType===Node.TEXT_NODE && child.nodeValue.trim()) target.textContent+=child.nodeValue;
    });
    return target;
  }
  function renderHtmlElement(source, parent, rootRect, scale, defs, warnings, counter) {
    if (source.nodeType===Node.TEXT_NODE) { appendText(source,parent,rootRect,scale,warnings); return; }
    if (source.nodeType!==Node.ELEMENT_NODE) return;
    const tag=source.localName.toLowerCase();
    if (tag==="svg") {
      const r=source.getBoundingClientRect();
      const svg=node("svg",{x:round((r.left-rootRect.left)*scale),y:round((r.top-rootRect.top)*scale),width:round(r.width*scale),height:round(r.height*scale),viewBox:source.getAttribute("viewBox")||("0 0 "+(source.getAttribute("width")||r.width)+" "+(source.getAttribute("height")||r.height)),preserveAspectRatio:"xMidYMid meet"},parent);
      Array.from(source.childNodes).forEach(child=>{if(child.nodeType===Node.ELEMENT_NODE)copySvgElement(child,svg,warnings);});
      return;
    }
    const rect=source.getBoundingClientRect();
    const style=getComputedStyle(source);
    if (style.display==="none" || style.visibility==="hidden" || rect.width===0 || rect.height===0) return;
    if (style.transform && style.transform!=="none") warnings.add("عنصر دارای transform در CSS است؛ برای حفظ هندسه، خروجی این طرح متوقف شد.");
    if (style.textShadow && style.textShadow!=="none") warnings.add("text-shadow در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.outlineStyle && style.outlineStyle!=="none" && parseFloat(style.outlineWidth)>0) warnings.add("outline در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.borderImageSource && style.borderImageSource!=="none") warnings.add("border-image در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.animationName && style.animationName!=="none" && style.animationDuration!=="0s") warnings.add("انیمیشن CSS در خروجی برداری ثابت قابل بازسازی نیست.");
    if (style.transitionDuration && style.transitionDuration!=="0s" && style.transitionDuration!=="0ms") warnings.add("transition CSS در خروجی برداری قابل بازسازی نیست.");
    if (style.mixBlendMode && style.mixBlendMode!=="normal") warnings.add("ترکیب لایه‌های CSS در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.backgroundBlendMode && style.backgroundBlendMode!=="normal") warnings.add("ترکیب پس‌زمینه‌های CSS در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.borderTopWidth!==style.borderRightWidth || style.borderTopWidth!==style.borderBottomWidth || style.borderTopWidth!==style.borderLeftWidth) warnings.add("ضخامت‌های متفاوت border در این نسخه قابل بازسازی نیستند.");
    if (style.borderTopLeftRadius!==style.borderTopRightRadius || style.borderTopLeftRadius!==style.borderBottomLeftRadius || style.borderTopLeftRadius!==style.borderBottomRightRadius) warnings.add("گوشه‌های با شعاع متفاوت در این نسخه قابل بازسازی نیستند.");
    if (style.borderTopStyle!=="none" && style.borderTopStyle!=="solid") warnings.add("خط دور نقطه‌چین یا خط‌چین در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.filter && style.filter!=="none") warnings.add("فیلتر CSS در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.clipPath && style.clipPath!=="none") warnings.add("clip-path CSS در این نسخه قابل بازسازی نیست.");
    if (style.maskImage && style.maskImage!=="none") warnings.add("CSS mask در این نسخه قابل بازسازی نیست.");
    if (!source.classList.contains("logo-art-root") && (style.overflowX!=="visible" || style.overflowY!=="visible")) warnings.add("برش محتوای داخلی با overflow در این نسخه قابل بازسازی نیست.");
    if (style.zIndex && style.zIndex!=="auto") warnings.add("ترتیب لایه‌های دارای z-index در این نسخه قابل بازسازی نیست.");
    const x=round((rect.left-rootRect.left)*scale),y=round((rect.top-rootRect.top)*scale),w=round(rect.width*scale),h=round(rect.height*scale);
    const group=node("g",{opacity:style.opacity==="1"?null:style.opacity},parent);
    const bg=style.backgroundColor;
    const bgImage=style.backgroundImage;
    let fill=colorIsVisible(bg)?bg:"none";
    if(bgImage && bgImage!=="none"){
      const gradient=parseGradient(bgImage,"nava-gradient-"+(++counter.value),defs);
      if(gradient) fill=gradient;
      else warnings.add("تصویر پس‌زمینه یا گرادیان پیچیده قابل تبدیل به SVG نیست.");
    }
    const radiusValue=style.borderTopLeftRadius||"0px";
    const radius=parseFloat(radiusValue)||0;
    const border=parseFloat(style.borderTopWidth)||0;
    const borderColor=style.borderTopColor;
    if(fill!=="none" || border>0){
      const shadow=parseShadow(style.boxShadow,"nava-shadow-"+(++counter.value),defs);
      if (style.boxShadow && style.boxShadow!=="none" && !shadow) warnings.add("این نوع box-shadow در خروجی برداری پشتیبانی نمی‌شود.");
      const shapeAttrs={fill,stroke:border>0?borderColor:"none","stroke-width":border>0?round(border*scale):null,filter:shadow||null};
      if (radiusValue.includes("%")) {
        if (parseFloat(radiusValue)>=49.9 && Math.abs(w-h)<1) {
          node("ellipse",Object.assign({cx:round(x+w/2),cy:round(y+h/2),rx:round(w/2),ry:round(h/2)},shapeAttrs),group);
        } else {
          warnings.add("شعاع درصدی گوشه‌ها فقط برای شکل دایره‌ای قابل بازسازی است.");
        }
      } else {
        node("rect",Object.assign({x,y,width:w,height:h,rx:round(radius*scale),ry:round(radius*scale)},shapeAttrs),group);
      }
    } else if(style.boxShadow && style.boxShadow!=="none") {
      warnings.add("سایه روی عنصر بدون پس‌زمینه ممکن است در بازسازی دقیقاً یکسان نباشد.");
    }
    const before=computedStyle(source,"::before").content;
    const after=computedStyle(source,"::after").content;
    if((before&&before!=="none"&&before!=="normal")||(after&&after!=="none"&&after!=="normal")) warnings.add("شبه‌عنصرهای CSS در خروجی برداری پشتیبانی نمی‌شوند.");
    Array.from(source.childNodes).forEach(child=>renderHtmlElement(child,group,rootRect,scale,defs,warnings,counter));
  }
  function buildSvg(frame, options) {
    if(!frame || !frame.contentDocument) throw new Error("پیش‌نمایش لوگو هنوز آماده نیست.");
    const doc=frame.contentDocument,root=doc.querySelector(".logo-art-root");
    if(!root) throw new Error("ساختار بوم طراحی پیدا نشد.");
    const rootRect=root.getBoundingClientRect();
    if(!rootRect.width || !rootRect.height) throw new Error("ابعاد بوم طراحی معتبر نیست.");
    const scale=1000/rootRect.width;
    const warnings=new Set(),counter={value:0};
    const svg=node("svg",{xmlns:NS,width:options.width||1200,height:options.height||1200,viewBox:"0 0 1000 1000",role:"img","aria-labelledby":"nava-logo-title"},null);
    node("title",{id:"nava-logo-title"},svg).textContent="Logo — "+(options.brandName||"NAVA");
    const defs=node("defs",{},svg);
    const rootStyle=computedStyle(root);
    const bg=rootStyle.backgroundColor;
    const bgImage=rootStyle.backgroundImage;
    let rootFill=colorIsVisible(bg)?bg:"none";
    if(bgImage&&bgImage!=="none") {
      const gradient=parseGradient(bgImage,"nava-root-gradient",defs);
      if(gradient) rootFill=gradient;
      else warnings.add("پس‌زمینه پیچیده بوم قابل تبدیل به SVG نیست.");
    }
    if(rootFill!=="none") node("rect",{x:0,y:0,width:1000,height:1000,fill:rootFill},svg);
    Array.from(root.childNodes).forEach(child=>renderHtmlElement(child,svg,rootRect,scale,defs,warnings,counter));
    const unsupported=Array.from(warnings).filter(w=>/متوقف|پشتیبانی نمی‌شود|قابل تبدیل|قابل بازسازی نیست/.test(w));
    if(unsupported.length) {
      const error=new Error("این طرح از جلوه‌هایی استفاده می‌کند که هنوز به‌صورت برداری قابل بازسازی نیستند؛ خروجی ناقص ساخته نشد.");
      error.details=Array.from(warnings);
      throw error;
    }
    if(svg.querySelector("foreignObject,image")) throw new Error("بازسازی برداری خالص ناموفق بود؛ خروجی ناامن رد شد.");
    return {svg:new XMLSerializer().serializeToString(svg),warnings:Array.from(warnings)};
  }
  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function exportPng(svgText,filename,size) {
    const blob=new Blob([svgText],{type:"image/svg+xml;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    try {
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("رندر SVG برای PNG ناموفق بود."));img.src=url;});
      const canvas=document.createElement("canvas");canvas.width=size||2400;canvas.height=size||2400;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("ساخت PNG در این مرورگر پشتیبانی نمی‌شود.");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!png)throw new Error("ساخت فایل PNG ناموفق بود.");
      downloadBlob(png,filename);
    } finally { URL.revokeObjectURL(url); }
  }
  global.NavaLogoRenderer={buildSvg,downloadBlob,exportPng};
})(window);
