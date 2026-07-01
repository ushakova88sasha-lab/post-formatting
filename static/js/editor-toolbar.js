/**
 * Панель форматирования: H1–H3, жирный, курсив, зачёркнутый, изображения.
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

  function buildImageMarkdown(url, caption) {
    if (caption && caption.trim()) {
      const safe = caption.trim().replace(/"/g, '\\"');
      return `![](${url} "${safe}")`;
    }
    return `![](${url})`;
  }

  async function uploadAndInsertImage(file) {
    const btn = document.getElementById("image-upload-btn");
    btn.classList.add("fmt-btn-loading");
    btn.textContent = "…";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/uploads/image", {
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

      const caption = window.prompt("Подпись к изображению (необязательно):", "") ?? "";
      insertBlockAtCursor(buildImageMarkdown(data.url, caption));
    } catch (err) {
      window.alert(err.message || "Не удалось загрузить изображение");
    } finally {
      btn.classList.remove("fmt-btn-loading");
      btn.textContent = "🖼";
    }
  }

  function setToolbarEnabled(enabled) {
    document.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.disabled = !enabled;
    });
    const fileInput = document.getElementById("image-file-input");
    if (fileInput) fileInput.disabled = !enabled;
  }

  function initToolbar() {
    const toolbar = document.getElementById("editor-toolbar");
    const fileInput = document.getElementById("image-file-input");
    if (!toolbar) return;

    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest(".fmt-btn");
      if (!btn || btn.disabled) return;

      const action = btn.dataset.action;
      if (action === "image") {
        e.preventDefault();
        fileInput?.click();
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
      }
    });

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) uploadAndInsertImage(file);
    });

    window.editorToolbar = { setToolbarEnabled };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToolbar);
  } else {
    initToolbar();
  }
})();
