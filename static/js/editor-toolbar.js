/**
 * Панель форматирования: текст, блоки, изображения.
 */
(function () {
  const CENTER_BLOCK_RE =
    /^(?:<aside>|<pullquote>|<p style="text-align:\s*center">)([\s\S]*)(?:<\/aside>|<\/pullquote>|<\/p>)$/i;

  let savedTextareaSelection = null;

  const PREVIEW_COMMANDS = {
    bold: "bold",
    italic: "italic",
    strike: "strikeThrough",
    underline: "underline",
  };

  function notifyContentChange(textarea) {
    if (!window.leftEditor?.isVisualMode?.()) {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      window.leftEditor.syncToTextarea?.({ force: true, silent: true });
      window.leftEditor.refreshFromMarkdown?.();
    }
    window.refreshPreview?.();
  }

  function replaceExactSelection(textarea, start, end, text, selectStart, selectEnd) {
    window.editorHistory?.beforeChange?.();
    const value = textarea.value;
    textarea.value = value.substring(0, start) + text + value.substring(end);
    const selStart = selectStart ?? start;
    const selEnd = selectEnd ?? selStart;
    setSelectionRange(textarea, selStart, selEnd);
    notifyContentChange(textarea);
    window.editorHistory?.afterChange?.();
  }

  function saveTextareaSelection() {
    const textarea = document.getElementById("post-content");
    if (!textarea || textarea.readOnly) return;
    savedTextareaSelection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function getTextarea() {
    const el = document.getElementById("post-content");
    if (!el || el.readOnly) return el;

    if (window.leftEditor?.isVisualMode?.()) {
      window.leftEditor.syncToTextarea?.();
    } else if (window.previewEditor?.isEditing?.()) {
      window.previewEditor.syncToTextarea();
    }
    return el;
  }

  function getSelectionRange(textarea) {
    if (!textarea) return { start: 0, end: 0 };

    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;

    if (
      savedTextareaSelection &&
      (document.activeElement !== textarea || start === end) &&
      savedTextareaSelection.start !== savedTextareaSelection.end
    ) {
      start = savedTextareaSelection.start;
      end = savedTextareaSelection.end;
    }

    return { start, end };
  }

  function setSelectionRange(textarea, start, end) {
    textarea.focus();
    textarea.setSelectionRange(start, end);
    savedTextareaSelection = { start, end };
  }

  function tryClearVisualFormat() {
    if (window.leftEditor?.clearFormatting?.()) {
      return true;
    }
    if (window.previewEditor?.clearFormatting?.()) {
      return true;
    }
    return false;
  }

  function stripMarkdownFormatting(text) {
    let result = text;
    result = result.replace(/^#{1,3}\s+/gm, "");
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
    result = result.replace(/__([^_]+)__/g, "$1");
    result = result.replace(/_([^_\n]+)_/g, "$1");
    result = result.replace(/\*([^*\n]+)\*/g, "$1");
    result = result.replace(/~~([^~]+)~~/g, "$1");
    result = result.replace(/==([^=]+)==/g, "$1");
    result = result.replace(/\|\|([^|]+)\|\|/g, "$1");
    result = result.replace(/`([^`]+)`/g, "$1");
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1");
    result = result.replace(/<\/?(?:u|sub|sup|mark|b|strong|i|em|s|del|ins|aside|pullquote)[^>]*>/gi, "");
    result = result.replace(/^>\s?/gm, "");
    result = result.replace(/^[-*+]\s+\[[ xX]\]\s+/gm, "");
    result = result.replace(/^[-*+]\s+/gm, "");
    result = result.replace(/^\d+\.\s+/gm, "");
    result = result.replace(/<details><summary>[\s\S]*?<\/summary>\s*([\s\S]*?)<\/details>/gi, "$1");
    result = result.replace(/<p style="text-align:\s*center">([\s\S]*?)<\/p>/gi, "$1");
    return result;
  }

  function getExactSelection(textarea) {
    if (!textarea || textarea.readOnly) return null;
    const { start, end } = getSelectionRange(textarea);
    if (start === end) return null;
    const value = textarea.value;
    return {
      textarea,
      value,
      start,
      end,
      selected: value.substring(start, end),
    };
  }

  function ensureMarkdownSelection() {
    if (window.leftEditor?.isVisualMode?.()) {
      if (!window.leftEditor.hasSelection?.()) return null;
      if (!window.leftEditor.mapSelectionToTextarea?.()) return null;
    }
    return getExactSelection(getTextarea());
  }

  function applySelectedTransform(transform) {
    const sel = ensureMarkdownSelection();
    if (!sel) return false;
    const newText = transform(sel.selected);
    if (newText === null || newText === undefined) return false;
    replaceExactSelection(sel.textarea, sel.start, sel.end, newText, sel.start, sel.start + newText.length);
    return true;
  }

  function toggleMarkdownWrap(before, after, unwrapFn) {
    const sel = ensureMarkdownSelection();
    if (!sel) return false;

    const { textarea, value, start, end, selected } = sel;

    if (
      selected.length >= before.length + after.length &&
      selected.startsWith(before) &&
      selected.endsWith(after)
    ) {
      const inner = selected.slice(before.length, selected.length - after.length);
      replaceExactSelection(textarea, start, end, inner, start, start + inner.length);
      return true;
    }

    if (
      start >= before.length &&
      value.substring(start - before.length, start) === before &&
      value.substring(end, end + after.length) === after
    ) {
      const newStart = start - before.length;
      replaceExactSelection(
        textarea,
        newStart,
        end + after.length,
        selected,
        newStart,
        newStart + selected.length
      );
      return true;
    }

    if (unwrapFn) {
      const inner = unwrapFn(selected);
      if (inner !== null) {
        replaceExactSelection(textarea, start, end, inner, start, start + inner.length);
        return true;
      }
    }

    const wrapped = before + selected + after;
    replaceExactSelection(
      textarea,
      start,
      end,
      wrapped,
      start + before.length,
      start + before.length + selected.length
    );
    return true;
  }

  function clearMarkdownFormatting() {
    return applySelectedTransform((selected) => stripMarkdownFormatting(selected));
  }

  function tryVisualBlockFormat(action) {
    if (!window.leftEditor?.isVisualMode?.()) return false;
    return Boolean(window.leftEditor?.applyBlockFormat?.(action));
  }

  function tryPreviewFormat(action) {
    if (window.leftEditor?.applyFormat?.(action)) {
      return true;
    }

    const previewEditor = window.previewEditor;
    if (!previewEditor?.hasSelection?.()) return false;

    if (PREVIEW_COMMANDS[action]) {
      previewEditor.applyCommand(PREVIEW_COMMANDS[action]);
      return true;
    }

    const previewWraps = {
      marker: () => previewEditor.wrapSelection("mark", "tg-mark"),
      spoiler: () => previewEditor.wrapSelection("span", "tg-spoiler"),
      code: () => previewEditor.wrapSelection("code"),
      sub: () => previewEditor.wrapSelection("sub"),
    };

    if (previewWraps[action]) {
      return previewWraps[action]();
    }

    return false;
  }

  function stripListMarker(line) {
    return line
      .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, "$1")
      .replace(/^(\s*)[-*+]\s+/, "$1")
      .replace(/^(\s*)\d+\.\s+/, "$1");
  }

  function applyBulletList() {
    applySelectedTransform((selected) => {
      const lines = selected.split("\n");
      const allBullets = lines.every(
        (line) => /^[-*+]\s+/.test(line) && !/^[-*+]\s+\[[ xX]\]/.test(line)
      );
      return lines
        .map((line) =>
          allBullets ? stripListMarker(line) : `- ${stripListMarker(line)}`
        )
        .join("\n");
    });
  }

  function applyOrderedList() {
    applySelectedTransform((selected) => {
      const lines = selected.split("\n");
      const allOrdered = lines.every((line) => /^\d+\.\s+/.test(line));
      if (allOrdered) {
        return lines.map((line) => stripListMarker(line)).join("\n");
      }
      return lines
        .map((line, idx) => `${idx + 1}. ${stripListMarker(line)}`)
        .join("\n");
    });
  }

  function applyChecklist(checked) {
    const prefix = checked ? "- [x] " : "- [ ] ";
    applySelectedTransform((selected) => {
      const lines = selected.split("\n");
      const allMatch = lines.every((line) => line.startsWith(prefix));
      return lines
        .map((line) => (allMatch ? stripListMarker(line) : prefix + stripListMarker(line)))
        .join("\n");
    });
  }

  async function insertTable() {
    const values = await window.appModal.form({
      title: "Вставить таблицу",
      fields: [
        { label: "Количество столбцов", value: "2", inputMode: "numeric" },
        { label: "Количество строк (без шапки)", value: "2", inputMode: "numeric" },
      ],
      confirmText: "Вставить",
    });
    if (!values) return;

    let cols = parseInt(values[0], 10) || 2;
    let rows = parseInt(values[1], 10) || 2;
    cols = Math.min(Math.max(cols, 1), 5);
    rows = Math.min(Math.max(rows, 1), 10);

    const headers = Array.from({ length: cols }, (_, i) => `Заголовок ${i + 1}`);
    const sep = headers.map((_, i) => (i === cols - 1 ? ":---:" : ":---"));
    let table = `| ${headers.join(" | ")} |\n| ${sep.join(" | ")} |\n`;
    for (let r = 0; r < rows; r += 1) {
      const cells = Array.from({ length: cols }, (_, i) => `Ячейка ${r + 1}.${i + 1}`);
      table += `| ${cells.join(" | ")} |\n`;
    }
    insertBlockAtCursor(table.trimEnd());
  }

  function applyHeader(level) {
    applySelectedTransform((selected) => {
      const lines = selected.split("\n");
      const prefix = "#".repeat(level) + " ";
      return lines
        .map((line) => {
          const match = line.match(/^(#{1,3})\s+(.*)$/);
          if (match && match[1].length === level) {
            return match[2];
          }
          const content = match ? match[2] : line;
          return prefix + content;
        })
        .join("\n");
    });
  }

  function insertBlockAtCursor(block) {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    window.editorHistory?.beforeChange?.();

    const { start, end } = getSelectionRange(textarea);
    let before = textarea.value.substring(0, start);
    let after = textarea.value.substring(end);

    if (before.length > 0 && !before.endsWith("\n")) {
      before += "\n";
    }
    if (before.length > 0 && !before.endsWith("\n\n")) {
      before += "\n";
    }
    if (after.length > 0 && !after.startsWith("\n")) {
      after = "\n" + after;
    }

    const insertion = block + "\n";
    textarea.value = before + insertion + after;
    const pos = before.length + insertion.length;
    setSelectionRange(textarea, pos, pos);
    notifyContentChange(textarea);
    window.editorHistory?.afterChange?.();
  }

  function buildMediaMarkdown(url, caption) {
    if (caption && caption.trim()) {
      const safe = caption.trim().replace(/"/g, '\\"');
      return `![](${url} "${safe}")`;
    }
    return `![](${url})`;
  }

  function insertQuote() {
    applySelectedTransform((selected) => {
      const lines = selected.split("\n");
      const allQuoted = lines.every((line) => /^> ?/.test(line));
      return lines
        .map((line) => (allQuoted ? line.replace(/^> ?/, "") : `> ${line}`))
        .join("\n");
    });
  }

  function applyCenter() {
    applySelectedTransform((selected) => {
      const match = selected.match(CENTER_BLOCK_RE);
      return match ? match[1] : `<aside>${selected}</aside>`;
    });
  }

  async function insertDetails() {
    const sel = ensureMarkdownSelection();
    if (!sel) return;

    const summary = await window.appModal.prompt({
      title: "Скрывающийся блок",
      label: "Заголовок блока",
      value: "Подробнее",
      confirmText: "Вставить",
    });
    if (summary === null) return;

    const block = `<details><summary>${summary.trim()}</summary>\n${sel.selected}\n</details>`;
    replaceExactSelection(sel.textarea, sel.start, sel.end, block, sel.start, sel.start + block.length);
  }

  async function insertLink() {
    const sel = ensureMarkdownSelection();
    if (!sel) return;

    const linkMatch = sel.selected.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      replaceExactSelection(
        sel.textarea,
        sel.start,
        sel.end,
        linkMatch[1],
        sel.start,
        sel.start + linkMatch[1].length
      );
      return;
    }

    const url = await window.appModal.prompt({
      title: "Ссылка",
      label: "URL",
      value: "https://t.me/dnative",
      confirmText: "Вставить",
    });
    if (!url) return;

    const link = `[${sel.selected}](${url.trim()})`;
    replaceExactSelection(
      sel.textarea,
      sel.start,
      sel.end,
      link,
      sel.start + 1,
      sel.start + 1 + sel.selected.length
    );
  }

  function wrapMath() {
    toggleMarkdownWrap("$", "$");
  }

  function showMediaCaptionDialog({ url, kind, filename }) {
    return new Promise((resolve) => {
      const modal = document.getElementById("media-insert-modal");
      const preview = document.getElementById("media-insert-preview");
      const captionInput = document.getElementById("media-insert-caption");
      const confirmBtn = document.getElementById("media-insert-confirm");
      const cancelBtn = document.getElementById("media-insert-cancel");
      const title = document.getElementById("media-insert-title");

      if (!modal || !preview || !captionInput) {
        resolve("");
        return;
      }

      const titles = { image: "Изображение", video: "Видео", audio: "Аудио" };
      title.textContent = titles[kind] || "Медиа";
      captionInput.placeholder =
        kind === "image" ? "Текст под картинкой" : kind === "video" ? "Текст под видео" : "Текст под аудио";

      preview.innerHTML = "";
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.className = "media-insert-thumb";
        preview.appendChild(img);
      } else if (kind === "video") {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.className = "media-insert-thumb";
        preview.appendChild(video);
      } else {
        const wrap = document.createElement("div");
        wrap.className = "media-insert-audio";
        const icon = document.createElement("span");
        icon.textContent = "🎵";
        const name = document.createElement("span");
        name.textContent = filename || "Аудиофайл";
        wrap.append(icon, name);
        preview.appendChild(wrap);
      }

      captionInput.value = "";
      modal.classList.remove("hidden");

      function cleanup() {
        modal.classList.remove("visible");
        modal.classList.add("hidden");
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onOverlay);
        document.removeEventListener("keydown", onKey);
      }

      function onConfirm() {
        const caption = captionInput.value;
        cleanup();
        resolve(caption);
      }

      function onCancel() {
        cleanup();
        resolve(null);
      }

      function onOverlay(e) {
        if (e.target === modal) onCancel();
      }

      function onKey(e) {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && document.activeElement === captionInput) {
          e.preventDefault();
          onConfirm();
        }
      }

      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onOverlay);
      document.addEventListener("keydown", onKey);

      requestAnimationFrame(() => {
        modal.classList.add("visible");
        captionInput.focus();
      });
    });
  }

  async function uploadAndInsertMedia(file, endpoint, btnId, kind) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const origText = btn.textContent;
    btn.classList.add("fmt-btn-loading");
    btn.textContent = "…";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      if (res.status === 401) {
        window.authClient.redirectToLogin();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Ошибка загрузки");
      }

      const caption = await showMediaCaptionDialog({
        url: data.url,
        kind,
        filename: file.name,
      });
      if (caption === null) return;

      insertBlockAtCursor(buildMediaMarkdown(data.url, caption));
    } catch (err) {
      await window.appModal.alert({
        title: "Ошибка загрузки",
        message: err.message || "Не удалось загрузить файл",
      });
    } finally {
      btn.classList.remove("fmt-btn-loading");
      btn.textContent = origText;
    }
  }

  function uploadAndInsertImage(file) {
    return uploadAndInsertMedia(file, "/api/uploads/image", "image-upload-btn", "image");
  }

  function uploadAndInsertVideo(file) {
    return uploadAndInsertMedia(file, "/api/uploads/video", "video-upload-btn", "video");
  }

  function uploadAndInsertAudio(file) {
    return uploadAndInsertMedia(file, "/api/uploads/audio", "audio-upload-btn", "audio");
  }

  function setToolbarEnabled(enabled) {
    document.querySelectorAll(".fmt-btn").forEach((btn) => {
      if (btn.dataset.action === "undo" || btn.dataset.action === "redo") return;
      btn.disabled = !enabled;
    });
    window.editorHistory?.setEnabled(enabled);
    ["image-file-input", "video-file-input", "audio-file-input"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    });
    if (!enabled) {
      window.emojiPicker?.close();
    }
  }

  function handleToolbarClick(e) {
    const btn = e.target.closest(".fmt-btn");
    if (!btn || btn.disabled) return;

    const action = btn.dataset.action;
    if (action === "image") {
      e.preventDefault();
      document.getElementById("image-file-input")?.click();
      return;
    }
    if (action === "video") {
      e.preventDefault();
      document.getElementById("video-file-input")?.click();
      return;
    }
    if (action === "audio") {
      e.preventDefault();
      document.getElementById("audio-file-input")?.click();
      return;
    }

    e.preventDefault();
    if (action === "undo") {
      window.editorHistory?.undo();
      return;
    }
    if (action === "redo") {
      window.editorHistory?.redo();
      return;
    }
    if (action === "clear-format") {
      if (!tryClearVisualFormat()) {
        clearMarkdownFormatting();
      }
      return;
    }
    if (tryPreviewFormat(action)) {
      return;
    }
    if (tryVisualBlockFormat(action)) {
      return;
    }
    switch (action) {
      case "h1":
        applyHeader(1);
        break;
      case "h2":
        applyHeader(2);
        break;
      case "h3":
        applyHeader(3);
        break;
      case "bold":
        toggleMarkdownWrap("**", "**");
        break;
      case "italic":
        toggleMarkdownWrap("_", "_");
        break;
      case "strike":
        toggleMarkdownWrap("~~", "~~");
        break;
      case "underline":
        toggleMarkdownWrap("<u>", "</u>");
        break;
      case "marker":
        toggleMarkdownWrap("==", "==");
        break;
      case "spoiler":
        toggleMarkdownWrap("||", "||");
        break;
      case "code":
        toggleMarkdownWrap("`", "`");
        break;
      case "sub":
        toggleMarkdownWrap("<sub>", "</sub>");
        break;
      case "math":
        wrapMath();
        break;
      case "link":
        insertLink();
        break;
      case "ulist":
        applyBulletList();
        break;
      case "olist":
        applyOrderedList();
        break;
      case "check-open":
        applyChecklist(false);
        break;
      case "check-done":
        applyChecklist(true);
        break;
      case "table":
        insertTable();
        break;
      case "quote":
        insertQuote();
        break;
      case "center":
        applyCenter();
        break;
      case "details":
        insertDetails();
        break;
    }
  }

  function initToolbar() {
    const textarea = document.getElementById("post-content");
    textarea?.addEventListener("mouseup", saveTextareaSelection);
    textarea?.addEventListener("keyup", saveTextareaSelection);
    textarea?.addEventListener("select", saveTextareaSelection);
    textarea?.addEventListener("focus", saveTextareaSelection);

    document.querySelectorAll(".editor-toolbar").forEach((toolbar) => {
      toolbar.addEventListener("mousedown", (e) => {
        if (e.target.closest(".fmt-btn")) {
          e.preventDefault();
          window.leftEditor?.saveSelection?.();
          window.previewEditor?.savePreviewSelection?.();
        }
      });
      toolbar.addEventListener("click", handleToolbarClick);
    });

    document.getElementById("image-file-input")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) uploadAndInsertImage(file);
    });
    document.getElementById("video-file-input")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) uploadAndInsertVideo(file);
    });
    document.getElementById("audio-file-input")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) uploadAndInsertAudio(file);
    });

    window.editorToolbar = { setToolbarEnabled };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToolbar);
  } else {
    initToolbar();
  }
})();
