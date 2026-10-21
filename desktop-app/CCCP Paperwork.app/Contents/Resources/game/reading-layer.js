(function () {
  "use strict";

  const HANZI_PATTERN = /[\u3400-\u9fff]/;
  const HANZI_RUN_PATTERN = /[\u3400-\u9fff]+/g;
  const SKIP_SELECTOR =
    ".hanzi-character, .sentence-pinyin, .hanzi-hover-card, [data-reading-skip], script, style, noscript, textarea";
  const meanings = window.HANZI_MEANINGS || {};
  const pinyin = window.pinyinPro?.pinyin;

  if (!pinyin) {
    console.warn("Mandarin reading layer could not start because pinyin-pro is unavailable.");
    return;
  }

  const pendingRoots = new Set();
  let readingScheduled = false;
  let touchHideTimer = null;

  const tooltip = document.createElement("div");
  tooltip.className = "hanzi-hover-card";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.dataset.readingSkip = "true";
  tooltip.innerHTML = `
    <span class="hover-glyph"></span>
    <span class="hover-details">
      <strong class="hover-pinyin"></strong>
      <span class="hover-meaning"></span>
    </span>
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

  function buildHanziRun(text) {
    const fragment = document.createDocumentFragment();
    const details = pinyin(text, {
      type: "all",
      toneSandhi: true,
      toneType: "symbol",
    });

    Array.from(text).forEach((character, index) => {
      const reading = details[index]?.pinyin || pinyin(character);
      const meaning = meanings[character] || "Chinese character";
      const span = document.createElement("span");
      span.className = "hanzi-character";
      span.dataset.character = character;
      span.dataset.pinyin = reading;
      span.dataset.meaning = meaning;
      span.textContent = character;
      fragment.appendChild(span);
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
      source.appendChild(buildHanziRun(match[0]));
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
    if (!(target instanceof Element) || !target.matches(".hanzi-character")) return;
    window.clearTimeout(touchHideTimer);
    tooltip.querySelector(".hover-glyph").textContent = target.dataset.character || target.textContent;
    tooltip.querySelector(".hover-pinyin").textContent = target.dataset.pinyin || "";
    tooltip.querySelector(".hover-meaning").textContent = target.dataset.meaning || "Chinese character";
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
    const character = event.target.closest?.(".hanzi-character");
    if (character) showTooltip(character);
  });

  document.addEventListener("pointerout", (event) => {
    const character = event.target.closest?.(".hanzi-character");
    if (character && !character.contains(event.relatedTarget)) hideTooltip();
  });

  document.addEventListener("click", (event) => {
    const character = event.target.closest?.(".hanzi-character");
    if (!character || character.closest("button")) {
      hideTooltip();
      return;
    }
    showTooltip(character);
    touchHideTimer = window.setTimeout(hideTooltip, 2400);
  });

  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);

  queueReading(document.getElementById("app") || document.body);
})();
