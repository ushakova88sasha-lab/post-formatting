---
tags:
  - telegram-admin
  - api
---

# API

Базовый URL: `http://localhost:8000` (прод: `:8000` на VPS)

Все `/api/*` (кроме логина) требуют cookie `session`.

См. также: [[Настройки и хранение]], [[Авторизация]]

## Авторизация

| Метод | Путь |
|-------|------|
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |

## Посты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/posts` | Список + `retention_days`; старые посты удаляются |
| POST | `/api/posts` | Создать черновик |
| GET | `/api/posts/{id}` | Один пост |
| PUT | `/api/posts/{id}` | Обновить (не `published`) |
| DELETE | `/api/posts/{id}` | Удалить |
| POST | `/api/posts/preview` | HTML превью |
| POST | `/api/posts/{id}/publish` | Опубликовать |
| POST | `/api/posts/{id}/schedule` | Запланировать (`scheduled_at` UTC) |

### `GET /api/posts` — пример ответа

```json
{
  "posts": [{ "id": 1, "title": "...", "status": "draft" }],
  "retention_days": 7
}
```

## Настройки Telegram

| Метод | Путь |
|-------|------|
| GET | `/api/settings/telegram` |
| PUT | `/api/settings/telegram` |
| POST | `/api/settings/telegram/verify` |

## Статусы поста

| Статус | Описание |
|--------|----------|
| `draft` | Черновик |
| `scheduled` | Запланирован |
| `published` | В канале |
| `failed` | Ошибка отправки |

## Health

`GET /health` → `status`, `bot_connected`, `bot_username`, `channel`

Swagger: `/docs`
