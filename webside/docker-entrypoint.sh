#!/bin/sh
set -e

# Entrypoint for the static frontend container. This script:
#  - reads a template config (`config.template.js`) if present
#  - substitutes environment variables into that template
#  - emits a concrete `config.js` that the static frontend loads
# The script also attempts to detect a non-loopback IPv4 address so
# containers in local networks can auto-wire to a backend running on
# the host or another container.

: "${OUTDOOR_API_ADDRESS:=https://api.open-meteo.com/v1/forecast}"
: "${INDOOR_API_ADDRESS:=http://localhost:8000/}"
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

if [ -f /usr/share/nginx/html/config.js ]; then
  echo "Using existing config.js in web root; skipping template substitution."
else
  if [ -f /usr/share/nginx/html/config.template.js ]; then
  # Allow overriding backend/frontend IPs via env; if not set, try to detect local IP
  BACKEND_IP=${BACKEND_FIXED_IP:-}
  FRONTEND_IP=${FRONTEND_FIXED_IP:-}

  if [ -z "$BACKEND_IP" ]; then
    # detect non-loopback IPv4
    BACKEND_IP=$(ip -4 addr show scope global | awk '/inet/ {print $2; exit}' | cut -d/ -f1)
  fi
  if [ -z "$FRONTEND_IP" ]; then
    FRONTEND_IP=$(ip -4 addr show scope global | awk '/inet/ {print $2; exit}' | cut -d/ -f1)
  fi

  # If BACKEND_FIXED_IP provided, use it as the API address; otherwise use detected BACKEND_IP
  if [ -n "$BACKEND_FIXED_IP" ]; then
    INDOOR_API_ADDR="http://${BACKEND_FIXED_IP}:8000/"
  else
    INDOOR_API_ADDR="http://${BACKEND_IP}:8000/"
  fi

  # Export so envsubst can replace placeholders
  export OUTDOOR_API_ADDRESS INDOOR_API_ADDR INDOOR_API_ENDPOINT_CURRENT INDOOR_API_ENDPOINT_RANGE INDOOR_API_PARAM_START INDOOR_API_PARAM_END INDOOR_API_PARAM_INTERVAL INDOOR_DATA_MAX_AGE POSITION_LAT POSITION_LON REFRESH_INTERVAL_MS TEMP_THRESHOLD_COLD_VALUE TEMP_THRESHOLD_COLD_COLOR TEMP_THRESHOLD_COOL_VALUE TEMP_THRESHOLD_COOL_COLOR TEMP_THRESHOLD_NORMAL_VALUE TEMP_THRESHOLD_NORMAL_COLOR TEMP_THRESHOLD_WARM_VALUE TEMP_THRESHOLD_WARM_COLOR

    # Generate config.js using the computed INDOOR_API_ADDR and other env vars
    envsubst < /usr/share/nginx/html/config.template.js | sed "s|\${INDOOR_API_ADDRESS}|${INDOOR_API_ADDR}|g" > /usr/share/nginx/html/config.js
  fi
fi

exec nginx -g "daemon off;"
