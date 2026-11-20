/* NAVI controlled HTML/CSS -> native SVG reconstruction.
 * No foreignObject, raster screenshots, remote assets, or hidden fallbacks.
 * The browser lays out the sandboxed HTML/CSS; this module rebuilds supported
 * primitives as native SVG geometry and editable SVG text.
 */
(function installNavaLogoRenderer(global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const SVG_TAGS = new Set(["svg","g","path","circle","rect","line","polygon","polyline","ellipse","defs","lineargradient","radialgradient","stop","clippath","text","tspan"]);
  const ATTRS = ["id","class","viewBox","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","d","points","offset","stop-color","stop-opacity","fill","fill-rule","fill-opacity","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset","stroke-opacity","opacity","transform","text-anchor","dominant-baseline","font-size","font-weight","letter-spacing","word-spacing","direction","unicode-bidi","font-family","font-style","font-stretch","textLength","lengthAdjust","dx","dy","rotate","clip-path","clipPathUnits","gradientUnits","gradientTransform","spreadMethod","preserveAspectRatio"];
  const TRANSPARENT = "rgba(0, 0, 0, 0)";
  const round = n => Math.round(Number(n) * 1000) / 1000;
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
        else if (/to top right|to right top/.test(direction)) angle = 45;
        else if (/to bottom right|to right bottom/.test(direction)) angle = 135;
        else if (/to bottom left|to left bottom/.test(direction)) angle = 225;
        else if (/to top left|to left top/.test(direction)) angle = 315;
        else if (/to right/.test(direction)) angle = 90;
        else if (/to left/.test(direction)) angle = 270;
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

  function parseShadow(value, id, defs, scale) {
    if (!value || value === "none") return null;
    if (splitCssList(value).length !== 1 || /inset/i.test(value)) return null;
    const colorFirst = value.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?/i);
    const valuesFirst = value.match(/(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?(?:\s+(-?[\d.]+)px)?\s+(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i);
    const match = colorFirst || valuesFirst;
    if (!match) return null;
    const dx = Number(colorFirst ? match[2] : match[1]) * scale;
    const dy = Number(colorFirst ? match[3] : match[2]) * scale;
    const blur = Number(colorFirst ? match[4] || 0 : match[3] || 0) * scale;
    const spread = Number(colorFirst ? match[5] || 0 : match[4] || 0);
    const color = colorFirst ? match[1] : match[5];
    if (spread !== 0) return null;
    const filter = node("filter", {
      id, x: "-100%", y: "-100%", width: "300%", height: "300%",
      "color-interpolation-filters": "sRGB"
    }, defs);
    node("feGaussianBlur", { in: "SourceAlpha", stdDeviation: round(blur / 2) }, filter);
    node("feOffset", { dx: round(dx), dy: round(dy), result: "offset-shadow" }, filter);
    node("feFlood", { "flood-color": color, "flood-opacity": "1", result: "shadow-color" }, filter);
    node("feComposite", {
      in: "shadow-color", in2: "offset-shadow", operator: "in"
    }, filter);
    return "url(#" + id + ")";
  }

  function styleAttrs(style, scale) {
    const scaledLength = value => {
      if (!value || value === "normal") return value || "normal";
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? round(number * scale) + "px" : value;
    };
    return {
      fill: style.color || "#111111",
      "font-family": style.fontFamily || "Arial, sans-serif",
      "font-size": scaledLength(style.fontSize || "16px"),
      "font-weight": style.fontWeight || "400",
      "font-style": style.fontStyle || "normal",
      "font-stretch": style.fontStretch || "normal",
      "letter-spacing": scaledLength(style.letterSpacing),
      "word-spacing": scaledLength(style.wordSpacing),
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
      : (align === "right" ? (rtl ? "start" : "end")
        : align === "left" ? (rtl ? "end" : "start")
        : align === "end" ? "end" : "start");
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(" ");

    lines.forEach(line => {
      const content = line.glyphs.join("");
      if (!content.trim()) return;
      const x = anchor === "middle" ? (line.left + line.right) / 2
        : (anchor === "start" ? (rtl ? line.right : line.left) : (rtl ? line.left : line.right));
      const measured = context ? context.measureText(content) : null;
      const ascent = measured && measured.actualBoundingBoxAscent
        ? measured.actualBoundingBoxAscent : fontSize * 0.82;
      const y = line.top - rootRect.top + ascent;
      const width = line.right - line.left;
      const text = node("text", Object.assign(styleAttrs(style, scale), {
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
    const tag = source.localName.toLowerCase();
    if (!SVG_TAGS.has(tag)) {
      warnings.add("عنصر SVG پشتیبانی‌نشده شناسایی شد: " + tag);
      return;
    }
    const outputTag = tag === "lineargradient" ? "linearGradient"
      : tag === "radialgradient" ? "radialGradient"
      : tag === "clippath" ? "clipPath" : tag;
    const target = node(outputTag, {}, parent);
    ATTRS.forEach(attribute => {
      if (source.hasAttribute(attribute)) target.setAttribute(attribute, source.getAttribute(attribute));
    });
    const style = computedStyle(source);
    if (style.transform && style.transform !== "none") warnings.add("CSS transform روی SVG در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.filter && style.filter !== "none") warnings.add("CSS filter روی SVG در خروجی برداری پشتیبانی نمی‌شود.");
    [
      "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width",
      "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
      "stroke-dashoffset", "stroke-opacity", "opacity", "font-family",
      "font-size", "font-weight", "font-style", "font-stretch",
      "letter-spacing", "word-spacing", "text-anchor", "dominant-baseline",
      "direction", "unicode-bidi", "clip-path", "stop-color", "stop-opacity"
    ].forEach(attribute => {
      const value = style.getPropertyValue(attribute);
      if (!value || (value === "normal" && !["fill", "stroke"].includes(attribute))) return;
      target.setAttribute(attribute, value);
    });
    Array.from(source.childNodes).forEach(child => {
      if (child.nodeType === 1) copySvgElement(child, target, warnings);
      else if (child.nodeType === 3 && child.nodeValue) {
        target.appendChild(document.createTextNode(child.nodeValue));
      }
    });
    return target;
  }

  function renderHtmlElement(source, parent, rootRect, scale, defs, warnings, counter) {
    if (source.nodeType === 3) {
      appendText(source, parent, rootRect, scale, warnings);
      return;
    }
    if (source.nodeType !== 1) return;

    const tag = source.localName.toLowerCase();
    const style = computedStyle(source);
    if (style.display === "none" || style.visibility === "hidden") return;

    if (tag === "svg") {
      if (style.transform && style.transform !== "none") warnings.add("CSS transform روی SVG در خروجی برداری پشتیبانی نمی‌شود.");
      if (style.filter && style.filter !== "none") warnings.add("CSS filter روی SVG در خروجی برداری پشتیبانی نمی‌شود.");
      if (style.clipPath && style.clipPath !== "none") warnings.add("CSS clip-path روی SVG در خروجی برداری پشتیبانی نمی‌شود.");
      const rect = source.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nested = node("svg", {
        x: round((rect.left - rootRect.left) * scale),
        y: round((rect.top - rootRect.top) * scale),
        width: round(rect.width * scale),
        height: round(rect.height * scale),
        viewBox: source.getAttribute("viewBox") || (
          "0 0 " + (source.getAttribute("width") || rect.width) + " " +
          (source.getAttribute("height") || rect.height)
        ),
        preserveAspectRatio: source.getAttribute("preserveAspectRatio") || "xMidYMid meet",
        opacity: style.opacity === "1" ? null : style.opacity
      }, parent);
      Array.from(source.childNodes).forEach(child => {
        if (child.nodeType === 1) copySvgElement(child, nested, warnings);
      });
      return;
    }

    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const isArtboard = source.classList.contains("logo-art-root");
    if (!isArtboard && (
      rect.left < rootRect.left - 0.5 || rect.top < rootRect.top - 0.5 ||
      rect.right > rootRect.right + 0.5 || rect.bottom > rootRect.bottom + 0.5
    )) warnings.add("یک عنصر از محدوده بوم لوگو بیرون زده و در پیش‌نمایش بریده می‌شود.");

    if (style.transform && style.transform !== "none") warnings.add("CSS transform در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.perspective && style.perspective !== "none") warnings.add("CSS perspective در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.textShadow && style.textShadow !== "none") warnings.add("text-shadow در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.outlineStyle && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) warnings.add("outline در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.borderImageSource && style.borderImageSource !== "none") warnings.add("border-image در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.animationName && style.animationName !== "none" && style.animationDuration !== "0s") warnings.add("انیمیشن CSS در خروجی برداری ثابت قابل بازسازی نیست.");
    if (style.transitionDuration && style.transitionDuration !== "0s" && style.transitionDuration !== "0ms") warnings.add("transition CSS در خروجی برداری قابل بازسازی نیست.");
    if (style.mixBlendMode && style.mixBlendMode !== "normal") warnings.add("ترکیب لایه‌های CSS در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.backgroundBlendMode && style.backgroundBlendMode !== "normal") warnings.add("ترکیب پس‌زمینه‌های CSS در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.filter && style.filter !== "none") warnings.add("CSS filter در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.backdropFilter && style.backdropFilter !== "none") warnings.add("backdrop-filter در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.clipPath && style.clipPath !== "none") warnings.add("CSS clip-path در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.maskImage && style.maskImage !== "none") warnings.add("CSS mask در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.position === "fixed" || style.position === "sticky") warnings.add("موقعیت‌دهی fixed یا sticky در خروجی برداری پشتیبانی نمی‌شود.");
    if (style.zIndex && style.zIndex !== "auto") warnings.add("z-index در خروجی برداری پشتیبانی نمی‌شود.");
    if (!isArtboard && (style.overflowX !== "visible" || style.overflowY !== "visible")) warnings.add("برش داخلی با overflow در این نسخه پشتیبانی نمی‌شود.");
    if (style.borderTopWidth !== style.borderRightWidth ||
        style.borderTopWidth !== style.borderBottomWidth ||
        style.borderTopWidth !== style.borderLeftWidth) warnings.add("ضخامت‌های متفاوت border در این نسخه پشتیبانی نمی‌شوند.");
    if (style.borderTopStyle !== style.borderRightStyle ||
        style.borderTopStyle !== style.borderBottomStyle ||
        style.borderTopStyle !== style.borderLeftStyle) warnings.add("سبک‌های متفاوت border در این نسخه پشتیبانی نمی‌شوند.");
    if (style.borderTopColor !== style.borderRightColor ||
        style.borderTopColor !== style.borderBottomColor ||
        style.borderTopColor !== style.borderLeftColor) warnings.add("رنگ‌های متفاوت border در این نسخه پشتیبانی نمی‌شوند.");
    if (style.borderTopLeftRadius !== style.borderTopRightRadius ||
        style.borderTopLeftRadius !== style.borderBottomLeftRadius ||
        style.borderTopLeftRadius !== style.borderBottomRightRadius) warnings.add("شعاع‌های متفاوت گوشه‌ها در این نسخه پشتیبانی نمی‌شوند.");
    if (style.borderTopStyle !== "none" && style.borderTopStyle !== "solid") warnings.add("فقط border یکپارچه و solid قابل تبدیل است.");

    const x = round((rect.left - rootRect.left) * scale);
    const y = round((rect.top - rootRect.top) * scale);
    const width = round(rect.width * scale);
    const height = round(rect.height * scale);
    const group = node("g", { opacity: style.opacity === "1" ? null : style.opacity }, parent);

    const backgroundColor = style.backgroundColor;
    const backgroundImage = style.backgroundImage;
    let gradientFill = null;
    if (backgroundImage && backgroundImage !== "none") {
      if (style.backgroundSize && !["auto", "auto auto"].includes(style.backgroundSize)) {
        warnings.add("background-size سفارشی در خروجی برداری پشتیبانی نمی‌شود.");
      }
      if (style.backgroundPosition && style.backgroundPosition !== "0% 0%") {
        warnings.add("background-position سفارشی در خروجی برداری پشتیبانی نمی‌شود.");
      }
      if (style.backgroundRepeat && style.backgroundRepeat !== "repeat") {
        warnings.add("background-repeat سفارشی در خروجی برداری پشتیبانی نمی‌شود.");
      }
      if (parseFloat(style.borderTopWidth) > 0 && style.backgroundOrigin !== "border-box") {
        warnings.add("ترکیب background-origin با border در خروجی برداری پشتیبانی نمی‌شود.");
      }
      gradientFill = parseGradient(backgroundImage, "nava-gradient-" + (++counter.value), defs, {
        x, y, width, height
      });
      if (!gradientFill) warnings.add("این نوع background-image یا gradient در خروجی برداری پشتیبانی نمی‌شود.");
    }

    const radiusValue = style.borderTopLeftRadius || "0px";
    const radiusParts = radiusValue.trim().split(/\s+/);
    const radiusX = radiusParts[0] || "0px";
    const radiusY = radiusParts[1] || radiusParts[0] || "0px";
    const radiusToSvg = (value, dimension) => {
      const amount = parseFloat(value) || 0;
      return round((value.includes("%") ? amount * dimension / 100 : amount) * scale);
    };
    const rx = radiusToSvg(radiusX, rect.width);
    const ry = radiusToSvg(radiusY, rect.height);
    const borderWidth = Math.max(0, parseFloat(style.borderTopWidth) || 0);
    const borderScaled = borderWidth * scale;
    const borderColor = style.borderTopColor;
    const box = { x, y, width, height, rx, ry };

    const shadow = parseShadow(style.boxShadow, "nava-shadow-" + (++counter.value), defs, scale);
    if (style.boxShadow && style.boxShadow !== "none" && !shadow) {
      warnings.add("این نوع box-shadow در خروجی برداری پشتیبانی نمی‌شود.");
    }
    if (shadow) node("rect", Object.assign({}, box, { fill: "#000000", filter: shadow }), group);
    if (colorIsVisible(backgroundColor)) node("rect", Object.assign({}, box, { fill: backgroundColor }), group);
    if (gradientFill) node("rect", Object.assign({}, box, { fill: gradientFill }), group);
    if (borderWidth > 0) {
      const inset = borderScaled / 2;
      node("rect", {
        x: round(x + inset), y: round(y + inset),
        width: round(Math.max(0, width - borderScaled)),
        height: round(Math.max(0, height - borderScaled)),
        rx: round(Math.max(0, rx - inset)), ry: round(Math.max(0, ry - inset)),
        fill: "none", stroke: borderColor, "stroke-width": round(borderScaled)
      }, group);
    }

    const before = computedStyle(source, "::before").content;
    const after = computedStyle(source, "::after").content;
    if ((before && before !== "none" && before !== "normal") ||
        (after && after !== "none" && after !== "normal")) {
      warnings.add("شبه‌عنصرهای CSS در خروجی برداری پشتیبانی نمی‌شوند.");
    }
    Array.from(source.childNodes).forEach(child => {
      renderHtmlElement(child, group, rootRect, scale, defs, warnings, counter);
    });
  }

  async function buildSvg(frame, options = {}) {
    if (!frame || !frame.contentDocument) throw new Error("پیش‌نمایش لوگو هنوز آماده نیست.");
    const doc = frame.contentDocument;
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    const root = doc.querySelector(".logo-art-root");
    if (!root) throw new Error("ساختار بوم طراحی پیدا نشد.");
    const rootRect = root.getBoundingClientRect();
    if (!rootRect.width || !rootRect.height) throw new Error("ابعاد بوم طراحی معتبر نیست.");
    if (Math.abs(rootRect.width - rootRect.height) > Math.max(rootRect.width, rootRect.height) * 0.01) {
      throw new Error("بوم طراحی باید مربع باشد تا نسبت اجزای لوگو در خروجی تغییر نکند.");
    }

    // The HTML/CSS browser renderer is the design engine. Do not redraw it
    // with a reduced set of SVG primitives: that lossy conversion caused
    // complex marks, shadows, gradients and typography to collapse into lines.
    // This SVG packages only the final logo artboard, not the Studio UI.
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const size = 1000;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("xmlns:xhtml", XHTML_NS);
    svg.setAttribute("width", String(options.width || 1200));
    svg.setAttribute("height", String(options.height || 1200));
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("role", "img");
    const title = document.createElementNS(NS, "title");
    title.textContent = "Logo — " + (options.brandName || "NAVA");
    svg.appendChild(title);

    const foreign = document.createElementNS(NS, "foreignObject");
    foreign.setAttribute("x", "0");
    foreign.setAttribute("y", "0");
    foreign.setAttribute("width", String(size));
    foreign.setAttribute("height", String(size));

    const stage = doc.createElementNS(XHTML_NS, "div");
    stage.setAttribute("xmlns", XHTML_NS);
    stage.setAttribute("style", "width:" + size + "px;height:" + size + "px;overflow:hidden;margin:0;padding:0;");
    const css = Array.from(doc.querySelectorAll("style"))
      .map(style => style.textContent || "")
      .join("\n");
    const styleNode = doc.createElementNS(XHTML_NS, "style");
    styleNode.textContent = css + "\nhtml,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important}*{box-sizing:border-box}";
    stage.appendChild(styleNode);

    const scale = size / rootRect.width;
    const scaled = doc.createElementNS(XHTML_NS, "div");
    scaled.setAttribute("style",
      "position:relative;width:" + rootRect.width + "px;height:" + rootRect.height +
      "px;overflow:hidden;transform:scale(" + scale + ");transform-origin:top left;");
    const art = root.cloneNode(true);

    // Export only safe logo markup; no executable or interactive document nodes.
    art.querySelectorAll("script,iframe,object,embed,form,button,input,textarea,select,link,meta,base,foreignObject")
      .forEach(element => element.remove());
    [art, ...Array.from(art.querySelectorAll("*"))].forEach(element => {
      Array.from(element.attributes || []).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith("on") || name === "srcdoc" ||
            ((name === "src" || name === "href") && value &&
             !value.startsWith("#") && !value.startsWith("data:"))) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    art.style.width = rootRect.width + "px";
    art.style.height = rootRect.height + "px";
    scaled.appendChild(art);
    stage.appendChild(scaled);
    foreign.appendChild(stage);
    svg.appendChild(foreign);

    const serialized = new XMLSerializer().serializeToString(svg);
    const parsed = new DOMParser().parseFromString(serialized, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
      throw new Error("اعتبارسنجی ساختار SVG نهایی ناموفق بود.");
    }
    if (parsed.querySelector("script,iframe,object,embed,form,foreignObject foreignObject")) {
      throw new Error("ساختار خروجی شامل محتوای اجرایی یا غیرمجاز است.");
    }
    return { svg: serialized, warnings: [] };
  }

  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;a.rel="noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Keep the URL alive long enough for mobile browsers/WebViews to open the fallback link.
    setTimeout(()=>URL.revokeObjectURL(url),5*60*1000);
    return url;
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
      return downloadBlob(png,filename);
    } finally { URL.revokeObjectURL(url); }
  }

  // Copy the iframe's *computed* visual tree into the parent document before
  // rasterizing. html2canvas cannot reliably paint a foreign-document subtree
  // on Android WebView; it often captures only the iframe/artboard background.
  // Inlining computed styles also preserves gradients, dimensions, transforms,
  // borders and shadows without relying on the model's stylesheet at export time.
  function copyComputedTree(source, targetDocument) {
    if (source.nodeType === 3) return targetDocument.createTextNode(source.nodeValue || "");
    if (source.nodeType !== 1) return null;
    const namespace = source.namespaceURI;
    const clone = namespace && namespace !== "http://www.w3.org/1999/xhtml"
      ? targetDocument.createElementNS(namespace, source.nodeName)
      : targetDocument.createElement(source.localName);
    Array.from(source.attributes || []).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (!name.startsWith("on") && name !== "srcdoc") {
        try { clone.setAttribute(attribute.name, attribute.value); } catch (_) {}
      }
    });
    const sourceWindow = source.ownerDocument.defaultView;
    const applyStyle = (from, to) => {
      const style = sourceWindow.getComputedStyle(source, from || null);
      for (let i = 0; i < style.length; i += 1) {
        const property = style[i];
        if (!property || property.startsWith("--")) continue;
        try { to.style.setProperty(property, style.getPropertyValue(property)); } catch (_) {}
      }
      to.style.setProperty("animation", "none", "important");
      to.style.setProperty("transition", "none", "important");
      to.style.setProperty("caret-color", "transparent", "important");
    };
    applyStyle(null, clone);
    const appendPseudo = pseudo => {
      const pseudoStyle = sourceWindow.getComputedStyle(source, pseudo);
      const content = pseudoStyle.getPropertyValue("content");
      if (!content || content === "none" || content === "normal" || content === "''" || content === '""') return;
      const generated = targetDocument.createElement("span");
      generated.setAttribute("aria-hidden", "true");
      for (let i = 0; i < pseudoStyle.length; i += 1) {
        const property = pseudoStyle[i];
        if (!property || property === "content" || property.startsWith("--")) continue;
        try { generated.style.setProperty(property, pseudoStyle.getPropertyValue(property)); } catch (_) {}
      }
      generated.style.setProperty("animation", "none", "important");
      generated.style.setProperty("transition", "none", "important");
      const text = content.length >= 2 && ((content[0] === '"' && content.at(-1) === '"') || (content[0] === "'" && content.at(-1) === "'"))
        ? content.slice(1, -1) : "";
      if (text && text !== "none") generated.textContent = text;
      if (pseudo === "::before") clone.insertBefore(generated, clone.firstChild);
      else clone.appendChild(generated);
    };
    appendPseudo("::before");
    Array.from(source.childNodes).forEach(child => {
      const copied = copyComputedTree(child, targetDocument);
      if (copied) clone.appendChild(copied);
    });
    appendPseudo("::after");
    return clone;
  }

  async function exportPngFromFrame(frame,filename,size) {
    const doc=frame && frame.contentDocument;
    const root=doc && doc.querySelector(".logo-art-root");
    if(!root)throw new Error("بوم پیش‌نمایش برای ساخت PNG پیدا نشد.");
    if(doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    const rect=root.getBoundingClientRect();
    if(!rect.width||!rect.height||Math.abs(rect.width-rect.height)>Math.max(rect.width,rect.height)*0.01) {
      throw new Error("ابعاد بوم پیش‌نمایش برای ساخت PNG معتبر نیست.");
    }
    if(typeof global.html2canvas!=="function") {
      throw new Error("موتور رندر PNG بارگذاری نشده است؛ صفحه را تازه‌سازی کن و دوباره تلاش کن.");
    }
    const outputSize=Math.max(1200,Math.min(3200,Math.round(Number(size)||2400)));
    const stage=document.createElement("div");
    stage.setAttribute("aria-hidden","true");
    // Keep the temporary capture stage inside the actual viewport. Several
    // Android WebViews return a transparent canvas when html2canvas is asked
    // to rasterize a fixed element positioned far outside the viewport.
    stage.style.cssText="position:fixed;left:0;top:0;width:"+rect.width+"px;height:"+rect.height+"px;overflow:hidden;margin:0;padding:0;pointer-events:none;z-index:2147483647;background:transparent;";
    const clone=copyComputedTree(root,document);
    // Preserve the generated artboard background exactly as seen in the iframe preview.
    clone.style.setProperty("width",rect.width+"px","important");
    clone.style.setProperty("height",rect.height+"px","important");
    clone.style.setProperty("min-width",rect.width+"px","important");
    clone.style.setProperty("min-height",rect.height+"px","important");
    clone.style.setProperty("max-width","none","important");
    clone.style.setProperty("max-height","none","important");
    clone.style.setProperty("transform","none","important");
    stage.appendChild(clone);
    document.body.appendChild(stage);
    let canvas;
    try {
      canvas=await global.html2canvas(clone,{
        backgroundColor:null,
        scale:outputSize/rect.width,
        width:rect.width,
        height:rect.height,
        windowWidth:Math.max(document.documentElement.clientWidth,Math.ceil(rect.width)),
        windowHeight:Math.max(document.documentElement.clientHeight,Math.ceil(rect.height)),
        scrollX:0,
        scrollY:0,
        useCORS:false,
        allowTaint:false,
        imageTimeout:0,
        logging:false,
        removeContainer:true,
        foreignObjectRendering:false
      });
    } finally {
      stage.remove();
    }
    if(!canvas || !canvas.width || !canvas.height) {
      throw new Error("موتور رندر، تصویر معتبر برای خروجی PNG تولید نکرد.");
    }
    const pixelContext=canvas.getContext("2d",{willReadFrequently:true});
    if(!pixelContext)throw new Error("خواندن تصویر نهایی PNG در این مرورگر ممکن نیست.");
    const pixels=pixelContext.getImageData(0,0,canvas.width,canvas.height).data;
    let visiblePixels=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8&&++visiblePixels>=24)break;
    if(visiblePixels<24)throw new Error("طرح واقعی در خروجی PNG دیده نشد؛ فایل خالی ذخیره نشد.");
    const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("ساخت فایل PNG ناموفق بود.")),"image/png"));
    if(!png)throw new Error("ساخت فایل PNG ناموفق بود.");
    return downloadBlob(png,filename);
  }
  // SVG reconstruction is intentionally not exposed as a user export.
  // PNG is captured directly from the browser-rendered HTML/CSS artboard.
  global.NavaLogoRenderer={downloadBlob,exportPngFromFrame};
})(window);
