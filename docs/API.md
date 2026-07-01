# API

Базовый URL: `http://localhost:8000`

Все эндпоинты `/api/*` (кроме логина) требуют cookie-сессии после авторизации.

## Авторизация

### `POST /api/auth/login`

```json
{
  "username": "admin",
  "password": "your_password"
}
```

Ответ: `{ "ok": true, "username": "admin" }` + cookie `session`.

### `POST /api/auth/logout`

Требует сессию. Удаляет cookie.

### `GET /api/auth/me`

```json
{ "username": "admin" }
```

## Посты

### `GET /api/posts`

Список постов (новые сверху).

### `POST /api/posts`

Создать черновик.

```json
{
  "title": "Заголовок",
  "content": "Текст в **Markdown**"
}
```

### `GET /api/posts/{id}`

Один пост.

### `PUT /api/posts/{id}`

Обновить черновик или запланированный пост. Опубликованные редактировать нельзя.

### `DELETE /api/posts/{id}`

Удалить пост. Запланированная задача отменяется.

### `POST /api/posts/preview`

Превью HTML для Telegram.

```json
{ "content": "**Привет**" }
```

Ответ: `{ "html": "<div class=\"tg-message\">...</div>" }`

### `POST /api/posts/{id}/publish`

Немедленная публикация в канал.

### `POST /api/posts/{id}/schedule`

Запланировать публикацию.

```json
{
  "scheduled_at": "2026-07-01T15:30:00Z"
}
```

Время в UTC (ISO 8601). В веб-интерфейсе локальное время конвертируется автоматически.

## Статусы поста

| Статус | Описание |
|--------|----------|
| `draft` | Черновик |
| `scheduled` | Ожидает публикации |
| `published` | Отправлен в канал |
| `failed` | Ошибка при отправке |

## Health

### `GET /health`

```json
{
  "status": "ok",
  "bot_connected": true,
  "bot_username": "your_bot"
}
```

## Swagger

Интерактивная документация: `http://localhost:8000/docs`
