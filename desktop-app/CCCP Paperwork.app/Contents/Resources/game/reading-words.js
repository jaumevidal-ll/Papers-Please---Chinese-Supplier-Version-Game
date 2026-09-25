(function (root) {
  "use strict";

  const tradeTerms = [
    "最迟装运日期",
    "已装船日期",
    "商业发票",
    "采购订单",
    "海运提单",
    "装箱单",
    "装货港",
    "卸货港",
    "集装箱号",
    "不一致",
    "字段",
    "审单",
  ];
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh", { granularity: "word" })
    : null;

  function splitUnknownWord(text, meanings) {
    const characters = Array.from(text);
    const words = [];
    for (let index = 0; index < characters.length;) {
      let match = "";
      for (let length = Math.min(8, characters.length - index); length >= 2; length--) {
        const candidate = characters.slice(index, index + length).join("");
        if (meanings[candidate]) {
          match = candidate;
          break;
        }
      }
      words.push(match || characters[index]);
      index += match ? Array.from(match).length : 1;
    }
    return words;
  }

  function segmentPlainText(text, meanings) {
    const segments = segmenter
      ? Array.from(segmenter.segment(text), (part) => part.segment)
      : [text];
    return segments.flatMap((word) => meanings[word] ? [word] : splitUnknownWord(word, meanings));
  }

  function splitChineseRun(text, meanings) {
    const words = [];
    let cursor = 0;
    while (cursor < text.length) {
      const term = tradeTerms.find((word) => meanings[word] && text.startsWith(word, cursor));
      if (term) {
        words.push(term);
        cursor += term.length;
        continue;
      }

      let nextTerm = cursor + 1;
      while (nextTerm < text.length && !tradeTerms.some(
        (word) => meanings[word] && text.startsWith(word, nextTerm)
      )) nextTerm++;
      words.push(...segmentPlainText(text.slice(cursor, nextTerm), meanings));
      cursor = nextTerm;
    }
    return words;
  }

  const api = Object.freeze({ splitChineseRun });
  root.READING_WORDS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
