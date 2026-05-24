FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY . ./
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Download vendor JS/CSS at build time so the page works without internet access.
RUN chmod +x /docker-entrypoint.sh && \
    mkdir -p vendor && \
    wget -q -O vendor/bootstrap.min.css \
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" && \
    wget -q -O vendor/bootstrap.bundle.min.js \
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" && \
    wget -q -O vendor/chart.min.js \
        "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js" && \
    wget -q -O vendor/chartjs-adapter-date-fns.bundle.min.js \
        "https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
