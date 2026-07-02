/**
 * Левая панель: переключатель «Визуально / Markdown».
 */
(function () {
  const MODE_KEY = "post-editor-left-mode";
  const VISUAL_ROOT_ID = "editor-visual-content";
  const TEXTAREA_ID = "post-content";
  const EMPTY_TEXT = "Начните вводить текст…";

  const PREVIEW_COMMANDS = {
    bold: "bold",
    italic: "italic",
    strike: "strikeThrough",
    underline: "underline",
  };

  let mode = localStorage.getItem(MODE_KEY) === "markdown" ? "markdown" : "visual";
  let editable = true;
  let focused = false;
  let dirty = false;
  let syncTimer = null;
  let savedRange = null;
  let refreshToken = 0;

  function getTextarea() {
    return document.getElementById(TEXTAREA_ID);
  }

  function getRoot() {
    return document.getElementById(VISUAL_ROOT_ID);
  }

  function getMessage() {
    return getRoot()?.querySelector(".tg-message");
  }

  function isVisualMode() {
    return mode === "visual";
  }

  function isEditing() {
    return isVisualMode() && focused;
  }

  function isDirty() {
    return dirty;
  }

  function serialize(messageEl) {
    return window.previewEditor?.messageToMarkdown?.(messageEl) ?? "";
  }

  function getMarkdown() {
    const messageEl = getMessage();
    if (!messageEl) return "";
    const markdown = serialize(messageEl);
    return markdown.trim() === EMPTY_TEXT ? "" : markdown;
  }

  function syncToTextarea({ force = false, silent = false } = {}) {
    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl || !textarea || textarea.readOnly) return;

    const markdown = serialize(messageEl);
    if (!force && !dirty && !markdown.trim() && textarea.value.trim()) {
      return;
    }

    const nextValue = markdown.trim() === EMPTY_TEXT ? "" : markdown;
    if (textarea.value === nextValue) {
      dirty = false;
      return;
    }

    textarea.value = nextValue;
    dirty = false;
    if (!silent) {
      textarea.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function saveSelection() {
    const messageEl = getMessage();
    if (!messageEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (messageEl.contains(range.commonAncestorContainer)) {
      savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const messageEl = getMessage();
    if (!messageEl) return false;

    if (savedRange) {
      messageEl.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange);
      return true;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    return messageEl.contains(range.commonAncestorContainer);
  }

  function hasSelection() {
    if (!isVisualMode()) return false;

    const messageEl = getMessage();
    if (!messageEl) return false;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (messageEl.contains(range.commonAncestorContainer) && !range.collapsed) {
        return true;
      }
    }

    return Boolean(savedRange && !savedRange.collapsed);
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

    const markdown = serialize(messageEl).trim();
    if (!markdown) {
      messageEl.dataset.empty = "1";
      messageEl.querySelector("p.empty")?.remove();
      return;
    }

    messageEl.removeAttribute("data-empty");
    messageEl.querySelector("p.empty")?.remove();
  }

  function applyEditableState(messageEl) {
    if (!messageEl) return;

    messageEl.contentEditable = editable ? "true" : "false";
    messageEl.classList.toggle("tg-editable", editable);
    messageEl.dataset.placeholder = editable ? EMPTY_TEXT : "";

    if (editable && !serialize(messageEl).trim()) {
      messageEl.dataset.empty = "1";
    } else {
      messageEl.removeAttribute("data-empty");
    }

    if (!editable) {
      messageEl.removeAttribute("contenteditable");
    }
  }

  function bindMessage(messageEl) {
    if (!messageEl || messageEl.dataset.leftEditorBound === "1") {
      applyEditableState(messageEl);
      return;
    }

    messageEl.dataset.leftEditorBound = "1";

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
      saveSelection();
      if (dirty) {
        syncToTextarea({ force: true, silent: true });
        window.editorHistory?.onTyping?.();
      }
      window.editorHistory?.flushTyping?.();
      dirty = false;
      updateEmptyState(messageEl);
      window.dispatchEvent(new CustomEvent("left-editor:blur"));
    });

    messageEl.addEventListener("keyup", saveSelection);
    messageEl.addEventListener("mouseup", saveSelection);

    messageEl.addEventListener("input", () => {
      if (!editable) return;
      dirty = true;
      updateEmptyState(messageEl);
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncToTextarea({ force: true, silent: true });
        window.editorHistory?.onTyping?.();
        window.refreshPreview?.(true);
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

  function setVisualHtml(html) {
    const root = getRoot();
    if (!root) return;

    const temp = document.createElement("div");
    temp.innerHTML = html || "";
    const message = temp.querySelector(".tg-message");
    const onlyEmpty =
      message &&
      message.querySelector("p.empty") &&
      !serialize(message).trim();

    root.innerHTML = onlyEmpty ? '<div class="tg-message tg-rich"></div>' : html;
    let bound = root.querySelector(".tg-message");
    if (!bound) {
      root.innerHTML = '<div class="tg-message tg-rich"></div>';
      bound = root.querySelector(".tg-message");
    }
    bindMessage(bound);
    updateEmptyState(bound);
  }

  async function refreshFromMarkdown() {
    const textarea = getTextarea();
    if (!textarea) return;

    const token = ++refreshToken;
    const content = textarea.value;

    if (!content.trim()) {
      setVisualHtml('<div class="tg-message tg-rich"></div>');
      dirty = false;
      return;
    }

    try {
      const data = await window.authClient.fetch(
        "/api/posts/preview",
        {
          method: "POST",
          body: JSON.stringify({ content }),
        },
        { redirectOn401: true }
      );
      if (token !== refreshToken) return;
      if (!data?.html) {
        setVisualHtml('<div class="tg-message tg-rich"><p class="empty">Ошибка превью</p></div>');
        return;
      }
      setVisualHtml(data.html);
      dirty = false;
    } catch {
      if (token !== refreshToken) return;
      setVisualHtml('<div class="tg-message tg-rich"><p class="empty">Ошибка превью</p></div>');
    }
  }

  function applyCommand(command) {
    if (!restoreSelection()) return false;
    window.editorHistory?.beforeChange?.();
    document.execCommand(command, false, null);
    saveSelection();
    dirty = true;
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.(true);
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
      saveSelection();
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      window.refreshPreview?.(true);
      return true;
    }

    const el = document.createElement(tagName);
    if (className) el.className = className;

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

    saveSelection();
    dirty = true;
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.(true);
    return true;
  }

  function applyBlockFormat(action) {
    if (!isVisualMode() || !editable || !hasSelection()) return false;

    const messageEl = getMessage();
    if (!messageEl || !restoreSelection()) return false;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    const vf = window.visualFormat;
    if (!vf) return false;

    window.editorHistory?.beforeChange?.();

    let applied = false;
    switch (action) {
      case "h1":
        applied = vf.toggleBlockTag(range, messageEl, "h1");
        break;
      case "h2":
        applied = vf.toggleBlockTag(range, messageEl, "h2");
        break;
      case "h3":
        applied = vf.toggleBlockTag(range, messageEl, "h3");
        break;
      case "quote":
        applied = vf.toggleQuote(range, messageEl);
        break;
      case "center":
        applied = vf.toggleCenter(range, messageEl);
        break;
      case "ulist":
        document.execCommand("insertUnorderedList", false, null);
        applied = true;
        break;
      case "olist":
        document.execCommand("insertOrderedList", false, null);
        applied = true;
        break;
      default:
        return false;
    }

    if (!applied) return false;

    saveSelection();
    dirty = true;
    updateEmptyState(messageEl);
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.(true);
    return true;
  }

  function mapSelectionToTextarea() {
    if (!isVisualMode() || !hasSelection()) return false;

    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl || !textarea) return false;
    if (!restoreSelection()) return false;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    const selWrap = document.createElement("div");
    selWrap.className = "tg-message tg-rich";
    selWrap.appendChild(range.cloneContents());
    const selMd = serialize(selWrap);

    syncToTextarea({ force: true, silent: true });
    const value = textarea.value;

    if (selMd) {
      const idx = value.indexOf(selMd);
      if (idx !== -1) {
        textarea.focus();
        textarea.setSelectionRange(idx, idx + selMd.length);
        return true;
      }
    }

    const plain = range.toString();
    if (!plain) return false;

    const idx = value.indexOf(plain);
    if (idx === -1) return false;

    textarea.focus();
    textarea.setSelectionRange(idx, idx + plain.length);
    return true;
  }

  function clearFormatting() {
    if (!isVisualMode() || !editable) return false;

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
    savedRange = range.cloneRange();

    dirty = true;
    updateEmptyState(messageEl);
    syncToTextarea({ silent: true });
    window.editorHistory?.afterChange?.();
    window.refreshPreview?.(true);
    return true;
  }

  function applyFormat(action) {
    if (!isVisualMode() || !hasSelection()) return false;

    if (PREVIEW_COMMANDS[action]) {
      return applyCommand(PREVIEW_COMMANDS[action]);
    }

    const wraps = {
      marker: () => wrapSelection("mark", "tg-mark"),
      spoiler: () => wrapSelection("span", "tg-spoiler"),
      code: () => wrapSelection("code"),
      sub: () => wrapSelection("sub"),
    };

    return wraps[action] ? wraps[action]() : false;
  }

  function insertText(text) {
    if (!isVisualMode() || !editable || !text) return false;

    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl) return false;
    if (textarea && document.activeElement === textarea) return false;

    window.editorHistory?.beforeChange?.();

    if (savedRange) {
      messageEl.focus();
      dismissPlaceholder(messageEl);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
        document.execCommand("insertText", false, text);
        if (sel.rangeCount) {
          savedRange = sel.getRangeAt(0).cloneRange();
        }
      }
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      window.refreshPreview?.(true);
      return true;
    }

    if (focused || messageEl === document.activeElement) {
      messageEl.focus();
      dismissPlaceholder(messageEl);
      document.execCommand("insertText", false, text);
      saveSelection();
      dirty = true;
      syncToTextarea({ silent: true });
      window.editorHistory?.afterChange?.();
      window.refreshPreview?.(true);
      return true;
    }

    return false;
  }

  function applyModeUI() {
    const visualEl = document.getElementById("editor-visual");
    const textarea = getTextarea();
    const isVisual = mode === "visual";

    visualEl?.classList.toggle("hidden", !isVisual);
    textarea?.classList.toggle("hidden", isVisual);

    document.querySelectorAll(".editor-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }

  async function setMode(nextMode, { force = false } = {}) {
    const normalized = nextMode === "visual" ? "visual" : "markdown";
    if (!force && normalized === mode) return;

    if (mode === "visual" && normalized === "markdown") {
      if (dirty) {
        syncToTextarea({ force: true });
      }
    }

    mode = normalized;
    localStorage.setItem(MODE_KEY, mode);
    applyModeUI();

    if (mode === "visual") {
      await refreshFromMarkdown();
    } else {
      savedRange = null;
      focused = false;
      dirty = false;
      window.refreshPreview?.(true);
    }
  }

  function getMode() {
    return mode;
  }

  function setEditable(enabled) {
    editable = Boolean(enabled);
    applyEditableState(getMessage());
    if (!enabled) {
      savedRange = null;
      focused = false;
    }
  }

  function saveSelectionPublic() {
    saveSelection();
  }

  function init() {
    document.querySelectorAll(".editor-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMode(btn.dataset.mode);
      });
    });

    const textarea = getTextarea();
    textarea?.addEventListener("focus", () => {
      if (isVisualMode()) {
        savedRange = null;
      }
    });

    applyModeUI();
    if (mode === "visual") {
      refreshFromMarkdown();
    }

    window.leftEditor = {
      isVisualMode,
      isEditing,
      isDirty,
      getMode,
      setMode,
      setEditable,
      syncToTextarea,
      refreshFromMarkdown,
      getMarkdown,
      hasSelection,
      saveSelection: saveSelectionPublic,
      applyFormat,
      applyBlockFormat,
      mapSelectionToTextarea,
      clearFormatting,
      insertText,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
