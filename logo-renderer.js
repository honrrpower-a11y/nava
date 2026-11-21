/* NAVA Logo Studio: direct HTML/CSS DOM rasterization. SVG is not generated or used. */
(function installNavaLogoRenderer(global) {
"use strict";
function downloadBlob(blob, filename) {
 const url=URL.createObjectURL(blob), anchor=document.createElement("a");
 anchor.href=url; anchor.download=filename; anchor.rel="noopener";
 document.body.appendChild(anchor); anchor.click(); anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5*60*1000); return url;
}
  function copyComputedTree(source, targetDocument) {
    if (source.nodeType === 3) return targetDocument.createTextNode(source.nodeValue || "");
    if (source.nodeType !== 1) return null;
    const clone = targetDocument.createElement(source.localName);
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

function paintNativeText(canvas, root, rootRect, scale) {
 const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("بوم متن فارسی در دسترس نیست.");
 const doc=root.ownerDocument, walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT), groups=[]; let node;
 while((node=walker.nextNode())) {
  const value=node.nodeValue||""; if(!value.trim()||!node.parentElement) continue;
  const parent=node.parentElement, style=doc.defaultView.getComputedStyle(parent);
  if(style.display==="none"||style.visibility==="hidden"||style.writingMode!=="horizontal-tb") continue;
  let offset=0;
  for(const character of value) {
   const range=doc.createRange(); range.setStart(node,offset); range.setEnd(node,offset+character.length); offset+=character.length;
   for(const rect of Array.from(range.getClientRects()).filter(r=>r.width||r.height)) {
    const top=Math.round(rect.top*2)/2;
    let line=groups.find(item=>item.node===node&&Math.abs(item.top-top)<=1);
    if(!line){line={node,parent,style,top,minX:rect.left,maxX:rect.right,minY:rect.top,maxY:rect.bottom,text:""};groups.push(line);}
    line.text+=character; line.minX=Math.min(line.minX,rect.left); line.maxX=Math.max(line.maxX,rect.right); line.minY=Math.min(line.minY,rect.top); line.maxY=Math.max(line.maxY,rect.bottom);
   }
  }
 }
 ctx.save(); ctx.setTransform(scale,0,0,scale,-rootRect.left*scale,-rootRect.top*scale);
 for(const line of groups) {
  const style=line.style, fontSize=parseFloat(style.fontSize)||16;
  ctx.font=[style.fontStyle,style.fontVariant,style.fontWeight,fontSize+"px",style.fontFamily].filter(Boolean).join(" ");
  ctx.direction=style.direction==="rtl"?"rtl":"ltr";
  const alignment=style.textAlign;
  if(alignment==="center") ctx.textAlign="center";
  else if(alignment==="right"||(alignment==="end"&&ctx.direction==="ltr")||(alignment==="start"&&ctx.direction==="rtl")) ctx.textAlign="right";
  else if(alignment==="left"||(alignment==="start"&&ctx.direction==="ltr")||(alignment==="end"&&ctx.direction==="rtl")) ctx.textAlign="left";
  else ctx.textAlign=ctx.direction==="rtl"?"right":"left";
  const lineHeight=style.lineHeight==="normal"?fontSize*1.2:(parseFloat(style.lineHeight)||fontSize*1.2);
  const ascent=ctx.measureText(line.text).actualBoundingBoxAscent||fontSize*.8;
  const baseline=line.minY+(lineHeight-fontSize)/2+ascent;
  const x=ctx.textAlign==="center"?(line.minX+line.maxX)/2:ctx.textAlign==="right"?line.maxX:line.minX;
  let opacity=1, element=line.parent;
  while(element&&element!==root.parentElement){opacity*=Number(doc.defaultView.getComputedStyle(element).opacity||1);if(element===root)break;element=element.parentElement;}
  ctx.globalAlpha=Math.max(0,Math.min(1,opacity)); ctx.fillStyle=style.color; ctx.shadowColor="transparent"; ctx.shadowBlur=0;
  ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; if("letterSpacing" in ctx) ctx.letterSpacing=style.letterSpacing||"0px";
  ctx.fillText(line.text,x,baseline);
 }
 ctx.restore();
}
function hideCloneText(root) {
 for(const element of [root,...root.querySelectorAll("*")]) {
  element.style.setProperty("color","transparent","important");
  element.style.setProperty("-webkit-text-fill-color","transparent","important");
  element.style.setProperty("text-shadow","none","important");
 }
}
async function renderFrameCanvas(frame,size) {
 const doc=frame&&frame.contentDocument, root=doc&&doc.querySelector(".logo-art-root");
 if(!root) throw new Error("بوم پیش‌نمایش برای ساخت تصویر پیدا نشد.");
 if(root.querySelector("svg")) throw new Error("در موتور لوگوساز فقط ساختار HTML/CSS مجاز است؛ SVG شناسایی شد.");
 if(doc.fonts&&doc.fonts.ready) await doc.fonts.ready;
 const rect=root.getBoundingClientRect();
 if(!rect.width||!rect.height||Math.abs(rect.width-rect.height)>Math.max(rect.width,rect.height)*.01) throw new Error("ابعاد بوم پیش‌نمایش معتبر نیست.");
 if(typeof global.html2canvas!=="function") throw new Error("موتور مستقیم تبدیل HTML/CSS به PNG بارگذاری نشده است.");
 const outputSize=Math.max(1200,Math.min(3200,Math.round(Number(size)||2400))), scale=outputSize/rect.width;
 const stage=document.createElement("div"); stage.setAttribute("aria-hidden","true");
 stage.style.cssText="position:fixed;left:-100000px;top:0;z-index:-1;width:"+rect.width+"px;height:"+rect.height+"px;overflow:hidden;pointer-events:none;contain:layout paint style";
 const clone=copyComputedTree(root,document);\n hideCloneText(clone);
 clone.style.setProperty("width",rect.width+"px","important"); clone.style.setProperty("height",rect.height+"px","important");
 clone.style.setProperty("max-width","none","important"); clone.style.setProperty("max-height","none","important");
 stage.appendChild(clone); document.body.appendChild(stage);
 try {
  if(document.fonts&&document.fonts.ready) await document.fonts.ready;
  const canvas=await global.html2canvas(clone,{backgroundColor:null,scale,width:rect.width,height:rect.height,windowWidth:Math.ceil(rect.width),windowHeight:Math.ceil(rect.height),scrollX:0,scrollY:0,useCORS:false,allowTaint:false,logging:false,removeContainer:true});
  if(!canvas||canvas.width<outputSize*.95||canvas.height<outputSize*.95) throw new Error("تصویر PNG با وضوح درخواستی ساخته نشد.");\n  paintNativeText(canvas,root,rect,canvas.width/rect.width);
  const pixels=canvas.getContext("2d")?.getImageData(0,0,canvas.width,canvas.height).data; let visible=0;
  if(pixels) for(let i=3;i<pixels.length;i+=4) if(pixels[i]>8&&++visible>=24) break;
  if(visible<24) throw new Error("طرح واقعی در تصویر نهایی دیده نشد؛ فایل خالی ذخیره نشد.");
  return canvas;
 } finally { stage.remove(); }
}
async function exportPngFromFrame(frame,filename,size) {
 const canvas=await renderFrameCanvas(frame,Math.max(1200,Math.min(3200,Math.round(Number(size)||2400))));
 const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("ساخت فایل PNG ناموفق بود.")),"image/png"));
 if(!png) throw new Error("ساخت فایل PNG ناموفق بود."); return downloadBlob(png,filename);
}
async function capturePreviewDataUrl(frame,size) {
 const canvas=await renderFrameCanvas(frame,Math.max(600,Math.min(1000,Math.round(Number(size)||768))));
 return canvas.toDataURL("image/png");
}
global.NavaLogoRenderer={downloadBlob,exportPngFromFrame,capturePreviewDataUrl};
})(window);
