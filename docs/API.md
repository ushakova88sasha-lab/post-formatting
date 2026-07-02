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

```json
{
  "posts": [ { "id": 1, "title": "...", "content": "...", "status": "draft" } ],
  "retention_days": 7
}
```

При запросе списка старые посты (старше `retention_days`) удаляются автоматически.

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

```json
{
  "title": "Заголовок",
  "content": "Текст",
  "buttons": [
    { "text": "Купить", "url": "https://example.com" }
  ]
}
```

Поле `buttons` необязательно. До 10 кнопок; URL только `http://` или `https://`.

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

Время в UTC (ISO 8601). В веб-интерфейсе отображается и вводится как **МСК** (UTC+3).

## Настройки Telegram

### `GET /api/settings/telegram`

Токен (маскированный), канал, статус подключения бота.

### `PUT /api/settings/telegram`

```json
{
  "channel_id": "@my_channel",
  "bot_token": "123456:ABC..."
}
```

Поле `bot_token` можно не передавать, чтобы оставить текущий токен без изменений.

### `POST /api/settings/telegram/verify`

Проверка токена и доступа бота к каналу.

## Кнопки и клики

К посту можно добавить до **10 inline-кнопок**. В Telegram уходит клавиатура с URL-редиректом через сервер.

### Поле `buttons` в посте

```json
{
  "buttons": [
    {
      "id": 1,
      "text": "Купить",
      "url": "https://example.com",
      "position": 0,
      "click_count": 12,
      "track_url": "https://your-server/go/AbCdEf123"
    }
  ]
}
```

- `track_url` — ссылка, которая попадает в Telegram (клики считаются на сервере).
- `click_count` — число переходов по кнопке.

### `GET /go/{token}`

Публичный редирект (без авторизации): записывает клик и перенаправляет на целевой URL.

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
