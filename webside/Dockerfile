FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY . ./
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
