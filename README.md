# Эфир · production

Скопируйте содержимое этой папки (включая .github) в корень GitHub-репозитория. Push в prod публикует два образа в GHCR с тегом SHA и разворачивает проверенные образы на Ubuntu. Конфигурация рассчитана на x86_64, Docker Engine с Compose v2 (поддержка нескольких --env-file и up --wait) и Nginx на хосте. Пакеты передаются на сервер по SSH, отдельный токен GHCR на сервере не нужен.

## 1. Один раз на Ubuntu

Для пользователя deploy с доступом к Docker:

    sudo install -d -m 750 -o deploy -g deploy /var/www/vscode-live
    sudo -u deploy sh -c 'umask 077; test -e /var/www/vscode-live/.env || printf "HOST_KEY=%s\n" "$(openssl rand -hex 32)" > /var/www/vscode-live/.env'
    sudo -iu deploy docker compose version

Положите публичный ключ деплоя в ~deploy/.ssh/authorized_keys. Секрет HOST_KEY понадобится только ведущим. Для внешнего Nginx выбран свободный локальный порт 18081. Если меняете его, задайте HTTP_PORT в .env и поменяйте upstream в deploy/host.conf.

## 2. GitHub

Создайте Environment `production` и добавьте в него четыре Secrets:

- `DEPLOY_DIR` — каталог на сервере, например `/var/www/vscode-live`;
- `SSH_HOST` — DNS-имя или IP-адрес сервера;
- `SSH_USER` — SSH-пользователь, например `deploy`;
- `PRIVATE_KEY` — приватный SSH-ключ целиком, включая строки `BEGIN` и `END`.

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

## Что опубликовано

Корень сайта обслуживает браузерный макет. Его демокомнаты продолжают работать в localStorage. Сервер Node отдельно обслуживает HTTP API /rooms для прототипа расширения из extension/. Укажите HTTPS-адрес собственного домена без /rooms при запуске Code Stream: Start. В этой версии расширения ведущий передаёт один документ; зритель использует Code Stream: Join со ссылкой от ведущего. Браузерные комнаты и комнаты расширения пока отдельные. VSIX и публикация в Marketplace в этот workflow не входят. Комнаты API хранятся в памяти и закрываются при перезапуске сервера, в том числе при деплое.
