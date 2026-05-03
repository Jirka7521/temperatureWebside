// Auto-generated from environment variables at container start
window.inlineConfig = {
  temperatureThresholds: {
    cold:   { value: ${TEMP_THRESHOLD_COLD_VALUE}, color: "${TEMP_THRESHOLD_COLD_COLOR}" },
    cool:   { value: ${TEMP_THRESHOLD_COOL_VALUE}, color: "${TEMP_THRESHOLD_COOL_COLOR}" },
    normal: { value: ${TEMP_THRESHOLD_NORMAL_VALUE}, color: "${TEMP_THRESHOLD_NORMAL_COLOR}" },
    warm:   { value: ${TEMP_THRESHOLD_WARM_VALUE}, color: "${TEMP_THRESHOLD_WARM_COLOR}" }
  },

  apiAddress: "${OUTDOOR_API_ADDRESS}",
  indoorApiAddress: "${INDOOR_API_ADDRESS}",
  indoorApiEndpointCurrent: "${INDOOR_API_ENDPOINT_CURRENT}",
  indoorApiEndpointRange: "${INDOOR_API_ENDPOINT_RANGE}",

  indoorApiParams: {
    start: "${INDOOR_API_PARAM_START}",
    end: "${INDOOR_API_PARAM_END}",
    interval: "${INDOOR_API_PARAM_INTERVAL}"
  },

  indoorDataMaxAge: ${INDOOR_DATA_MAX_AGE},
  position: { latitude: ${POSITION_LAT}, longitude: ${POSITION_LON} },
  refreshInterval: ${REFRESH_INTERVAL_MS}
};
