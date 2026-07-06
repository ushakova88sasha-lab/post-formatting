const { fetch: authFetch, redirectToLogin } = window.authClient;

let currentPostId = null;
let posts = [];
let retentionDays = 7;
let previewTimer = null;
let currentView = "posts";
let postFilter = "all";
let postsOffset = 0;
let hasMorePosts = true;
let loadingPosts = false;
let postsLoadObserver = null;
const POSTS_PAGE_SIZE = 10;

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

function emptyPostsLabel() {
  if (postFilter === "published") return "Нет опубликованных постов";
  if (postFilter === "draft") return "Нет черновиков";
  return "Нет постов";
}

function buildPostsQuery(offset) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(POSTS_PAGE_SIZE),
  });
  if (postFilter !== "all") {
    params.set("filter", postFilter);
  }
  return params;
}

function renderPostList() {
  const list = document.getElementById("post-list");
  if (!posts.length) {
    list.innerHTML = `<li style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0.75rem;">${emptyPostsLabel()}</li>`;
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
}

function setPostFilter(filter) {
  if (postFilter === filter) return;
  postFilter = filter;
  document.querySelectorAll(".post-filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  return loadPosts({ reset: true, selectFirst: true });
}

function setPostListLoading(isLoading) {
  const loader = document.getElementById("post-list-loader");
  if (loader) {
    loader.classList.toggle("hidden", !isLoading);
  }
}

function setupPostsInfiniteScroll() {
  const root = document.getElementById("post-list-scroll");
  const sentinel = document.getElementById("post-list-sentinel");
  if (!root || !sentinel) return;

  if (postsLoadObserver) {
    postsLoadObserver.disconnect();
  }

  postsLoadObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting || loadingPosts || !hasMorePosts) return;
      loadPosts().catch((err) => showAlert(err.message || "Не удалось загрузить посты"));
    },
    {
      root,
      rootMargin: "120px",
      threshold: 0,
    }
  );

  postsLoadObserver.observe(sentinel);
}

async function maybeFillPostList() {
  const root = document.getElementById("post-list-scroll");
  if (!root || loadingPosts || !hasMorePosts) return;

  let guard = 0;
  while (hasMorePosts && !loadingPosts && root.scrollHeight <= root.clientHeight + 8 && guard < 20) {
    guard += 1;
    await loadPosts();
  }
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
    loadEmojiPacks();
    window.postStats?.loadMonthlyStats(api);
    window.postStats?.loadTrackingSettings(api);
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

function renderEmojiPacksList(packs) {
  const el = document.getElementById("emoji-packs-list");
  if (!el) return;

  if (!packs.length) {
    el.innerHTML = '<p class="field-hint">Наборы не импортированы. Добавьте ссылку выше.</p>';
    return;
  }

  el.innerHTML = packs
    .map(
      (pack) => `
        <article class="emoji-pack-card" data-pack="${escapeHtml(pack.short_name)}">
          <div class="emoji-pack-card-info">
            <p class="emoji-pack-card-title">${escapeHtml(pack.title || pack.short_name)}</p>
            <p class="emoji-pack-card-meta">
              ${pack.emoji_count || (pack.emojis || []).length} эмодзи ·
              <a href="${escapeHtml(pack.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pack.short_name)}</a>
            </p>
          </div>
          <div class="emoji-pack-card-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="refresh-emoji-pack">Обновить</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="delete-emoji-pack">Удалить</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadEmojiPacks() {
  const el = document.getElementById("emoji-packs-list");
  if (!el) return;

  try {
    const data = await api("/api/emoji/packs");
    if (!data) return;

    const packs = Array.isArray(data.packs) ? data.packs : [];
    renderEmojiPacksList(packs);
    await window.emojiPicker?.reload?.();
  } catch (err) {
    el.innerHTML = `<p class="field-hint">${escapeHtml(err.message || "Не удалось загрузить наборы")}</p>`;
  }
}

async function importEmojiPack(event) {
  event.preventDefault();

  const urlInput = document.getElementById("emoji-pack-url");
  const url = urlInput?.value?.trim();
  if (!url) {
    showAlert("Укажите ссылку на набор эмодзи");
    return;
  }

  try {
    const pack = await api("/api/emoji/packs/import", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    if (!pack) return;

    showAlert(`Набор «${pack.title || pack.short_name}» импортирован`, "success");
    if (urlInput) {
      urlInput.value = "";
    }
    await loadEmojiPacks();
  } catch (err) {
    showAlert(err.message || "Не удалось импортировать набор");
  }
}

async function refreshEmojiPack(shortName) {
  try {
    const pack = await api(`/api/emoji/packs/${encodeURIComponent(shortName)}/refresh`, {
      method: "POST",
    });
    if (!pack) return;

    showAlert(`Набор «${pack.title || pack.short_name}» обновлён`, "success");
    await loadEmojiPacks();
  } catch (err) {
    showAlert(err.message || "Не удалось обновить набор");
  }
}

async function deleteEmojiPack(shortName) {
  if (!window.confirm(`Удалить набор «${shortName}» из админки?`)) {
    return;
  }

  try {
    await api(`/api/emoji/packs/${encodeURIComponent(shortName)}`, {
      method: "DELETE",
    });
    showAlert("Набор удалён", "success");
    await loadEmojiPacks();
  } catch (err) {
    showAlert(err.message || "Не удалось удалить набор");
  }
}

function setChannelLabel(channel) {
  const label = document.getElementById("channel-label");
  if (!label) return;
  label.textContent = channel ? `Публикация в канал ${channel}` : "Публикация в канал";
}

async function loadPosts({ reset = false, selectFirst = false } = {}) {
  if (loadingPosts) return;
  if (!reset && !hasMorePosts) return;

  if (reset) {
    postsOffset = 0;
    posts = [];
    hasMorePosts = true;
    renderPostList();
  }

  loadingPosts = true;
  setPostListLoading(true);

  try {
    const data = await api(`/api/posts?${buildPostsQuery(postsOffset).toString()}`);
    if (!data) return;

    const batch = Array.isArray(data?.posts) ? data.posts : [];
    retentionDays = data?.retention_days ?? retentionDays;
    hasMorePosts = Boolean(data?.has_more);
    postsOffset += batch.length;
    posts = reset ? batch : [...posts, ...batch];

    updateRetentionHint();
    renderPostList();
    setupPostsInfiniteScroll();

    if (selectFirst) {
      if (posts.length) {
        await selectPost(posts[0].id);
      } else {
        currentPostId = null;
        showEditor(false);
      }
    }
  } finally {
    loadingPosts = false;
    setPostListLoading(false);
  }

  await maybeFillPostList();
}

async function reloadPostList({ keepSelection = true } = {}) {
  const selectedId = keepSelection ? currentPostId : null;
  await loadPosts({ reset: true });

  if (selectedId && posts.some((post) => post.id === selectedId)) {
    await selectPost(selectedId);
    return;
  }

  if (posts.length) {
    await selectPost(posts[0].id);
    return;
  }

  currentPostId = null;
  showEditor(false);
}

async function selectPost(id) {
  const post = await api(`/api/posts/${id}`);
  if (!post) return;

  const index = posts.findIndex((p) => p.id === id);
  if (index >= 0) {
    posts[index] = { ...posts[index], ...post };
  }

  currentPostId = post.id;
  document.getElementById("post-title").value = post.title || "";
  document.getElementById("post-content").value = post.content || "";
  window.editorHistory?.reset(post.content || "");
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
  window.postStats?.setPostStatsVisible(isPublished);
  if (isPublished) {
    window.postStats?.loadPostStats(api, post.id);
  }
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

  if (window.leftEditor?.isVisualMode?.()) {
    window.leftEditor.syncToTextarea?.({ force: true, silent: true });
  }

  const content = document.getElementById("post-content").value;
  try {
    if (!content.trim()) {
      const emptyHtml = '<div class="tg-message tg-rich"></div>';
      if (window.previewEditor) {
        window.previewEditor.setHtml(emptyHtml);
      } else {
        document.getElementById("preview-content").innerHTML = emptyHtml;
      }
      return;
    }

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
  const content = getContentForSave();
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
  const content = getContentForSave();
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
  await reloadPostList({ keepSelection: false });
  await selectPost(post.id);
}

function getContentForSave() {
  const textarea = document.getElementById("post-content");
  if (!textarea) return "";

  if (window.leftEditor?.isVisualMode?.()) {
    window.leftEditor.syncToTextarea?.({ force: true, silent: true });
  } else if (window.previewEditor?.isDirty?.()) {
    window.previewEditor.syncToTextarea?.({ silent: true });
  }

  return textarea.value;
}

async function savePost() {
  if (!currentPostId) return;
  const buttonError = window.postButtons?.validateButtonsPayload?.();
  if (buttonError) {
    showAlert(buttonError);
    return;
  }

  const title = document.getElementById("post-title").value;
  const content = getContentForSave();
  const buttons = window.postButtons?.getButtonsPayload() || [];

  await api(`/api/posts/${currentPostId}`, {
    method: "PUT",
    body: JSON.stringify({ title, content, buttons }),
  });

  await reloadPostList();
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
    await reloadPostList();
    await selectPost(currentPostId);
    showAlert("Пост опубликован!", "success");
  } catch (err) {
    showAlert(err.message);
    await reloadPostList();
    if (currentPostId) {
      await selectPost(currentPostId);
    }
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
    await reloadPostList();
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
    await loadPosts({ reset: true, selectFirst: true });
    if (!posts.length) {
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

document.querySelectorAll(".post-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setPostFilter(btn.dataset.filter).catch((err) => {
      showAlert(err.message || "Не удалось загрузить посты");
    });
  });
});

document.getElementById("post-list").addEventListener("click", (event) => {
  const item = event.target.closest(".post-item");
  if (!item?.dataset?.id) return;
  selectPost(Number(item.dataset.id));
});

document.getElementById("settings-form").addEventListener("submit", saveTelegramSettings);
document.getElementById("verify-telegram-btn").addEventListener("click", verifyTelegramSettings);
document.getElementById("emoji-pack-form")?.addEventListener("submit", (event) => {
  importEmojiPack(event).catch((err) => showAlert(err.message || "Не удалось импортировать набор"));
});
document.getElementById("emoji-packs-list")?.addEventListener("click", (event) => {
  const card = event.target.closest(".emoji-pack-card");
  if (!card?.dataset?.pack) return;

  const action = event.target.closest("[data-action]")?.dataset?.action;
  if (action === "refresh-emoji-pack") {
    refreshEmojiPack(card.dataset.pack).catch((err) => showAlert(err.message || "Не удалось обновить набор"));
  }
  if (action === "delete-emoji-pack") {
    deleteEmojiPack(card.dataset.pack).catch((err) => showAlert(err.message || "Не удалось удалить набор"));
  }
});
document.getElementById("tracking-form")?.addEventListener("submit", (event) => {
  window.postStats
    ?.saveTrackingSettings(api, event)
    .catch((err) => showAlert(err.message || "Не удалось сохранить трекер"));
});
document.getElementById("refresh-stats-btn")?.addEventListener("click", () => {
  if (!currentPostId) return;
  window.postStats
    ?.loadPostStats(api, currentPostId)
    .then(() => showAlert("Статистика обновлена", "success"))
    .catch((err) => showAlert(err.message || "Не удалось обновить статистику"));
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  redirectToLogin();
});

init();
