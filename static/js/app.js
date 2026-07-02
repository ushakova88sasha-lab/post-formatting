const { fetch: authFetch, redirectToLogin } = window.authClient;

let currentPostId = null;
let posts = [];
let retentionDays = 7;
let previewTimer = null;
let currentView = "posts";

async function api(path, options = {}) {
  return authFetch(path, options, { redirectOn401: true });
}

function showAlert(message, type = "error") {
  const el = document.getElementById("alert");
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

window.showPostAlert = showAlert;

function statusBadge(status) {
  const labels = {
    draft: "Черновик",
    scheduled: "Запланирован",
    published: "Опубликован",
    failed: "Ошибка",
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function formatDate(iso) {
  return window.moscowTime.formatMoscowDateTime(iso);
}

function postListTitle(post) {
  const generic = (value) => {
    const text = (value || "").trim().toLowerCase();
    return !text || text === "новый пост" || text === "без названия";
  };

  if (post.display_title && !generic(post.display_title)) {
    return post.display_title;
  }
  if (post.title && !generic(post.title)) {
    return post.title;
  }
  return post.display_title || post.title || "Без названия";
}

function updateRetentionHint() {
  const el = document.getElementById("post-retention-hint");
  if (!el) return;
  const days = retentionDays;
  const label = days === 1 ? "день" : days >= 2 && days <= 4 ? "дня" : "дней";
  el.textContent = `Посты хранятся ${days} ${label}, затем удаляются автоматически`;
}

function renderPostList() {
  const list = document.getElementById("post-list");
  if (!posts.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.85rem;">Нет постов</li>';
    return;
  }

  list.innerHTML = posts
    .map(
      (p) => `
    <li class="post-item ${p.id === currentPostId ? "active" : ""}" data-id="${p.id}">
      <div class="post-item-title">${escapeHtml(postListTitle(p))}</div>
      <div class="post-item-meta">
        ${statusBadge(p.status)}
        <span class="post-item-date">${formatDate(p.updated_at)}</span>
      </div>
    </li>`
    )
    .join("");

  list.querySelectorAll(".post-item").forEach((el) => {
    el.addEventListener("click", () => selectPost(Number(el.dataset.id)));
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showEditor(show) {
  document.getElementById("editor-view").classList.toggle("hidden", !show);
  document.getElementById("empty-view").classList.toggle("hidden", show);
}

function showView(view) {
  currentView = view;
  const isPosts = view === "posts";
  const isSettings = view === "settings";

  document.querySelectorAll(".sidebar-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });

  document.getElementById("sidebar-posts").classList.toggle("hidden", !isPosts);
  document.getElementById("settings-view").classList.toggle("hidden", !isSettings);

  if (isSettings) {
    document.getElementById("editor-view").classList.add("hidden");
    document.getElementById("empty-view").classList.add("hidden");
    loadTelegramSettings();
    return;
  }

  if (currentPostId) {
    showEditor(true);
  } else {
    showEditor(false);
  }
}

function renderSettingsStatus(data) {
  const el = document.getElementById("settings-status");
  if (!el) return;

  const botLine = data.bot_connected
    ? `<span class="status-ok">Бот подключён</span>${data.bot_username ? ` (@${data.bot_username})` : ""}`
    : `<span class="status-warn">Бот не подключён</span>`;

  const channelLine = data.channel_display
    ? `Канал: <strong>${escapeHtml(data.channel_display)}</strong>`
    : "Канал не указан";

  const tokenLine = data.token_configured
    ? `Токен: ${escapeHtml(data.token_hint)}`
    : '<span class="status-warn">Токен не указан</span>';

  el.innerHTML = `${botLine}<br>${channelLine}<br>${tokenLine}`;
}

async function loadTelegramSettings() {
  try {
    const data = await api("/api/settings/telegram");
    if (!data) return;

    document.getElementById("channel-id").value = data.channel_id || "";
    document.getElementById("bot-token").value = "";
    document.getElementById("token-hint").textContent = data.token_configured
      ? `Текущий токен: ${data.token_hint}. Оставьте поле пустым, чтобы не менять.`
      : "Получите токен у @BotFather в Telegram.";

    renderSettingsStatus(data);
    setChannelLabel(data.channel_display);
  } catch (err) {
    showAlert(err.message || "Не удалось загрузить настройки");
  }
}

async function saveTelegramSettings(event) {
  event.preventDefault();

  const channelId = document.getElementById("channel-id").value.trim();
  const botToken = document.getElementById("bot-token").value.trim();

  if (!channelId) {
    showAlert("Укажите канал");
    return;
  }

  const payload = { channel_id: channelId };
  if (botToken) {
    payload.bot_token = botToken;
  }

  try {
    const data = await api("/api/settings/telegram", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!data) return;

    document.getElementById("bot-token").value = "";
    renderSettingsStatus(data);
    setChannelLabel(data.channel_display);
    showAlert("Настройки сохранены", "success");
  } catch (err) {
    showAlert(err.message);
  }
}

async function verifyTelegramSettings() {
  try {
    const data = await api("/api/settings/telegram/verify", { method: "POST" });
    if (!data) return;

    renderSettingsStatus(data);
    setChannelLabel(data.channel_display);
    showAlert("Подключение успешно", "success");
  } catch (err) {
    showAlert(err.message);
  }
}

function setChannelLabel(channel) {
  const label = document.getElementById("channel-label");
  if (!label) return;
  label.textContent = channel ? `Публикация в канал ${channel}` : "Публикация в канал";
}

async function loadPosts() {
  const data = await api("/api/posts");
  if (Array.isArray(data)) {
    posts = data;
  } else {
    posts = Array.isArray(data?.posts) ? data.posts : [];
    retentionDays = data?.retention_days ?? 7;
  }
  updateRetentionHint();
  renderPostList();
}

async function selectPost(id) {
  const post = posts.find((p) => p.id === id) || (await api(`/api/posts/${id}`));
  if (!post) return;

  currentPostId = post.id;
  document.getElementById("post-title").value = post.title || "";
  document.getElementById("post-content").value = post.content || "";
  window.postButtons?.setButtons(post.buttons || []);

  if (post.scheduled_at) {
    const d = window.moscowTime.parseUtcDate(post.scheduled_at);
    document.getElementById("schedule-at").value = d
      ? window.moscowTime.toMoscowDatetimeLocal(d)
      : "";
  } else {
    document.getElementById("schedule-at").value = "";
  }

  const isPublished = post.status === "published";
  document.getElementById("post-content").readOnly = isPublished;
  document.getElementById("post-title").readOnly = isPublished;
  document.getElementById("publish-btn").disabled = isPublished;
  document.getElementById("schedule-btn").disabled = isPublished;
  document.getElementById("save-btn").disabled = isPublished;
  window.postButtons?.setReadOnly(isPublished, isPublished);
  window.leftEditor?.setEditable(!isPublished);
  if (window.leftEditor?.isVisualMode?.()) {
    window.leftEditor.refreshFromMarkdown?.();
  }
  if (window.editorToolbar) {
    window.editorToolbar.setToolbarEnabled(!isPublished);
  }
  if (window.previewEditor) {
    window.previewEditor.setEditable(!isPublished);
  }

  showEditor(true);
  renderPostList();
  updatePreview();
}

async function updatePreview(force = false) {
  if (!force && window.previewEditor?.isEditing()) return;
  if (!force && window.leftEditor?.isEditing?.()) return;

  const content = document.getElementById("post-content").value;
  try {
    const data = await api("/api/posts/preview", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (data) {
      if (window.previewEditor) {
        window.previewEditor.setHtml(data.html);
      } else {
        document.getElementById("preview-content").innerHTML = data.html;
      }
    }
  } catch {
    const errorHtml = '<div class="tg-message tg-rich"><p class="empty">Ошибка превью</p></div>';
    if (window.previewEditor) {
      window.previewEditor.setHtml(errorHtml);
    } else {
      document.getElementById("preview-content").innerHTML = errorHtml;
    }
  }
}

async function copyTextToClipboard(text, plainOnly = false) {
  if (!plainOnly && navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function copyPostHtml() {
  const content = document.getElementById("post-content").value;
  if (!content.trim()) {
    showAlert("Пост пустой");
    return;
  }

  try {
    const data = await api("/api/posts/preview", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (!data?.html) {
      showAlert("Не удалось получить HTML");
      return;
    }

    const html = data.html;
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([html], { type: "text/plain" }),
        }),
      ]);
    } else {
      await copyTextToClipboard(html, true);
    }

    showAlert("HTML скопирован", "success");
  } catch (err) {
    showAlert(err.message || "Не удалось скопировать HTML");
  }
}

async function copyPostMarkdown() {
  const content = document.getElementById("post-content").value;
  if (!content.trim()) {
    showAlert("Пост пустой");
    return;
  }

  try {
    const data = await api("/api/posts/export/telegram-markdown", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (!data?.markdown) {
      showAlert("Не удалось получить Markdown");
      return;
    }

    await copyTextToClipboard(data.markdown, true);
    showAlert("Markdown скопирован", "success");
  } catch (err) {
    showAlert(err.message || "Не удалось скопировать Markdown");
  }
}

async function createPost() {
  if (currentView !== "posts") {
    showView("posts");
  }
  const post = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({ title: "Новый пост", content: "" }),
  });
  if (!post) return;
  await loadPosts();
  await selectPost(post.id);
}

async function savePost() {
  if (!currentPostId) return;
  const buttonError = window.postButtons?.validateButtonsPayload?.();
  if (buttonError) {
    showAlert(buttonError);
    return;
  }

  const title = document.getElementById("post-title").value;
  const content = document.getElementById("post-content").value;
  const buttons = window.postButtons?.getButtonsPayload() || [];

  await api(`/api/posts/${currentPostId}`, {
    method: "PUT",
    body: JSON.stringify({ title, content, buttons }),
  });

  await loadPosts();
  showAlert("Сохранено", "success");
}

async function publishPost() {
  if (!currentPostId) return;
  const confirmed = await window.appModal.confirm({
    title: "Публикация",
    message: "Опубликовать пост в Telegram сейчас?",
    confirmText: "Опубликовать",
  });
  if (!confirmed) return;

  try {
    await savePost();
    await api(`/api/posts/${currentPostId}/publish`, { method: "POST" });
    await loadPosts();
    await selectPost(currentPostId);
    showAlert("Пост опубликован!", "success");
  } catch (err) {
    showAlert(err.message);
    await loadPosts();
    await selectPost(currentPostId);
  }
}

async function schedulePost() {
  if (!currentPostId) return;
  const value = document.getElementById("schedule-at").value;
  if (!value) {
    showAlert("Укажите дату и время");
    return;
  }

  const scheduled_at = window.moscowTime.moscowDatetimeLocalToUtcIso(value);

  try {
    await savePost();
    await api(`/api/posts/${currentPostId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at }),
    });
    await loadPosts();
    await selectPost(currentPostId);
    showAlert("Пост запланирован", "success");
  } catch (err) {
    showAlert(err.message);
  }
}

async function init() {
  const me = await api("/api/auth/me");
  if (!me) return;

  document.getElementById("username-label").textContent = me.username;

  try {
    const health = await fetch("/health");
    if (health.ok) {
      const healthData = await health.json();
      setChannelLabel(healthData.channel);
    }
  } catch {
    // канал в превью необязателен
  }

  try {
    await loadPosts();
    if (posts.length) {
      await selectPost(posts[0].id);
    } else {
      showEditor(false);
    }
  } catch (err) {
    showEditor(false);
    showAlert(err.message || "Не удалось загрузить посты");
  }
}

window.refreshPreview = function () {
  clearTimeout(previewTimer);
  return updatePreview(true);
};

document.getElementById("post-content").addEventListener("input", () => {
  if (window.previewEditor?.isEditing()) return;
  if (window.leftEditor?.isVisualMode?.()) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
});

window.addEventListener("left-editor:blur", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 50);
});

window.addEventListener("preview-editor:blur", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 50);
});

document.getElementById("new-post-btn").addEventListener("click", createPost);
document.getElementById("empty-new-btn").addEventListener("click", createPost);
document.getElementById("save-btn").addEventListener("click", savePost);
document.getElementById("publish-btn").addEventListener("click", publishPost);
document.getElementById("schedule-btn").addEventListener("click", schedulePost);
document.getElementById("copy-html-btn").addEventListener("click", copyPostHtml);
document.getElementById("copy-markdown-btn").addEventListener("click", copyPostMarkdown);

document.querySelectorAll(".sidebar-tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

document.getElementById("settings-form").addEventListener("submit", saveTelegramSettings);
document.getElementById("verify-telegram-btn").addEventListener("click", verifyTelegramSettings);

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  redirectToLogin();
});

init();
