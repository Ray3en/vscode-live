# Эфир · production

Скопируйте содержимое этой папки (включая .github) в корень GitHub-репозитория. Push в prod публикует два образа в GHCR с тегом SHA и разворачивает проверенные образы на Ubuntu. Конфигурация рассчитана на x86_64, Docker Engine с Compose v2 (поддержка нескольких --env-file и up --wait) и Nginx на хосте. Пакеты передаются на сервер по SSH, отдельный токен GHCR на сервере не нужен.

## 1. Один раз на Ubuntu

Для пользователя deploy с доступом к Docker:

    sudo -iu deploy docker compose version

Положите публичный ключ деплоя в ~deploy/.ssh/authorized_keys. Каталог `DEPLOY_DIR` и файл `.env` создаются workflow при первом деплое; SSH-пользователь должен иметь право записи в родительский каталог. Секрет HOST_KEY понадобится только ведущим. Для внешнего Nginx выбран свободный локальный порт 18081. Если меняете его, задайте HTTP_PORT в .env и поменяйте upstream в deploy/host.conf.

## 2. GitHub

Создайте Environment `production` и добавьте в него пять Secrets:

- `DEPLOY_DIR` — каталог на сервере, например `/var/www/vscode-live`;
- `SSH_HOST` — DNS-имя или IP-адрес сервера;
- `SSH_USER` — SSH-пользователь, например `deploy`;
- `PRIVATE_KEY` — приватный SSH-ключ целиком, включая строки `BEGIN` и `END`;
- `ENV` — содержимое серверного `.env`, например `HOST_KEY=...`. Workflow записывает его только если `.env` отсутствует или пуст.

Workflow рассчитан на стандартный SSH-порт 22 и при деплое сам добавляет ключ хоста в `known_hosts`. Собранные Docker-образы передаются на сервер напрямую по SSH, без публикации в GHCR.

В существующем проекте переключитесь на prod (git switch prod или git switch -c prod для новой ветки), добавьте файлы архива в корень и проверьте git status. Затем:

    git add .github Dockerfile .dockerignore .gitignore compose.yaml deploy web extension server.js README.md
    git commit -m "Deploy vscode-live from prod"
    git push -u origin prod

CI поднимает Compose, проверяет HTML и API через Nginx, передаёт образы и разворачивает их по SSH. Предыдущая исправная конфигурация хранится в /var/www/vscode-live/current. При ошибке проверки контейнеров скрипт пытается восстановить предыдущий релиз. Образы старых релизов занимают место; сохраняйте образы для нужной глубины отката.

## 3. Внешний домен

Направьте DNS своего поддомена на Ubuntu. Скопируйте deploy/host.conf в /etc/nginx/sites-available/vscode-live, замените efir.example.org на свой поддомен и выполните:

    sudo ln -s /etc/nginx/sites-available/vscode-live /etc/nginx/sites-enabled/vscode-live
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d ВАШ_ПОДДОМЕН
    curl -fsS https://ВАШ_ПОДДОМЕН/healthz

Порт 80 должен быть доступен для выдачи сертификата, 443 — для HTTPS. Промежуточный HTTP-конфиг используется для выпуска сертификата; передавайте ключ ведущего только после настройки HTTPS. Хостовый Nginx и сертификаты настраиваются один раз, workflow их не перезаписывает.

## Комнаты и VS Code

Браузер и расширение VS Code используют общие серверные комнаты. Преподаватель создаёт комнату, получает шестизначный код и может изменять набор файлов. Студент вводит этот код и получает read-only представление. После восстановления соединения загружается актуальная версия.

Скачайте `/efir-0.2.0.vsix` со своего сервера и установите через `Extensions: Install from VSIX…`. В настройке `Эфир: Server Url` укажите адрес сервера, например `http://IP_СЕРВЕРА` или `https://ДОМЕН`.

Команды: `Эфир: Создать комнату`, `Эфир: Войти по коду`, `Эфир: Открыть файл` и `Эфир: Завершить`.

Комнаты хранятся в памяти сервера, удаляются после 12 часов бездействия и не переживают перезапуск API.
