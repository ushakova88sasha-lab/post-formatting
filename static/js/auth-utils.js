/** Общие хелперы навигации для авторизации. */
function redirectToLogin() {
  const path = window.location.pathname;
  if (path !== "/login" && !path.endsWith("/login")) {
    window.location.assign("/login");
  }
}

function redirectToApp() {
  const path = window.location.pathname;
  if (path === "/login" || path.endsWith("/login")) {
    window.location.assign("/");
  }
}
