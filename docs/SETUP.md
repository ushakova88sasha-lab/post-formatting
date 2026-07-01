# Установка и деплой на VPS

## Требования

- Ubuntu 22.04+ / Debian 12+ (или аналог)
- Python 3.11+
- Домен или IP сервера (опционально — nginx + HTTPS)

## 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git nginx
```

## 2. Клонирование проекта

```bash
cd /opt
sudo git clone https://github.com/ushakova88sasha-lab/post-formatting.git
sudo chown -R $USER:$USER post-formatting
cd post-formatting
```

## 3. Настройка окружения

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
nano .env
```

### Параметры `.env`

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен от [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHANNEL_ID` | `@username_канала` или числовой ID `-1001234567890` |
| `ADMIN_USERNAME` | Логин для входа в панель |
| `ADMIN_PASSWORD` | Пароль (используйте сложный) |
| `SESSION_SECRET` | Случайная строка 32+ символов |
| `HOST` | `0.0.0.0` |
| `PORT` | `8000` |

### Как узнать ID канала

1. Добавьте бота администратором канала с правом публикации сообщений.
2. Укажите `@username` публичного канала в `TELEGRAM_CHANNEL_ID`.
3. Для приватного канала: перешлите любое сообщение из канала боту [@userinfobot](https://t.me/userinfobot) или используйте `@username`, если он есть.

## 4. Проверка запуска

```bash
source venv/bin/activate
python run.py
```

Откройте `http://ВАШ_IP:8000/login`. После проверки остановите процесс (`Ctrl+C`).

## 5. Systemd-сервис

Создайте файл `/etc/systemd/system/telegram-admin.service`:

```ini
[Unit]
Description=Telegram Post Admin
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/post-formatting
Environment=PATH=/opt/post-formatting/venv/bin
ExecStart=/opt/post-formatting/venv/bin/python run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/post-formatting
sudo systemctl daemon-reload
sudo systemctl enable telegram-admin
sudo systemctl start telegram-admin
sudo systemctl status telegram-admin
```

## 6. Nginx (рекомендуется)

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/telegram-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS через Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d admin.example.com
```

## 7. Резервное копирование

Достаточно бэкапить:

- `data/posts.db` — все посты и расписание
- `.env` — секреты (храните отдельно и безопасно)

## Обновление

```bash
cd /opt/post-formatting
git pull
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart telegram-admin
```

## Автодеплой (GitHub Actions)

При каждом `push` в ветку `cursor/telegram-admin-panel-684e` сайт на VPS обновляется автоматически.

### Секреты в GitHub

**Settings → Secrets and variables → Actions:**

| Secret | Значение |
|--------|----------|
| `VPS_HOST` | IP сервера, например `159.194.203.99` |
| `VPS_USER` | `root` |
| `VPS_SSH_PASSWORD` | пароль SSH |

На VPS должен быть включён вход по паролю (`PasswordAuthentication yes` в `/etc/ssh/sshd_config`).

### Ручной запуск

**Actions → Deploy to VPS → Run workflow**

### Что делает workflow

1. Подключается к VPS по SSH
2. `git pull` ветки, из которой был push
3. `pip install -r requirements.txt`
4. `systemctl restart telegram-admin`

## Почему SQLite, а не «без БД»

Для отложенной публикации нужно где-то хранить посты и время отправки. SQLite — это один файл на диске, без отдельного сервера PostgreSQL/MySQL. При перезапуске сервиса планировщик подхватывает неотправленные посты из базы.
