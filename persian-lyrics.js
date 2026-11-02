
/*
 * Nava Persian Lyrics Engine
 * Version: 0.3.1
 * Manual syllable dictionary + review detection
 */

const NAVA_PRONUNCIATION = [
  { word: "چگونه", variants: ["چگونه"], spoken: "چگونه", singing: "چِگُونه", phonetic: "che-goo-ne" },
  { word: "دیوونه", variants: ["دیوونه"], spoken: "دیوونه", singing: "دیوونه", phonetic: "di-voo-ne" },
  { word: "بی‌نشونه", variants: ["بی‌نشونه", "بی نشونه"], spoken: "بی‌نشونه", singing: "بی‌نشونه", phonetic: "bi-ne-shoo-ne" },
  { word: "پریشون", variants: ["پریشون"], spoken: "پریشون", singing: "پریشون", phonetic: "pa-ri-shoon" },
  { word: "بی‌امونه", variants: ["بی‌امونه", "بی امونه"], spoken: "بی‌امونه", singing: "بی‌امونه", phonetic: "bi-a-moo-ne" },
  { word: "عاشقونه", variants: ["عاشقونه"], spoken: "عاشقونه", singing: "عاشقونه", phonetic: "a-she-ghoo-ne" },
  { word: "دل‌شکسته", variants: ["دل‌شکسته", "دل شکسته"], spoken: "دل‌شکسته", singing: "دل‌شکسته", phonetic: "del-she-kas-te" },
  { word: "خونه", variants: ["خونه"], spoken: "خونه", singing: "خونه", phonetic: "khoo-ne" },
  { word: "می‌خوام", variants: ["می‌خوام", "می خوام"], spoken: "می‌خوام", singing: "می‌خوام", phonetic: "mi-khaam" },
  { word: "خسته", variants: ["خسته"], spoken: "خسته", singing: "خسته", phonetic: "khas-te" }
];

/*
 * Manual dictionary.
 * Only manually entered words are accepted as verified.
 * Unknown words are marked for review, never guessed.
 */

const NAVA_SYLLABLES = {
  "تو": ["تو"],
  "دیوونه": ["دی", "وو", "نه"],
  "رفتی": ["رَف", "تی"],
  "یه": ["یه"],
  "شب": ["شَب"],
  "بی‌نشونه": ["بی", "نِ", "شو", "نه"],
  "خواستی": ["خواس", "تی"],
  "که": ["کِ"],
  "قلبم": ["قَل", "بَم"],
  "پریشون": ["پَ", "ری", "شون"],
  "بمونه": ["بِ", "مو", "نه"],
  "واست": ["وا", "سِت"],
  "گریه": ["گِر", "یه"],
  "من": ["مَن"],
  "دیگه": ["دی", "گِ"],
  "بی‌امونه": ["بی", "ا", "مو", "نه"],
  "دل": ["دِل"],
  "از": ["اَز"],
  "درد": ["دَرد"],
  "عشقت": ["عِش", "قَت"],
  "دریای": ["دَر", "یا", "یِ"],
  "خونه": ["خو", "نه"],
  "می‌خوام": ["می", "خوام"],
  "با": ["با"],
  "باشم": ["با", "شَم"],
  "هنوز": ["هَ", "نوز"],
  "عاشقونه": ["عا", "شِ", "غو", "نه"],
  "ولی": ["وَ", "لی"],
  "نازنینم": ["نا", "زِ", "نی", "نَم"],
  "چگونه": ["چِ", "گُو", "نه"],
  "سبزه": ["سَب", "زِ"],
  "سبزم": ["سَب", "زَم"],
  "خسته": ["خَس", "تِ"],
  "شهر": ["شَهر"],
  "عشقم": ["عِش", "قَم"],
  "دل‌شکسته": ["دِل", "شِ", "کَس", "تِ"]
};

function normalizePersian(text) {
  return String(text || "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u0640/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function prepareSingingText(line) {
  return line
    .replace(/می\s+خواهم/g, "می‌خوام")
    .replace(/می‌خواهم/g, "می‌خوام")
    .replace(/دل\s+شکسته/g, "دل‌شکسته")
    .replace(/بی\s+نشونه/g, "بی‌نشونه")
    .replace(/بی\s+امونه/g, "بی‌امونه")
    .trim();
}

function getPronunciationHints(line) {
  const hints = [];

  for (const item of NAVA_PRONUNCIATION) {
    if (item.variants.some(v => line.includes(v))) {
      hints.push({
        word: item.word,
        spoken: item.spoken,
        singing: item.singing,
        phonetic: item.phonetic
      });
    }
  }

  return hints;
}

function getSyllables(line) {
  const words = line.match(/[\u0600-\u06FF\u200c]+/g) || [];

  return words.map(word => {
    const syllables = NAVA_SYLLABLES[word] || null;

    return {
      word,
      syllables,
      syllable_count: syllables ? syllables.length : null,
      syllable_source: syllables ? "manual_dictionary" : null,
      review_required: !syllables
    };
  });
}

function preparePersianLyrics(input) {
  const originalText = String(input || "");
  const normalizedText = normalizePersian(originalText);

  const lines = normalizedText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const preparedLines = lines.map((line, index) => {
    const singingText = prepareSingingText(line);
    const syllables = getSyllables(singingText);

    const reviewWords = syllables
      .filter(item => item.review_required)
      .map(item => item.word);

    return {
      line_number: index + 1,
      original: line,
      singing_text: singingText,

      pronunciation_hints:
        getPronunciationHints(singingText),

      syllable_analysis: {
        words: syllables,

        total_known_syllables: syllables.reduce(
          (sum, item) => sum + (item.syllable_count || 0),
          0
        ),

        needs_review: reviewWords.length > 0,
        review_words: [...new Set(reviewWords)]
      },

      pause_after_ms: index === lines.length - 1 ? 700 : 450
    };
  });

  const allReviewWords = preparedLines.flatMap(
    line => line.syllable_analysis.review_words
  );

  return {
    engine: "Nava Persian Lyrics Engine",
    version: "0.3.1",
    language: "fa",
    dialect: "persian_colloquial",

    original_text: originalText,
    normalized_text: normalizedText,

    vocal: {
      voice: "male_solo",
      backing_vocals: false,
      style: "emotional"
    },

    review_summary: {
      needs_review: allReviewWords.length > 0,
      unknown_words: [...new Set(allReviewWords)]
    },

    lines: preparedLines
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    preparePersianLyrics,
    normalizePersian,
    prepareSingingText,
    getPronunciationHints,
    getSyllables,
    NAVA_PRONUNCIATION,
    NAVA_SYLLABLES
  };
}
