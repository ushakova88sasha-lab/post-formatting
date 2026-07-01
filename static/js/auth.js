const { fetch: authFetch, redirectToApp, clearRedirectGuard } = window.authClient;

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("error");
  errorEl.classList.add("hidden");

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const data = await authFetch(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      { redirectOn401: false }
    );
    if (!data) {
      throw new Error("Неверный логин или пароль");
    }
    clearRedirectGuard();
    redirectToApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

// Уже авторизован — на главную. При 401 остаёмся на /login.
authFetch("/api/auth/me", {}, { redirectOn401: false }).then((data) => {
  if (data) redirectToApp();
});
