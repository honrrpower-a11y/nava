
/*
 * Nava Persian Lyrics Engine
 * Version: 0.1.0
 * مستقل از Worker فعلی
 * بدون API و بدون هزینه
 */

const NAVA_PRONUNCIATION = {
  "چگونه": {
    spoken: "چگونه",
    phonetic: "che-goo-ne",
    singing: "چِگُونه"
  },
  "دیوونه": {
    spoken: "دیوونه",
    phonetic: "di-voo-ne"
  },
  "بی‌نشونه": {
    spoken: "بی‌نشونه",
    phonetic: "bi-ne-shoo-ne"
  },
  "پریشون": {
    spoken: "پریشون",
    phonetic: "pa-ri-shoon"
  },
  "بی‌امونه": {
    spoken: "بی‌امونه",
    phonetic: "bi-a-moo-ne"
  },
  "عاشقونه": {
    spoken: "عاشقونه",
    phonetic: "a-she-ghoo-ne"
  },
  "دل‌شکسته": {
    spoken: "دل‌شکسته",
    phonetic: "del-she-kas-te"
  }
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

function getPronunciationHints(line) {
  const hints = [];

  for (const [word, info] of Object.entries(NAVA_PRONUNCIATION)) {
    if (line.includes(word)) {
      hints.push({
        word,
        ...info
      });
    }
  }

  return hints;
}

function preparePersianLyrics(input) {
  const originalText = String(input || "");
  const normalizedText = normalizePersian(originalText);

  const lines = normalizedText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return {
    engine: "Nava Persian Lyrics Engine",
    version: "0.1.0",
    language: "fa",
    dialect: "persian_colloquial",

    original_text: originalText,
    normalized_text: normalizedText,

    vocal: {
      voice: "male_solo",
      backing_vocals: false,
      style: "emotional"
    },

    lines: lines.map((line, index) => ({
      line_number: index + 1,
      original: line,
      singing_text: line,
      pronunciation_hints: getPronunciationHints(line)
    }))
  };
}

// Export for use in other Nava files
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    preparePersianLyrics,
    normalizePersian,
    NAVA_PRONUNCIATION
  };
}
