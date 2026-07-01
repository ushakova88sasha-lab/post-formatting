/**
 * Панель форматирования: текст, блоки, изображения.
 */
(function () {
  const HEADER_RE = /^(#{1,3})\s+(.*)$/;

  function getTextarea() {
    return document.getElementById("post-content");
  }

  function getLinesRange(textarea) {
    const value = textarea.value;
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;

    if (start === end) {
      start = value.lastIndexOf("\n", start - 1) + 1;
      end = value.indexOf("\n", end);
      if (end === -1) end = value.length;
    } else {
      start = value.lastIndexOf("\n", start - 1) + 1;
      const endLine = value.indexOf("\n", end);
      end = endLine === -1 ? value.length : endLine;
    }

    return { value, start, end };
  }

  function stripListMarker(line) {
    return line
      .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, "$1")
      .replace(/^(\s*)[-*+]\s+/, "$1")
      .replace(/^(\s*)\d+\.\s+/, "$1");
  }

  function applyLinesTransform(transform) {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const { value, start, end } = getLinesRange(textarea);
    const block = value.substring(start, end);
    const lines = block.split("\n");
    const newLines = lines.map((line, idx) => transform(line, idx));
    const newBlock = newLines.join("\n");

    textarea.value = value.substring(0, start) + newBlock + value.substring(end);
    textarea.setSelectionRange(start, start + newBlock.length);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyBulletList() {
    applyLinesTransform((line) => `- ${stripListMarker(line)}`);
  }

  function applyOrderedList() {
    let n = 0;
    applyLinesTransform((line) => {
      n += 1;
      return `${n}. ${stripListMarker(line)}`;
    });
  }

  function applyChecklist(checked) {
    const prefix = checked ? "- [x] " : "- [ ] ";
    applyLinesTransform((line) => prefix + stripListMarker(line));
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

  function stripHeader(line) {
    const match = line.match(HEADER_RE);
    return match ? match[2] : line;
  }

  function getHeaderLevel(line) {
    const match = line.match(HEADER_RE);
    return match ? match[1].length : 0;
  }

  function applyHeader(level) {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const { value, start, end } = getLinesRange(textarea);
    const block = value.substring(start, end);
    const lines = block.split("\n");

    const newLines = lines.map((line) => {
      const content = stripHeader(line);
      const current = getHeaderLevel(line);
      if (current === level) {
        return content;
      }
      return "#".repeat(level) + " " + content;
    });

    const newBlock = newLines.join("\n");
    textarea.value = value.substring(0, start) + newBlock + value.substring(end);
    textarea.setSelectionRange(start, start + newBlock.length);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wrapSelection(before, after) {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.substring(start, end);
    const inner = selected || "текст";

    const newValue = value.substring(0, start) + before + inner + after + value.substring(end);
    textarea.value = newValue;

    const cursorStart = start + before.length;
    const cursorEnd = cursorStart + inner.length;
    textarea.setSelectionRange(cursorStart, cursorEnd);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insertBlockAtCursor(block) {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
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
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function buildMediaMarkdown(url, caption) {
    if (caption && caption.trim()) {
      const safe = caption.trim().replace(/"/g, '\\"');
      return `![](${url} "${safe}")`;
    }
    return `![](${url})`;
  }

  function insertQuote() {
    applyLinesTransform((line) => {
      if (/^\s*>/.test(line)) return line;
      return `> ${line}`;
    });
  }

  async function insertDetails() {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    const summary = await window.appModal.prompt({
      title: "Скрывающийся блок",
      label: "Заголовок блока",
      value: "Подробнее",
      confirmText: "Вставить",
    });
    if (summary === null) return;

    const content = selected || "Скрытый текст…";
    const block = `<details><summary>${summary.trim()}</summary>\n${content}\n</details>`;
    insertBlockAtCursor(block);
  }

  async function insertLink() {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const url = await window.appModal.prompt({
      title: "Ссылка",
      label: "URL",
      value: "https://t.me/dnative",
      confirmText: "Вставить",
    });
    if (!url) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || "ссылка";
    const link = `[${selected}](${url.trim()})`;

    textarea.value = textarea.value.substring(0, start) + link + textarea.value.substring(end);
    const pos = start + link.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wrapMath() {
    const textarea = getTextarea();
    if (!textarea || textarea.readOnly) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const inner = selected || "E=mc^2";

    textarea.value = textarea.value.substring(0, start) + "$" + inner + "$" + textarea.value.substring(end);
    textarea.setSelectionRange(start + 1, start + 1 + inner.length);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
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
        window.location.href = "/login";
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
      btn.disabled = !enabled;
    });
    ["image-file-input", "video-file-input", "audio-file-input"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    });
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
        wrapSelection("**", "**");
        break;
      case "italic":
        wrapSelection("_", "_");
        break;
      case "strike":
        wrapSelection("~~", "~~");
        break;
      case "underline":
        wrapSelection("<u>", "</u>");
        break;
      case "marker":
        wrapSelection("==", "==");
        break;
      case "spoiler":
        wrapSelection("||", "||");
        break;
      case "code":
        wrapSelection("`", "`");
        break;
      case "sub":
        wrapSelection("<sub>", "</sub>");
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
      case "details":
        insertDetails();
        break;
    }
  }

  function initToolbar() {
    document.querySelectorAll(".editor-toolbar").forEach((toolbar) => {
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
