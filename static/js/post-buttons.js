(function () {
  let buttons = [];
  let isReadOnly = false;
  let isPublished = false;

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function normalizeButtons(items) {
    return (items || []).map((button, index) => ({
      id: button.id ?? null,
      text: button.text || "",
      url: button.url || "",
      click_count: button.click_count ?? 0,
      position: button.position ?? index,
    }));
  }

  function renderButtonsList() {
    const list = document.getElementById("buttons-list");
    if (!list) return;

    if (!buttons.length) {
      list.innerHTML = '<p class="buttons-empty">Кнопок пока нет</p>';
      renderPreviewButtons();
      return;
    }

    list.innerHTML = buttons
      .map(
        (button, index) => `
      <div class="button-row" data-index="${index}">
        <div class="button-row-fields">
          <input
            type="text"
            class="input button-text-input"
            placeholder="Текст кнопки"
            maxlength="64"
            value="${escapeHtml(button.text)}"
            ${isReadOnly ? "readonly" : ""}
          >
          <input
            type="url"
            class="input button-url-input"
            placeholder="https://example.com"
            value="${escapeHtml(button.url)}"
            ${isReadOnly ? "readonly" : ""}
            required
          >
        </div>
        <div class="button-row-actions">
          ${
            isPublished
              ? `<span class="button-click-count" title="Уникальные клики">${button.click_count} уник. кликов</span>`
              : ""
          }
          ${
            isReadOnly
              ? ""
              : `<button type="button" class="btn btn-danger btn-icon button-remove-btn" data-index="${index}" title="Удалить">×</button>`
          }
        </div>
      </div>`
      )
      .join("");

    if (!isReadOnly) {
      list.querySelectorAll(".button-text-input").forEach((input) => {
        input.addEventListener("input", onFieldInput);
      });
      list.querySelectorAll(".button-url-input").forEach((input) => {
        input.addEventListener("input", onFieldInput);
      });
      list.querySelectorAll(".button-remove-btn").forEach((btn) => {
        btn.addEventListener("click", () => removeButton(Number(btn.dataset.index)));
      });
    }

    renderPreviewButtons();
  }

  function onFieldInput(event) {
    const row = event.target.closest(".button-row");
    if (!row) return;
    const index = Number(row.dataset.index);
    const textInput = row.querySelector(".button-text-input");
    const urlInput = row.querySelector(".button-url-input");
    buttons[index] = {
      ...buttons[index],
      text: textInput.value,
      url: urlInput.value,
    };
    renderPreviewButtons();
  }

  function renderPreviewButtons() {
    const container = document.getElementById("preview-buttons");
    if (!container) return;

    const validButtons = buttons.filter((button) => button.text.trim() && button.url.trim());
    if (!validButtons.length) {
      container.innerHTML = "";
      container.classList.add("hidden");
      return;
    }

    container.classList.remove("hidden");
    container.innerHTML = validButtons
      .map(
        (button) =>
          `<a class="tg-inline-button" href="${escapeHtml(button.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(button.text.trim())}</a>`
      )
      .join("");
  }

  function addButton() {
    if (isReadOnly) return;
    if (buttons.length >= 10) {
      window.showPostAlert?.("Не более 10 кнопок в одном посте");
      return;
    }
    buttons.push({ text: "", url: "", click_count: 0 });
    renderButtonsList();
  }

  function removeButton(index) {
    if (isReadOnly) return;
    buttons.splice(index, 1);
    renderButtonsList();
  }

  function setButtons(items) {
    buttons = normalizeButtons(items);
    renderButtonsList();
  }

  function setReadOnly(readOnly, published = false) {
    isReadOnly = readOnly;
    isPublished = published;
    const addBtn = document.getElementById("add-button-btn");
    if (addBtn) {
      addBtn.disabled = readOnly;
      addBtn.classList.toggle("hidden", readOnly);
    }
    renderButtonsList();
  }

  function getButtonsPayload() {
    return buttons
      .filter((button) => button.text.trim() || button.url.trim())
      .map((button) => ({
        text: button.text.trim(),
        url: button.url.trim(),
      }));
  }

  function validateButtonsPayload() {
    for (const button of buttons) {
      const text = button.text.trim();
      const url = button.url.trim();
      if (!text && !url) continue;
      if (!text) {
        return "Укажите текст кнопки";
      }
      if (!url) {
        return "Укажите URL кнопки";
      }
      if (!/^https?:\/\//i.test(url)) {
        return "URL кнопки должен начинаться с http:// или https://";
      }
    }
    return null;
  }

  function clearButtons() {
    buttons = [];
    renderButtonsList();
  }

  document.getElementById("add-button-btn")?.addEventListener("click", addButton);

  window.postButtons = {
    setButtons,
    setReadOnly,
    getButtonsPayload,
    validateButtonsPayload,
    clearButtons,
    renderPreviewButtons,
  };
})();
