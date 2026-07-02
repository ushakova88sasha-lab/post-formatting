(function () {
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function renderMonthlyStats(container, data) {
    if (!container || !data?.months?.length) {
      if (container) {
        container.innerHTML = '<p class="field-hint">Нет данных о публикациях</p>';
      }
      return;
    }

    const maxCount = Math.max(...data.months.map((m) => m.count), 1);
    const bars = data.months
      .map((month) => {
        const height = month.count ? Math.max(12, Math.round((month.count / maxCount) * 100)) : 4;
        return `
          <div class="monthly-stat-item">
            <div class="monthly-stat-bar-wrap" title="${month.count} постов">
              <div class="monthly-stat-bar" style="height:${height}%"></div>
            </div>
            <div class="monthly-stat-count">${month.count}</div>
            <div class="monthly-stat-label">${escapeHtml(month.label)}</div>
          </div>`;
      })
      .join("");

    container.innerHTML = `
      <div class="monthly-stats-summary">Всего за ${data.retention_months} мес.: <strong>${data.total}</strong></div>
      <div class="monthly-stats-chart">${bars}</div>`;
  }

  function renderClickList(title, items, emptyText) {
    if (!items?.length) {
      return `<div class="post-stats-block"><h4>${escapeHtml(title)}</h4><p class="field-hint">${escapeHtml(emptyText)}</p></div>`;
    }

    const rows = items
      .map(
        (item) => `
        <div class="post-stats-row">
          <div class="post-stats-row-main">
            <span class="post-stats-row-label">${escapeHtml(item.text || item.label || item.url)}</span>
            <span class="post-stats-row-url">${escapeHtml(item.url)}</span>
          </div>
          <div class="post-stats-row-meta">
            <span class="post-stats-clicks">${item.click_count} кл.</span>
          </div>
        </div>`
      )
      .join("");

    return `<div class="post-stats-block"><h4>${escapeHtml(title)}</h4>${rows}</div>`;
  }

  function renderPostStats(container, data) {
    if (!container) return;

    if (!data) {
      container.innerHTML = '<p class="field-hint">Не удалось загрузить статистику</p>';
      return;
    }

    const channel = data.channel_stats || {};
    const tgLink = channel.telegram_post_url
      ? `<a href="${escapeHtml(channel.telegram_post_url)}" target="_blank" rel="noopener">Открыть в Telegram</a>`
      : "—";

    const subscribers =
      channel.channel_subscribers_at_publish != null
        ? `<div class="post-stats-metric"><span>Подписчиков на момент публикации</span><strong>${channel.channel_subscribers_at_publish}</strong></div>`
        : "";

    const note = channel.note
      ? `<p class="field-hint post-stats-note">${escapeHtml(channel.note)}</p>`
      : "";

    container.innerHTML = `
      <div class="post-stats-grid">
        <div class="post-stats-metric"><span>Опубликован</span><strong>${escapeHtml(window.moscowTime?.formatMoscowDateTime?.(data.published_at) || data.published_at || "—")}</strong></div>
        <div class="post-stats-metric"><span>Message ID</span><strong>${data.telegram_message_id ?? "—"}</strong></div>
        <div class="post-stats-metric"><span>Пост в Telegram</span><strong>${tgLink}</strong></div>
        ${subscribers}
      </div>
      ${note}
      ${renderClickList("Кнопки", data.buttons, "Кнопок нет")}
      ${renderClickList("Ссылки в тексте", data.links, "Отслеживаемых ссылок в тексте нет")}
      <div class="post-stats-block post-stats-tracking">
        <h4>UTM-трекер</h4>
        <p class="field-hint">${
          data.tracking?.enabled
            ? `utm_source=${escapeHtml(data.tracking.utm_source)}, utm_medium=${escapeHtml(data.tracking.utm_medium)}, utm_campaign=${escapeHtml(data.tracking.utm_campaign)}`
            : "UTM-метки отключены"
        }</p>
      </div>`;
  }

  async function loadMonthlyStats(api) {
    const container = document.getElementById("monthly-stats");
    if (!container) return;
    try {
      const data = await api("/api/settings/stats");
      renderMonthlyStats(container, data);
    } catch {
      container.innerHTML = '<p class="field-hint">Не удалось загрузить статистику</p>';
    }
  }

  async function loadTrackingSettings(api) {
    try {
      const data = await api("/api/settings/tracking");
      if (!data) return;
      document.getElementById("tracking-enabled").checked = !!data.enabled;
      document.getElementById("utm-source").value = data.utm_source || "";
      document.getElementById("utm-medium").value = data.utm_medium || "";
      document.getElementById("utm-campaign").value = data.utm_campaign || "";
    } catch {
      // optional
    }
  }

  async function saveTrackingSettings(api, event) {
    event.preventDefault();
    const payload = {
      enabled: document.getElementById("tracking-enabled").checked,
      utm_source: document.getElementById("utm-source").value.trim(),
      utm_medium: document.getElementById("utm-medium").value.trim(),
      utm_campaign: document.getElementById("utm-campaign").value.trim(),
    };
    await api("/api/settings/tracking", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    window.showPostAlert?.("Настройки трекера сохранены", "success");
  }

  async function loadPostStats(api, postId) {
    const section = document.getElementById("post-stats-section");
    const container = document.getElementById("post-stats-content");
    if (!section || !container || !postId) return null;

    try {
      const data = await api(`/api/posts/${postId}/stats`);
      renderPostStats(container, data);
      return data;
    } catch {
      container.innerHTML = '<p class="field-hint">Статистика недоступна для этого поста</p>';
      return null;
    }
  }

  function setPostStatsVisible(isPublished) {
    const section = document.getElementById("post-stats-section");
    if (section) {
      section.classList.toggle("hidden", !isPublished);
    }
  }

  window.postStats = {
    loadMonthlyStats,
    loadTrackingSettings,
    saveTrackingSettings,
    loadPostStats,
    setPostStatsVisible,
    renderMonthlyStats,
    renderPostStats,
  };
})();
