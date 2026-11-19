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
  function parseGradient(value, id, defs) {
    const match = /^(linear|radial)-gradient\((.*)\)$/i.exec(value || "");
    if (!match) return null;
    const gradientType = match[1].toLowerCase();
    const body = match[2];
    const parts = body.split(/,(?![^()]*\))/).map(s => s.trim());
    if (gradientType === "radial" && parts.length && /^(circle|ellipse|closest-|farthest-)/i.test(parts[0])) {
      if (/\bat\b/i.test(parts[0])) return null;
      parts.shift();
    }
    let angle = 180;
    if (parts.length && /^(to\s|[-\d.]+deg)/i.test(parts[0])) {
      const dir = parts.shift();
      if (/deg$/i.test(dir)) angle = parseFloat(dir);
      else if (/to right/i.test(dir)) angle = 90;
      else if (/to left/i.test(dir)) angle = 270;
      else if (/to top/i.test(dir)) angle = 0;
      else if (/to bottom/i.test(dir)) angle = 180;
      else if (/top right|right top/i.test(dir)) angle = 45;
      else if (/bottom right|right bottom/i.test(dir)) angle = 135;
      else if (/bottom left|left bottom/i.test(dir)) angle = 225;
      else if (/top left|left top/i.test(dir)) angle = 315;
    }
    const stops = parts.map(part => {
      const color = part.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i);
      if (!color) return null;
      const pct = part.match(/([\d.]+)%\s*$/);
      return { color: color[1], offset: pct ? Math.max(0, Math.min(100, Number(pct[1]))) + "%" : null };
    }).filter(Boolean);
    if (stops.length < 2) return null;
    const rad = (angle - 90) * Math.PI / 180;
    const dx = Math.cos(rad) * .5, dy = Math.sin(rad) * .5;
    const grad = gradientType === "radial"
      ? node("radialGradient", {id, cx: ".5", cy: ".5", r: ".5"}, defs)
      : node("linearGradient", {id, x1: round(.5-dx), y1: round(.5-dy), x2: round(.5+dx), y2: round(.5+dy)}, defs);
    stops.forEach((stop, i) => node("stop", {offset: stop.offset || (i/(stops.length-1)*100)+"%", "stop-color": stop.color}, grad));
    return "url(#"+id+")";
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
  function textLines(text, maxWidth, style) {
    let source = String(text || "").replace(/\s+/g, " ").trim();
    if (style.textTransform === "uppercase") source = source.toLocaleUpperCase();
    if (style.textTransform === "lowercase") source = source.toLocaleLowerCase();
    if (!source) return [];
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    if (!ctx) return [source];
    ctx.font = [style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].filter(Boolean).join(" ");
    const words = source.split(" "), lines = [];
    let line = "";
    words.forEach(word => {
      const next = line ? line+" "+word : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line=word; }
      else line=next;
    });
    if (line) lines.push(line);
    return lines;
  }
  function appendText(textNode, parent, rootRect, scale, warnings) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) return;
    const el = textNode.parentElement;
    if (!el) return;
    const range=el.ownerDocument.createRange(); range.selectNodeContents(textNode);
    const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0);
    if (!rects.length) return;
    const style=computedStyle(el);
    if (style.textDecorationLine && style.textDecorationLine !== "none") warnings.add("زیرخط یا خط‌خوردگی متن در خروجی برداری این نسخه پشتیبانی نمی‌شود.");
    if (style.writingMode && style.writingMode !== "horizontal-tb") warnings.add("نوشتار عمودی در خروجی برداری پشتیبانی نمی‌شود.");
    const fontSize=parseFloat(style.fontSize)||16;
    const maxWidth=Math.max(...rects.map(r=>r.width));
    const lines=textLines(text,Math.max(maxWidth,rects[0].width),style);
    const box=rects[0];
    const rtl = style.direction === "rtl";
    const rightAligned = style.textAlign === "right" || (style.textAlign === "start" && rtl);
    const leftAligned = style.textAlign === "left" || (style.textAlign === "start" && !rtl);
    const x=style.textAlign==="center" ? box.left+box.width/2 : (rightAligned ? box.right : (leftAligned ? box.left : box.left));
    const y=box.top-rootRect.top+fontSize*.86;
    const t=node("text",Object.assign(styleAttrs(style),{x:round((x-rootRect.left)*scale),y:round(y*scale)}),parent);
    lines.forEach((line,i)=>node("tspan",{x:round((x-rootRect.left)*scale),dy:i===0?0:round(fontSize*1.2*scale)},t).textContent=line);
    if (lines.length>1) warnings.add("متن چندخطی با بازسازی تقریبی فاصله خطوط تبدیل شد.");
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
