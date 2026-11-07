const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";

// ACE-Step
const ACE_API_URL = "https://api.acemusic.ai/v1/chat/completions";
const ACE_MODELS_URL = "https://api.acemusic.ai/v1/models";
const ACE_MODEL = "acemusic/acestep-v1.5-turbo";

// Gemini
const GEMINI_MODEL = "gemini-3.5-flash-lite";

// ==========================================
// ابزارهای عمومی
// ==========================================

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token, Authorization",
      "Cache-Control": "no-store",
      "Vary": "Origin"
    }
  });
}

function extractText(content) {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content.map(part =>
      typeof part === "string" ? part : part?.text || ""
    ).join("").trim();
  }

  return "";
}

function cleanLyrics(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/<\/?(?:prompt|lyrics)\b[^>]*>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function safeNaviText(value, maxLength = 3000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizePersianSpacing(text) {
  return String(text || "").replace(
    /([\u0621-\u06A9]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
    "$1ه $2"
  );
}

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
// تبدیل فایل صوتی به Base64
// ==========================================

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

// ==========================================
// آماده‌سازی شعر برای ACE
// ==========================================

function prepareMusicLyrics(text, profile) {
  let result = String(text || "").trim();

  if (!result || profile !== "persian") return result;

  result = result.replace(
    /^\s*(?:\[(?:intro|instrumental)\]\s*)+/i,
    ""
  );

  const hasSongSections =
    /\[(?:verse|chorus|pre-chorus|bridge|final chorus|outro|instrumental)\b[^\]]*\]/i.test(result);

  if (!hasSongSections) {
    result = `[Verse 1]\n${result}`;
  }

  return `[Intro]\n[Instrumental]\n\n${result}`.trim();
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

  if (!lyrics) lyrics = cleaned;

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
// پرامپت ساخت شعر
// ==========================================

function buildLyricsPrompt(topic, style, language) {
  return `
تو یک ترانه‌سرای حرفه‌ای، خلاق و مسلط به ترانه‌سرایی موسیقایی هستی.

برای موضوع زیر یک ترانه کامل، منسجم، احساسی و قابل اجرا بساز.

موضوع: ${topic}
سبک و حال‌وهوا: ${style}
زبان: ${language}

اصول ترانه‌سرایی:

۱. ترانه باید موضوع مرکزی مشخص و مسیر احساسی منسجم داشته باشد.
۲. هر بند تصویر یا احساس تازه‌ای اضافه کند.
۳. از کلیشه‌ها و تکرار بی‌هدف دوری کن.
۴. زبان طبیعی، روان و زنده باشد.
۵. جمله‌ها هنگام خواندن با صدای بلند طبیعی باشند.
۶. قافیه‌ها طبیعی باشند و به زور وارد شعر نشوند.
۷. طول سطرها برای اجرای موسیقایی مناسب باشد.
۸. ترجیع‌بند باید ساده، قدرتمند و به‌یادماندنی باشد.

ساختار:

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

قوانین ویژه زبان فارسی:

اگر زبان فارسی است:

- فقط از حروف و واژه‌های فارسی برای متن فارسی استفاده کن.
- حروف لاتین را به انتهای کلمات فارسی نچسبان.
- از ترکیب تصادفی حروف فارسی و لاتین خودداری کن.
- فارسی طبیعی و خوش‌آهنگ باشد.
- کلمات انگلیسی فقط در صورت استفاده عمدی و مستقل مجازند.

دو نسخه هماهنگ بساز:

نسخه lyrics:
متن خوانا و طبیعی، بدون اعراب‌گذاری اضافی.

نسخه singingLyrics:
دقیقاً همان شعر و همان کلمات نسخه اول.
فقط کلمات دشوار یا چندخوانشی را با اعراب لازم مشخص کن.
هیچ کلمه یا سطری را تغییر نده، حذف نکن یا اضافه نکن.

جدانویسی ه غیرملفوظ:

کافه ای
خانه ام
پنجره ات
خسته ام
قصه ام

اگر زبان ترکی یا انگلیسی است، هر دو نسخه از نظر متن یکسان باشند.

قوانین خروجی:

فقط JSON معتبر برگردان.
هیچ توضیحی بیرون از JSON ننویس.
از Markdown و کدبلاک استفاده نکن.

ساختار دقیق:

{
  "lyrics": "متن کامل شعر اصلی",
  "singingLyrics": "همان شعر با اعراب‌گذاری انتخابی"
}

تمام خطوط شعر و برچسب‌های بخش‌ها را در هر دو نسخه حفظ کن.
`;
}

// ==========================================
// پروفایل‌های موسیقی
// ==========================================

function buildMusicProfile(input) {
  const language = ["fa", "tr", "en"].includes(input.language)
    ? input.language
    : "fa";

  const requestedStyle = safeText(
    input.musicStyle ||
    input.music_style ||
    input.genre ||
    input.style ||
    "",
    120
  );

  const style = requestedStyle.toLowerCase();

  const mood = safeText(
    input.musicMood ||
    input.music_mood ||
    input.mood ||
    "",
    120
  );

  let profile = "persian";
  let prompt = "";
  let bpm = null;
  let timeSignature = null;

  if (
    /ترک|ترکی|turkish|türk|turkiye|türkiye/i.test(style) ||
    (!requestedStyle && language === "tr")
  ) {
    profile = "turkish";

    prompt = `
Authentic Turkish music with a clearly recognizable Turkish musical identity.

Use Turkish melodic phrasing and Turkish makam-inspired melodic structures.
Create a distinctly Turkish melody, not a generic Western pop melody.

Use appropriate Turkish instruments such as:
baglama, saz, kanun, ney, Turkish clarinet and darbuka.

The arrangement must have Turkish rhythmic character and Turkish melodic ornaments.

Avoid Iranian, Arabic, Indian and Bollywood musical arrangements.
Avoid generic Western rock and jazz sounds.
Do not make electric guitar the dominant instrument.
The result must sound Turkish in its melody, rhythm and arrangement.
`;

    bpm = 105;
    timeSignature = "4";
  }

  else if (/عرب|arabic|arab|خلیجی/i.test(style)) {
    profile = "arabic";

    prompt = `
Authentic Arabic music with a recognizable Arabic melodic identity.

Use Arabic maqam-inspired melodic phrasing and ornamentation.
Use oud, qanun, ney, riq and darbuka where appropriate.
Create Arabic rhythmic patterns and expressive Arabic melodies.

Avoid generic Western rock, jazz and Indian musical styles.
The result must sound Arabic in its melody and rhythm.
`;

    bpm = 100;
    timeSignature = "4";
  }

  else if (/راک|rock|metal|متال/i.test(style)) {
    profile = "rock";

    prompt = `
Authentic rock music.

Use electric guitar, bass guitar and live rock drums.
Create strong guitar riffs, energetic rhythmic sections and a memorable rock melody.
Use a clear rock arrangement and dynamic song structure.

Avoid jazz swing and Indian or Bollywood musical elements.
`;

    bpm = 120;
    timeSignature = "4";
  }

  else if (/جاز|jazz|بلوز|blues/i.test(style)) {
    profile = "jazz";

    prompt = `
Authentic jazz music with jazz harmony and rhythmic phrasing.

Use piano, upright bass, acoustic drums and saxophone where appropriate.
Create expressive melodic improvisation and a coherent jazz arrangement.
Use jazz chord progressions and natural swing where appropriate.

Avoid rock guitar riffs and traditional regional pop arrangements.
`;

    bpm = 95;
    timeSignature = "4";
  }

  else if (
    /ایران|فارسی|persian|iranian|سنتی|تلفیقی/i.test(style) ||
    language === "fa"
  ) {
    profile = "persian";

    prompt = `
Create a contemporary Iranian Persian romantic pop song.

CORE MUSICAL IDENTITY:

- Contemporary Iranian Persian pop, not generic international pop.
- A recognizable Iranian melodic identity in the lead vocal melody.
- Natural native Iranian Persian pronunciation and phrasing.
- Warm, intimate, emotional and memorable.
- Modern, polished production with an authentic Iranian character.
- Keep the same overall Persian pop identity across songs, but do not reuse
  the same melody, intro, groove or arrangement.

PERSIAN VOCAL PERFORMANCE:

The lead singer must sound like a native Persian-language pop singer.
Use natural Iranian Persian pronunciation, diction, accent and vocal phrasing.
Follow the natural rhythm and stress of Persian words.
Emphasize meaningful syllables and emotional words.
Avoid English-like or foreign-language syllable stress.

Use connected, expressive Persian phrases.
Let the melody rise and fall naturally with the meaning of the lyrics.
Allow comfortable breathing spaces between phrases.
Do not rush the lyrics.

Use restrained and tasteful Iranian pop ornaments at suitable phrase endings.
Avoid excessive melisma, exaggerated vibrato, robotic delivery,
flat recitation and artificial vocal runs.

Keep one clear lead vocal identity.
Do not add a female backing singer or choir unless explicitly requested.
Do not add improvised vocal responses.

NO WORDLESS VOCALS:

Do not sing, hum, chant or vocalize sounds that are not written in the lyrics.

No "hoo-hoo", "woo-woo", "oh-oh", "ah-ah", "ooh", "yeah",
humming, vocal warm-ups, scat singing or improvised syllables.

No wordless vocals before, between or after lyric sections.
No vocal samples or background voices in the instrumental introduction.

Every vocal phrase must contain actual words from the supplied lyrics.
The singer must not invent extra words or syllables.

INSTRUMENTAL INTRO:

Start with a short, completely instrumental introduction.

Use Iranian instruments only during the introduction.
The introduction must contain no singer, no background voice,
no humming, no chanting and no wordless vocal sounds.

After the instrumental introduction, enter directly with the first written lyric line.
Do not add a separate vocal intro or improvised syllables.

The intro should be short and musically connected to the song.
Do not let it consume too much of the song.

SONG-SPECIFIC MELODY AND ARRANGEMENT:

Create a fresh melody and arrangement for this particular song.

Use the meaning, emotion and imagery of the supplied lyrics
to shape the melody, rhythm, instrumental choices and dynamics.

Do not reuse a generic melody or the same arrangement template for every song.

Give each song its own recognizable musical character:
- A distinct opening instrumental phrase.
- A distinct vocal melody and phrase ending.
- A groove that fits the emotional character.
- A clear musical build toward the chorus.
- A memorable but natural chorus melody.
- A suitable instrumental transition or short solo.

Keep the overall identity contemporary Iranian Persian pop,
while allowing the melody and arrangement to change from song to song.

IRANIAN INSTRUMENTS:

Use Iranian instruments as meaningful musical voices,
not merely as background decoration.

Available instruments:

1. Santur:
A clearly audible melodic instrument.
Use recognizable Persian melodic phrases, especially in the intro
or in selected instrumental transitions.

2. Tar:
Use expressive Persian melodic responses and short instrumental phrases.
Keep its sound distinguishable.

3. Kamancheh:
Use emotional sustained melodies and responses between vocal phrases.

4. Ney:
Use selectively for atmospheric Persian melodic passages.
Do not let it disappear behind the mix.

5. Tombak and Daf:
Use gentle, controlled Iranian percussion.
Keep the rhythm supportive and natural.
Avoid loud, rapid or continuous percussion.

INSTRUMENTAL BALANCE:

Do not force every Iranian instrument to play continuously.

Choose two or three featured Iranian instruments for the main arrangement
according to the mood and character of this song.
Let the remaining instruments appear selectively in transitions
or as subtle supporting layers.

Give each featured instrument enough space to be clearly heard.
Avoid overcrowding the mix.

Santur and tar should have an identifiable role where musically appropriate.
Kamancheh and ney should complement the melody without competing with the singer.
Tombak and daf should support the groove without overpowering the arrangement.

Do not let synthesizers, electric guitar or generic drum loops dominate.
The vocal melody must remain the emotional center of the song.

TEMPO AND GROOVE:

Use a moderate, comfortable mid-tempo Persian pop groove.

Keep the rhythm steady and natural.
Do not rush the lyrics.
Do not make the performance excessively slow, sleepy or dragging.
Do not make it fast, aggressive or dance-oriented unless the requested mood clearly calls for it.

Keep the current moderate Persian pop character,
but shape the rhythmic feel and arrangement to suit each song.

MUSICAL DYNAMICS:

Create a clear difference between the verses and chorus.

Keep the verses intimate and expressive.
Let the pre-chorus build naturally when present.
Give the chorus more emotional and melodic impact.
Use a controlled musical lift rather than simply making everything louder.

Allow the bridge and final chorus to develop naturally.
Avoid repeating the same instrumental pattern throughout the entire song.

STRICT STYLE EXCLUSIONS:

Avoid generic Western pop vocal phrasing.
Avoid English-like pronunciation and syllable stress.
Avoid foreign-sounding melodic delivery.
Avoid Turkish pop vocal ornaments and Turkish folk phrasing.
Avoid Arabic vocal phrasing.
Avoid Indian and Bollywood-style singing.
Avoid traditional classical Persian vocal performance.

Do not turn the song into a traditional classical performance.
Do not use excessive vocal ornaments.
Do not make the singer sound like a foreign pop singer singing Persian lyrics.

FINAL MUSICAL DIRECTION:

The result should sound like a professionally produced contemporary Iranian romantic pop song.

Keep a recognizable Persian pop identity in the singer, melody and arrangement.
Make the melody, intro, groove and instrumental arrangement specific to this song.

The introduction is instrumental only.
The singer enters with the first actual lyric line.
No wordless vocalizations anywhere in the song.
`;

    bpm = 88;
    timeSignature = "4";
  }

  else {
    profile = "pop";

    prompt = `
Create a contemporary pop song with a clear musical identity.

Use a memorable melody, balanced instrumentation and a coherent arrangement.
Follow the requested musical style: ${requestedStyle || "contemporary pop"}.

Avoid unnecessary jazz or rock elements unless explicitly requested.
`;

    timeSignature = "4";
  }

  if (mood) {
    prompt += `
Requested mood and atmosphere: ${mood}.
Use this mood to shape the melody, groove, dynamics and instrumental arrangement.
`;
  }

  return {
    profile,
    requestedStyle,
    vocalLanguage: language,
    prompt,
    bpm,
    timeSignature
  };
}

// ==========================================
// استخراج فایل صوتی ACE
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
// درخواست مشترک به ACE
// ==========================================

async function requestAce(apiKey, aceBody) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    240000
  );

  try {
    const response = await fetch(ACE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(aceBody),
      signal: controller.signal
    });

    const rawResponse = await response.text();
    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      throw new Error(
        `پاسخ ACE قابل پردازش نیست. کد HTTP: ${response.status}. ` +
        rawResponse.slice(0, 500)
      );
    }

    if (!response.ok || data.error) {
      const apiError =
        data.error?.message ||
        data.error ||
        data.message ||
        `خطای ACE با کد ${response.status}`;

      throw new Error(String(apiError).slice(0, 1200));
    }

    return {
      data,
      status: response.status
    };

  } finally {
    clearTimeout(timeout);
  }
}

// ==========================================
// آماده‌سازی تاریخچه NAVI برای Gemini
// ==========================================

function prepareNaviHistory(history, currentMessage) {
  const rawHistory = Array.isArray(history)
    ? history.slice(-10)
    : [];

  const contents = [];

  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;

    let role = String(item.role || "").toLowerCase();

    if (role === "assistant") role = "model";

    if (role !== "user" && role !== "model") continue;

    const historyText = safeNaviText(
      item.content || item.text || "",
      2000
    );

    if (!historyText) continue;

    const previousMessage = contents[contents.length - 1];

    if (previousMessage && previousMessage.role === role) {
      previousMessage.parts[0].text += "\n" + historyText;
    } else {
      contents.push({
        role,
        parts: [{ text: historyText }]
      });
    }
  }

  while (
    contents.length > 0 &&
    contents[0].role !== "user"
  ) {
    contents.shift();
  }

  const lastMessage = contents[contents.length - 1];

  if (
    lastMessage &&
    lastMessage.role === "user" &&
    lastMessage.parts[0].text.trim() === currentMessage.trim()
  ) {
    return contents;
  }

  if (lastMessage && lastMessage.role === "user") {
    lastMessage.parts[0].text += "\n" + currentMessage;
  } else {
    contents.push({
      role: "user",
      parts: [{ text: currentMessage }]
    });
  }

  return contents;
}

// ==========================================
// تنظیمات حافظه پایدار NAVI - D1
// ==========================================

const NAVI_MAIN_THREAD_ID = "owner-main";
const NAVI_OWNER_ID = "owner";

async function ensureNaviMainThread(db) {
  await db.prepare(`
    INSERT OR IGNORE INTO navi_chat_threads_v1
    (thread_id, owner_id, title)
    VALUES (?, ?, ?)
  `).bind(
    NAVI_MAIN_THREAD_ID,
    NAVI_OWNER_ID,
    "گفت‌وگوی اصلی ناوی"
  ).run();
}

async function getNaviDbHistory(db, limit = 10) {
  const result = await db.prepare(`
    SELECT role, content, created_at
    FROM navi_chat_messages_v1
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).bind(
    NAVI_MAIN_THREAD_ID,
    limit
  ).all();

  return (result.results || []).reverse().map(row => ({
    role: row.role,
    content: row.content,
    created_at: row.created_at
  }));
}

async function getNaviApprovedMemory(db) {
  const result = await db.prepare(`
    SELECT memory_key, memory_value
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'approved'
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(NAVI_OWNER_ID).all();

  return result.results || [];
}

// تشخیص دستور مستقیم ذخیره حافظه
function parseNaviMemoryCommand(message) {
  const text = String(message || "");

  const match = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?به\s+خاطر\s+بسپار(?:\s+که)?\s*[:：،-]?\s*/u
  );

  if (!match) {
    return {
      isCommand: false,
      value: ""
    };
  }

  return {
    isCommand: true,
    value: safeNaviText(
      text.slice(match[0].length),
      1000
    )
  };
}

// ذخیره اطلاعات تأییدشده در D1
async function saveNaviMemoryFact(db, value) {
  const memoryKey = "یادداشت کاربر";

  const existing = await db.prepare(`
    SELECT id
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND memory_key = ?
      AND memory_value = ?
      AND status = 'approved'
    LIMIT 1
  `).bind(
    NAVI_OWNER_ID,
    memoryKey,
    value
  ).first();

  if (existing) {
    return {
      duplicate: true
    };
  }

  await db.prepare(`
    INSERT INTO navi_memory_facts_v1
    (owner_id, memory_key, memory_value, source, status)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    NAVI_OWNER_ID,
    memoryKey,
    value,
    "user_command",
    "approved"
  ).run();

  return {
    duplicate: false
  };
}

async function saveNaviConversation(db, userMessage, assistantMessage) {
  await db.batch([
    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'user', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      userMessage
    ),

    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'assistant', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      assistantMessage
    ),

    db.prepare(`
      UPDATE navi_chat_threads_v1
      SET updated_at = datetime('now')
      WHERE thread_id = ?
    `).bind(NAVI_MAIN_THREAD_ID)
  ]);
}

// ==========================================
// NAVI PRIVATE AUTH - Secure Session
// ==========================================

function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(
    normalized + "=".repeat((4 - normalized.length % 4) % 4)
  );

  return Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );
}

async function getNaviSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

async function createNaviSession(secret) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: "nava-navi",
    sub: "owner",
    iat: now,
    exp: now + 12 * 60 * 60
  };

  const payloadPart = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await getNaviSigningKey(secret);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart)
  );

  return payloadPart + "." + base64UrlEncode(
    new Uint8Array(signature)
  );
}

async function verifyNaviSession(token, secret) {
  try {
    if (
      typeof token !== "string" ||
      token.length > 2000
    ) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) return false;

    const [payloadPart, signaturePart] = parts;
    const key = await getNaviSigningKey(secret);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(payloadPart)
    );

    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(
        base64UrlDecode(payloadPart)
      )
    );

    const now = Math.floor(Date.now() / 1000);

    return (
      payload.iss === "nava-navi" &&
      payload.sub === "owner" &&
      Number.isFinite(payload.exp) &&
      payload.exp > now &&
      Number.isFinite(payload.iat) &&
      payload.iat <= now + 60
    );

  } catch {
    return false;
  }
}

async function verifyNaviPassword(inputPassword, realPassword) {
  if (
    typeof inputPassword !== "string" ||
    typeof realPassword !== "string" ||
    inputPassword.length < 1 ||
    inputPassword.length > 256
  ) {
    return false;
  }

  const encoder = new TextEncoder();

  const inputHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(inputPassword)
    )
  );

  const realHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(realPassword)
    )
  );

  let difference = 0;

  for (let i = 0; i < inputHash.length; i++) {
    difference |= inputHash[i] ^ realHash[i];
  }

  return difference === 0;
}
 
