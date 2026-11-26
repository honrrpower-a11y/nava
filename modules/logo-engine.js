// Deterministic HTML/CSS construction grammar for NAVI Logo Studio.
// NAVI owns the brief and art direction; this module owns the actual geometry.
// No SVG, canvas, raster assets, external fonts, or runtime drawing APIs.
const esc = value => String(value || "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);

function detectFamily(data, blueprint) {
  const prompt = String(data.designPrompt || "").toLocaleLowerCase("fa");
  const text = [
    data.symbolIdea, data.industry, data.brandName,
    blueprint?.firstRead, blueprint?.centralThesis, blueprint?.symbolConstruction,
    blueprint?.geometryRecipe, blueprint?.objectCues?.join(" ")
  ].join(" ").toLocaleLowerCase("fa");
  const familyOf = value => {
    if (/کتاب|کتابخانه|کتابفروشی|book|library|bookstore|reading/.test(value)) return "book";
    if (/موسیقی|آهنگ|صدا|موزیک|music|audio|sound|melody/.test(value)) return "music";
    if (/شبکه|اینترنت|اتصال|ارتباط|network|internet|connect|web/.test(value)) return "network";
    if (/نان|نانوایی|شیرینی|بیکری|bread|bakery|pastry/.test(value)) return "bread";
    if (/برگ|گیاه|طبیعت|سبز|leaf|plant|botanical|nature/.test(value)) return "leaf";
    if (/قهوه|کافه|coffee|cafe/.test(value)) return "coffee";
    return "";
  };
  // In client mode the explicit design request outranks older/default form hints.
  const requestedFamily = data.designMode === "custom" ? familyOf(prompt) : "";
  if (requestedFamily) return requestedFamily;
  const inferredFamily = familyOf(text);
  if (inferredFamily) return inferredFamily;
  return "monogram";
}

const families = {
  book: [
    {
      title:"گشودگی و دانش",
      rationale:"دو صفحه باز با عطف مرکزی، کتاب را در نگاه اول مشخص می‌کند؛ برش بالایی صفحات امضای بصری مسیر است.",
      html:'<div class="book-spread"><div class="book-page page-left"><span class="page-cut cut-one"></span><span class="page-cut cut-two"></span></div><div class="book-page page-right"><span class="page-cut cut-one"></span><span class="page-cut cut-two"></span></div><div class="book-spine"></div><div class="book-foot"></div></div>',
      css:'.navi-symbol{position:relative;width:74cqw;height:48cqw;max-width:74%;max-height:48%;margin:auto;display:grid;place-items:center;overflow:visible}.book-spread{position:relative;width:100%;height:100%;filter:drop-shadow(0 2.2cqw 1.8cqw rgba(18,28,42,.18))}.book-page{position:absolute;top:8%;width:48%;height:78%;background:linear-gradient(145deg,#fff 0%,#f1eee7 68%,#d8d2c6 100%);border:1px solid rgba(30,42,58,.18);box-shadow:inset 0 -1.5cqw 0 rgba(35,45,58,.08),inset 0 1cqw 0 rgba(255,255,255,.9)}.page-left{left:2%;border-radius:8% 5% 13% 18%;transform:skewY(7deg);clip-path:polygon(0 8%,88% 0,100% 100%,8% 86%)}.page-right{right:2%;border-radius:5% 8% 18% 13%;transform:skewY(-7deg);clip-path:polygon(12% 0,100% 8%,92% 86%,0 100%)}.page-cut{position:absolute;display:block;height:2.2%;width:42%;background:var(--logo-primary);opacity:.22;border-radius:9px}.page-left .cut-one{left:20%;top:33%}.page-left .cut-two{left:27%;top:44%;width:35%}.page-right .cut-one{right:20%;top:33%}.page-right .cut-two{right:27%;top:44%;width:35%}.book-spine{position:absolute;z-index:3;left:49%;top:8%;width:2.5%;height:78%;background:linear-gradient(90deg,#8d7653,var(--logo-primary),#e9d9b9);border-radius:50%;box-shadow:0 0 1.2cqw rgba(0,0,0,.22)}.book-foot{position:absolute;left:13%;right:13%;bottom:4%;height:5%;border-radius:50%;background:var(--logo-primary);opacity:.85}'
    },
    {
      title:"کتابِ استوار",
      rationale:"کتاب بسته با جلد مشخص، بلوک صفحات و عطف برجسته، هویت ماندگار و قابل‌تشخیص می‌سازد.",
      html:'<div class="closed-book"><div class="book-cover"><span class="cover-inset"></span><span class="cover-mark"></span></div><div class="page-block"></div><div class="book-spine"></div></div>',
      css:'.navi-symbol{position:relative;width:54cqw;height:70cqw;max-width:54%;max-height:70%;margin:auto;overflow:visible}.closed-book{position:absolute;inset:4% 7% 8% 7%;transform:rotate(-7deg);filter:drop-shadow(2cqw 2.8cqw 2cqw rgba(20,28,40,.2))}.page-block{position:absolute;right:3%;top:7%;width:83%;height:88%;background:repeating-linear-gradient(180deg,#fff 0 2.5%,#d9d5cc 2.7% 3.3%);border-radius:3% 8% 8% 3%;clip-path:polygon(0 0,100% 5%,100% 100%,0 94%)}.book-cover{position:absolute;z-index:2;left:0;top:0;width:84%;height:94%;border-radius:8% 3% 3% 8%;background:linear-gradient(125deg,var(--logo-primary),#34465a 72%,#182b40);box-shadow:inset 1.4cqw 0 0 rgba(255,255,255,.17),inset -1.2cqw 0 0 rgba(0,0,0,.2)}.cover-inset{position:absolute;inset:10%;border:1.2cqw solid rgba(255,255,255,.5);border-radius:4%}.cover-mark{position:absolute;left:36%;top:30%;width:28%;height:35%;border:1.5cqw solid rgba(255,255,255,.85);border-radius:45% 45% 12% 12%}.book-spine{position:absolute;z-index:3;left:6%;top:0;width:7%;height:96%;background:linear-gradient(90deg,rgba(0,0,0,.28),rgba(255,255,255,.3));border-radius:5px}'
    },
    {
      title:"صفحه و عطف",
      rationale:"سیلوئت باز و زاویه‌دار صفحات با عطف ممتد، خوانش کتاب را با فرمی فشرده‌تر و معاصر ترکیب می‌کند.",
      html:'<div class="angular-book"><div class="leaf-page left-leaf"></div><div class="leaf-page right-leaf"></div><div class="gutter"></div><div class="page-edge"></div></div>',
      css:'.navi-symbol{position:relative;width:78cqw;height:58cqw;max-width:78%;max-height:58%;margin:auto;overflow:visible}.angular-book{position:absolute;inset:8% 0 4%;filter:drop-shadow(0 2cqw 1.5cqw rgba(15,25,38,.16))}.leaf-page{position:absolute;top:5%;width:49%;height:83%;background:linear-gradient(145deg,#fff,#e7e2d8);border:1px solid rgba(35,45,55,.18)}.left-leaf{left:0;clip-path:polygon(0 0,100% 14%,91% 100%,10% 78%);border-radius:8% 2% 12% 20%}.right-leaf{right:0;clip-path:polygon(0 14%,100% 0,90% 78%,9% 100%);border-radius:2% 8% 20% 12%}.gutter{position:absolute;left:48%;top:17%;height:68%;width:4%;background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(255,255,255,.6),rgba(0,0,0,.12));border-radius:50%}.page-edge{position:absolute;bottom:3%;left:12%;width:76%;height:8%;background:var(--logo-primary);clip-path:polygon(0 0,50% 55%,100% 0,92% 100%,8% 100%);border-radius:0 0 20% 20%}'
    }
  ],
  music: [
    {
      title:"موجِ پیوسته",
      rationale:"یک نوار صوتی پیوسته با فراز و فرود کنترل‌شده، به‌جای میله‌های اکولایزر، حس جریان موسیقی را منتقل می‌کند.",
      html:'<div class="sound-ribbon"><span class="ribbon-loop"></span><span class="ribbon-core"></span><span class="ribbon-tail"></span></div>',
      css:'.navi-symbol{position:relative;width:72cqw;height:62cqw;max-width:72%;max-height:62%;margin:auto}.sound-ribbon{position:absolute;inset:12% 3%;filter:drop-shadow(0 2cqw 2cqw rgba(20,30,45,.18))}.ribbon-loop{position:absolute;left:5%;top:12%;width:54%;height:68%;border:7cqw solid var(--logo-primary);border-right-color:transparent;border-radius:55% 48% 52% 45%;transform:rotate(-28deg)}.ribbon-core{position:absolute;left:39%;top:39%;width:52%;height:22%;background:linear-gradient(90deg,var(--logo-primary),#b7a17a,var(--logo-primary));border-radius:50% 8% 50% 8%;transform:rotate(-27deg);box-shadow:0 1cqw 2cqw rgba(0,0,0,.16)}.ribbon-tail{position:absolute;right:0;top:8%;width:28%;height:72%;border-right:5cqw solid var(--logo-primary);border-radius:50%;transform:rotate(22deg);opacity:.8}'
    },
    {
      title:"طنین و ریتم",
      rationale:"دو قوس هم‌مرکز و یک هسته فشرده، حرکت انتشار صدا را با ریتمی نامتقارن و امضادار نشان می‌دهد.",
      html:'<div class="resonance"><span class="resonance-core"></span><span class="resonance-arc arc-one"></span><span class="resonance-arc arc-two"></span></div>',
      css:'.navi-symbol{position:relative;width:70cqw;height:70cqw;max-width:70%;max-height:70%;margin:auto}.resonance{position:absolute;inset:8%;display:grid;place-items:center}.resonance-core{position:absolute;left:10%;top:38%;width:26%;height:26%;background:linear-gradient(145deg,var(--logo-primary),#8c7656);border-radius:50% 18% 50% 18%;transform:rotate(45deg);box-shadow:0 2cqw 3cqw rgba(0,0,0,.2)}.resonance-arc{position:absolute;border:4cqw solid var(--logo-primary);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(45deg)}.arc-one{width:64%;height:64%;right:8%;opacity:.9}.arc-two{width:94%;height:94%;right:-5%;opacity:.42;border-width:2.5cqw}'
    },
    {
      title:"پیوندِ نغمه",
      rationale:"فرم مرکزی شبیه موجِ تاخورده، حرکت ملودی را به یک نشانه یکپارچه و فشرده تبدیل می‌کند.",
      html:'<div class="melody-knot"><span class="knot-left"></span><span class="knot-right"></span><span class="knot-join"></span></div>',
      css:'.navi-symbol{position:relative;width:76cqw;height:62cqw;max-width:76%;max-height:62%;margin:auto}.melody-knot{position:absolute;inset:8% 4%}.knot-left,.knot-right{position:absolute;top:8%;width:54%;height:78%;border:6cqw solid var(--logo-primary);border-radius:50%;transform:rotate(35deg)}.knot-left{left:0;border-right-color:transparent}.knot-right{right:0;border-left-color:transparent;transform:rotate(-35deg)}.knot-join{position:absolute;left:38%;top:44%;width:26%;height:14%;background:var(--logo-primary);border-radius:50%;transform:rotate(-12deg)}'
    }
  ],
  network: [
    {
      title:"گره‌های هم‌پیوند",
      rationale:"سه گره با اتصال‌های مورب و یک گره مرکزی، ساختار شبکه را به‌صورت یک سامانه واحد نشان می‌دهد.",
      html:'<div class="network-map"><span class="net-link link-a"></span><span class="net-link link-b"></span><span class="net-link link-c"></span><span class="net-node node-a"></span><span class="net-node node-b"></span><span class="net-node node-c"></span><span class="net-node node-center"></span></div>',
      css:'.navi-symbol{position:relative;width:70cqw;height:70cqw;max-width:70%;max-height:70%;margin:auto}.network-map{position:absolute;inset:8%}.net-link{position:absolute;height:5%;background:linear-gradient(90deg,var(--logo-primary),#a99776);border-radius:99px;transform-origin:left center}.link-a{left:25%;top:27%;width:57%;transform:rotate(29deg)}.link-b{left:25%;top:27%;width:57%;transform:rotate(112deg)}.link-c{left:25%;top:27%;width:57%;transform:rotate(-28deg)}.net-node{position:absolute;width:27%;height:27%;border-radius:50%;background:linear-gradient(145deg,#fff,var(--logo-primary));border:2cqw solid var(--logo-primary);box-shadow:0 1.5cqw 2.5cqw rgba(0,0,0,.18)}.node-a{left:4%;top:9%}.node-b{right:1%;top:9%}.node-c{left:5%;bottom:2%}.node-center{left:37%;top:35%;width:31%;height:31%;background:linear-gradient(145deg,var(--logo-primary),#263c52);border:1cqw solid #fff}'
    },
    {
      title:"اتصالِ متمرکز",
      rationale:"هسته مرکزی و سه بازوی نامتقارن، شبکه‌ای با مرکز روشن و مسیرهای قابل‌ردیابی می‌سازد.",
      html:'<div class="network-hub"><span class="hub-arm arm-one"></span><span class="hub-arm arm-two"></span><span class="hub-arm arm-three"></span><span class="hub-core"></span><span class="hub-node node-one"></span><span class="hub-node node-two"></span><span class="hub-node node-three"></span></div>',
      css:'.navi-symbol{position:relative;width:70cqw;height:70cqw;max-width:70%;max-height:70%;margin:auto}.network-hub{position:absolute;inset:5%}.hub-arm{position:absolute;left:40%;top:40%;width:50%;height:5%;background:var(--logo-primary);border-radius:99px;transform-origin:left center}.arm-one{transform:rotate(-38deg)}.arm-two{transform:rotate(25deg)}.arm-three{transform:rotate(130deg)}.hub-core{position:absolute;left:28%;top:28%;width:42%;height:42%;border-radius:38% 62% 45% 55%;background:linear-gradient(135deg,var(--logo-primary),#c2a979);box-shadow:0 2cqw 3cqw rgba(0,0,0,.2)}.hub-node{position:absolute;width:23%;height:23%;border:2cqw solid var(--logo-primary);border-radius:50%;background:#fff}.node-one{right:0;top:0}.node-two{right:0;bottom:2%}.node-three{left:0;bottom:0}'
    },
    {
      title:"شبکه‌ی جاری",
      rationale:"اتصال‌ها به شکل مسیر ممتد و گوشه‌گرد ساخته شده‌اند تا حس جریان اطلاعات، نه صرفاً مجموعه‌ای از نقطه‌ها، منتقل شود.",
      html:'<div class="network-flow"><span class="flow-path"></span><span class="flow-node node-start"></span><span class="flow-node node-mid"></span><span class="flow-node node-end"></span></div>',
      css:'.navi-symbol{position:relative;width:78cqw;height:60cqw;max-width:78%;max-height:60%;margin:auto}.network-flow{position:absolute;inset:10% 3%}.flow-path{position:absolute;left:8%;top:28%;width:84%;height:48%;border:5cqw solid var(--logo-primary);border-left-color:transparent;border-radius:0 55% 55% 0;transform:skewY(-14deg)}.flow-node{position:absolute;width:22%;height:22%;background:linear-gradient(145deg,#fff,#c8b58f);border:2cqw solid var(--logo-primary);border-radius:38%}.node-start{left:0;top:5%}.node-mid{left:40%;bottom:0;border-radius:50%}.node-end{right:0;top:0;border-radius:50%}'
    }
  ],
  bread: [
    {
      title:"نانِ تازه",
      rationale:"فرم یک قرص نان با پوسته برجسته و شیارهای پخت، موضوع را مستقیم و بدون نشانه‌های تزئینی اضافی منتقل می‌کند.",
      html:'<div class="loaf"><span class="loaf-score score-one"></span><span class="loaf-score score-two"></span><span class="loaf-score score-three"></span><span class="loaf-base"></span></div>',
      css:'.navi-symbol{position:relative;width:72cqw;height:58cqw;max-width:72%;max-height:58%;margin:auto}.loaf{position:absolute;left:5%;right:5%;top:14%;height:70%;border-radius:48% 48% 22% 22%;background:linear-gradient(145deg,#f2d6a4 0%,#c58b4d 58%,#8b572e 100%);box-shadow:inset 0 2cqw 0 rgba(255,255,255,.55),inset 0 -3cqw 0 rgba(75,42,20,.25),0 3cqw 3cqw rgba(30,25,20,.2)}.loaf-score{position:absolute;top:17%;width:8%;height:36%;border-left:3cqw solid #fff0d0;border-radius:50%;transform:rotate(28deg);box-shadow:1cqw 0 0 rgba(93,53,27,.22)}.score-one{left:30%}.score-two{left:48%;top:11%}.score-three{left:66%}.loaf-base{position:absolute;left:8%;right:8%;bottom:-5%;height:16%;border-radius:50%;background:linear-gradient(#a96d37,#744421)}'
    },
    {
      title:"مهرِ نانوا",
      rationale:"قرص نان با برش‌های مشخص درون یک قاب نرم و اختصاصی قرار می‌گیرد؛ مناسب هویت سنتی‌تر و ماندگار.",
      html:'<div class="artisan-loaf"><span class="bread-body"></span><span class="bread-cut cut-a"></span><span class="bread-cut cut-b"></span><span class="bread-cut cut-c"></span></div>',
      css:'.navi-symbol{position:relative;width:68cqw;height:68cqw;max-width:68%;max-height:68%;margin:auto}.artisan-loaf{position:absolute;inset:8%;border:3cqw solid var(--logo-primary);border-radius:48% 48% 34% 34%;display:grid;place-items:center}.bread-body{position:absolute;left:13%;right:13%;top:20%;height:63%;background:linear-gradient(140deg,#f8dfb5,#c18a4f 70%,#87532d);border-radius:50% 50% 25% 25%;box-shadow:inset 0 2cqw 0 rgba(255,255,255,.5),0 2cqw 3cqw rgba(0,0,0,.16)}.bread-cut{position:absolute;top:29%;width:5%;height:32%;background:#fff0d1;border-radius:50%;transform:rotate(30deg)}.cut-a{left:34%}.cut-b{left:49%;top:24%}.cut-c{left:64%}'
    },
    {
      title:"پوسته و برش",
      rationale:"نمای فشرده و هندسی نان با یک برش مرکزی شاخص، در اندازه کوچک نیز هویت نانوایی را حفظ می‌کند.",
      html:'<div class="bread-crest"><span class="crest-loaf"></span><span class="crest-score"></span><span class="crest-crust"></span></div>',
      css:'.navi-symbol{position:relative;width:76cqw;height:62cqw;max-width:76%;max-height:62%;margin:auto}.bread-crest{position:absolute;inset:8% 3%}.crest-loaf{position:absolute;left:8%;top:16%;width:84%;height:72%;background:linear-gradient(135deg,#f5d5a1,#b97a3e 75%);border-radius:52% 52% 18% 18%;box-shadow:inset 0 -2cqw 0 rgba(74,40,19,.24),0 2cqw 3cqw rgba(0,0,0,.18)}.crest-score{position:absolute;left:47%;top:22%;width:7%;height:39%;border-left:4cqw solid #fff0cf;border-radius:50%;transform:rotate(24deg)}.crest-crust{position:absolute;left:17%;right:17%;bottom:9%;height:7%;background:#764521;border-radius:50%;opacity:.72}'
    }
  ],
  leaf: [
    {
      title:"برگِ زنده",
      rationale:"سیلوئت برگ با نوک مشخص و رگبرگ مرکزی، طبیعت را به نشانی روشن و قابل‌شناسایی تبدیل می‌کند.",
      html:'<div class="leaf-mark"><span class="leaf-body"></span><span class="leaf-vein"></span><span class="leaf-branch branch-one"></span><span class="leaf-branch branch-two"></span></div>',
      css:'.navi-symbol{position:relative;width:65cqw;height:76cqw;max-width:65%;max-height:76%;margin:auto}.leaf-mark{position:absolute;inset:4% 10%;transform:rotate(28deg)}.leaf-body{position:absolute;inset:4% 7%;background:linear-gradient(135deg,#b9c99a,#527c54 68%,#294e3b);border-radius:5% 88% 5% 88%;box-shadow:inset 2cqw 2cqw 0 rgba(255,255,255,.25),0 2cqw 3cqw rgba(0,0,0,.16)}.leaf-vein{position:absolute;left:49%;top:10%;width:2.5%;height:83%;background:#e5e9d5;border-radius:50%;transform:rotate(36deg)}.leaf-branch{position:absolute;left:32%;width:27%;height:2%;background:#e5e9d5;border-radius:50%;transform-origin:right center}.branch-one{top:40%;transform:rotate(28deg)}.branch-two{top:61%;transform:rotate(-24deg)}'
    },
    {
      title:"رویشِ نو",
      rationale:"دو برگ نامتقارن از یک ساقه مشترک رشد می‌کنند؛ ساختار، حس رشد و حرکت رو به جلو را تقویت می‌کند.",
      html:'<div class="sprout"><span class="sprout-stem"></span><span class="sprout-leaf leaf-a"></span><span class="sprout-leaf leaf-b"></span><span class="sprout-ground"></span></div>',
      css:'.navi-symbol{position:relative;width:68cqw;height:72cqw;max-width:68%;max-height:72%;margin:auto}.sprout{position:absolute;inset:4% 10%}.sprout-stem{position:absolute;left:48%;top:28%;height:65%;width:5%;background:linear-gradient(90deg,#315a40,#86a16d);border-radius:50%;transform:rotate(8deg)}.sprout-leaf{position:absolute;width:48%;height:42%;background:linear-gradient(135deg,#b7c990,#4c7b51);border-radius:8% 90% 8% 90%;box-shadow:0 2cqw 3cqw rgba(0,0,0,.14)}.leaf-a{left:0;top:7%;transform:rotate(8deg)}.leaf-b{right:0;top:22%;transform:scaleX(-1) rotate(8deg)}.sprout-ground{position:absolute;left:12%;right:12%;bottom:0;height:5%;border-radius:50%;background:var(--logo-primary);opacity:.7}'
    },
    {
      title:"رگبرگِ هندسی",
      rationale:"برگ با برش کشیده و محور مرکزی، هویت طبیعی را در قالبی دقیق‌تر و مدرن‌تر فشرده می‌کند.",
      html:'<div class="vein-leaf"><span class="vein-main"></span><span class="vein-side side-a"></span><span class="vein-side side-b"></span></div>',
      css:'.navi-symbol{position:relative;width:70cqw;height:70cqw;max-width:70%;max-height:70%;margin:auto}.vein-leaf{position:absolute;inset:8% 12%;background:linear-gradient(145deg,#b8c99b,#416f4c);clip-path:polygon(50% 0,91% 27%,100% 60%,50% 100%,0 60%,9% 27%);border-radius:45%;filter:drop-shadow(0 2cqw 2cqw rgba(0,0,0,.18))}.vein-main{position:absolute;left:49%;top:12%;width:2.5%;height:80%;background:#e7edda;border-radius:50%}.vein-side{position:absolute;left:28%;top:42%;width:27%;height:2%;background:#e7edda;border-radius:50%}.side-a{transform:rotate(27deg)}.side-b{left:47%;top:62%;transform:rotate(-25deg)}'
    }
  ],
  coffee: [
    {
      title:"فنجانِ عمیق",
      rationale:"کاسه فنجان، دسته و سطح قهوه در یک سیلوئت خوانا ترکیب شده‌اند.",
      html:'<div class="coffee-cup"><span class="cup-bowl"></span><span class="cup-handle"></span><span class="coffee-surface"></span><span class="cup-foot"></span></div>',
      css:'.navi-symbol{position:relative;width:76cqw;height:66cqw;max-width:76%;max-height:66%;margin:auto}.coffee-cup{position:absolute;inset:8% 3%}.cup-bowl{position:absolute;left:8%;top:20%;width:68%;height:63%;background:linear-gradient(145deg,#fff,#ded5c7);border:3cqw solid var(--logo-primary);border-radius:8% 8% 42% 42%;box-shadow:inset 0 -3cqw 0 rgba(0,0,0,.08),0 2cqw 3cqw rgba(0,0,0,.16)}.cup-handle{position:absolute;right:4%;top:28%;width:30%;height:42%;border:6cqw solid var(--logo-primary);border-left:0;border-radius:0 55% 55% 0}.coffee-surface{position:absolute;left:13%;top:22%;width:58%;height:8%;background:linear-gradient(90deg,#4c2b1c,#9a6740);border-radius:50%}.cup-foot{position:absolute;left:22%;bottom:8%;width:42%;height:5%;background:var(--logo-primary);border-radius:50%}'
    },
    {
      title:"عطرِ قهوه",
      rationale:"فنجان مینیمال با دو مسیر بخار منحنی، تجربه عطر و نوشیدنی را در یک نشانه جمع می‌کند.",
      html:'<div class="coffee-aroma"><span class="aroma-cup"></span><span class="aroma-steam steam-a"></span><span class="aroma-steam steam-b"></span></div>',
      css:'.navi-symbol{position:relative;width:68cqw;height:72cqw;max-width:68%;max-height:72%;margin:auto}.coffee-aroma{position:absolute;inset:5% 8%}.aroma-cup{position:absolute;left:12%;bottom:8%;width:70%;height:45%;border:5cqw solid var(--logo-primary);border-top-width:3cqw;border-radius:8% 8% 35% 35%;background:linear-gradient(#e9dfcf,#fff)}.aroma-cup:after{content:"";position:absolute;right:-27%;top:10%;width:26%;height:45%;border:4cqw solid var(--logo-primary);border-left:0;border-radius:0 50% 50% 0}.aroma-steam{position:absolute;top:2%;width:12%;height:40%;border-left:4cqw solid #b29a72;border-radius:50%;transform:rotate(14deg)}.steam-a{left:39%}.steam-b{left:59%;top:0;transform:rotate(-15deg)}'
    },
    {
      title:"دانه و فنجان",
      rationale:"دانه قهوه به‌عنوان فضای منفی در بدنه فنجان قرار گرفته و دو معنا را در یک ساختار واحد پیوند می‌دهد.",
      html:'<div class="bean-cup"><span class="bean-cup-body"></span><span class="bean-negative"></span><span class="bean-handle"></span></div>',
      css:'.navi-symbol{position:relative;width:72cqw;height:68cqw;max-width:72%;max-height:68%;margin:auto}.bean-cup{position:absolute;inset:12% 5%}.bean-cup-body{position:absolute;left:6%;top:15%;width:70%;height:68%;background:linear-gradient(135deg,var(--logo-primary),#a58a62);border-radius:10% 10% 38% 38%;box-shadow:0 2cqw 3cqw rgba(0,0,0,.17)}.bean-negative{position:absolute;left:30%;top:28%;width:22%;height:34%;border-radius:55% 45% 55% 45%;background:#fff;transform:rotate(28deg)}.bean-negative:after{content:"";position:absolute;left:48%;top:5%;height:90%;width:7%;background:#a58a62;border-radius:50%;transform:rotate(-18deg)}.bean-handle{position:absolute;right:1%;top:26%;width:34%;height:44%;border:6cqw solid var(--logo-primary);border-left:0;border-radius:0 50% 50% 0}'
    }
  ],
  monogram: [
    {
      title:"حرفِ امضادار",
      rationale:"حرف آغازین نام برند به یک فرم هندسی اختصاصی تبدیل می‌شود؛ ساختار بر خوانایی و تناسب متمرکز است.",
      html:'<div class="initial-mark"><span class="initial-letter">{{INITIAL}}</span><span class="initial-cut"></span></div>',
      css:'.navi-symbol{position:relative;width:66cqw;height:66cqw;max-width:66%;max-height:66%;margin:auto}.initial-mark{position:absolute;inset:4%;display:grid;place-items:center;background:linear-gradient(145deg,var(--logo-primary),#263b50);border-radius:28% 8% 28% 8%;box-shadow:inset 1.5cqw 1.5cqw 0 rgba(255,255,255,.18),0 3cqw 4cqw rgba(0,0,0,.2);transform:rotate(-5deg)}.initial-letter{font-family:inherit;font-size:52cqw;font-weight:900;line-height:1;color:#fff;text-shadow:0 2cqw 1cqw rgba(0,0,0,.2);transform:rotate(5deg)}.initial-cut{position:absolute;right:9%;top:10%;width:18%;height:18%;border-top:2cqw solid rgba(255,255,255,.65);border-right:2cqw solid rgba(255,255,255,.65)}'
    },
    {
      title:"نشانِ لایه‌مند",
      rationale:"دو سطح هم‌پوشان و یک بریدگی کنترل‌شده، حرف آغازین را در یک نشان معاصر و قابل‌استفاده می‌سازند.",
      html:'<div class="layered-initial"><span class="initial-back"></span><span class="initial-front">{{INITIAL}}</span></div>',
      css:'.navi-symbol{position:relative;width:68cqw;height:68cqw;max-width:68%;max-height:68%;margin:auto}.layered-initial{position:absolute;inset:4%}.initial-back{position:absolute;left:0;top:0;width:72%;height:82%;background:linear-gradient(145deg,#b49b70,#806744);border-radius:18% 50% 18% 50%;transform:rotate(-18deg);box-shadow:0 2cqw 3cqw rgba(0,0,0,.18)}.initial-front{position:absolute;right:0;bottom:0;width:78%;height:82%;display:grid;place-items:center;background:linear-gradient(145deg,var(--logo-primary),#1f3348);color:#fff;border-radius:50% 18% 50% 18%;font-size:48cqw;font-weight:900;line-height:1;box-shadow:inset 1cqw 1cqw 0 rgba(255,255,255,.16)}'
    },
    {
      title:"مونوگرامِ متوازن",
      rationale:"حرف برند درون یک قاب باز و نامتقارن قرار می‌گیرد؛ فضای منفی به‌اندازه خود حرف در هویت نقش دارد.",
      html:'<div class="open-monogram"><span class="monogram-letter">{{INITIAL}}</span><span class="monogram-frame"></span></div>',
      css:'.navi-symbol{position:relative;width:72cqw;height:72cqw;max-width:72%;max-height:72%;margin:auto}.open-monogram{position:absolute;inset:5%;display:grid;place-items:center}.monogram-letter{position:relative;z-index:2;font-size:54cqw;font-weight:900;line-height:1;color:var(--logo-primary);text-shadow:1cqw 1cqw 0 rgba(177,155,117,.45)}.monogram-frame{position:absolute;inset:4%;border:4cqw solid var(--logo-primary);border-left-color:transparent;border-radius:16% 46% 16% 46%;transform:rotate(12deg)}'
    }
  ]
};

// Translate NAVI's semantic construction notes into controlled, visible HTML/CSS geometry.
// The model never supplies markup here: blueprint language only selects reusable primitives.
function deriveSemanticGeometry(blueprint, family, index) {
  const semanticText = [
    blueprint?.geometryRecipe, blueprint?.objectCues?.join(" "),
    blueprint?.spatialRelationship, blueprint?.negativeSpace,
    blueprint?.signatureFeature, blueprint?.silhouette
  ].filter(Boolean).join(" ").toLocaleLowerCase("fa");
  const html = [];
  const css = [];
  const features = [];
  const radiance = /پرتو|اشعه|شعاع|نور|روشنای|درخشش|تابش|سپیده|طلوع|light|ray|radiance|glow|beam|sunbeam/.test(semanticText);
  if (radiance) {
    const rayCount = 3 + (index % 3);
    const rays = Array.from({ length: rayCount }, (_, rayIndex) => '<span class="semantic-ray ray-' + (rayIndex + 1) + '"></span>').join("");
    html.push('<span class="semantic-radiance" aria-hidden="true">' + rays + '</span>');
    css.push([
      '.semantic-radiance{position:absolute;z-index:6;left:50%;top:-19%;width:36%;height:47%;transform:translateX(-50%);pointer-events:none;filter:drop-shadow(0 .8cqw 1.2cqw rgba(177,137,65,.2))}',
      '.semantic-ray{position:absolute;bottom:0;display:block;width:10%;height:var(--ray-height,78%);background:linear-gradient(180deg,rgba(222,183,105,.2),#c49a52 58%,#e5cb91);clip-path:polygon(50% 0,100% 100%,0 100%);transform-origin:50% 100%;border-radius:30% 30% 0 0}',
      '.semantic-ray.ray-1{left:8%;height:58%;transform:rotate(-35deg)}',
      '.semantic-ray.ray-2{left:27%;height:84%;transform:rotate(-17deg)}',
      '.semantic-ray.ray-3{left:46%;height:100%;width:12%}',
      '.semantic-ray.ray-4{left:66%;height:82%;transform:rotate(17deg)}',
      '.semantic-ray.ray-5{left:84%;height:58%;transform:rotate(35deg)}'
    ].join(""));
    features.push("radiance-rays");
  }
  const asymmetricMass = /نامتقارن|یک.?طرف|یک سمت|سمت راست|سمت چپ|پرتر|سنگین.?تر|asymmetr|one[- ]sided|one side|heavier side|larger side|thicker side/.test(semanticText);
  if (asymmetricMass) {
    const rulesByFamily = {
      book: '.book-page.page-left{width:52%;transform:skewY(5deg) scaleY(1.02)}.book-page.page-right{width:44%;transform:skewY(-9deg) scaleY(.96)}.book-spine{width:3.2%;left:48.5%}',
      network: '.net-node.node-a{width:33%;height:33%}.net-node.node-b{width:21%;height:21%}.net-node.node-center{width:34%;height:34%;left:35%}.net-link.link-a{height:6%}',
      music: '.ribbon-loop{width:61%;border-width:8cqw}.ribbon-core{width:56%;left:35%}.ribbon-tail{width:22%;opacity:.65}',
      leaf: '.leaf-body{inset:0 2% 5% 15%;border-radius:8% 92% 4% 84%}.leaf-vein{width:3.2%;left:48%}',
      bread: '.loaf{left:2%;right:10%;transform:rotate(-5deg)}.loaf-score.score-one{height:42%}',
      coffee: '.cup-bowl{width:72%;left:5%}.cup-handle{right:0;width:26%}'
    };
    if (rulesByFamily[family]) { css.push(rulesByFamily[family]); features.push("asymmetric-mass"); }
  }
  return { html: html.join(""), css: css.join("\n"), features };
}

function wordmarkHtml(data) {
  return '<div class="logo-lockup"><div class="wordmark-only"><span data-logo-role="brand">{{BRAND_NAME}}</span></div>' +
    (data.slogan ? '<small class="slogan-only" data-logo-role="slogan">{{SLOGAN}}</small>' : "") + '</div>';
}

export function buildStructuredLogoConcepts(data, blueprints) {
  const family = detectFamily(data, blueprints?.[0]);
  const variants = families[family] || families.monogram;
  const count = Math.min(blueprints.length, data.singleConcept ? 1 : 3);
  const initial = Array.from(String(data.brandName || "").trim())[0] || "N";
  const concepts = [];
  for (let index = 0; index < count; index += 1) {
    const blueprint = blueprints[index] || blueprints[0] || {};
    const variant = variants[index % variants.length];
    const semanticGeometry = deriveSemanticGeometry(blueprint, family, index);
    let html = data.format === "wordmark"
      ? wordmarkHtml(data)
      : '<div class="mark-lockup"><div class="navi-symbol" data-logo-role="symbol">' +
        variant.html.replace(/\{\{INITIAL\}\}/g, esc(initial)) +
        semanticGeometry.html +
        '</div><div class="brand-lockup"><strong data-logo-role="brand">{{BRAND_NAME}}</strong>' +
        (data.slogan ? '<small data-logo-role="slogan">{{SLOGAN}}</small>' : "") +
        '</div></div>';
    let css = [
      '.logo-art-root{display:grid;place-items:center;padding:7%;direction:rtl;text-align:center;font-family:Arial,Tahoma,sans-serif;color:var(--logo-primary)}',
      '.mark-lockup{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5cqw}',
      variant.css,
      semanticGeometry.css,
      '.brand-lockup{max-width:90%;display:flex;flex-direction:column;align-items:center;gap:1.5cqw;margin-top:1cqw}',
      '.brand-lockup strong{display:block;color:var(--logo-primary);font-size:clamp(28px,7cqw,76px);font-weight:850;line-height:1.3;letter-spacing:-.035em;direction:auto;unicode-bidi:plaintext;text-wrap:balance}',
      '.brand-lockup small{display:block;color:var(--logo-primary);font-size:clamp(13px,2.8cqw,27px);font-weight:500;line-height:1.5;opacity:.78;direction:auto;unicode-bidi:plaintext}',
      '.logo-lockup{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3cqw}',
      '.wordmark-only{font-size:clamp(34px,10cqw,110px);font-weight:900;line-height:1.2;letter-spacing:-.04em;color:var(--logo-primary);direction:auto;unicode-bidi:plaintext}',
      '.slogan-only{font-size:clamp(15px,3cqw,30px);opacity:.78;direction:auto;unicode-bidi:plaintext}'
    ].join('\n');
    const anchors = (blueprint.briefElements || []).slice(0, 4);
    const visualAnchors = anchors.length
      ? anchors.map((description, i) => ({ id: "anchor-" + (i + 1), description, relationship: i === 0 ? "primary silhouette" : "integrated in the central mark" }))
      : [{ id: "anchor-1", description: blueprint.firstRead || family + " identity", relationship: "primary silhouette" }];
    concepts.push({
      index: index + 1,
      title: blueprint.title || variant.title,
      rationale: variant.rationale,
      centralThesis: blueprint.centralThesis || variant.rationale,
      briefElements: anchors.length ? anchors : [blueprint.firstRead || variant.title],
      symbolConstruction: blueprint.symbolConstruction || variant.rationale,
      briefAlignment: blueprint.briefAlignment || variant.rationale,
      visualAnchors,
      anchorMap: visualAnchors.map(anchor => ({ anchorId: anchor.id, layerClass: "navi-symbol", visualRole: "visible in the primary HTML/CSS silhouette" })),
      mechanism: "A semantic subject-specific construction is rendered from a deterministic HTML/CSS component grammar, then finished as a responsive identity lockup.",
      expressionMove: blueprint.signatureFeature || variant.title,
      semanticGeometry: semanticGeometry.features,
      semanticGeometryNote: semanticGeometry.features.length ? "NAVI blueprint cues were translated into visible geometry: " + semanticGeometry.features.join(", ") : "Base subject grammar retained; no supported secondary geometry cue was detected.",
      geometryRecipe: blueprint.geometryRecipe || "",
      spatialRelationship: blueprint.spatialRelationship || "",
      negativeSpace: blueprint.negativeSpace || "",
      differsBy: variant.title + " — distinct silhouette and geometry, not a recolour.",
      axes: { "ساختار": variant.title, "پرداخت": blueprint.materialDirection || "concept-specific" },
      defaultsUsed: [],
      html,
      css
    });
  }
  return { family, concepts };
}
