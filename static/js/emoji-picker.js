/**
 * Панель выбора эмодзи для редактора постов.
 */
(function () {
  const CATEGORIES = window.EMOJI_CATEGORIES || [];

  let open = false;
  let activeCategory = CATEGORIES[0]?.id || "smileys";
  let searchQuery = "";

  function getPopover() {
    return document.getElementById("emoji-picker-popover");
  }

  function getButton() {
    return document.getElementById("emoji-picker-btn");
  }

  function getSearchInput() {
    return document.getElementById("emoji-picker-search");
  }

  function emojiChar(item) {
    return typeof item === "string" ? item : item.e;
  }

  function insertIntoEditor(text) {
    if (window.previewEditor?.insertText?.(text)) {
      window.refreshPreview?.();
      return;
    }

    const textarea = document.getElementById("post-content");
    if (!textarea || textarea.readOnly) return;

    window.previewEditor?.syncToTextarea?.();

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    window.refreshPreview?.();
  }

  function collectSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results = [];
    const seen = new Set();

    for (const cat of CATEGORIES) {
      for (const item of cat.emojis) {
        const char = emojiChar(item);
        if (seen.has(char)) continue;

        const keywords = typeof item === "string" ? "" : item.q || "";
        if (char.includes(q) || keywords.includes(q)) {
          seen.add(char);
          results.push(char);
        }
      }
    }

    return results;
  }

  function renderEmojiGrid(emojis) {
    const grid = document.getElementById("emoji-picker-grid");
    if (!grid) return;

    if (!emojis.length) {
      grid.innerHTML = '<p class="emoji-picker-empty">Ничего не найдено</p>';
      return;
    }

    grid.innerHTML = emojis
      .map(
        (emoji) =>
          `<button type="button" class="emoji-picker-item" data-emoji="${emoji}" title="${emoji}">${emoji}</button>`
      )
      .join("");

    grid.querySelectorAll(".emoji-picker-item").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertIntoEditor(btn.dataset.emoji || btn.textContent);
      });
    });
  }

  function renderGrid(categoryId) {
    if (searchQuery.trim()) {
      renderEmojiGrid(collectSearchResults(searchQuery));
      return;
    }

    const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
    if (!category) return;

    activeCategory = category.id;
    renderEmojiGrid(category.emojis.map(emojiChar));
  }

  function renderTabs() {
    const tabs = document.getElementById("emoji-picker-tabs");
    if (!tabs) return;

    const showSearchActive = Boolean(searchQuery.trim());

    tabs.innerHTML = CATEGORIES.map(
      (cat) =>
        `<button type="button" class="emoji-picker-tab ${!showSearchActive && cat.id === activeCategory ? "active" : ""}" data-category="${cat.id}" title="${cat.title}">${cat.label}</button>`
    ).join("");

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
    if (!popover || !btn || btn.disabled || !CATEGORIES.length) return;

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

  function init() {
    const btn = getButton();
    const popover = getPopover();
    if (!btn || !popover) return;

    document.body.appendChild(popover);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
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

    window.emojiPicker = { close, insert: insertIntoEditor };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
