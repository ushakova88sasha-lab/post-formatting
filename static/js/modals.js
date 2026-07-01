/**
 * Кастомные попапы вместо window.prompt / confirm / alert.
 */
(function () {
  const modal = () => document.getElementById("app-modal");
  const titleEl = () => document.getElementById("app-modal-title");
  const messageEl = () => document.getElementById("app-modal-message");
  const fieldsEl = () => document.getElementById("app-modal-fields");
  const confirmBtn = () => document.getElementById("app-modal-confirm");
  const cancelBtn = () => document.getElementById("app-modal-cancel");

  let activeCleanup = null;

  function closeModal() {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    const el = modal();
    if (!el) return;
    el.classList.remove("visible");
    el.classList.add("hidden");
    fieldsEl().innerHTML = "";
    messageEl().classList.add("hidden");
    messageEl().textContent = "";
  }

  function openModal({ title, message, fields, confirmText, cancelText, onConfirm, onCancel }) {
    return new Promise((resolve) => {
      closeModal();

      titleEl().textContent = title;
      if (message) {
        messageEl().textContent = message;
        messageEl().classList.remove("hidden");
      }

      const inputs = [];
      fields.forEach((field) => {
        const group = document.createElement("div");
        group.className = "form-group app-modal-field";
        const label = document.createElement("label");
        label.textContent = field.label;
        label.htmlFor = field.id;
        const input = document.createElement("input");
        input.type = field.type || "text";
        input.id = field.id;
        input.className = "input";
        input.value = field.value ?? "";
        input.placeholder = field.placeholder || "";
        if (field.inputMode) input.inputMode = field.inputMode;
        group.append(label, input);
        fieldsEl().appendChild(group);
        inputs.push(input);
      });

      confirmBtn().textContent = confirmText || "OK";
      cancelBtn().textContent = cancelText || "Отмена";
      cancelBtn().classList.toggle("hidden", !cancelText);

      function finish(result) {
        closeModal();
        resolve(result);
      }

      function handleConfirm() {
        if (inputs.length === 0) {
          finish(true);
          return;
        }
        if (inputs.length === 1) {
          finish(inputs[0].value);
          return;
        }
        finish(inputs.map((input) => input.value));
      }

      function handleCancel() {
        finish(inputs.length <= 1 ? null : null);
      }

      function onOverlay(e) {
        if (e.target === modal()) handleCancel();
      }

      function onKey(e) {
        if (e.key === "Escape") handleCancel();
        if (e.key === "Enter" && e.target.tagName === "INPUT") {
          e.preventDefault();
          handleConfirm();
        }
      }

      confirmBtn().onclick = handleConfirm;
      cancelBtn().onclick = handleCancel;
      modal().onclick = onOverlay;
      document.addEventListener("keydown", onKey);

      activeCleanup = () => {
        confirmBtn().onclick = null;
        cancelBtn().onclick = null;
        modal().onclick = null;
        document.removeEventListener("keydown", onKey);
      };

      modal().classList.remove("hidden");
      requestAnimationFrame(() => {
        modal().classList.add("visible");
        (inputs[0] || confirmBtn()).focus();
        if (inputs[0]) inputs[0].select();
      });
    });
  }

  window.appModal = {
    prompt({ title, label, value = "", placeholder = "", confirmText = "OK", cancelText = "Отмена" }) {
      return openModal({
        title,
        fields: [{ id: "app-modal-input", label, value, placeholder }],
        confirmText,
        cancelText,
      });
    },

    confirm({ title, message, confirmText = "Да", cancelText = "Отмена" }) {
      return openModal({
        title,
        message,
        fields: [],
        confirmText,
        cancelText,
      }).then((result) => result === true);
    },

    alert({ title, message, confirmText = "OK" }) {
      return openModal({
        title,
        message,
        fields: [],
        confirmText,
        cancelText: null,
      });
    },

    form({ title, fields, confirmText = "OK", cancelText = "Отмена" }) {
      return openModal({
        title,
        fields: fields.map((field, index) => ({
          id: `app-modal-field-${index}`,
          ...field,
        })),
        confirmText,
        cancelText,
      });
    },
  };
})();
