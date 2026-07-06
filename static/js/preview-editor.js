/**
 * Редактирование текста прямо в превью Telegram (contenteditable + HTML → Markdown).
 */
(function () {
  const PREVIEW_ROOT_ID = "preview-content";
  const TEXTAREA_ID = "post-content";
  const EMPTY_TEXT = "Начните вводить текст…";

  let editable = true;
  let dirty = false;
  let focused = false;
  let syncTimer = null;
  let savedPreviewRange = null;

  function savePreviewSelection() {
    const messageEl = getMessage();
    if (!messageEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (messageEl.contains(range.commonAncestorContainer)) {
      savedPreviewRange = range.cloneRange();
    }
  }

  function getRoot() {
    return document.getElementById(PREVIEW_ROOT_ID);
  }

  function getMessage() {
    return getRoot()?.querySelector(".tg-message");
  }

  function getTextarea() {
    return document.getElementById(TEXTAREA_ID);
  }

  function isEditing() {
    return focused;
  }

  function isDirty() {
    return dirty;
  }

  function serializeInline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node;
    const tag = el.tagName.toLowerCase();
    const inner = () => Array.from(el.childNodes).map(serializeInline).join("");

    switch (tag) {
      case "br":
        return "\n";
      case "b":
      case "strong":
        return `**${inner()}**`;
      case "i":
      case "em":
        return `*${inner()}*`;
      case "s":
      case "del":
        return `~~${inner()}~~`;
      case "u":
        return `<u>${inner()}</u>`;
      case "mark":
        return `==${inner()}==`;
      case "code":
        if (el.parentElement?.tagName === "PRE") {
          return el.textContent;
        }
        return `\`${inner()}\``;
      case "sub":
        return `<sub>${inner()}</sub>`;
      case "sup":
        return `<sup>${inner()}</sup>`;
      case "a": {
        const href = el.getAttribute("href") || "";
        return `[${inner()}](${href})`;
      }
      case "span":
        if (el.classList.contains("tg-spoiler")) {
          return `||${inner()}||`;
        }
        if (el.classList.contains("tg-math")) {
          return `$${inner()}$`;
        }
        return inner();
      case "img": {
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        if (src.startsWith("tg://emoji?id=")) {
          return `![${alt}](${src})`;
        }
        return `![](${src})`;
      }
      default:
        return inner();
    }
  }

  const INLINE_TAGS = new Set([
    "br", "b", "strong", "i", "em", "s", "del", "u", "mark",
    "code", "sub", "sup", "a", "span", "img",
  ]);

  function isInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return true;
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return INLINE_TAGS.has(node.tagName.toLowerCase());
  }

  /**
   * Дочерние узлы блока могут содержать «голый» инлайн-контент (текст и теги
   * форматирования вроде <mark>/<strong>) прямо рядом с блочными тегами —
   * так бывает, когда строка не обёрнута в <p> (первая строка поста, строка
   * после Enter). Такие узлы нельзя отдавать в serializeBlock по одному:
   * он не знает про инлайн-теги и потеряет их разметку (**, ==, ~~ и т.п.).
   * Поэтому собираем подряд идущие инлайн-узлы и сериализуем их как один
   * абзац через serializeInline.
   */
  function serializeBlockChildren(children) {
    const parts = [];
    let buffer = [];

    function flushBuffer() {
      if (!buffer.length) return;
      const text = buffer.map(serializeInline).join("").trim();
      if (text) parts.push(`${text}\n\n`);
      buffer = [];
    }

    children.forEach((node) => {
      if (isInlineNode(node)) {
        buffer.push(node);
      } else {
        flushBuffer();
        parts.push(serializeBlock(node));
      }
    });
    flushBuffer();

    return parts.join("");
  }

  function serializeParagraph(el) {
    const text = Array.from(el.childNodes).map(serializeInline).join("");
    return text.replace(/\n+$/, "");
  }

  function serializeListItem(el, ordered, index) {
    const prefix = ordered ? `${index}. ` : "- ";
    return prefix + serializeParagraph(el);
  }

  function serializeTable(el) {
    const rows = Array.from(el.querySelectorAll("tr"));
    if (!rows.length) return "";

    const lines = rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      return `| ${cells.map((cell) => serializeParagraph(cell).replace(/\|/g, "\\|")).join(" | ")} |`;
    });

    if (lines.length > 1) {
      const colCount = rows[0].querySelectorAll("th, td").length;
      const sep = Array.from({ length: colCount }, (_, i) => (i === colCount - 1 ? ":---:" : ":---"));
      lines.splice(1, 0, `| ${sep.join(" | ")} |`);
    }

    return `${lines.join("\n")}\n\n`;
  }

  function serializeFigure(el) {
    const media = el.querySelector("img, video, audio");
    if (!media) return "";

    const url = media.getAttribute("src") || "";
    const caption = el.querySelector("figcaption")?.textContent?.trim();
    if (caption) {
      const safe = caption.replace(/"/g, '\\"');
      return `![](${url} "${safe}")\n\n`;
    }
    return `![](${url})\n\n`;
  }

  function serializeDetails(el) {
    const summaryEl = el.querySelector("summary");
    const summary = summaryEl ? serializeInline(summaryEl).trim() : "Подробнее";

    const clone = el.cloneNode(true);
    clone.querySelector("summary")?.remove();
    const body = Array.from(clone.childNodes)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          return serializeBlock(node);
        }
        return "";
      })
      .join("")
      .trim();

    return `<details><summary>${summary}</summary>\n${body}\n</details>\n\n`;
  }

  function serializeBlock(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      return text.trim() ? `${text.trim()}\n\n` : "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node;
    const tag = el.tagName.toLowerCase();

    if (tag === "p" && el.classList.contains("empty")) {
      return "";
    }

    switch (tag) {
      case "p":
        return `${serializeParagraph(el)}\n\n`;
      case "h1":
        return `# ${serializeParagraph(el)}\n\n`;
      case "h2":
        return `## ${serializeParagraph(el)}\n\n`;
      case "h3":
        return `### ${serializeParagraph(el)}\n\n`;
      case "blockquote": {
        const lines = [];
        const paragraphs = el.querySelectorAll("p");
        if (paragraphs.length) {
          paragraphs.forEach((p) => {
            const line = serializeParagraph(p).trim();
            if (line) lines.push(`> ${line}`);
          });
        } else {
          const line = serializeInline(el).trim();
          if (line) lines.push(`> ${line}`);
        }
        return lines.length ? `${lines.join("\n")}\n\n` : "";
      }
      case "ul":
        if (el.classList.contains("tg-checklist")) {
          const items = Array.from(el.querySelectorAll(":scope > li")).map((li) => {
            const checked = li.classList.contains("checked") ? "x" : " ";
            return `- [${checked}] ${serializeParagraph(li)}`;
          });
          return items.length ? `${items.join("\n")}\n\n` : "";
        }
        return (
          Array.from(el.querySelectorAll(":scope > li"))
            .map((li, i) => serializeListItem(li, false, i + 1))
            .join("\n") + "\n\n"
        );
      case "ol":
        return (
          Array.from(el.querySelectorAll(":scope > li"))
            .map((li, i) => serializeListItem(li, true, i + 1))
            .join("\n") + "\n\n"
        );
      case "pre": {
        const code = el.querySelector("code");
        const text = (code ? code.textContent : el.textContent).replace(/\n$/, "");
        return `\`\`\`\n${text}\n\`\`\`\n\n`;
      }
      case "aside":
        return `<aside>${serializeInline(el)}</aside>\n\n`;
      case "figure":
        return serializeFigure(el);
      case "table":
        return serializeTable(el);
      case "details":
        return serializeDetails(el);
      case "div":
        if (el.classList.contains("tg-math-block")) {
          return `$$${serializeInline(el)}$$\n\n`;
        }
        return serializeBlockChildren(Array.from(el.childNodes));
      default:
        return serializeBlockChildren(Array.from(el.childNodes));
    }
  }

  function messageToMarkdown(messageEl) {
    if (!messageEl) return "";

    return serializeBlockChildren(Array.from(messageEl.childNodes))
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
  }

  function dismissPlaceholder(messageEl) {
    if (!messageEl) return;

    messageEl.querySelector("p.empty")?.remove();

    const text = (messageEl.textContent || "").trim();
    if (text === EMPTY_TEXT) {
      messageEl.textContent = "";
    }

    messageEl.removeAttribute("data-empty");
  }

  function updateEmptyState(messageEl) {
    if (!messageEl) return;

    const markdown = messageToMarkdown(messageEl).trim();
    if (!markdown) {
      messageEl.dataset.empty = "1";
      messageEl.querySelector("p.empty")?.remove();
      return;
    }

    messageEl.removeAttribute("data-empty");
    messageEl.querySelector("p.empty")?.remove();
  }

  function ensureMessageElement() {
    const root = getRoot();
    if (!root) return null;

    let message = root.querySelector(".tg-message");
    if (!message) {
      root.innerHTML = '<div class="tg-message tg-rich"></div>';
      message = root.querySelector(".tg-message");
    }
    return message;
  }

  function restoreSelection() {
    const messageEl = getMessage();
    if (!messageEl) return false;

    if (savedPreviewRange) {
      messageEl.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedPreviewRange);
      return true;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    return messageEl.contains(range.commonAncestorContainer);
  }

  function hasSelection() {
    const messageEl = getMessage();
    if (!messageEl) return false;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (messageEl.contains(range.commonAncestorContainer) && !range.collapsed) {
        return true;
      }
    }

    return Boolean(savedPreviewRange && !savedPreviewRange.collapsed);
  }

  function applyCommand(command) {
    if (!restoreSelection()) return false;

    window.editorHistory?.beforeChange?.();
    document.execCommand(command, false, null);
    savePreviewSelection();
    dirty = true;
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.();
    return true;
  }

  function wrapSelection(tagName, className) {
    if (!restoreSelection()) return false;

    const messageEl = getMessage();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !messageEl) return false;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    window.editorHistory?.beforeChange?.();

    const vf = window.visualFormat;
    if (vf?.isFormatActive?.(range, messageEl, tagName, className)) {
      vf.toggleWrapRange(range, messageEl, tagName, className);
      savePreviewSelection();
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      window.refreshPreview?.();
      return true;
    }

    const el = document.createElement(tagName);
    if (className) {
      el.className = className;
    }

    try {
      range.surroundContents(el);
      const newRange = document.createRange();
      newRange.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } catch {
      const fragment = range.extractContents();
      el.appendChild(fragment);
      range.insertNode(el);
      const newRange = document.createRange();
      newRange.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    savePreviewSelection();
    dirty = true;
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.();
    return true;
  }

  function applyEditableState(messageEl) {
    if (!messageEl) return;

    messageEl.contentEditable = editable ? "true" : "false";
    messageEl.classList.toggle("tg-editable", editable);
    messageEl.dataset.placeholder = editable ? EMPTY_TEXT : "";

    if (editable && !messageToMarkdown(messageEl).trim()) {
      messageEl.dataset.empty = "1";
    } else {
      messageEl.removeAttribute("data-empty");
    }

    if (!editable) {
      messageEl.removeAttribute("contenteditable");
    }
  }

  function bindMessage(messageEl) {
    if (!messageEl || messageEl.dataset.previewBound === "1") {
      applyEditableState(messageEl);
      return;
    }

    messageEl.dataset.previewBound = "1";

    messageEl.addEventListener("focus", () => {
      focused = true;
      dismissPlaceholder(messageEl);
    });

    messageEl.addEventListener("keydown", () => {
      dismissPlaceholder(messageEl);
    });

    messageEl.addEventListener("beforeinput", () => {
      dismissPlaceholder(messageEl);
    });

    messageEl.addEventListener("blur", () => {
      focused = false;
      savePreviewSelection();
      if (dirty) {
        syncToTextarea({ silent: true });
        window.editorHistory?.onTyping?.();
      }
      window.editorHistory?.flushTyping?.();
      dirty = false;
      updateEmptyState(messageEl);
      window.dispatchEvent(new CustomEvent("preview-editor:blur"));
    });

    messageEl.addEventListener("keyup", savePreviewSelection);
    messageEl.addEventListener("mouseup", savePreviewSelection);

    messageEl.addEventListener("input", () => {
      if (!editable) return;
      dirty = true;
      updateEmptyState(messageEl);
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncToTextarea({ silent: true });
        window.editorHistory?.onTyping?.();
        window.refreshPreview?.();
      }, 200);
    });

    messageEl.addEventListener("paste", (e) => {
      if (!editable) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text);
    });

    messageEl.addEventListener("click", (e) => {
      if (!editable) return;
      if (e.target.closest(".tg-spoiler")) {
        e.preventDefault();
      }
    });

    applyEditableState(messageEl);
  }

  function getMarkdown() {
    const messageEl = getMessage();
    if (!messageEl) return "";
    const markdown = messageToMarkdown(messageEl);
    return markdown.trim() === EMPTY_TEXT ? "" : markdown;
  }

  function syncToTextarea({ silent = false } = {}) {
    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl || !textarea || textarea.readOnly) {
      return;
    }

    const markdown = messageToMarkdown(messageEl);
    const normalized = markdown.trim() === EMPTY_TEXT ? "" : markdown;
    if (textarea.value === normalized) {
      dirty = false;
      return;
    }

    textarea.value = normalized;
    dirty = false;
    if (!silent) {
      textarea.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function clearFormatting() {
    if (!editable) return false;

    const messageEl = getMessage();
    if (!messageEl) return false;

    dismissPlaceholder(messageEl);

    if (!restoreSelection()) {
      messageEl.focus();
      const range = document.createRange();
      range.selectNodeContents(messageEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (!messageEl.contains(range.commonAncestorContainer)) return false;

    const plain = range.toString();
    if (!plain && range.collapsed) return false;

    window.editorHistory?.beforeChange?.();

    range.deleteContents();
    const textNode = document.createTextNode(plain);
    range.insertNode(textNode);
    range.selectNode(textNode);
    sel.removeAllRanges();
    sel.addRange(range);
    savedPreviewRange = range.cloneRange();

    dirty = true;
    updateEmptyState(messageEl);
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.(true);
    return true;
  }

  function setHtml(html) {
    const root = getRoot();
    if (!root) return;

    const temp = document.createElement("div");
    temp.innerHTML = html || "";
    const message = temp.querySelector(".tg-message");
    const onlyEmpty =
      message &&
      message.querySelector("p.empty") &&
      !messageToMarkdown(message).trim();

    root.innerHTML = onlyEmpty ? '<div class="tg-message tg-rich"></div>' : html;
    const bound = ensureMessageElement();
    bindMessage(bound);
    updateEmptyState(bound);
  }

  function setEditable(enabled) {
    editable = Boolean(enabled);
    const message = getMessage();
    applyEditableState(message);
    if (!enabled) {
      savedPreviewRange = null;
    }
  }

  function insertAtEnd(messageEl, text) {
    messageEl.focus();
    dismissPlaceholder(messageEl);

    const sel = window.getSelection();
    if (!sel) return false;

    const range = document.createRange();
    range.selectNodeContents(messageEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, text);
    if (sel.rangeCount) {
      savedPreviewRange = sel.getRangeAt(0).cloneRange();
    }
    return true;
  }

  function insertText(text) {
    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl || !editable || !text) {
      return false;
    }

    if (textarea && document.activeElement === textarea) {
      return false;
    }

    window.editorHistory?.beforeChange?.();

    if (savedPreviewRange) {
      messageEl.focus();
      dismissPlaceholder(messageEl);

      const sel = window.getSelection();
      if (sel) {
        try {
          sel.removeAllRanges();
          sel.addRange(savedPreviewRange);
          document.execCommand("insertText", false, text);
          if (sel.rangeCount) {
            savedPreviewRange = sel.getRangeAt(0).cloneRange();
          }

          dirty = true;
          syncToTextarea({ silent: true });
          window.editorHistory?.afterChange?.();
          return true;
        } catch {
          savedPreviewRange = null;
        }
      }
    }

    if (focused || messageEl === document.activeElement) {
      messageEl.focus();
      dismissPlaceholder(messageEl);
      document.execCommand("insertText", false, text);
      savePreviewSelection();
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      return true;
    }

    if (insertAtEnd(messageEl, text)) {
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      return true;
    }

    return false;
  }

  function init() {
    const root = getRoot();
    if (!root) return;

    bindMessage(getMessage());

    const textarea = getTextarea();
    textarea?.addEventListener("focus", () => {
      savedPreviewRange = null;
    });

    window.previewEditor = {
      isEditing,
      isDirty,
      syncToTextarea,
      setHtml,
      setEditable,
      insertText,
      messageToMarkdown,
      getMarkdown,
      hasSelection,
      savePreviewSelection,
      applyCommand,
      wrapSelection,
      clearFormatting,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
