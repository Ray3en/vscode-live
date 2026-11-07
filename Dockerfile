FROM node:22-alpine AS api
WORKDIR /app
COPY --chown=node:node server.js .
USER node
ENV BIND=0.0.0.0 PORT=7341
EXPOSE 7341
CMD ["node","server.js"]

FROM nginx:stable-alpine AS web
COPY deploy/container.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/
COPY extension/efir-0.2.0.vsix /usr/share/nginx/html/efir-0.2.0.vsix
