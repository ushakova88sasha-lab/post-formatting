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
        return `_${inner()}_`;
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
        return `![](${src})`;
      }
      default:
        return inner();
    }
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
        return Array.from(el.childNodes).map(serializeBlock).join("");
      default:
        return Array.from(el.childNodes).map(serializeBlock).join("");
    }
  }

  function messageToMarkdown(messageEl) {
    if (!messageEl) return "";

    const parts = Array.from(messageEl.childNodes).map(serializeBlock);
    return parts
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
  }

  function clearEmptyPlaceholder(messageEl) {
    const empty = messageEl.querySelector("p.empty");
    if (empty) {
      empty.remove();
    }
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

  function applyEditableState(messageEl) {
    if (!messageEl) return;

    messageEl.contentEditable = editable ? "true" : "false";
    messageEl.classList.toggle("tg-editable", editable);
    messageEl.dataset.placeholder = editable ? EMPTY_TEXT : "";

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
      clearEmptyPlaceholder(messageEl);
    });

    messageEl.addEventListener("blur", () => {
      focused = false;
      syncToTextarea();
      dirty = false;
      window.dispatchEvent(new CustomEvent("preview-editor:blur"));
    });

    messageEl.addEventListener("input", () => {
      if (!editable) return;
      dirty = true;
      clearEmptyPlaceholder(messageEl);
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncToTextarea, 200);
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

  function syncToTextarea() {
    const messageEl = getMessage();
    const textarea = getTextarea();
    if (!messageEl || !textarea || textarea.readOnly) {
      return;
    }

    const markdown = messageToMarkdown(messageEl);
    if (textarea.value === markdown) {
      dirty = false;
      return;
    }

    textarea.value = markdown;
    dirty = false;
    textarea.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }

  function setHtml(html) {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = html;
    const message = ensureMessageElement();
    bindMessage(message);
  }

  function setEditable(enabled) {
    editable = Boolean(enabled);
    const message = getMessage();
    applyEditableState(message);
  }

  function init() {
    const root = getRoot();
    if (!root) return;

    bindMessage(getMessage());

    window.previewEditor = {
      isEditing,
      isDirty,
      syncToTextarea,
      setHtml,
      setEditable,
      messageToMarkdown,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
