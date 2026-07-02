/**
 * История изменений текста поста: отмена / возврат (до 5 шагов).
 */
(function () {
  const TEXTAREA_ID = "post-content";
  const MAX_HISTORY = 5;
  const DEBOUNCE_MS = 400;

  let undoStack = [];
  let redoStack = [];
  let baseline = "";
  let applying = false;
  let editSessionActive = false;
  let debounceTimer = null;
  let enabled = true;

  function getTextarea() {
    return document.getElementById(TEXTAREA_ID);
  }

  function syncVisualFromTextarea() {
    if (window.leftEditor?.isVisualMode?.()) {
      window.leftEditor.refreshFromMarkdown?.();
    }
    window.refreshPreview?.(true);
  }

  function readContent() {
    const textarea = getTextarea();
    if (!textarea) return "";

    if (window.leftEditor?.isVisualMode?.()) {
      window.leftEditor.syncToTextarea?.({ force: true });
    } else if (window.previewEditor?.isEditing?.()) {
      window.previewEditor.syncToTextarea?.();
    }

    return textarea.value;
  }

  function writeContent(value) {
    const textarea = getTextarea();
    if (!textarea) return;

    applying = true;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    syncVisualFromTextarea();
    applying = false;
    baseline = value;
    editSessionActive = false;
  }

  function pushUndo(snapshot) {
    if (snapshot === undefined) return;
    undoStack.push(snapshot);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
  }

  function flushPendingSession() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (!editSessionActive) return;
    baseline = readContent();
    editSessionActive = false;
  }

  function onContentInput() {
    if (applying || !enabled) return;

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    if (!editSessionActive) {
      editSessionActive = true;
      pushUndo(baseline);
      redoStack = [];
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      baseline = readContent();
      editSessionActive = false;
      debounceTimer = null;
      updateButtons();
    }, DEBOUNCE_MS);

    updateButtons();
  }

  function undo() {
    if (!enabled || !undoStack.length) return false;

    flushPendingSession();

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return false;

    const current = readContent();
    redoStack.push(current);
    if (redoStack.length > MAX_HISTORY) {
      redoStack.shift();
    }

    const previous = undoStack.pop();
    writeContent(previous);
    updateButtons();
    return true;
  }

  function redo() {
    if (!enabled || !redoStack.length) return false;

    flushPendingSession();

    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return false;

    const current = readContent();
    pushUndo(current);

    const next = redoStack.pop();
    writeContent(next);
    updateButtons();
    return true;
  }

  function reset(content) {
    flushPendingSession();
    undoStack = [];
    redoStack = [];
    baseline = content ?? readContent();
    editSessionActive = false;
    updateButtons();
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!enabled) {
      flushPendingSession();
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
      undo();
      return;
    }

    if (e.key === "y" || (e.key === "z" && e.shiftKey) || (e.key === "Z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  function init() {
    const textarea = getTextarea();
    textarea?.addEventListener("input", onContentInput);
    document.addEventListener("keydown", onKeydown);

    window.editorHistory = {
      undo,
      redo,
      reset,
      setEnabled,
      updateButtons,
    };

    reset("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
