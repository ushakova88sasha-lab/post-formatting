/**
 * История изменений: отмена / возврат (до 5 шагов).
 *
 * undoStack хранит предыдущие состояния текста.
 * committed — текущее зафиксированное состояние.
 */
(function () {
  const TEXTAREA_ID = "post-content";
  const MAX_HISTORY = 5;
  const TYPING_DEBOUNCE_MS = 400;

  let undoStack = [];
  let redoStack = [];
  let committed = "";
  let applying = false;
  let enabled = true;
  let typingActive = false;
  let typingTimer = null;

  function getTextarea() {
    return document.getElementById(TEXTAREA_ID);
  }

  function readContent() {
    const textarea = getTextarea();
    if (!textarea) return "";

    if (window.leftEditor?.isVisualMode?.()) {
      const markdown = window.leftEditor.getMarkdown?.() ?? "";
      textarea.value = markdown;
      return markdown;
    }

    if (window.previewEditor?.isEditing?.()) {
      const markdown = window.previewEditor.getMarkdown?.() ?? "";
      textarea.value = markdown;
      return markdown;
    }

    return textarea.value;
  }

  async function writeContent(value) {
    const textarea = getTextarea();
    if (!textarea) return;

    applying = true;
    textarea.value = value;

    if (window.leftEditor?.isVisualMode?.()) {
      await window.leftEditor.refreshFromMarkdown?.();
    }

    await window.refreshPreview?.(true);

    applying = false;
    committed = value;
    typingActive = false;
    clearTimeout(typingTimer);
    typingTimer = null;
  }

  function pushUndo(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
  }

  function flushTyping() {
    clearTimeout(typingTimer);
    typingTimer = null;
    if (!typingActive) return;
    committed = readContent();
    typingActive = false;
  }

  /** Быстрый набор — один шаг истории на «порцию» текста. */
  function onTyping() {
    if (applying || !enabled) return;

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    if (!typingActive) {
      pushUndo(committed);
      redoStack = [];
      typingActive = true;
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      committed = readContent();
      typingActive = false;
      typingTimer = null;
      updateButtons();
    }, TYPING_DEBOUNCE_MS);

    updateButtons();
  }

  /** Перед форматированием, вставкой кнопкой и т.п. */
  function beforeChange() {
    if (applying || !enabled) return false;

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return false;

    flushTyping();
    pushUndo(readContent());
    redoStack = [];
    updateButtons();
    return true;
  }

  function afterChange() {
    if (applying || !enabled) return;
    committed = readContent();
    updateButtons();
  }

  function flushTypingState() {
    flushTyping();
    updateButtons();
  }

  function onTextareaInput() {
    if (window.leftEditor?.isVisualMode?.()) return;
    if (window.previewEditor?.isEditing?.()) return;
    onTyping();
  }

  async function undo() {
    if (!enabled || !undoStack.length) return false;

    flushTyping();

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return false;

    const current = readContent();
    redoStack.push(current);
    if (redoStack.length > MAX_HISTORY) {
      redoStack.shift();
    }

    const previous = undoStack.pop();
    await writeContent(previous);
    updateButtons();
    return true;
  }

  async function redo() {
    if (!enabled || !redoStack.length) return false;

    flushTyping();

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return false;

    pushUndo(readContent());

    const next = redoStack.pop();
    await writeContent(next);
    updateButtons();
    return true;
  }

  function reset(content) {
    applying = true;
    flushTyping();
    undoStack = [];
    redoStack = [];
    committed = content ?? readContent();
    applying = false;
    updateButtons();
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) {
      flushTyping();
    }
    updateButtons();
  }

  function updateButtons() {
    const textarea = getTextarea();
    const readOnly = !textarea || textarea.readOnly || !enabled;

    document.querySelectorAll('[data-action="undo"]').forEach((btn) => {
      btn.disabled = readOnly || undoStack.length === 0;
    });
    document.querySelectorAll('[data-action="redo"]').forEach((btn) => {
      btn.disabled = readOnly || redoStack.length === 0;
    });
  }

  function isEditorFocused() {
    const textarea = getTextarea();
    const active = document.activeElement;
    if (active === textarea) return true;

    const visualMessage = document
      .getElementById("editor-visual-content")
      ?.querySelector(".tg-message");
    if (visualMessage && (active === visualMessage || visualMessage.contains(active))) {
      return true;
    }

    const previewMessage = document
      .getElementById("preview-content")
      ?.querySelector(".tg-message");
    if (previewMessage && (active === previewMessage || previewMessage.contains(active))) {
      return true;
    }

    return false;
  }

  function onKeydown(e) {
    if (!isEditorFocused() || !enabled) return;

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      void undo();
      return;
    }

    if (e.key === "y" || (e.key === "z" && e.shiftKey) || (e.key === "Z" && e.shiftKey)) {
      e.preventDefault();
      void redo();
    }
  }

  function init() {
    const textarea = getTextarea();
    textarea?.addEventListener("input", onTextareaInput);
    document.addEventListener("keydown", onKeydown);

    window.editorHistory = {
      undo,
      redo,
      reset,
      setEnabled,
      updateButtons,
      onTyping,
      beforeChange,
      afterChange,
      flushTyping: flushTypingState,
    };

    reset("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
