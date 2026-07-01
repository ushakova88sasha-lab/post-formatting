/**
 * AUTH NAVIGATION — единственное место для редиректов между / и /login.
 *
 * Правила (обязательны для всех изменений фронтенда):
 * 1. Не использовать window.location.* для /login и / в других файлах.
 * 2. На /login редирект на /login запрещён.
 * 3. На / редирект на /login только при HTTP 401, не в catch-all.
 * 4. Ошибки загрузки данных (500, сеть) не должны отправлять на /login.
 */
(function () {
  const AUTH_LOGIN_PATH = "/login";
  const AUTH_APP_PATH = "/";
  const REDIRECT_GUARD_KEY = "tg_admin_redirect_guard";
  const REDIRECT_WINDOW_MS = 8000;
  const REDIRECT_MAX_IN_WINDOW = 4;

  function isLoginPage() {
    const path = window.location.pathname;
    return path === AUTH_LOGIN_PATH || path.endsWith(AUTH_LOGIN_PATH);
  }

  function readRedirectGuard() {
    try {
      const raw = sessionStorage.getItem(REDIRECT_GUARD_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeRedirectGuard(data) {
    try {
      sessionStorage.setItem(REDIRECT_GUARD_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function canRedirect(target) {
    const now = Date.now();
    const guard = readRedirectGuard();
    const recent = (guard[target] || []).filter((ts) => now - ts < REDIRECT_WINDOW_MS);
    if (recent.length >= REDIRECT_MAX_IN_WINDOW) {
      return false;
    }
    recent.push(now);
    guard[target] = recent;
    writeRedirectGuard(guard);
    return true;
  }

  function showRedirectLoopBlocked() {
    const banner = document.createElement("div");
    banner.className = "auth-loop-banner";
    banner.textContent =
      "Обнаружен цикл переходов. Очистите cookies сайта или откройте страницу в новой вкладке.";
    document.body.prepend(banner);
  }

  function redirectToLogin() {
    if (isLoginPage()) return;
    if (!canRedirect("login")) {
      showRedirectLoopBlocked();
      return;
    }
    window.location.assign(AUTH_LOGIN_PATH);
  }

  function redirectToApp() {
    if (!isLoginPage()) return;
    if (!canRedirect("app")) {
      showRedirectLoopBlocked();
      return;
    }
    window.location.assign(AUTH_APP_PATH);
  }

  async function authFetch(path, options = {}, { redirectOn401 = true } = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      if (redirectOn401) {
        redirectToLogin();
      }
      return null;
    }

    if (!res.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg || item).join(", ")
        : data.detail;
      throw new Error(detail || "Ошибка запроса");
    }

    return data;
  }

  function clearRedirectGuard() {
    try {
      sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    } catch {
      /* ignore */
    }
  }

  window.authClient = {
    fetch: authFetch,
    redirectToLogin,
    redirectToApp,
    clearRedirectGuard,
    isLoginPage,
  };

  // Обратная совместимость для существующих вызовов
  window.redirectToLogin = redirectToLogin;
  window.redirectToApp = redirectToApp;
})();
