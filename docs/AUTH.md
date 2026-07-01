# Авторизация и редиректы

## Проблема, которую нельзя повторять

Цикл `/` ↔ `/login` возникает, если:
- главная страница при **любой** ошибке делает `redirectToLogin()`;
- страница логина при успешной сессии делает `redirectToApp()`;
- API временно падает (БД, сеть) — пользователь попадает в бесконечный цикл.

## Правила фронтенда

1. **Редиректы только через** `static/js/auth-utils.js` (`window.authClient`).
2. **На `/login`** нельзя редиректить на `/login`.
3. **На `/`** редирект на `/login` **только при HTTP 401**.
4. **Ошибки 500, сеть, пустой список постов** — показывать сообщение, **не** редиректить на логин.
5. **Не использовать** `window.location.href = "/login"` или `"/"` в других JS-файлах.

## API

```javascript
const { fetch: authFetch, redirectToLogin, redirectToApp } = window.authClient;

// Главная: 401 → /login
await authFetch("/api/posts");

// Логин: 401 → остаёмся на странице
await authFetch("/api/auth/login", { ... }, { redirectOn401: false });
```

## Защита от цикла

`auth-utils.js` считает частые редиректы в `sessionStorage` и блокирует цикл, показывая сообщение на странице.

## CI

Перед деплоем запускается:

```bash
bash scripts/check-auth-redirects.sh
pytest -q
```

Workflow: `.github/workflows/ci.yml`

## Cookie сессии

При логине cookie `session` всегда с `path=/` (см. `app/routers/auth.py`).
