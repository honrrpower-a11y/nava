const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";
const MUSIC_DURATION_SECONDS = 60;

// ACE-Step
const ACE_API_URL = "https://api.acemusic.ai/v1/chat/completions";
const ACE_MODEL = "acemusic/acestep-v1.5-turbo";

// ==========================================
// ابزارهای عمومی
// ==========================================

function json(data, status, origin) {
return new Response(JSON.stringify(data), {
status,
headers: {
"Content-Type": "application/json; charset=utf-8",
"Access-Control-Allow-Origin": origin,
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type",
"Cache-Control": "no-store"
}
});
}

function extractText(content) {
if (typeof content === "string") return content.trim();

if (Array.isArray(content)) {
return content
.map(part =>
typeof part === "string" ? part : part?.text || ""
)
.join("")
.trim();
}

return "";
}

function cleanLyrics(text) {
return String(text || "")
.replace(/<think>[\s\S]?</think>/gi, "")
.replace(/<think>[\s\S]$/gi, "")
.replace(/^(?:json)?\s*/i, "")   .replace(/\s*$/i, "")
.trim();
}

function safeText(value, maxLength = 1000) {
return String(value ?? "")
.replace(/</?(?:prompt|lyrics)\b[^>]*>/gi, "")
.replace(/[<>]/g, "")
.replace(/\u0000/g, "")
.trim()
.slice(0, maxLength);
}

function normalizePersianSpacing(text) {
return String(text || "").replace(
/([\u0621-\u064A]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
"$1ه $2"
);
}

// ==========================================
// پاک‌سازی حروف لاتین ناخواسته در شعر فارسی
// ==========================================

function cleanPersianLatinMix(text, language = "fa") {
let result = String(text || "");

if (language !== "fa") return result;

result = result.replace(
/([\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF])([A-Za-z]{1,12})(?=$|[\s،؛,.!?؟:])/g,
"$1"
);

result = result.replace(/[ \t]{2,}/g, " ");
result = result.replace(/\s+([،؛.!؟,:])/g, "$1");

return result.trim();
}

function prepareLyrics(text, language = "fa") {
let result = String(text || "");

result = normalizePersianSpacing(result);
result = cleanPersianLatinMix(result, language);

return result.trim();
}

// ==========================================
// آماده‌سازی متن برای خوانندگی
// ==========================================

function prepareSingingLyrics(text, voice) {
let result = String(text || "").trim();

if (voice !== "duet") {
result = result.replace(/\(([^()]*)\)/g, "$1");
result = result.replace(/（([^（）]*)）/g, "$1");
}

return result.trim();
}

// ==========================================
// استخراج دو نسخه شعر
// ==========================================

function parseLyricsOutput(rawText, language = "fa") {
const cleaned = cleanLyrics(rawText);

let parsed = null;

try {
parsed = JSON.parse(cleaned);
} catch {
const firstBrace = cleaned.indexOf("{");
const lastBrace = cleaned.lastIndexOf("}");

if (firstBrace !== -1 && lastBrace > firstBrace) {  
  try {  
    parsed = JSON.parse(  
      cleaned.slice(firstBrace, lastBrace + 1)  
    );  
  } catch {  
    parsed = null;  
  }  
}

}

let lyrics = "";
let singingLyrics = "";

if (
parsed &&
typeof parsed === "object" &&
!Array.isArray(parsed)
) {
lyrics = extractText(
parsed.lyrics ||
parsed.originalLyrics ||
parsed.original
);

singingLyrics = extractText(  
  parsed.singingLyrics ||  
  parsed.singing_lyrics ||  
  parsed.pronunciationLyrics  
);

}

if (!lyrics) {
lyrics = cleaned;
}

lyrics = prepareLyrics(lyrics, language);

singingLyrics = singingLyrics
? prepareLyrics(singingLyrics, language)
: lyrics;

return {
lyrics: lyrics.trim(),
singingLyrics: singingLyrics.trim()
};
}

// ==========================================
// کنترل صدای خواننده
// ==========================================

const VALID_VOICES = [
"male_pop",
"male_deep",
"male_raspy",
"female_pop",
"female_powerful",
"duet",
"instrumental"
];

function normalizeVoice(value) {
return VALID_VOICES.includes(value)
? value
: "male_pop";
}

function getVoiceDescription(voice) {
const voices = {
male_pop:   STRICT SINGLE MALE SOLO VOCAL.   Exactly one adult male singer.   One unique male vocal identity from beginning to end.   One lead vocal recording only.   Natural clear youthful male pop voice.   Keep the same singer and vocal tone throughout the entire song.   No female voice.   No second male voice.   No duet.   No backing vocals.   No vocal harmonies.   No choir.   No vocal doubling.   No layered lead vocals.   No call and response.   No vocal ad-libs.   No wordless vocal sounds.  ,

male_deep: `

STRICT SINGLE MALE SOLO BARITONE VOCAL.
Exactly one adult male singer.
One unique deep, warm and mature male voice.
One lead vocal recording only.
Keep the same male voice throughout the song.
Natural intimate baritone performance.
No female voice.
No second male voice.
No duet.
No backing vocals.
No vocal harmonies.
No choir.
No vocal doubling.
No layered lead vocals.
No call and response.
No vocal ad-libs.
No wordless vocal sounds.
`,

male_raspy: `

STRICT SINGLE MALE SOLO VOCAL.
Exactly one adult male singer.
One unique natural male voice with a subtle husky texture.
One lead vocal recording only.
Keep the same male vocal identity throughout.
No female voice.
No second male voice.
No duet.
No backing vocals.
No vocal harmonies.
No choir.
No vocal doubling.
No layered lead vocals.
No call and response.
No vocal ad-libs.
No wordless vocal sounds.
`,

female_pop: `

STRICT SINGLE FEMALE SOLO VOCAL.
Exactly one adult female singer.
One unique natural female voice throughout.
One lead vocal recording only.
No male voice.
No second female voice.
No duet.
No backing vocals.
No vocal harmonies.
No choir.
No vocal doubling.
No layered lead vocals.
No vocal ad-libs.
No wordless vocal sounds.
`,

female_powerful: `

STRICT SINGLE FEMALE SOLO VOCAL.
Exactly one adult female singer.
One unique powerful and expressive female voice.
One lead vocal recording only.
Keep the same female voice throughout.
No male voice.
No second female voice.
No duet.
No backing vocals.
No vocal harmonies.
No choir.
No vocal doubling.
No layered lead vocals.
No vocal ad-libs.
No wordless vocal sounds.
`,

duet: `

Male and female duet with two distinct and consistent singers.
Let them alternate naturally and sing together where musically appropriate.
`,

instrumental: `

STRICTLY INSTRUMENTAL MUSIC.
Absolutely no human voice of any kind.
No singing.
No speech.
No humming.
No vocal samples.
No choir.
No vocal chops.
No vocal ad-libs.
No human-like vocal sounds.
No wordless vocalizations.
`
};

return voices[voice] || voices.male_pop;
}

// ==========================================
// پروفایل مستقل برای هر حال‌وهوای موسیقی
// ==========================================

function getMoodProfile(mood) {
const profiles = {
emotional: {
bpm: 82,
description:   Emotional contemporary ballad.   Moderate-slow tempo around 82 BPM.   Expressive melodic phrases, warm harmony and gradual emotional development.   Begin intimate and restrained, then build into a memorable emotional chorus.   Use meaningful pauses and dynamic contrast.   Avoid dance beats and overly cheerful rhythms.  
},

happy: {  
  bpm: 124,  
  description: `

Genuinely joyful and uplifting music.
Fast, lively and danceable tempo.
A strong, infectious groove with a memorable melodic chorus.
Bright major-key harmony and lively rhythmic movement.
The music must feel genuinely happy, celebratory and catchy.
Do not confuse high energy with a good melody.
Avoid generic EDM loops and monotonous dance beats.
`
},

sad: {  
  bpm: 70,  
  description: `

Deep melancholic slow ballad.
Slow tempo around 70 BPM.
Minor-key atmosphere, delicate melody and spacious arrangement.
Use restrained percussion, emotional pauses and expressive instrumental phrases.
The music should feel reflective, lonely and bittersweet.
Avoid upbeat dance rhythms.
`
},

romantic: {  
  bpm: 88,  
  description: `

Warm intimate romantic music.
Gentle tempo around 88 BPM.
Soft flowing rhythm, tender melodic phrases and rich warm harmony.
Create an intimate atmosphere with graceful musical transitions.
The arrangement should feel affectionate, elegant and emotionally close.
Avoid aggressive drums and heavy rock energy.
`
},

epic: {  
  bpm: 108,  
  description: `

Powerful cinematic epic music.
Driving tempo around 108 BPM.
Grand harmonic movement, dramatic percussion and a strong memorable theme.
Build intensity progressively toward a powerful climax.
Use wide dynamic contrast and cinematic instrumental layers.
The music should feel heroic, dramatic and expansive.
`
},

calm: {  
  bpm: 66,  
  description: `

Peaceful relaxing ambient music.
Slow tempo around 66 BPM.
Gentle flowing movement, spacious sound and soft dynamics.
Use delicate melodic phrases and a calm uncluttered arrangement.
Create a meditative, peaceful and soothing atmosphere.
Avoid heavy percussion and energetic rhythmic patterns.
`
},

energetic: {  
  bpm: 136,  
  description: `

High-energy modern music.
Fast tempo around 136 BPM.
Strong rhythmic drive, punchy drums and a powerful groove.
Use energetic melodic hooks and dynamic instrumental breaks.
The music should feel exciting, active and full of momentum.
Avoid slow ballad pacing.
`
}
};

return profiles[mood] || profiles.emotional;
}

// ==========================================
// تشخیص سبک موسیقی
// ==========================================

function getStyleDescription(style, language = "fa", musicMood = "") {
const original = String(style || "Modern pop").trim();
const value = original.toLowerCase();

let detail = "";

const isIranianHappyPop =
language === "fa" &&
musicMood === "happy" &&
/پاپ|pop/.test(value) &&
!/راک|rock|هیپ.?هاپ|hip.?hop|رپ|rap|الکترونیک|edm|house|techno/.test(value);

if (isIranianHappyPop) {
detail = `
IRANIAN HAPPY POP - SPECIFIC MUSICAL IDENTITY.

This must sound like a professionally produced, genuinely popular Iranian happy pop song.
Do NOT create generic Western dance-pop, generic EDM or a simple electronic beat.

RHYTHM:
Use a lively Iranian 6/8 pop dance groove.
Make the 6/8 pulse unmistakable and naturally danceable.
Use a bouncing rhythmic feel with clear accents on the first and fourth beats of the six-part pattern.
Combine punchy kick, crisp snare, handclaps and tasteful Iranian percussion.
The rhythm must feel like a real Iranian celebration and party song, not a generic four-on-the-floor EDM track.

MELODY:
Write a memorable, catchy Iranian pop melody.
Use natural Persian melodic phrasing and familiar Iranian pop harmonic movement.
The chorus must have a strong singable hook that listeners can remember after one listen.
Use melodic variation between verses and chorus.
Avoid repetitive one-note melodies and generic Western EDM hooks.

ARRANGEMENT:
Use a polished modern Iranian pop arrangement.
Combine modern pop production with a recognizable Iranian musical character.
Use a lively bass line, rhythmic piano, tasteful melodic instrumental responses and rich but controlled accompaniment.
Create musical fills and transitions between vocal phrases.
The arrangement must sound like a complete commercial Iranian pop song.

IMPORTANT:
Do not turn this into traditional Persian classical music.
Do not turn this into Arabic pop, Turkish pop, Indian music or generic Western club music.
The result must have its own recognizable Iranian happy pop identity.
;   } else if (   /آذربایجان|آذری|azerbaijan|azerbaijani/.test(value)   ) {   detail = 
AZERBAIJANI MUSIC IDENTITY.
Use Azerbaijani melodic phrasing and regional ornamentation.
Use an expressive folk-inspired melodic character.
When appropriate, feature saz or tar-like plucked string colors.
Avoid generic Turkish pop or Western pop phrasing.
;   } else if (   /باغلاما|baglama|ترکیه|ترکی|turkish/.test(value)   ) {   detail = 
TURKISH MUSIC IDENTITY.
Use Turkish melodic phrasing and characteristic ornamentation.
Choose a coherent Turkish pop, arabesque or folk character according to the selected style.
When appropriate, feature bağlama as a recognizable instrument.
Avoid generic Western pop phrasing.
;   } else if (   /کردی|کردستان|kurdish|kurdi/.test(value)   ) {   detail = 
Use a Kurdish folk-inspired musical identity.
Use characteristic Kurdish melodic phrasing and rhythmic movement.
Give the melody a recognizable regional character.
Avoid generic Western pop arrangements.
;   } else if (   /سنتی|اصیل|traditional|classical persian|موسیقی ایرانی/.test(value)   ) {   detail = 
Use Persian traditional musical aesthetics.
Create expressive Persian melodic phrasing and ornamentation.
Use an authentic traditional musical character rather than generic pop.
;   } else if (   /راک|rock|metal/.test(value)   ) {   detail = 
Use a clearly recognizable rock arrangement.
Give electric guitars, bass and live-style drums a strong musical role.
Use rock-oriented riffs, rhythmic accents and energetic transitions.
Do not turn the arrangement into soft generic pop.
;   } else if (   /الکترونیک|edm|electronic|dance|house|techno/.test(value)   ) {   detail = 
Use a clearly electronic music production style.
Build the rhythm around electronic drums, synthesizers and controlled bass.
Use genre-appropriate rhythmic drops and electronic transitions.
Do not use a traditional acoustic ballad arrangement.
;   } else if (   /جاز|jazz|blues|بلوز/.test(value)   ) {   detail = 
Use jazz or blues musical language.
Create expressive phrasing, characteristic harmony and a natural groove.
Avoid generic pop chord progressions and production.
;   } else if (   /هیپ.?هاپ|hip.?hop|rap|رپ/.test(value)   ) {   detail = 
Use a recognizable hip-hop or rap production style.
Create a strong rhythmic foundation, controlled bass and genre-appropriate drums.
Keep the arrangement rhythmically focused.
;   } else if (   /پاپ|pop/.test(value)   ) {   detail = 
Use a polished modern pop arrangement.
Create a memorable chorus, clear melodic hooks and a contemporary rhythmic foundation.
`;
}

return {
original,
detail
};
}

// ==========================================
// زبان خوانندگی
// ==========================================

function getLanguageName(language) {
const languages = {
fa: "Persian (Farsi)",
tr: "Turkish (Istanbul Turkish)",
en: "English"
};

return languages[language] || "Persian (Farsi)";
}

function getAceLanguage(language) {
const languages = {
fa: "fa",
tr: "tr",
en: "en"
};

return languages[language] || "fa";
}

// ==========================================
// ساخت پرامپت شعر
// ==========================================

function buildLyricsPrompt(topic, style, language) {
return `
تو یک ترانه‌سرای حرفه‌ای، خلاق و مسلط به ترانه‌سرایی موسیقایی هستی.

برای موضوع زیر یک ترانه کامل، منسجم، احساسی و قابل اجرا بساز.

مشخصات:
موضوع: ${topic}
سبک و حال‌وهوای ترانه: ${style}
زبان: ${language}

اصول ترانه‌سرایی:

۱. داستان و مفهوم:

- ترانه باید یک موضوع مرکزی مشخص داشته باشد.
- از ابتدا تا انتها مسیر احساسی منسجم داشته باشد.
- هر بند تصویر یا احساس تازه‌ای اضافه کند.
- از تکرار بی‌هدف مفهوم خودداری کن.

۲. زبان:

- از زبان طبیعی، روان و زنده استفاده کن.
- جمله‌ها هنگام خواندن با صدای بلند طبیعی باشند.
- از عبارت‌های مصنوعی و ترکیب‌های بی‌معنی دوری کن.
- هیچ کلمه‌ای را فقط برای تکمیل قافیه وارد نکن.

۳. قافیه و وزن:

- قافیه‌ها طبیعی و گوش‌نواز باشند.
- طول سطرها برای اجرای موسیقایی مناسب باشد.
- روانی و معنای درست از قافیه اجباری مهم‌تر است.

۴. تصویرسازی:

- از تصاویر ملموس و جزئیات واقعی استفاده کن.
- از کلیشه‌های تکراری و عبارت‌های مصرف‌شده دوری کن.
- احساس را با تصویر و موقعیت منتقل کن.

۵. ترجیع‌بند:

- بخش به‌یادماندنی و احساسی ترانه باشد.
- جمله محوری مشخص و قابل زمزمه داشته باشد.
- ساده، قدرتمند و ماندگار باشد.

۶. ساختار:

[Verse 1]
معرفی موضوع و موقعیت.

[Pre-Chorus]
افزایش تدریجی احساس.

[Chorus]
پیام اصلی و بخش ماندگار.

[Verse 2]
ادامه داستان با تصاویر تازه.

[Bridge]
تغییر احساسی یا نگاه متفاوت.

[Final Chorus]
بازگشت به ترجیع‌بند با همان متن اصلی.

۷. کنترل کیفیت:

- تمام جمله‌ها باید معنی روشن داشته باشند.
- فارسی باید طبیعی و خوش‌آهنگ باشد.
- قافیه‌ها نباید تصنعی باشند.
- سطرها باید قابلیت خوانده شدن روی موسیقی داشته باشند.
- از تکرار بی‌هدف خودداری کن.

قوانین ویژه زبان فارسی:

اگر زبان ترانه فارسی است:

الف) فقط از حروف و واژه‌های فارسی برای متن فارسی استفاده کن.

- هیچ حرف لاتینی را به انتهای کلمات فارسی نچسبان.
- از ترکیب تصادفی حروف فارسی و لاتین خودداری کن.
- اگر واژه‌ای را نمی‌دانی، آن را با واژه فارسی طبیعی جایگزین کن.
- کلمات انگلیسی فقط زمانی مجازند که عمداً و به‌صورت مستقل در ترانه استفاده شوند.

ب) دو نسخه کاملاً هماهنگ بساز:

نسخه اول با نام lyrics:

- متن معمولی و خوانا برای نمایش به کاربر.
- بدون اعراب‌گذاری اضافی.
- ساختار و واژه‌های طبیعی فارسی.

نسخه دوم با نام singingLyrics:

- دقیقاً همان شعر و همان کلمات نسخه اول.
- فقط کلمات دشوار، چندخوانشی یا دارای تلفظ احتمالی اشتباه را با اعراب لازم مشخص کن.
- تمام شعر را اعراب‌گذاری نکن.
- اعراب‌گذاری باید با توجه به معنای جمله باشد.
- کلمات ساده و واضح را بدون اعراب نگه دار.
- هیچ کلمه‌ای را تغییر نده و هیچ سطری را حذف یا اضافه نکن.

ج) جدانویسی «ه» غیرملفوظ:
وقتی کلمه‌ای به «ه» غیرملفوظ ختم می‌شود و پسوند یا واژه‌ای مانند «ای»، «ام»، «ات»، «اش»، «ایم»، «اید» یا «اند» به آن می‌پیوندد، آن‌ها را جدا بنویس.

نمونه:
کافه ای
خانه ام
پنجره ات
خسته ام
قصه ام

این قاعده را در هر دو نسخه رعایت کن.

اگر زبان ترکی یا انگلیسی است:

- هر دو نسخه باید از نظر متن یکسان باشند.
- اعراب فارسی به آن‌ها اضافه نکن.

قوانین خروجی بسیار مهم:

- فقط یک JSON معتبر برگردان.
- هیچ مقدمه یا توضیحی بیرون از JSON ننویس.
- از Markdown و کدبلاک استفاده نکن.
- ساختار دقیقاً این باشد:

{
"lyrics": "متن کامل شعر اصلی",
"singingLyrics": "همان شعر با اعراب‌گذاری انتخابی برای خوانندگی"
}

تمام خطوط شعر و برچسب‌های بخش‌ها را در هر دو نسخه حفظ کن.
`;
}

// ==========================================
// تشخیص ساز اصلی
// ==========================================

function getInstrumentList(instruments) {
return String(instruments || "")
.split(/[,،;؛\n]+/)
.map(item => item.trim())
.filter(Boolean)
.slice(0, 8);
}

function isPianoInstrument(name) {
return /piano|پیانو|پیانوئی/i.test(name);
}

// ==========================================
// NAVA MUSIC BRAIN - ابزارهای پایه
// ==========================================

function navaHash(text) {
let hash = 2166136261;

for (let i = 0; i < text.length; i++) {
hash ^= text.charCodeAt(i);
hash = Math.imul(hash, 16777619);
}

return hash >>> 0;
}

function navaPick(items, seed) {
if (!items.length) return null;
return items[seed % items.length];
}

function detectNavaGenre(style, language, musicMood) {
const value = String(style || "").toLowerCase();

const iranianHappyPop =
language === "fa" &&
musicMood === "happy" &&
/پاپ|pop/.test(value) &&
!/راک|rock|رپ|rap|هیپ.?هاپ|hip.?hop|edm|الکترونیک/.test(value);

if (iranianHappyPop) return "iranian_happy_pop";

if (/آذربایجان|آذری|azerbaijan|azerbaijani/.test(value)) {
return "azerbaijani_folk";
}

if (/باغلاما|baglama|ترکیه|ترکی|turkish/.test(value)) {
if (/عربسک|arabesque/.test(value)) return "turkish_arabesque";
if (/سنتی|فولک|folk|محلی/.test(value)) return "turkish_folk";
return "turkish_pop";
}

if (/کردی|کردستان|kurdish|kurdi/.test(value)) {
return "kurdish_folk";
}

if (/راک|rock|metal/.test(value)) return "rock";
if (/جاز|jazz/.test(value)) return "jazz";
if (/بلوز|blues/.test(value)) return "blues";
if (/هیپ.?هاپ|hip.?hop|رپ|rap/.test(value)) return "hip_hop";
if (/edm|الکترونیک|electronic|house|techno|dance/.test(value)) {
return "electronic";
}
if (/سنتی|اصیل|traditional|classical persian|موسیقی ایرانی/.test(value)) {
return "persian_traditional";
}
if (/پاپ|pop/.test(value)) return "pop";

return language === "tr"
? "turkish_pop"
: language === "fa"
? "iranian_pop"
: "modern_pop";
}

// ==========================================
// NAVA MELODY DESIGNER
// ==========================================

function designNavaMelody(genre, mood) {
const profiles = {
iranian_happy_pop: {
verse: "Use a compact, rhythmic and conversational melodic contour with short memorable phrases.",
preChorus: "Gradually raise melodic tension and move toward a higher register.",
chorus: "Use a bright, memorable hook with a clear peak note and a satisfying descending response.",
variation: "Keep the verse rhythmically nimble; make the chorus broader, more open and easier to sing."
},

turkish_pop: {  
  verse: "Use flowing Turkish pop phrasing with natural syllabic movement and subtle melodic ornaments.",  
  preChorus: "Build anticipation with a gradual melodic rise.",  
  chorus: "Create a strong lyrical hook with a wider melodic range and a memorable resolving phrase.",  
  variation: "Keep the verse intimate and the chorus expansive."  
},  

turkish_arabesque: {  
  verse: "Use expressive long phrases, emotional turns and tasteful ornamentation.",  
  preChorus: "Increase tension through rising phrases and held notes.",  
  chorus: "Use an emotionally intense and memorable melodic peak.",  
  variation: "Contrast restrained lines with expressive sustained notes."  
},  

turkish_folk: {  
  verse: "Use folk-inspired melodic motifs and regional phrasing.",  
  preChorus: "Build naturally from the main folk motif.",  
  chorus: "Use a strong repetitive folk hook with clear rhythmic identity.",  
  variation: "Develop the motif through call-like instrumental responses, not extra voices."  
},  

azerbaijani_folk: {  
  verse: "Use expressive Azerbaijani folk-inspired melodic phrases and characteristic ornaments.",  
  preChorus: "Build tension with a rising phrase related to the main motif.",  
  chorus: "Use a memorable regional melodic motif with a strong emotional resolution.",  
  variation: "Keep the melody recognizable while varying its ending and ornamentation."  
},  

kurdish_folk: {  
  verse: "Use Kurdish folk-inspired melodic movement and a clear regional character.",  
  preChorus: "Increase melodic energy without losing the folk identity.",  
  chorus: "Use a memorable, open and expressive folk refrain.",  
  variation: "Alternate compact phrases with longer melodic responses."  
},  

rock: {  
  verse: "Use focused melodic phrases with rhythmic drive and a clear tonal center.",  
  preChorus: "Increase tension and melodic height.",  
  chorus: "Use a powerful, wide-range melodic hook that works over electric guitars.",  
  variation: "Make the chorus more open and forceful than the verse."  
},  

electronic: {  
  verse: "Use concise melodic phrases with a clear rhythmic identity.",  
  preChorus: "Create anticipation through rising notes and increasing rhythmic density.",  
  chorus: "Use a simple, instantly recognizable melodic hook.",  
  variation: "Use contrast between sparse sections and full electronic sections."  
},  

hip_hop: {  
  verse: "Use rhythmically precise vocal phrasing and a controlled melodic range.",  
  preChorus: "Create a gradual lift before the hook.",  
  chorus: "Use a short, memorable melodic refrain.",  
  variation: "Keep the verse rhythmically detailed and the hook simpler."  
}

};

const base = profiles[genre] || {
verse: "Use natural, expressive melodic phrases with a clear tonal center.",
preChorus: "Build anticipation through a gradual melodic rise.",
chorus: "Create a memorable chorus with a clear melodic peak and satisfying resolution.",
variation: "Make the chorus noticeably different from the verse."
};

const moodInstructions = {
emotional: "Favor expressive minor-oriented phrases, meaningful pauses and emotional melodic resolution.",
sad: "Favor restrained descending phrases, longer held notes and a reflective melodic contour.",
romantic: "Favor smooth connected phrases, gentle melodic turns and warm resolutions.",
happy: "Favor bright major-oriented phrases, rhythmic hooks and uplifting melodic movement.",
epic: "Favor wide melodic range, rising sequences and a strong climactic peak.",
calm: "Favor spacious phrases, gentle movement and soft melodic resolution.",
energetic: "Favor rhythmic precision, strong accents and energetic melodic hooks."
};

return {
...base,
mood: moodInstructions[mood] || moodInstructions.emotional
};
}

// ==========================================
// NAVA HARMONY ENGINE
// ==========================================

function designNavaHarmony(genre, mood, seed) {
const minorProgressions = [
["i", "VI", "III", "VII"],
["i", "iv", "VI", "V"],
["i", "VII", "VI", "VII"]
];

const majorProgressions = [
["I", "V", "vi", "IV"],
["I", "vi", "IV", "V"],
["vi", "IV", "I", "V"]
];

const isMinor =
["sad", "emotional", "epic"].includes(mood) ||
["turkish_arabesque", "azerbaijani_folk"].includes(genre);

const progression = navaPick(
isMinor ? minorProgressions : majorProgressions,
seed
);

const keyOptions = isMinor
? ["A minor", "D minor", "E minor", "G minor"]
: ["C major", "G major", "D major", "A major"];

const key = navaPick(keyOptions, seed >>> 3);

return {
key,
mode: isMinor ? "minor" : "major",
progression,
verse: progression,
chorus: isMinor
? ["i", "VI", "III", "VII"]
: ["I", "V", "vi", "IV"],
bridge: isMinor
? ["VI", "iv", "i", "V"]
: ["vi", "IV", "ii", "V"],
instruction:   Use a coherent tonal harmony in ${key}.   Main harmonic progression: ${progression.join(" - ")}.   Keep the harmonic movement musical and consistent.   Use a related but slightly more uplifting or intense progression in the chorus.   Do not change key randomly between sections.  
};
}

// ==========================================
// NAVA RHYTHM ENGINE
// ==========================================

function designNavaRhythm(genre, mood, baseBpm) {
let timeSignature = "4/4";
let groove = "Steady contemporary pop groove with clear kick and snare placement.";
let rhythmicPattern = "";
let bpm = baseBpm;

if (genre === "iranian_happy_pop") {
timeSignature = "6/8";
bpm = 124;

groove = `

Authentic Iranian happy pop 6/8 dance rhythm.
Each bar contains SIX eighth-note subdivisions grouped into TWO main beats:
ONE-two-three, FOUR-five-six.
The listener must clearly feel TWO main pulses in every bar.
`;

rhythmicPattern = `

EXACT RHYTHMIC FEEL:

Count every bar:
1 - 2 - 3 | 4 - 5 - 6

Main pulse:
STRONG - light - light | STRONG - light - light

Percussion:

- Deep kick or tombak-style bass drum on count 1.
- Light percussion on counts 2 and 3.
- Clear clap, snare or daf-style accent on count 4.
- Light percussion on counts 5 and 6.
- Bass reinforces the two main pulses on counts 1 and 4.
- Piano chords and melodic accompaniment follow the same six-part cycle.

The rhythm must have a bouncing, rolling Iranian 6/8 dance feel.
Each bar must sound like two groups of three, not three groups of two.

STRICTLY AVOID:

- Four-on-the-floor kick.
- Standard straight 4/4 pop beat.
- Generic EDM dance rhythm.
- A simple fast beat that only sounds energetic.
- Straight eighth-note rock or disco rhythm.

The 6/8 identity must be unmistakable even without vocals.
`;
} else if (
genre === "kurdish_folk" ||
genre === "azerbaijani_folk"
) {
timeSignature = "6/8";
groove = "Regional folk-inspired 6/8 groove with two main pulses per bar.";

rhythmicPattern = `

Use a natural folk 6/8 pulse.
Count: ONE-two-three, FOUR-five-six.
Keep the percussion organic and the melodic phrases aligned with the two main beats.
`;
} else if (genre === "turkish_folk") {
timeSignature = "4/4";
groove = "Folk-oriented rhythmic pulse with regional phrasing and organic percussion.";
} else if (genre === "turkish_arabesque") {
timeSignature = "4/4";
groove = "Expressive slow-to-mid tempo arabesque pulse with spacious phrasing.";
} else if (genre === "rock") {
timeSignature = "4/4";
groove = "Driving rock backbeat with a strong kick, snare and bass foundation.";
} else if (genre === "electronic") {
timeSignature = "4/4";
groove = "Genre-appropriate electronic pulse with controlled kick, percussion and bass.";
} else if (genre === "jazz" || genre === "blues") {
timeSignature = "4/4";
groove = "Natural swung or laid-back groove appropriate to the selected jazz or blues character.";
}

const dynamics = {
emotional: "restrained verse, gradual lift, expressive chorus",
sad: "soft pulse, sparse percussion, spacious phrasing",
romantic: "gentle pulse, smooth transitions, warm dynamics",
happy: "bright rhythmic drive, lively accents, energetic chorus",
epic: "progressive build, powerful accents, dramatic climax",
calm: "soft pulse, minimal percussion, spacious dynamics",
energetic: "strong rhythmic drive, punchy accents, energetic transitions"
};

return {
bpm,
timeSignature,
groove,
rhythmicPattern,
dynamics: dynamics[mood] || dynamics.emotional
};
}

// ==========================================
// NAVA ARRANGEMENT ENGINE
// ==========================================

function designNavaArrangement(genre, instruments, instrumental) {
const selected = getInstrumentList(instruments);

const piano = selected.find(isPianoInstrument);
const lead = piano || selected[0] || "";

const support = selected.filter(item => item !== lead);

const roles = {
lead: lead || "A genre-appropriate melodic lead instrument",
bass: "Bass supports the chord roots and rhythmic movement",
rhythm: "Drums and percussion establish the selected groove",
harmony: "Keys, piano, strings or guitars provide harmonic support",
fills: "Short instrumental responses between vocal phrases"
};

if (genre === "iranian_happy_pop") {
roles.rhythm = "Iranian 6/8 pop percussion, kick, snare and tasteful handclaps";
roles.harmony = "Rhythmic piano and bright modern pop harmonic layers";
roles.fills = "Short Iranian-pop melodic responses between vocal phrases";
}

if (genre === "turkish_pop" || genre === "turkish_arabesque") {
roles.fills = "Tasteful bağlama or regional melodic responses when suitable";
}

if (genre === "azerbaijani_folk") {
roles.fills = "Saz or tar-like folk melodic responses when suitable";
}

const structure = instrumental
? ["intro", "main_theme", "variation", "climax", "outro"]
: ["intro", "verse_1", "pre_chorus", "chorus", "verse_2", "chorus", "outro"];

return {
lead,
support,
roles,
structure,
instruction: `
ARRANGEMENT DEVELOPMENT:
Intro: establish the main musical identity with instruments only.
Verse: keep the arrangement lighter and leave space for the lead vocal.
Pre-chorus: gradually add energy and harmonic tension.
Chorus: widen the arrangement and strengthen the main melodic hook.
Second verse: introduce subtle instrumental variation.
Final chorus: deliver the fullest and most memorable arrangement.
Outro: finish with a deliberate musical ending, not an abrupt cutoff.

Instrument roles:
Lead: ${roles.lead}
Bass: ${roles.bass}
Rhythm: ${roles.rhythm}
Harmony: ${roles.harmony}
Instrumental fills: ${roles.fills}
`
};
}

// ==========================================
// NAVA MUSIC PLAN - مغز مرکزی
// ==========================================

function buildNavaMusicPlan(settings) {
const {
style,
musicMood,
language,
instruments,
instrumental = false
} = settings;

const genre = detectNavaGenre(
style,
language,
musicMood
);

const moodProfile = getMoodProfile(musicMood);

const seedText = [
style,
musicMood,
language,
instruments
].join("|");

const seed = navaHash(seedText);

const melody = designNavaMelody(
genre,
musicMood
);

const harmony = designNavaHarmony(
genre,
musicMood,
seed
);

const rhythm = designNavaRhythm(
genre,
musicMood,
moodProfile.bpm
);

const arrangement = designNavaArrangement(
genre,
instruments,
instrumental
);

return {
version: "1.1",
genre,
mood: musicMood,
tempo: rhythm.bpm,
timeSignature: rhythm.timeSignature,
key: harmony.key,
mode: harmony.mode,
harmony: {
verse: harmony.verse,
chorus: harmony.chorus,
bridge: harmony.bridge
},
melody,
rhythm,
instruments: {
lead: arrangement.lead,
supporting: arrangement.support,
roles: arrangement.roles
},
structure: arrangement.structure,
arrangement
};
}

// ==========================================
// تبدیل MusicPlan به دستور قابل فهم برای ACE
// ==========================================

function buildNavaMusicPlanPrompt(plan) {
return `

NAVA MUSIC BRAIN - COMPOSITION PLAN

This is a structured musical direction created by Nava's composition engine.
Follow the musical identity and section contrasts as closely as the model allows.

GENRE:
${plan.genre}

MOOD:
${plan.mood}

TEMPO:
${plan.tempo} BPM

TIME SIGNATURE:
${plan.timeSignature}

TONAL CENTER:
${plan.key} (${plan.mode})

HARMONY:
Verse progression: ${plan.harmony.verse.join(" - ")}
Chorus progression: ${plan.harmony.chorus.join(" - ")}
Bridge progression: ${plan.harmony.bridge.join(" - ")}

MELODY DESIGN:
Verse: ${plan.melody.verse}
Pre-chorus: ${plan.melody.preChorus}
Chorus: ${plan.melody.chorus}
Section contrast: ${plan.melody.variation}
Mood expression: ${plan.melody.mood}

RHYTHM DESIGN:
${plan.rhythm.groove}

${plan.rhythm.rhythmicPattern}

Dynamic direction: ${plan.rhythm.dynamics}

The drums, bass, piano and melodic accompaniment must all follow
the same rhythmic meter and accent pattern.
Do not replace the requested meter with a generic pop beat.

ARRANGEMENT PLAN:
${plan.arrangement.instruction}

SECTION ORDER:
${plan.structure.join(" -> ")}

IMPORTANT COMPOSITION RULES:

- Create a genuinely memorable melodic identity, not a generic loop.
- Make the chorus clearly different from the verse.
- Keep the tempo and rhythmic identity consistent.
- Use harmonic movement that supports the emotional direction.
- Give the selected lead instrument a recognizable musical role.
- Use instrumental fills to connect vocal phrases.
- Avoid random changes of genre, tempo or musical identity.
- Do not imitate any specific existing song or artist.

This plan is the musical blueprint for the requested composition.
`;
}

// ==========================================
// ساخت پرامپت موسیقی برای ACE
// ==========================================

function buildAceMusicPrompt(settings) {
const {
style,
musicMood,
voice,
instruments,
extraMood,
pronunciationNotes,
language,
instrumental,
musicPlan
} = settings;

const instrumentList = getInstrumentList(instruments);
const piano = instrumentList.find(isPianoInstrument);
const leadInstrument = piano || instrumentList[0] || "";

const supportingInstruments = instrumentList.filter(
item => item !== leadInstrument
);

const moodProfile = getMoodProfile(musicMood);
const styleProfile = getStyleDescription(
style,
language,
musicMood
);

const isIranianHappyPop =
language === "fa" &&
musicMood === "happy" &&
/پاپ|pop/i.test(style) &&
!/راک|rock|رپ|rap|هیپ.?هاپ|hip.?hop|edm|الکترونیک/i.test(style);

const parts = [];

parts.push(`
ORIGINAL MUSIC PRODUCTION.

GENRE:
${styleProfile.original}

${styleProfile.detail}

MOOD:
${moodProfile.description}

TEMPO:
Exactly ${musicPlan?.tempo || moodProfile.bpm} BPM.
Use a clear and recognizable rhythmic groove.
`);

if (musicPlan) {
parts.push(buildNavaMusicPlanPrompt(musicPlan));
}

if (isIranianHappyPop) {
parts.push(`
IRANIAN HAPPY POP - AUTHENTIC 6/8 DANCE RHYTHM.

THIS IS NOT A GENERIC ENERGETIC POP SONG.
THIS MUST BE A REAL IRANIAN HAPPY 6/8 POP SONG.

METER:
Strict 6/8 compound meter.
Each bar has six eighth-note subdivisions.
The six subdivisions form TWO main beats:

ONE - two - three | FOUR - five - six

The listener must feel:
DUM - tak - tak | DUM - tak - tak

RHYTHMIC FOUNDATION:

- Strong bass drum on beat 1.
- Clear clap or snare accent on beat 4.
- Light percussion fills on beats 2, 3, 5 and 6.
- Bass line must emphasize beats 1 and 4.
- Piano chords must follow the same two-beat 6/8 cycle.
- All instruments must lock into the same compound-meter groove.

IMPORTANT:
The rhythm must have a rolling, bouncing Iranian 6/8 dance character.
It must sound like Iranian celebration and dance music.
Do not merely increase the speed of a normal pop beat.

FORBIDDEN RHYTHMS:

- Straight 4/4 pop.
- Four-on-the-floor EDM.
- Standard disco beat.
- Generic electronic dance rhythm.
- Fast rock beat.
- A simple energetic beat without a clear 6/8 pulse.

MELODY:
Use a catchy Iranian pop melody.
The verse must have rhythmic, compact phrases.
The chorus must be more open, joyful and memorable.
Melodic phrases must naturally fit the six-part rhythmic cycle.

ARRANGEMENT:
Use lively Iranian pop percussion.
Use a bouncing bass line.
Use rhythmic piano chords that reinforce the 6/8 groove.
Add short melodic instrumental responses between vocal phrases.
Keep the piano clearly audible.

The groove must remain recognizably Iranian 6/8 from the introduction to the ending.
Do not change to 4/4 in the chorus.
`);
}

if (!instrumental) {
parts.push(`
VOCAL STYLE:
${getVoiceDescription(voice)}

VOCAL LANGUAGE:
${getLanguageName(language)}.
`);
}

if (extraMood) {
parts.push(  ADDITIONAL ARTISTIC DIRECTION:   ${extraMood}  );
}

if (piano) {
parts.push(`
DOMINANT INSTRUMENT: REAL ACOUSTIC PIANO.

The piano must be clearly audible and musically prominent.
Use a real acoustic piano sound, not a soft pad or a barely audible background texture.

PIANO ARRANGEMENT:

- Begin with a clearly audible piano introduction.
- Play a recognizable rhythmic piano motif.
- Use the piano to reinforce the selected groove.
- Let the piano play rhythmic chords and melodic fills.
- Give the piano a memorable melodic phrase between vocal sections.
- Keep the piano forward and clearly separated in the mix.
- Keep the piano audible during the chorus.
- Do not bury the piano under synthesizers, guitars or percussion.
- Do not replace the piano with an electric keyboard pad.

The listener must clearly recognize the piano as an important part of the arrangement.
);   } else if (leadInstrument) {   parts.push(
FEATURED LEAD INSTRUMENT:
${leadInstrument}

Make this instrument prominent, recognizable and musically important.
Create a memorable melodic hook using this instrument.
Feature it clearly in the introduction and instrumental passages.
);   } else {   parts.push(
INSTRUMENT ARRANGEMENT:
Choose a coherent arrangement that fits the selected genre and mood.
Use distinct melodic and rhythmic elements.
`);
}

if (supportingInstruments.length > 0) {
parts.push(`
SUPPORTING INSTRUMENTS:
${supportingInstruments.join(", ")}

These are supporting instruments, not competing lead instruments.
Keep the featured lead instrument clearly audible.
`);
}

if (instrumental) {
parts.push(`
INSTRUMENTAL ONLY - ABSOLUTE REQUIREMENT.

Generate a completely instrumental music track.
There must be no human voice anywhere in the audio.

STRICTLY FORBIDDEN:
Singing, speech, humming, human vocal samples, choir,
vocal chops, vocal ad-libs, wordless vocalizations,
human-like sounds, "Hoo", "Woo", "Ooh", "Yeah",
or any female or male vocal sound.

Use musical instruments only.
All melodies must be played by instruments, never by a human voice.
);   } else {   parts.push(
SINGLE SINGER - ABSOLUTE PRIORITY.

Use exactly ONE human singer.
There must be only one vocal identity in the entire song.
The lead vocal must sound like one person singing alone.

NO second singer.
NO female voice in a male solo song.
NO male voice in a female solo song.
NO backing vocals.
NO harmonies.
NO choir.
NO vocal doubling.
NO layered vocals.
NO duplicated lead vocal.
NO call-and-response.
NO overlapping singers.
NO vocal ad-libs.
NO humming.
NO wordless vocal sounds.
NO "Hoo", "Woo", "Ooh", "Yeah".

VOCAL MIXING:
Use one clean, centered lead vocal.
Keep the vocal natural and intimate.
Avoid chorus effects, vocal doubling and stereo widening.
Do not create the impression of two singers.
`);
}

if (language === "fa" && !instrumental) {
parts.push(`
PERSIAN VOCAL REQUIREMENTS:

Sing in natural native Iranian Persian (Farsi).
Use clear Iranian Persian pronunciation and natural Persian vowels.
Avoid foreign, Indian-sounding or unnatural pronunciation.
Preserve the supplied Persian words exactly.
Do not translate, rewrite or replace the lyrics.
Do not invent extra words or syllables.
Avoid unnecessary vocal ornaments.
`);
}

if (pronunciationNotes && !instrumental) {
parts.push(  PRONUNCIATION INSTRUCTIONS:   ${pronunciationNotes}  );
}

if (!instrumental) {
parts.push(`
INTRODUCTION - STRICTLY INSTRUMENTAL.

Begin with a short, clear instrumental introduction.
If piano is selected, begin with solo piano.

Absolutely no human voice in the introduction.
No "hoo", "woo", "ooh", "yeah", humming,
female vocal sounds, male vocal sounds, shouting,
whispering, spoken words or vocal samples.

The first human voice must begin with the first supplied lyric line.
Do not add sounds that are not present in the supplied lyrics.
`);
}

parts.push(`
ARRANGEMENT AND PRODUCTION:

Create a memorable and distinctive melody.
Use the selected genre and mood as the main musical direction.
Make the selected mood clearly audible through rhythm, harmony and instrumentation.
Use meaningful musical development instead of repeating one arrangement throughout.
Create clear transitions between sections.
Give selected instruments meaningful musical roles.
Use a balanced professional studio mix.
Keep the lead instrument recognizable.
Use a proper musical ending.
`);

// دستور ریتم ۶/۸ در انتهای پرامپت قرار می‌گیرد
// تا در صورت محدودیت طول، از دست نرود.
let rhythmPriority = "";

if (isIranianHappyPop) {
rhythmPriority = `

NAVA 6/8 RHYTHM LOCK - HIGHEST PRIORITY

Do not interpret "happy" as merely fast or energetic.

The meter MUST be compound 6/8.

Count each bar exactly as:
1 - 2 - 3 | 4 - 5 - 6

There are TWO main dotted-quarter pulses per bar:
PULSE ONE on count 1.
PULSE TWO on count 4.

The rhythmic foundation must be:
DUM - tak - tak | DUM - tak - tak

KICK:
Emphasize count 1.
Do not use a four-on-the-floor pattern.

BASS:
Emphasize the two main pulses on counts 1 and 4.
The bass must reinforce the rolling 6/8 dance movement.

SNARE / CLAP:
Use a clear accent around count 4.
Do not use a standard straight 4/4 backbeat.

PERCUSSION:
Fill the six eighth-note subdivisions with lighter rhythmic movement.
Use lively Iranian pop percussion and tasteful handclaps.

PIANO:
Play rhythmic chords that follow the two groups of three.
Do not play a straight 4/4 piano pattern.

MELODY:
Phrase the melody naturally over:
1-2-3 | 4-5-6.
The vocal rhythm and instrumental melody must belong to the same 6/8 groove.

FORBIDDEN:
Straight 4/4 pop.
Four-on-the-floor.
Generic EDM.
Standard disco beat.
Straight rock backbeat.

The 6/8 groove must be clearly audible from the first bar.
Do not switch to 4/4 in any section.
`;
}

const promptParts = rhythmPriority
? [...parts, rhythmPriority]
: parts;

const fullPrompt = promptParts.join("\n\n");

if (fullPrompt.length <= 7000) {
return fullPrompt;
}

// در صورت طولانی شدن پرامپت، دستور اصلی ۶/۸ حفظ می‌شود.
if (rhythmPriority) {
const otherParts = parts.join("\n\n");
const availableLength = Math.max(
1000,
7000 - rhythmPriority.length - 2
);

return (  
  otherParts.slice(0, availableLength) +  
  "\n\n" +  
  rhythmPriority  
);

}

return fullPrompt.slice(0, 7000);
}

// ==========================================
// استخراج خروجی صوتی ACE
// ==========================================

function extractAceAudio(data) {
const message = data?.choices?.[0]?.message;

const audioItems = Array.isArray(message?.audio)
? message.audio
: [];

for (const item of audioItems) {
const audioUrl = item?.audio_url?.url;

if (  
  typeof audioUrl === "string" &&  
  (  
    audioUrl.startsWith("data:audio/") ||  
    audioUrl.startsWith("https://")  
  )  
) {  
  return audioUrl;  
}

}

const alternatives = [
message?.audio_url?.url,
message?.audio_url,
data?.audio_url?.url,
data?.audio_url
];

for (const item of alternatives) {
if (
typeof item === "string" &&
(
item.startsWith("data:audio/") ||
item.startsWith("https://")
)
) {
return item;
}
}

return "";
}

// ==========================================
// Worker
// ==========================================

export default {
async fetch(request, env) {
const origin = request.headers.get("Origin") || "";

const corsOrigin =  
  origin === ALLOWED_ORIGIN  
    ? ALLOWED_ORIGIN  
    : "*";  

// ------------------------------------------  
// CORS  
// ------------------------------------------  

if (request.method === "OPTIONS") {  
  return new Response(null, {  
    status: 204,  
    headers: {  
      "Access-Control-Allow-Origin": corsOrigin,  
      "Access-Control-Allow-Methods": "POST, OPTIONS",  
      "Access-Control-Allow-Headers": "Content-Type",  
      "Access-Control-Max-Age": "86400"  
    }  
  });  
}  

const url = new URL(request.url);  

// ==========================================  
// ۱. ساخت شعر با Gemini و OpenRouter  
// ==========================================  

if (  
  url.pathname === "/generate-lyrics" &&  
  request.method === "POST"  
) {  
  let input;  

  try {  
    input = await request.json();  
  } catch {  
    return json(  
      { error: "اطلاعات ارسالی نامعتبر است." },  
      400,  
      corsOrigin  
    );  
  }  

  const topic = safeText(input.topic || "", 500);  
  const style = safeText(input.style || "پاپ", 100);  

  const language = ["fa", "tr", "en"].includes(input.language)  
    ? input.language  
    : "fa";  

  if (!topic) {  
    return json(  
      { error: "موضوع شعر نمی‌تواند خالی باشد." },  
      400,  
      corsOrigin  
    );  
  }  

  const prompt = buildLyricsPrompt(  
    topic,  
    style,  
    language  
  );  

  let geminiError = "";  

  // ------------------------------------------  
  // Gemini  
  // ------------------------------------------  

  if (env.GEMINI_API_KEY) {  
    try {  
      const geminiRes = await fetch(  
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`,  
        {  
          method: "POST",  
          headers: {  
            "Content-Type": "application/json"  
          },  
          body: JSON.stringify({  
            contents: [  
              {  
                parts: [{ text: prompt }]  
              }  
            ],  
            generationConfig: {  
              temperature: 0.85,  
              maxOutputTokens: 3000,  
              responseMimeType: "application/json"  
            }  
          })  
        }  
      );  

      const data = await geminiRes.json();  

      if (geminiRes.ok) {  
        const rawLyrics = extractText(  
          data.candidates?.[0]?.content?.parts  
            ?.map(part => part.text || "")  
            .join("")  
        );  

        const result = parseLyricsOutput(  
          rawLyrics,  
          language  
        );  

        if (result.lyrics) {  
          return json(  
            {  
              success: true,  
              lyrics: result.lyrics,  
              singingLyrics: result.singingLyrics,  
              provider: "Gemini"  
            },  
            200,  
            corsOrigin  
          );  
        }  

        geminiError =  
          "جمنای متن معتبری تولید نکرد.";  
      } else {  
        geminiError =  
          data.error?.message ||  
          `خطای Gemini با کد ${geminiRes.status}`;  
      }  
    } catch (e) {  
      geminiError =  
        e.message || "خطای ارتباط با Gemini";  
    }  
  } else {  
    geminiError =  
      "کلید GEMINI_API_KEY تنظیم نشده است.";  
  }  

  // ------------------------------------------  
  // OpenRouter فقط در صورت شکست Gemini  
  // ------------------------------------------  

  if (!env.OPENROUTER_API_KEY) {  
    return json(  
      {  
        error:  
          "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",  
        geminiError  
      },  
      502,  
      corsOrigin  
    );  
  }  

  try {  
    const routerRes = await fetch(  
      "https://openrouter.ai/api/v1/chat/completions",  
      {  
        method: "POST",  
        headers: {  
          "Authorization":  
            `Bearer ${env.OPENROUTER_API_KEY}`,  
          "Content-Type": "application/json",  
          "HTTP-Referer":  
            "https://honrrpower-a11y.github.io/nava/",  
          "X-OpenRouter-Title": "Nava AI"  
        },  
        body: JSON.stringify({  
          model: "qwen/qwen3-8b:free",  
          messages: [  
            {  
              role: "user",  
              content: prompt  
            }  
          ],  
          temperature: 0.85,  
          max_tokens: 3000,  
          stream: false  
        })  
      }  
    );  

    const rawText = await routerRes.text();  

    let routerData;  

    try {  
      routerData = JSON.parse(rawText);  
    } catch {  
      return json(  
        {  
          error: "پاسخ OpenRouter قابل پردازش نیست.",  
          geminiError,  
          routerStatus: routerRes.status  
        },  
        502,  
        corsOrigin  
      );  
    }  

    if (!routerRes.ok || routerData.error) {  
      return json(  
        {  
          error: "ساخت شعر با هر دو سرویس ناموفق بود.",  
          geminiError,  
          openRouterError:  
            routerData.error?.message ||  
            `خطای OpenRouter با کد ${routerRes.status}`  
        },  
        502,  
        corsOrigin  
      );  
    }  

    const rawLyrics = extractText(  
      routerData.choices?.[0]?.message?.content  
    );  

    const result = parseLyricsOutput(  
      rawLyrics,  
      language  
    );  

    if (!result.lyrics) {  
      return json(  
        {  
          error:  
            "OpenRouter هم متن معتبری تولید نکرد.",  
          geminiError  
        },  
        502,  
        corsOrigin  
      );  
    }  

    return json(  
      {  
        success: true,  
        lyrics: result.lyrics,  
        singingLyrics: result.singingLyrics,  
        provider: "OpenRouter - Qwen3 8B"  
      },  
      200,  
      corsOrigin  
    );  

  } catch (e) {  
    return json(  
      {  
        error:  
          "ارتباط با سرویس ساخت شعر ناموفق بود.",  
        geminiError,  
        openRouterError: e.message  
      },  
      502,  
      corsOrigin  
    );  
  }  
}  

// ==========================================  
// ۲. ساخت موسیقی با ACE-Step و Nava Music Brain  
// ==========================================  

if (  
  url.pathname === "/generate-music" &&  
  request.method === "POST"  
) {  
  const apiKey = env.ACEMUSIC_API_KEY;  

  if (!apiKey) {  
    return json(  
      {  
        success: false,  
        error:  
          "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."  
      },  
      500,  
      corsOrigin  
    );  
  }  

  let input;  

  try {  
    input = await request.json();  
  } catch {  
    return json(  
      {  
        success: false,  
        error: "فرمت اطلاعات ارسالی نامعتبر است."  
      },  
      400,  
      corsOrigin  
    );  
  }  

  // ------------------------------------------  
  // دریافت و پاک‌سازی اطلاعات  
  // ------------------------------------------  

  const language = ["fa", "tr", "en"].includes(input.language)  
    ? input.language  
    : "fa";  

  const voice = normalizeVoice(  
    safeText(input.voice || "male_pop", 40)  
  );  

  const instrumental = voice === "instrumental";  

  const originalLyrics = prepareLyrics(  
    safeText(input.lyrics || "", 8000),  
    language  
  );  

  const suppliedSingingLyrics = prepareLyrics(  
    safeText(input.singingLyrics || "", 8000),  
    language  
  );  

  const rawSingingLyrics =  
    suppliedSingingLyrics || originalLyrics;  

  const singingLyrics = prepareSingingLyrics(  
    rawSingingLyrics,  
    voice  
  );  

  const style = safeText(  
    input.style || "Modern pop",  
    300  
  );  

  const musicMood = safeText(  
    input.musicMood || "emotional",  
    30  
  );  

  const extraMood = safeText(  
    input.mood || "",  
    500  
  );  

  const instruments = safeText(  
    input.instruments || "",  
    300  
  );  

  const pronunciationNotes = safeText(  
    input.pronunciationNotes || "",  
    1200  
  );  

  // ------------------------------------------  
  // اعتبارسنجی  
  // ------------------------------------------  

  if (!instrumental && !singingLyrics) {  
    return json(  
      {  
        success: false,  
        error:  
          "متن ترانه خالی است. ابتدا شعر را وارد کن."  
      },  
      400,  
      corsOrigin  
    );  
  }  

  if (  
    !instrumental &&  
    (  
      singingLyrics.length > 5000 ||  
      originalLyrics.length > 5000  
    )  
  ) {  
    return json(  
      {  
        success: false,  
        error:  
          "متن ترانه بیش از محدودیت ۵۰۰۰ کاراکتری است. لطفاً شعر را کوتاه‌تر کن."  
      },  
      400,  
      corsOrigin  
    );  
  }  

  // ------------------------------------------  
  // ساخت نقشه موسیقی با موتور Nava  
  // ------------------------------------------  

  const musicPlan = buildNavaMusicPlan({  
    style,  
    musicMood,  
    language,  
    instruments,  
    instrumental  
  });  

  // ------------------------------------------  
  // ساخت توضیح موسیقی برای ACE  
  // ------------------------------------------  

  const musicPrompt = buildAceMusicPrompt({  
    style,  
    musicMood,  
    voice,  
    instruments,  
    extraMood,  
    pronunciationNotes,  
    language,  
    instrumental,  
    musicPlan  
  });  

  // ------------------------------------------  
  // ساخت متن Tagged Mode برای ACE  
  // ------------------------------------------  

  const aceLyrics = instrumental  
    ? "[Instrumental]"  
    : singingLyrics;  

  const taggedContent = `

<prompt>  
${musicPrompt}  
</prompt>  <lyrics>  
${aceLyrics}  
</lyrics>  
`.trim();  // ------------------------------------------  
  // تنظیمات درخواست ACE  
  // ------------------------------------------  

  const audioConfig = {  
    duration: MUSIC_DURATION_SECONDS,  
    format: "mp3",  
    instrumental: instrumental,  
    bpm: musicPlan.tempo  
  };  

  if (!instrumental) {  
    audioConfig.vocal_language = getAceLanguage(language);  
  }  

  // ------------------------------------------  
  // بدنه درخواست ACE  
  // ------------------------------------------  

  const aceBody = {  
    model: ACE_MODEL,  

    messages: [  
      {  
        role: "user",  
        content: taggedContent  
      }  
    ],  

    stream: false,  

    thinking: true,  

    use_format: false,  

    use_cot_caption: false,  

    use_cot_language: false,  

    temperature: 0.85,  

    audio_config: audioConfig  
  };  

  // ------------------------------------------  
  // ارسال درخواست به ACE  
  // ------------------------------------------  

  let aceResponse;  

  try {  
    const controller = new AbortController();  

    const timeout = setTimeout(  
      () => controller.abort(),  
      240000  
    );  

    let aceRes;  

    try {  
      aceRes = await fetch(  
        ACE_API_URL,  
        {  
          method: "POST",  
          headers: {  
            "Authorization": `Bearer ${apiKey}`,  
            "Content-Type": "application/json",  
            "Accept": "application/json"  
          },  
          body: JSON.stringify(aceBody),  
          signal: controller.signal  
        }  
      );  
    } finally {  
      clearTimeout(timeout);  
    }  

    const rawResponse = await aceRes.text();  

    try {  
      aceResponse = JSON.parse(rawResponse);  
    } catch {  
      return json(  
        {  
          success: false,  
          error: "پاسخ ACE قابل پردازش نیست.",  
          status: aceRes.status,  
          details: rawResponse.slice(0, 1200),  
          provider: "ACE"  
        },  
        502,  
        corsOrigin  
      );  
    }  

    if (!aceRes.ok || aceResponse.error) {  
      const apiError =  
        aceResponse.error?.message ||  
        aceResponse.error ||  
        aceResponse.message ||  
        `خطای ACE با کد ${aceRes.status}`;  

      return json(  
        {  
          success: false,  
          error: String(apiError).slice(0, 1200),  
          status: aceRes.status,  
          provider: "ACE",  
          model: ACE_MODEL  
        },  
        502,  
        corsOrigin  
      );  
    }  

  } catch (e) {  
    const timeoutError =  
      e.name === "AbortError";  

    return json(  
      {  
        success: false,  

        error: timeoutError  
          ? "زمان انتظار برای ساخت آهنگ توسط ACE تمام شد."  
          : "ارتباط با سرویس ACE برقرار نشد.",  

        details: e.message || "ACE connection error",  

        provider: "ACE"  
      },  
      502,  
      corsOrigin  
    );  
  }  

  // ------------------------------------------  
  // استخراج فایل صوتی  
  // ------------------------------------------  

  const audioUrl = extractAceAudio(aceResponse);  

  if (!audioUrl) {  
    const message =  
      aceResponse.choices?.[0]?.message;  

    const responseText = extractText(  
      message?.content  
    );  

    return json(  
      {  
        success: false,  

        error:  
          "ACE پاسخ داده است اما فایل صوتی در پاسخ پیدا نشد.",  

        details: responseText.slice(0, 1500),  

        provider: "ACE",  

        model: ACE_MODEL  
      },  
      502,  
      corsOrigin  
    );  
  }  

  // ------------------------------------------  
  // خروجی سازگار با سایت Nava  
  // ------------------------------------------  

  return json(  
    {  
      success: true,  

      audioUrl,  

      title: "Nava AI Song",  

      duration: MUSIC_DURATION_SECONDS,  

      requestedDuration: MUSIC_DURATION_SECONDS,  

      provider: "ACE-Step",  

      model: ACE_MODEL,  

      musicPlan: {  
        version: musicPlan.version,  
        genre: musicPlan.genre,  
        mood: musicPlan.mood,  
        tempo: musicPlan.tempo,  
        timeSignature: musicPlan.timeSignature,  
        key: musicPlan.key,  
        mode: musicPlan.mode,  
        harmony: musicPlan.harmony,  
        structure: musicPlan.structure,  
        instruments: musicPlan.instruments  
      }  
    },  
    200,  
    corsOrigin  
  );  
}  

// ==========================================  
// مسیر نامعتبر  
// ==========================================  

return json(  
  {  
    error: "Not found"  
  },  
  404,  
  corsOrigin  
);

}
}; 
