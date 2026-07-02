/**
 * Общие операции форматирования для contenteditable-редакторов.
 */
(function () {
  function unwrapElement(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }

  function matchesElement(el, tagName, className) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.tagName.toLowerCase() !== tagName.toLowerCase()) return false;
    if (!className) return true;
    if (className === "tg-mark" && tagName.toLowerCase() === "mark") {
      return el.classList.contains("tg-mark") || !el.className;
    }
    return el.classList.contains(className);
  }

  function findInnermostWrapper(range, boundary, tagName, className) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

    let innermost = null;
    while (node && node !== boundary) {
      if (matchesElement(node, tagName, className)) {
        innermost = node;
      }
      node = node.parentElement;
    }
    return innermost;
  }

  function isSelectionInsideElement(range, el) {
    const elRange = document.createRange();
    elRange.selectNodeContents(el);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, elRange) >= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, elRange) <= 0
    );
  }

  function toggleWrapRange(range, boundary, tagName, className) {
    let unwrapped = false;

    while (true) {
      const wrapper = findInnermostWrapper(range, boundary, tagName, className);
      if (!wrapper || !isSelectionInsideElement(range, wrapper)) {
        break;
      }
      unwrapElement(wrapper);
      unwrapped = true;
    }

    return unwrapped;
  }

  function findClosestBlock(range, messageEl) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const blocks = new Set([
      "p",
      "h1",
      "h2",
      "h3",
      "li",
      "blockquote",
      "aside",
      "pre",
      "td",
      "th",
    ]);
    while (node && node !== messageEl) {
      if (blocks.has(node.tagName.toLowerCase())) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function surroundRange(range, el) {
    try {
      range.surroundContents(el);
      return true;
    } catch {
      const fragment = range.extractContents();
      if (!fragment.textContent.trim()) return false;
      el.appendChild(fragment);
      range.insertNode(el);
      return true;
    }
  }

  function toggleBlockTag(range, messageEl, tagName) {
    const wrapper = findInnermostWrapper(range, messageEl, tagName);
    if (wrapper && isSelectionInsideElement(range, wrapper)) {
      unwrapElement(wrapper);
      return true;
    }

    const block = findClosestBlock(range, messageEl);
    if (block && block.tagName.toLowerCase() === tagName.toLowerCase()) {
      const replacement = document.createElement("p");
      replacement.innerHTML = block.innerHTML;
      block.replaceWith(replacement);
      return true;
    }

    if (block && /^h[1-3]$/.test(block.tagName.toLowerCase())) {
      const heading = document.createElement(tagName);
      heading.innerHTML = block.innerHTML;
      block.replaceWith(heading);
      return true;
    }

    const el = document.createElement(tagName);
    return surroundRange(range, el);
  }

  function toggleQuote(range, messageEl) {
    const wrapper = findInnermostWrapper(range, messageEl, "blockquote");
    if (wrapper && isSelectionInsideElement(range, wrapper)) {
      unwrapElement(wrapper);
      return true;
    }

    const quote = document.createElement("blockquote");
    const p = document.createElement("p");
    try {
      const fragment = range.extractContents();
      if (!fragment.textContent.trim()) return false;
      p.appendChild(fragment);
      quote.appendChild(p);
      range.insertNode(quote);
      return true;
    } catch {
      return surroundRange(range, quote);
    }
  }

  function toggleCenter(range, messageEl) {
    const wrapper = findInnermostWrapper(range, messageEl, "aside");
    if (wrapper && isSelectionInsideElement(range, wrapper)) {
      unwrapElement(wrapper);
      return true;
    }

    const aside = document.createElement("aside");
    return surroundRange(range, aside);
  }

  function queryFormatState(range, boundary, tagName, className) {
    const wrapper = findInnermostWrapper(range, boundary, tagName, className);
    return Boolean(wrapper && isSelectionInsideElement(range, wrapper));
  }

  window.visualFormat = {
    unwrapElement,
    findInnermostWrapper,
    isSelectionInsideElement,
    toggleWrapRange,
    toggleBlockTag,
    toggleQuote,
    toggleCenter,
    findClosestBlock,
    matchesElement,
    queryFormatState,
  };
})();
