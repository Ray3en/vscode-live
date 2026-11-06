# Эфир · production

Скопируйте содержимое этой папки (включая .github) в корень GitHub-репозитория. Push в prod публикует два образа в GHCR с тегом SHA и разворачивает проверенные образы на Ubuntu. Конфигурация рассчитана на x86_64, Docker Engine с Compose v2 (поддержка нескольких --env-file и up --wait) и Nginx на хосте. Пакеты передаются на сервер по SSH, отдельный токен GHCR на сервере не нужен.

## 1. Один раз на Ubuntu

Для пользователя deploy с доступом к Docker:

    sudo install -d -m 750 -o deploy -g deploy /var/www/delo-efir
    sudo -u deploy sh -c 'umask 077; test -e /var/www/delo-efir/.env || printf "HOST_KEY=%s\n" "$(openssl rand -hex 32)" > /var/www/delo-efir/.env'
    sudo -iu deploy docker compose version

Положите публичный ключ деплоя в ~deploy/.ssh/authorized_keys. Секрет HOST_KEY понадобится только ведущим. Для внешнего Nginx выбран свободный локальный порт 18081. Если меняете его, задайте HTTP_PORT в .env и поменяйте upstream в deploy/host.conf.

## 2. GitHub

Создайте Environment production. Добавьте Secrets DEPLOY_HOST, DEPLOY_SSH_KEY (приватный ключ) и DEPLOY_KNOWN_HOSTS (проверенная строка known_hosts для этого сервера; для нестандартного порта имя имеет вид [host]:port). Variables DEPLOY_USER и DEPLOY_PORT по умолчанию равны deploy и 22. Actions должны иметь возможность публиковать пакеты GHCR репозитория.

В существующем проекте переключитесь на prod (git switch prod или git switch -c prod для новой ветки), добавьте файлы архива в корень и проверьте git status. Затем:

    git add .github Dockerfile .dockerignore .gitignore compose.yaml deploy web extension server.js README.md
    git commit -m "Deploy Delo Efir from prod"
    git push -u origin prod

CI поднимает Compose, проверяет HTML и API через Nginx, публикует образы и разворачивает их по SSH. Предыдущая исправная конфигурация хранится в /var/www/delo-efir/current. При ошибке проверки контейнеров скрипт пытается восстановить предыдущий релиз. Образы старых релизов занимают место; сохраняйте образы для нужной глубины отката.

## 3. Внешний домен

Направьте DNS своего поддомена на Ubuntu. Скопируйте deploy/host.conf в /etc/nginx/sites-available/delo-efir, замените efir.example.org на свой поддомен и выполните:

    sudo ln -s /etc/nginx/sites-available/delo-efir /etc/nginx/sites-enabled/delo-efir
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d ВАШ_ПОДДОМЕН
    curl -fsS https://ВАШ_ПОДДОМЕН/healthz

Порт 80 должен быть доступен для выдачи сертификата, 443 — для HTTPS. Промежуточный HTTP-конфиг используется для выпуска сертификата; передавайте ключ ведущего только после настройки HTTPS. Хостовый Nginx и сертификаты настраиваются один раз, workflow их не перезаписывает.

## Что опубликовано

Корень сайта обслуживает браузерный макет. Его демокомнаты продолжают работать в localStorage. Сервер Node отдельно обслуживает HTTP API /rooms для прототипа расширения из extension/. Укажите HTTPS-адрес собственного домена без /rooms при запуске Code Stream: Start. В этой версии расширения ведущий передаёт один документ; зритель использует Code Stream: Join со ссылкой от ведущего. Браузерные комнаты и комнаты расширения пока отдельные. VSIX и публикация в Marketplace в этот workflow не входят. Комнаты API хранятся в памяти и закрываются при перезапуске сервера, в том числе при деплое.
