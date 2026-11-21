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

// Paint DOM text through Chromium Canvas 2D so Persian/Arabic shaping is retained.
function extractNativeText(source,clone,rootRect,runs){
 if(source.nodeType===3){
  const value=source.nodeValue||"",parent=source.parentElement;
  if(!value.trim()||!parent){clone.nodeValue="";return;}
  const style=parent.ownerDocument.defaultView.getComputedStyle(parent),range=source.ownerDocument.createRange();
  const seg=typeof Intl.Segmenter==="function"?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  const parts=seg?Array.from(seg.segment(value),x=>({text:x.segment,index:x.index})):Array.from(value).map((text,index,all)=>({text,index:all.slice(0,index).join("").length}));
  const lines=new Map();
  for(const part of parts){range.setStart(source,part.index);range.setEnd(source,part.index+part.text.length);const rect=range.getBoundingClientRect();if(!rect||(!rect.width&&!rect.height))continue;const key=Math.round(rect.top*2)/2;if(!lines.has(key))lines.set(key,{text:"",left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom});const line=lines.get(key);line.text+=part.text;line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);line.top=Math.min(line.top,rect.top);line.bottom=Math.max(line.bottom,rect.bottom);}
  for(const line of lines.values())if(line.text.trim())runs.push({text:line.text,style,left:line.left-rootRect.left,right:line.right-rootRect.left,top:line.top-rootRect.top,height:Math.max(1,line.bottom-line.top)});
  clone.nodeValue="";return;
 }
 if(source.nodeType!==1||clone.nodeType!==1)return;
 const a=Array.from(source.childNodes||[]),b=Array.from(clone.childNodes||[]);
 for(let i=0;i<Math.min(a.length,b.length);i++)extractNativeText(a[i],b[i],rootRect,runs);
}
function paintNativeText(canvas,runs,scale){
 if(!runs.length)return;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("بوم متن فارسی برای خروجی PNG در دسترس نیست.");
 for(const run of runs){const s=run.style;ctx.save();ctx.scale(scale,scale);ctx.font=s.font||(s.fontWeight+" "+s.fontSize+" "+s.fontFamily);ctx.direction=s.direction==="rtl"?"rtl":"ltr";ctx.textBaseline="alphabetic";ctx.globalAlpha=Number.parseFloat(s.opacity||"1")||1;ctx.fillStyle=s.color||"#000";const align=s.textAlign;ctx.textAlign=align==="center"?"center":(align==="right"||align==="end"?"right":(align==="left"||align==="start"?"left":(s.direction==="rtl"?"right":"left")));const x=align==="center"?(run.left+run.right)/2:ctx.textAlign==="right"?run.right:run.left;const y=run.top+run.height*.82;const stroke=Number.parseFloat(s.webkitTextStrokeWidth||"0");if(stroke>0){ctx.lineWidth=stroke*2;ctx.strokeStyle=s.webkitTextStrokeColor||s.color||"#000";ctx.strokeText(run.text,x,y);}ctx.fillText(run.text,x,y);ctx.restore();}
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
 const clone=copyComputedTree(root,document);
 const nativeTextRuns=[];
 extractNativeText(root,clone,rect,nativeTextRuns);
 clone.style.setProperty("width",rect.width+"px","important"); clone.style.setProperty("height",rect.height+"px","important");
 clone.style.setProperty("max-width","none","important"); clone.style.setProperty("max-height","none","important");
 stage.appendChild(clone); document.body.appendChild(stage);
 try {
  if(document.fonts&&document.fonts.ready) await document.fonts.ready;
  const canvas=await global.html2canvas(clone,{backgroundColor:null,scale,width:rect.width,height:rect.height,windowWidth:Math.ceil(rect.width),windowHeight:Math.ceil(rect.height),scrollX:0,scrollY:0,useCORS:false,allowTaint:false,logging:false,removeContainer:true});
  if(!canvas||canvas.width<outputSize*.95||canvas.height<outputSize*.95) throw new Error("تصویر PNG با وضوح درخواستی ساخته نشد.");
  const pixels=canvas.getContext("2d")?.getImageData(0,0,canvas.width,canvas.height).data; let visible=0;
  if(pixels) for(let i=3;i<pixels.length;i+=4) if(pixels[i]>8&&++visible>=24) break;
  if(visible<24) throw new Error("طرح واقعی در تصویر نهایی دیده نشد؛ فایل خالی ذخیره نشد.");
  paintNativeText(canvas,nativeTextRuns,scale);
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
