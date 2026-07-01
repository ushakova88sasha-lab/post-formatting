let currentPostId = null;
let posts = [];
let previewTimer = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    redirectToLogin();
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg || d).join(", ")
      : data.detail;
    throw new Error(detail || "Ошибка запроса");
  }
  return data;
}

function showAlert(message, type = "error") {
  const el = document.getElementById("alert");
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

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
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      <div class="post-item-title">${escapeHtml(p.title || "Без названия")}</div>
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

function setChannelLabel(channel) {
  const label = document.getElementById("channel-label");
  if (!label) return;
  label.textContent = channel ? `Публикация в канал ${channel}` : "Публикация в канал";
}

async function loadPosts() {
  const data = await api("/api/posts");
  posts = Array.isArray(data) ? data : [];
  renderPostList();
}

async function selectPost(id) {
  const post = posts.find((p) => p.id === id) || (await api(`/api/posts/${id}`));
  if (!post) return;

  currentPostId = post.id;
  document.getElementById("post-title").value = post.title || "";
  document.getElementById("post-content").value = post.content || "";

  if (post.scheduled_at) {
    const d = new Date(post.scheduled_at);
    document.getElementById("schedule-at").value = toLocalDatetime(d);
  } else {
    document.getElementById("schedule-at").value = "";
  }

  const isPublished = post.status === "published";
  document.getElementById("post-content").readOnly = isPublished;
  document.getElementById("post-title").readOnly = isPublished;
  document.getElementById("publish-btn").disabled = isPublished;
  document.getElementById("schedule-btn").disabled = isPublished;
  document.getElementById("save-btn").disabled = isPublished;
  if (window.editorToolbar) {
    window.editorToolbar.setToolbarEnabled(!isPublished);
  }

  showEditor(true);
  renderPostList();
  updatePreview();
}

function toLocalDatetime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function updatePreview() {
  const content = document.getElementById("post-content").value;
  try {
    const data = await api("/api/posts/preview", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (data) {
      document.getElementById("preview-content").innerHTML = data.html;
    }
  } catch {
    document.getElementById("preview-content").innerHTML =
      '<div class="tg-message"><p class="empty">Ошибка превью</p></div>';
  }
}

async function createPost() {
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
  const title = document.getElementById("post-title").value;
  const content = document.getElementById("post-content").value;

  await api(`/api/posts/${currentPostId}`, {
    method: "PUT",
    body: JSON.stringify({ title, content }),
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

  const localDate = new Date(value);
  const scheduled_at = localDate.toISOString();

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

async function bootstrap() {
  try {
    await init();
  } catch {
    redirectToLogin();
  }
}

document.getElementById("post-content").addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
});

document.getElementById("new-post-btn").addEventListener("click", createPost);
document.getElementById("empty-new-btn").addEventListener("click", createPost);
document.getElementById("save-btn").addEventListener("click", savePost);
document.getElementById("publish-btn").addEventListener("click", publishPost);
document.getElementById("schedule-btn").addEventListener("click", schedulePost);

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  redirectToLogin();
});

bootstrap();
