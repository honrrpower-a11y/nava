"use strict";
(function installNaviLocalImageAnalysis() {
  const MAX_FILE_BYTES = 20 * 1024 * 1024, SAMPLE_EDGE = 192, GRID = 3;
  function toneLabel(h, s, b) {
    if (s < .16) return b < .28 ? "خاکستری تیره" : b > .78 ? "روشن و خنثی" : "خاکستری/خنثی";
    if (h < 18 || h >= 345) return "قرمز/گرم";
    if (h < 48) return "نارنجی و طلایی";
    if (h < 72) return "زرد";
    if (h < 165) return "سبز";
    if (h < 205) return "فیروزه‌ای";
    if (h < 260) return "آبی";
    if (h < 295) return "بنفش";
    return "صورتی";
  }
  async function analyze(file) {
    if (!(file instanceof File) || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))
      throw new Error("فرمت تصویر پشتیبانی نمی‌شود؛ JPG، PNG یا WebP انتخاب کن.");
    if (file.size > MAX_FILE_BYTES) throw new Error("حجم تصویر باید کمتر از ۲۰ مگابایت باشد.");
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (_) { throw new Error("مرورگر نتوانست تصویر را باز کند."); }
    try {
      const width = bitmap.width, height = bitmap.height;
      if (!width || !height) throw new Error("ابعاد تصویر معتبر نیست.");
      const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("پردازش تصویر در این مرورگر ممکن نیست.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sumY=0,sumY2=0,sumS=0,sumHs=0,sumHc=0,count=0;
      const bins=new Map(), cells=Array.from({length:GRID*GRID},()=>({n:0,y:0,y2:0,edge:0}));
      const w=canvas.width,h=canvas.height, lum=new Float32Array(w*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const p=(y*w+x)*4,r=data[p]/255,g=data[p+1]/255,b=data[p+2]/255;
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,yy=.2126*r+.7152*g+.0722*b;
        let hue=0;
        if(d){if(mx===r)hue=60*(((g-b)/d)%6);else if(mx===g)hue=60*((b-r)/d+2);else hue=60*((r-g)/d+4);if(hue<0)hue+=360;}
        const sat=mx?d/mx:0; lum[y*w+x]=yy;
        sumY+=yy;sumY2+=yy*yy;sumS+=sat;count++;
        if(sat>.08){const rad=hue*Math.PI/180;sumHs+=Math.sin(rad)*sat;sumHc+=Math.cos(rad)*sat;}
        const key=[r,g,b].map(v=>Math.min(3,Math.floor(v*4))).join("");
        bins.set(key,(bins.get(key)||0)+1);
        const cell=cells[Math.min(GRID-1,Math.floor(y/h*GRID))*GRID+Math.min(GRID-1,Math.floor(x/w*GRID))];
        cell.n++;cell.y+=yy;cell.y2+=yy*yy;
        if(x)cell.edge+=Math.abs(yy-lum[y*w+x-1]);
        if(y)cell.edge+=Math.abs(yy-lum[(y-1)*w+x]);
      }
      const mean=sumY/count,contrast=Math.sqrt(Math.max(0,sumY2/count-mean*mean)),sat=sumS/count;
      let hue=Math.atan2(sumHs,sumHc)*180/Math.PI;if(hue<0)hue+=360;
      const palette=[...bins.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([key])=>
        key.split("").map(v=>Math.min(255,Math.round((Number(v)*4+2)*255/4)).toString(16).padStart(2,"0")).join("").toUpperCase());
      const names=["بالا-چپ","بالا-وسط","بالا-راست","وسط-چپ","مرکز","وسط-راست","پایین-چپ","پایین-وسط","پایین-راست"];
      const regions=cells.map((c,index)=>{const avg=c.y/Math.max(1,c.n),variance=Math.sqrt(Math.max(0,c.y2/Math.max(1,c.n)-avg*avg)),edge=c.edge/Math.max(1,c.n*2),penalty=avg<.12||avg>.92?.08:0;return{index,score:variance*.65+edge*.35+penalty};}).sort((a,b)=>a.score-b.score);
      const brightness=mean<.28?"تیره":mean>.72?"روشن":"متوسط";
      const contrastText=contrast<.12?"کم":contrast>.27?"زیاد":"متوسط";
      const saturation=sat<.18?"کم‌رنگ":sat>.48?"اشباع":"متعادل";
      const orientation=width>height*1.12?"افقی":height>width*1.12?"عمودی":"مربعی";
      return [
        "گزارش تحلیل بصری محلی تصویر (ویژگی‌های پیکسلی؛ سوژه و محتوای عکس تشخیص داده نشده):",
        "ابعاد: "+width+"×"+height+" پیکسل؛ کادر "+orientation+".",
        "روشنایی: "+brightness+"؛ کنتراست: "+contrastText+"؛ اشباع رنگ: "+saturation+".",
        "تم رنگی غالب: "+toneLabel(hue,sat,mean)+"؛ پالت تقریبی: "+palette.map(c=>"#"+c).join("، ")+".",
        "ناحیه‌های کم‌جزئیات‌تر برای بررسی محل متن: "+regions.slice(0,2).map(r=>names[r.index]).join(" و ")+". این فقط پیشنهاد اولیه است.",
        "از این گزارش برای چیدمان و خوانایی متن استفاده کن؛ درباره سوژه، اشخاص یا اتفاقات داخل عکس حدس نزن."
      ].join("\n");
    } finally { bitmap.close?.(); }
  }
  window.NaviLocalImageAnalysis=Object.freeze({analyze});
})();
