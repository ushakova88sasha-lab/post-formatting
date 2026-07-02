/**
 * Панель выбора эмодзи для редактора постов.
 */
(function () {
  const UNICODE_CATEGORIES = window.EMOJI_CATEGORIES || [];

  let open = false;
  let activeCategory = UNICODE_CATEGORIES[0]?.id || "smileys";
  let searchQuery = "";
  let customPacks = [];
  let categories = [];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getPopover() {
    return document.getElementById("emoji-picker-popover");
  }

  function getButton() {
    return document.getElementById("emoji-picker-btn");
  }

  function getSearchInput() {
    return document.getElementById("emoji-picker-search");
  }

  function packTabLabel(title) {
    const text = (title || "").trim();
    if (!text) return "★";
    if (text.length <= 3) return text;
    return text.slice(0, 3);
  }

  function buildCategories() {
    const customCategories = customPacks.map((pack) => ({
      id: `custom:${pack.short_name}`,
      label: packTabLabel(pack.title),
      title: pack.title || pack.short_name,
      custom: true,
      emojis: (pack.emojis || []).map((emoji) => ({
        custom: true,
        id: emoji.id,
        alt: emoji.alt || "✨",
        preview_url: emoji.preview_url,
        insert: `![](tg://emoji?id=${emoji.id})`,
      })),
    }));

    categories = [...UNICODE_CATEGORIES, ...customCategories];
    if (!categories.some((category) => category.id === activeCategory)) {
      activeCategory = categories[0]?.id || "smileys";
    }
  }

  function emojiChar(item) {
    if (item?.custom) {
      return item.alt || "✨";
    }
    return typeof item === "string" ? item : item.e;
  }

  function emojiInsertText(item) {
    if (item?.custom) {
      return item.insert || `![](tg://emoji?id=${item.id})`;
    }
    return emojiChar(item);
  }

  function insertIntoEditor(text) {
    if (!text) return;

    if (window.leftEditor?.insertText?.(text)) {
      return;
    }
    if (window.previewEditor?.insertText?.(text)) {
      window.refreshPreview?.();
      return;
    }

    const textarea = document.getElementById("post-content");
    if (!textarea || textarea.readOnly) return;

    const isVisual = window.leftEditor?.isVisualMode?.();

    window.editorHistory?.beforeChange?.();

    let start = textarea.selectionStart ?? textarea.value.length;
    let end = textarea.selectionEnd ?? start;

    if (isVisual && document.activeElement !== textarea) {
      const markdown = window.leftEditor?.getMarkdown?.() ?? textarea.value;
      start = markdown.length;
      end = start;
    } else if (isVisual) {
      window.leftEditor?.syncToTextarea?.({ force: true });
      start = textarea.selectionStart ?? textarea.value.length;
      end = textarea.selectionEnd ?? start;
    } else {
      window.previewEditor?.syncToTextarea?.();
    }

    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    window.editorHistory?.afterChange?.();

    if (isVisual) {
      void window.leftEditor?.refreshFromMarkdown?.();
    }
    window.refreshPreview?.(true);
  }

  function resolveInsertText(btn) {
    const customId = btn.dataset.customId;
    if (customId) {
      return `![](tg://emoji?id=${customId})`;
    }
    return btn.dataset.emoji || btn.textContent || "";
  }

  function saveEditorSelection() {
    window.leftEditor?.saveSelection?.();
    window.previewEditor?.savePreviewSelection?.();
  }

  function collectSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results = [];
    const seen = new Set();

    for (const cat of categories) {
      for (const item of cat.emojis) {
        if (item?.custom) {
          const key = `custom:${item.id}`;
          if (seen.has(key)) continue;

          const alt = (item.alt || "").toLowerCase();
          const title = (cat.title || "").toLowerCase();
          if (alt.includes(q) || title.includes(q) || String(item.id).includes(q)) {
            seen.add(key);
            results.push(item);
          }
          continue;
        }

        const char = emojiChar(item);
        if (seen.has(char)) continue;

        const keywords = typeof item === "string" ? "" : item.q || "";
        if (char.includes(q) || keywords.includes(q)) {
          seen.add(char);
          results.push(item);
        }
      }
    }

    return results;
  }

  function renderEmojiButton(item) {
    if (item?.custom) {
      const alt = escapeHtml(item.alt || "✨");
      const preview = item.preview_url
        ? `<img src="${escapeHtml(item.preview_url)}" alt="${alt}" class="emoji-picker-preview" loading="lazy">`
        : alt;
      return `<button type="button" class="emoji-picker-item emoji-picker-item-custom" data-custom-id="${escapeHtml(
        item.id
      )}" title="${alt}">${preview}</button>`;
    }

    const emoji = emojiChar(item);
    return `<button type="button" class="emoji-picker-item" data-emoji="${escapeHtml(
      emoji
    )}" title="${escapeHtml(emoji)}">${emoji}</button>`;
  }

  function renderEmojiGrid(emojis) {
    const grid = document.getElementById("emoji-picker-grid");
    if (!grid) return;

    if (!emojis.length) {
      grid.innerHTML = '<p class="emoji-picker-empty">Ничего не найдено</p>';
      return;
    }

    grid.innerHTML = emojis.map((emoji) => renderEmojiButton(emoji)).join("");

    grid.querySelectorAll(".emoji-picker-item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        saveEditorSelection();
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertIntoEditor(resolveInsertText(btn));
      });
    });
  }

  function renderGrid(categoryId) {
    if (searchQuery.trim()) {
      renderEmojiGrid(collectSearchResults(searchQuery));
      return;
    }

    const category = categories.find((c) => c.id === categoryId) || categories[0];
    if (!category) return;

    activeCategory = category.id;
    renderEmojiGrid(category.emojis);
  }

  function renderTabs() {
    const tabs = document.getElementById("emoji-picker-tabs");
    if (!tabs) return;

    const showSearchActive = Boolean(searchQuery.trim());

    tabs.innerHTML = categories
      .map((cat) => {
        const tabClass = [
          "emoji-picker-tab",
          cat.custom ? "emoji-picker-tab-custom" : "",
          !showSearchActive && cat.id === activeCategory ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<button type="button" class="${tabClass}" data-category="${escapeHtml(
          cat.id
        )}" title="${escapeHtml(cat.title || cat.label)}">${escapeHtml(cat.label)}</button>`;
      })
      .join("");

    tabs.querySelectorAll(".emoji-picker-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const input = getSearchInput();
        if (input) {
          input.value = "";
        }
        searchQuery = "";
        activeCategory = tab.dataset.category;
        tabs.querySelectorAll(".emoji-picker-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.category === activeCategory);
        });
        renderGrid(activeCategory);
      });
    });
  }

  function positionPopover() {
    const btn = getButton();
    const popover = getPopover();
    if (!btn || !popover) return;

    const margin = 8;
    const rect = btn.getBoundingClientRect();

    popover.style.visibility = "hidden";
    popover.classList.remove("hidden");
    const popoverRect = popover.getBoundingClientRect();
    popover.style.visibility = "";

    let top = rect.bottom + margin;
    let left = rect.left;

    if (left + popoverRect.width > window.innerWidth - margin) {
      left = window.innerWidth - popoverRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top + popoverRect.height > window.innerHeight - margin) {
      top = rect.top - popoverRect.height - margin;
    }
    if (top < margin) {
      top = margin;
    }

    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
  }

  function show() {
    const popover = getPopover();
    const btn = getButton();
    if (!popover || !btn || btn.disabled || !categories.length) return;

    searchQuery = "";
    const input = getSearchInput();
    if (input) {
      input.value = "";
    }

    renderTabs();
    renderGrid(activeCategory);
    positionPopover();
    popover.classList.remove("hidden");
    open = true;
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }

  function close() {
    const popover = getPopover();
    const btn = getButton();
    if (!popover) return;

    popover.classList.add("hidden");
    open = false;
    searchQuery = "";
    btn?.classList.remove("active");
    btn?.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (open) {
      close();
    } else {
      show();
    }
  }

  async function loadCustomPacks() {
    if (!window.authClient?.fetch) {
      buildCategories();
      return;
    }

    try {
      const data = await window.authClient.fetch("/api/emoji/packs", {}, { redirectOn401: false });
      customPacks = Array.isArray(data?.packs) ? data.packs : [];
    } catch {
      customPacks = [];
    }

    buildCategories();
  }

  function init() {
    const btn = getButton();
    const popover = getPopover();
    if (!btn || !popover) return;

    buildCategories();
    loadCustomPacks();

    document.body.appendChild(popover);

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      saveEditorSelection();
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    popover.addEventListener("mousedown", (e) => {
      if (e.target.closest(".emoji-picker-search")) return;
      e.preventDefault();
      saveEditorSelection();
    });

    const searchInput = getSearchInput();
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderTabs();
        renderGrid(activeCategory);
        if (open) {
          positionPopover();
        }
      });

      searchInput.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    document.addEventListener("click", (e) => {
      if (!open) return;
      if (e.target.closest(".fmt-emoji-wrap") || e.target.closest("#emoji-picker-popover")) return;
      close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) {
        close();
      }
    });

    window.addEventListener("resize", () => {
      if (open) positionPopover();
    });

    window.addEventListener(
      "scroll",
      () => {
        if (open) positionPopover();
      },
      true
    );

    window.emojiPicker = {
      close,
      insert: insertIntoEditor,
      reload: async () => {
        await loadCustomPacks();
        if (open) {
          renderTabs();
          renderGrid(activeCategory);
          positionPopover();
        }
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
