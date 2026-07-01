async function api(path, options = {}, { redirectOn401 = false } = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (redirectOn401) {
      window.location.href = "/login";
    }
    return null;
  }

  if (!res.ok) {
    throw new Error(data.detail || "Ошибка запроса");
  }
  return data;
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("error");
  errorEl.classList.add("hidden");

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!data) {
      throw new Error("Неверный логин или пароль");
    }
    window.location.href = "/";
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

// Если уже авторизован — редирект на главную (без редиректа при 401)
api("/api/auth/me").then((data) => {
  if (data) window.location.href = "/";
});
