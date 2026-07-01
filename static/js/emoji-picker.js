/**
 * Панель выбора эмодзи для редактора постов.
 */
(function () {
  const CATEGORIES = [
    {
      id: "smileys",
      label: "😀",
      title: "Смайлы",
      emojis: [
        "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍",
        "🥰", "😘", "😎", "🤔", "😮", "😢", "😭", "😡", "🥳", "😴", "🤯", "🫡",
      ],
    },
    {
      id: "gestures",
      label: "👍",
      title: "Жесты",
      emojis: [
        "👍", "👎", "👌", "✌️", "🤝", "👏", "🙌", "🙏", "💪", "👋", "🤞", "✊",
        "👊", "🫶", "🤙", "☝️", "👆", "👇", "👉", "👈", "✋", "🖐️", "🤷", "🙋",
      ],
    },
    {
      id: "hearts",
      label: "❤️",
      title: "Сердца",
      emojis: [
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
        "💞", "💓", "💗", "💖", "💘", "💝", "♥️", "😍", "😘", "💑", "💏", "🥰",
      ],
    },
    {
      id: "symbols",
      label: "✨",
      title: "Символы",
      emojis: [
        "✨", "⭐", "🌟", "💫", "🔥", "💯", "✅", "❌", "⚡️", "💡", "📌", "🎯",
        "🏆", "🎉", "🎊", "🎁", "🔔", "📣", "💬", "💭", "🗣️", "‼️", "❓", "❗️",
      ],
    },
    {
      id: "nature",
      label: "🌸",
      title: "Природа",
      emojis: [
        "☀️", "🌤️", "⛅️", "🌙", "⭐️", "🌈", "🌸", "🌺", "🌻", "🌹", "🍀", "🌿",
        "🌳", "🌊", "❄️", "⛄️", "🐶", "🐱", "🦊", "🐻", "🦁", "🐸", "🦋", "🐝",
      ],
    },
    {
      id: "food",
      label: "☕️",
      title: "Еда",
      emojis: [
        "☕️", "🍵", "🧃", "🍺", "🥂", "🍷", "🍕", "🍔", "🌭", "🍟", "🥗", "🍣",
        "🍰", "🎂", "🍪", "🍫", "🍎", "🍇", "🍓", "🥑", "🌶️", "🧀", "🥐", "🍳",
      ],
    },
    {
      id: "work",
      label: "💼",
      title: "Дела",
      emojis: [
        "💼", "📱", "💻", "🖥️", "⌨️", "📝", "📊", "📈", "📉", "📅", "⏰", "🔒",
        "🔑", "🛠️", "⚙️", "🔗", "📎", "📁", "📂", "✉️", "📩", "📰", "🧾", "🏠",
      ],
    },
    {
      id: "travel",
      label: "✈️",
      title: "Путешествия",
      emojis: [
        "✈️", "🚀", "🚗", "🚕", "🚌", "🚎", "🏎️", "🚲", "🛵", "🚂", "🛳️", "⛵️",
        "🗺️", "🧳", "🏖️", "🏔️", "🏕️", "🌍", "🌎", "🌏", "🏙️", "🗽", "🎡", "🎢",
      ],
    },
  ];

  let open = false;
  let activeCategory = CATEGORIES[0].id;

  function getPopover() {
    return document.getElementById("emoji-picker-popover");
  }

  function getButton() {
    return document.getElementById("emoji-picker-btn");
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

  function renderGrid(categoryId) {
    const grid = document.getElementById("emoji-picker-grid");
    if (!grid) return;

    const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
    activeCategory = category.id;

    grid.innerHTML = category.emojis
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

  function renderTabs() {
    const tabs = document.getElementById("emoji-picker-tabs");
    if (!tabs) return;

    tabs.innerHTML = CATEGORIES.map(
      (cat) =>
        `<button type="button" class="emoji-picker-tab ${cat.id === activeCategory ? "active" : ""}" data-category="${cat.id}" title="${cat.title}">${cat.label}</button>`
    ).join("");

    tabs.querySelectorAll(".emoji-picker-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeCategory = tab.dataset.category;
        tabs.querySelectorAll(".emoji-picker-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.category === activeCategory);
        });
        renderGrid(activeCategory);
      });
    });
  }

  function show() {
    const popover = getPopover();
    const btn = getButton();
    if (!popover || !btn || btn.disabled) return;

    renderTabs();
    renderGrid(activeCategory);
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

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    document.addEventListener("click", (e) => {
      if (!open) return;
      if (e.target.closest(".fmt-emoji-wrap")) return;
      close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) {
        close();
      }
    });

    window.emojiPicker = { close, insert: insertIntoEditor };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
