#!/bin/sh
set -e

# Entrypoint for the static frontend container. This script:
#  - reads a template config (`config.template.js`) if present
#  - substitutes environment variables into that template
#  - emits a concrete `config.js` that the static frontend loads
# All API endpoints are configured via environment variables or taken from
# the defaults below. To override, pass the desired env var to `docker run`.

: "${OUTDOOR_API_ADDRESS:=https://api.open-meteo.com/v1/forecast}"
: "${INDOOR_API_ADDRESS:=https://jimajer.cz/tempAPI/}"
: "${INDOOR_API_ENDPOINT_CURRENT:=getCurrent}"
: "${INDOOR_API_ENDPOINT_RANGE:=getPast}"
: "${INDOOR_API_PARAM_START:=start}"
: "${INDOOR_API_PARAM_END:=end}"
: "${INDOOR_API_PARAM_INTERVAL:=interval}"
: "${INDOOR_DATA_MAX_AGE:=60}"
: "${POSITION_LAT:=50.0000}"
: "${POSITION_LON:=15.0000}"
: "${REFRESH_INTERVAL_MS:=15000}"
: "${TEMP_THRESHOLD_COLD_VALUE:=15}"
: "${TEMP_THRESHOLD_COLD_COLOR:=#0000CC}"
: "${TEMP_THRESHOLD_COOL_VALUE:=20}"
: "${TEMP_THRESHOLD_COOL_COLOR:=#00CCCC}"
: "${TEMP_THRESHOLD_NORMAL_VALUE:=25}"
: "${TEMP_THRESHOLD_NORMAL_COLOR:=#00CC00}"
: "${TEMP_THRESHOLD_WARM_VALUE:=30}"
: "${TEMP_THRESHOLD_WARM_COLOR:=#CCCC00}"

if [ -f /usr/share/nginx/html/config.template.js ]; then
  export OUTDOOR_API_ADDRESS INDOOR_API_ADDRESS INDOOR_API_ENDPOINT_CURRENT INDOOR_API_ENDPOINT_RANGE INDOOR_API_PARAM_START INDOOR_API_PARAM_END INDOOR_API_PARAM_INTERVAL INDOOR_DATA_MAX_AGE POSITION_LAT POSITION_LON REFRESH_INTERVAL_MS TEMP_THRESHOLD_COLD_VALUE TEMP_THRESHOLD_COLD_COLOR TEMP_THRESHOLD_COOL_VALUE TEMP_THRESHOLD_COOL_COLOR TEMP_THRESHOLD_NORMAL_VALUE TEMP_THRESHOLD_NORMAL_COLOR TEMP_THRESHOLD_WARM_VALUE TEMP_THRESHOLD_WARM_COLOR
  envsubst < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js
  echo "Generated config.js from template."
else
  echo "No config.template.js found; using baked-in config.js."
fi

exec nginx -g "daemon off;"
