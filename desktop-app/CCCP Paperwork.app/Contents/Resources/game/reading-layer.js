(function () {
  "use strict";

  const HANZI_PATTERN = /[\u3400-\u9fff]/;
  const HANZI_RUN_PATTERN = /[\u3400-\u9fff]+/g;
  const SKIP_SELECTOR =
    ".hanzi-word, .hanzi-character, .sentence-pinyin, .hanzi-hover-card, [data-reading-skip], script, style, noscript, textarea";
  const meanings = window.HANZI_MEANINGS || {};
  const wordMeanings = window.WORD_MEANINGS || {};
  const splitChineseRun = window.READING_WORDS?.splitChineseRun;
  const pinyin = window.pinyinPro?.pinyin;

  if (!pinyin || !splitChineseRun) {
    console.warn("Mandarin reading layer could not start because its language data is unavailable.");
    return;
  }

  const pendingRoots = new Set();
  let readingScheduled = false;
  let touchHideTimer = null;

  const tooltip = document.createElement("div");
  tooltip.id = "reading-word-tooltip";
  tooltip.className = "hanzi-hover-card";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.dataset.readingSkip = "true";
  tooltip.innerHTML = `
    <span class="hover-word-row">
      <span class="hover-glyph"></span>
      <span class="hover-details">
        <span class="hover-label">WORD</span>
        <strong class="hover-pinyin"></strong>
        <span class="hover-meaning"></span>
      </span>
    </span>
    <span class="hover-breakdown-label">CHARACTER MEANINGS</span>
    <span class="hover-breakdown"></span>
  `;
  document.body.appendChild(tooltip);

  function isSkippable(node) {
    return Boolean(node.parentElement?.closest(SKIP_SELECTOR));
  }

  function readingUnitFor(node) {
    let element = node.parentElement;
    while (element && element !== document.body) {
      if (element.matches(SKIP_SELECTOR)) return null;
      const display = window.getComputedStyle(element).display;
      if (display !== "inline" && display !== "contents") return element;
      element = element.parentElement;
    }
    return node.parentElement;
  }

  function sentenceReading(text) {
    return pinyin(text.trim(), {
      nonZh: "consecutive",
      separator: " ",
      toneSandhi: true,
      toneType: "symbol",
    });
  }

  function shortMeaning(value) {
    return (value || "Chinese character").split("; ").slice(0, 2).join("; ").slice(0, 90);
  }

  function buildHanziRun(text, insideButton) {
    const fragment = document.createDocumentFragment();
    const details = pinyin(text, {
      type: "all",
      toneSandhi: true,
      toneType: "symbol",
    });

    let offset = 0;
    splitChineseRun(text, wordMeanings).forEach((word) => {
      const wordSpan = document.createElement("span");
      const characters = Array.from(word);
      const reading = details.slice(offset, offset + characters.length)
        .map((part, index) => part?.pinyin || pinyin(characters[index]))
        .join(" ");
      const meaning = wordMeanings[word] || meanings[word] ||
        "No whole-word translation available; see character meanings below.";
      wordSpan.className = "hanzi-word";
      wordSpan.dataset.word = word;
      wordSpan.dataset.pinyin = reading;
      wordSpan.dataset.meaning = meaning;
      if (!insideButton) {
        wordSpan.tabIndex = 0;
        wordSpan.setAttribute("aria-describedby", tooltip.id);
      }

      characters.forEach((character, index) => {
        const charSpan = document.createElement("span");
        charSpan.className = "hanzi-character";
        charSpan.dataset.character = character;
        charSpan.dataset.pinyin = details[offset + index]?.pinyin || pinyin(character);
        charSpan.dataset.meaning = meanings[character] || "Chinese character";
        charSpan.textContent = character;
        wordSpan.appendChild(charSpan);
      });
      offset += characters.length;
      fragment.appendChild(wordSpan);
    });

    return fragment;
  }

  function annotateTextNode(node) {
    const value = node.nodeValue || "";
    if (!HANZI_PATTERN.test(value) || isSkippable(node)) return null;

    const unit = readingUnitFor(node);
    const reading = sentenceReading(value);
    const source = document.createElement("span");
    source.className = "hanzi-text-run";
    let cursor = 0;

    for (const match of value.matchAll(HANZI_RUN_PATTERN)) {
      const start = match.index || 0;
      if (start > cursor) source.appendChild(document.createTextNode(value.slice(cursor, start)));
      source.appendChild(buildHanziRun(match[0], Boolean(node.parentElement?.closest("button"))));
      cursor = start + match[0].length;
    }

    if (cursor < value.length) source.appendChild(document.createTextNode(value.slice(cursor)));
    node.replaceWith(source);

    return unit && reading ? { unit, reading } : null;
  }

  function applyReadingLayer(root) {
    if (!root || !root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) root = root.parentElement;
    if (!(root instanceof Element) || root.closest(SKIP_SELECTOR)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return HANZI_PATTERN.test(node.nodeValue || "") && !isSkippable(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const textNodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    const readingsByUnit = new Map();
    textNodes.forEach((node) => {
      const result = annotateTextNode(node);
      if (!result) return;
      if (!readingsByUnit.has(result.unit)) readingsByUnit.set(result.unit, []);
      readingsByUnit.get(result.unit).push(result.reading);
    });

    readingsByUnit.forEach((readings, unit) => {
      if (unit.closest("[data-reading-no-line]")) return;
      unit.querySelector(":scope > .sentence-pinyin[data-generated-reading]")?.remove();
      const line = document.createElement("span");
      line.className = "sentence-pinyin";
      line.dataset.generatedReading = "true";
      line.setAttribute("aria-hidden", "true");
      line.textContent = readings.join(" ").replace(/\s+/g, " ").trim();
      unit.classList.add("has-mandarin-reading");
      unit.appendChild(line);
    });
  }

  function queueReading(root) {
    const element = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!(element instanceof Element) || element.closest(SKIP_SELECTOR)) return;
    pendingRoots.add(element);
    if (readingScheduled) return;
    readingScheduled = true;
    window.requestAnimationFrame(() => {
      readingScheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(applyReadingLayer);
    });
  }

  function positionTooltip(target) {
    const targetBox = target.getBoundingClientRect();
    const tooltipBox = tooltip.getBoundingClientRect();
    const margin = 10;
    let left = targetBox.left + targetBox.width / 2 - tooltipBox.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipBox.width - margin));
    let top = targetBox.bottom + 9;
    if (top + tooltipBox.height > window.innerHeight - margin) {
      top = targetBox.top - tooltipBox.height - 9;
    }
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.max(margin, Math.round(top))}px`;
  }

  function showTooltip(target) {
    if (!(target instanceof Element) || !target.matches(".hanzi-word")) return;
    window.clearTimeout(touchHideTimer);
    tooltip.querySelector(".hover-glyph").textContent = target.dataset.word || target.textContent;
    tooltip.querySelector(".hover-pinyin").textContent = target.dataset.pinyin || "";
    tooltip.querySelector(".hover-meaning").textContent = target.dataset.meaning || "";
    const breakdown = tooltip.querySelector(".hover-breakdown");
    breakdown.replaceChildren();
    target.querySelectorAll(":scope > .hanzi-character").forEach((character) => {
      const row = document.createElement("span");
      row.className = "hover-character-row";
      for (const [className, value] of [
        ["hover-character-glyph", character.dataset.character],
        ["hover-character-pinyin", character.dataset.pinyin],
        ["hover-character-meaning", shortMeaning(character.dataset.meaning)],
      ]) {
        const part = document.createElement("span");
        part.className = className;
        part.textContent = value || "";
        row.appendChild(part);
      }
      breakdown.appendChild(row);
    });
    tooltip.classList.add("visible");
    tooltip.setAttribute("aria-hidden", "false");
    positionTooltip(target);
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") queueReading(mutation.target);
      mutation.addedNodes.forEach((node) => queueReading(node));
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  document.addEventListener("pointerover", (event) => {
    const word = event.target.closest?.(".hanzi-word");
    if (word) showTooltip(word);
  });

  document.addEventListener("pointerout", (event) => {
    const word = event.target.closest?.(".hanzi-word");
    if (word && !word.contains(event.relatedTarget)) hideTooltip();
  });

  document.addEventListener("click", (event) => {
    const word = event.target.closest?.(".hanzi-word");
    if (!word || word.closest("button")) {
      hideTooltip();
      return;
    }
    showTooltip(word);
    touchHideTimer = window.setTimeout(hideTooltip, 4000);
  });

  document.addEventListener("focusin", (event) => {
    const word = event.target.closest?.(".hanzi-word");
    if (word) showTooltip(word);
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.(".hanzi-word")) hideTooltip();
  });

  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);

  queueReading(document.getElementById("app") || document.body);
})();
