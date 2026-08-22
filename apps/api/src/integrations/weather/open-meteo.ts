export type ForecastHour = {
  time: string;
  temperature_c: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  weather_code: number;
};

export type DailyForecast = {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_sum_mm: number;
  weather_code: number;
};

export type WeatherForecast = {
  latitude: number;
  longitude: number;
  hourly: ForecastHour[];
  daily: DailyForecast[];
  fetched_at: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: { key: string; at: number; data: WeatherForecast } | undefined;

export function weatherCodeLabel(code: number): string {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code <= 48) return "雾";
  if (code <= 57) return "毛毛雨";
  if (code <= 67) return "雨";
  if (code <= 77) return "雪";
  if (code <= 82) return "阵雨";
  if (code <= 86) return "阵雪";
  if (code <= 99) return "雷暴";
  return "未知";
}

function cacheKey(lat: number, lng: number, hours: number): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}:${hours}`;
}

export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  hours = 24,
): Promise<WeatherForecast> {
  const key = cacheKey(lat, lng, hours);
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "temperature_2m,precipitation,weather_code,windspeed_10m");
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
  );
  url.searchParams.set("forecast_hours", String(Math.min(hours, 72)));
  url.searchParams.set("timezone", "Asia/Shanghai");

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Open-Meteo 请求失败：${res.status} ${body.slice(0, 120)}`);
  }

  const payload = (await res.json()) as {
    latitude: number;
    longitude: number;
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      weather_code?: number[];
      windspeed_10m?: number[];
    };
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_sum?: number[];
      weather_code?: number[];
    };
  };

  const ht = payload.hourly?.time ?? [];
  const hourly: ForecastHour[] = ht.map((time, i) => ({
    time,
    temperature_c: payload.hourly?.temperature_2m?.[i] ?? 0,
    precipitation_mm: payload.hourly?.precipitation?.[i] ?? 0,
    wind_speed_kmh: payload.hourly?.windspeed_10m?.[i] ?? 0,
    weather_code: payload.hourly?.weather_code?.[i] ?? 0,
  }));

  const dt = payload.daily?.time ?? [];
  const daily: DailyForecast[] = dt.map((date, i) => ({
    date,
    temp_max_c: payload.daily?.temperature_2m_max?.[i] ?? 0,
    temp_min_c: payload.daily?.temperature_2m_min?.[i] ?? 0,
    precipitation_sum_mm: payload.daily?.precipitation_sum?.[i] ?? 0,
    weather_code: payload.daily?.weather_code?.[i] ?? 0,
  }));

  const data: WeatherForecast = {
    latitude: payload.latitude,
    longitude: payload.longitude,
    hourly,
    daily,
    fetched_at: new Date().toISOString(),
  };
  cache = { key, at: Date.now(), data };
  return data;
}

export function formatForecastSnippet(forecast: WeatherForecast): string {
  const next = forecast.hourly.slice(0, 6);
  if (next.length === 0) return "暂无逐时预报。";
  const parts = next.map((h) => {
    const hour = h.time.slice(11, 16);
    return `${hour} ${h.temperature_c.toFixed(1)}°C ${weatherCodeLabel(h.weather_code)}`;
  });
  const tomorrow = forecast.daily[1];
  const tomorrowLine = tomorrow
    ? `；明日 ${tomorrow.temp_min_c.toFixed(0)}~${tomorrow.temp_max_c.toFixed(0)}°C ${weatherCodeLabel(tomorrow.weather_code)}`
    : "";
  return `未来几小时：${parts.join("，")}${tomorrowLine}`;
}

export function detectColdWaveAlert(forecast: WeatherForecast): {
  active: boolean;
  message: string;
  min_temp_c: number;
} | null {
  const tomorrow = forecast.daily[1];
  if (!tomorrow) return null;
  if (tomorrow.temp_min_c <= 2) {
    return {
      active: true,
      message: `明晨最低约 ${tomorrow.temp_min_c.toFixed(1)}°C，注意防寒保温。`,
      min_temp_c: tomorrow.temp_min_c,
    };
  }
  const tonight = forecast.hourly.filter((h) => {
    const hour = Number(h.time.slice(11, 13));
    return hour >= 18 || hour <= 6;
  });
  const minTonight = Math.min(...tonight.map((h) => h.temperature_c), Infinity);
  if (Number.isFinite(minTonight) && minTonight <= 5) {
    return {
      active: true,
      message: `今夜最低约 ${minTonight.toFixed(1)}°C，注意检查卷膜与保温。`,
      min_temp_c: minTonight,
    };
  }
  return null;
}

export function detectHeatAlert(forecast: WeatherForecast): {
  active: boolean;
  message: string;
  max_temp_c: number;
} | null {
  const tomorrow = forecast.daily[1];
  if (!tomorrow) return null;
  if (tomorrow.temp_max_c >= 35) {
    return {
      active: true,
      message: `明日最高约 ${tomorrow.temp_max_c.toFixed(1)}°C，注意棚内降温。`,
      max_temp_c: tomorrow.temp_max_c,
    };
  }
  return null;
}

export function formatForecastReply(forecast: WeatherForecast, hours: number): string {
  const slice = forecast.hourly.slice(0, hours);
  const lines = slice.map((h) => {
    const label = weatherCodeLabel(h.weather_code);
    const rain = h.precipitation_mm > 0 ? `，降水 ${h.precipitation_mm.toFixed(1)}mm` : "";
    return `${h.time.slice(0, 16)} ${h.temperature_c.toFixed(1)}°C ${label}，风速 ${h.wind_speed_kmh.toFixed(0)}km/h${rain}`;
  });
  const dailyLines = forecast.daily.slice(0, 3).map((d) => {
    return `${d.date} ${d.temp_min_c.toFixed(0)}~${d.temp_max_c.toFixed(0)}°C ${weatherCodeLabel(d.weather_code)}，降水 ${d.precipitation_sum_mm.toFixed(1)}mm`;
  });
  return [
    `农场坐标 ${forecast.latitude.toFixed(2)}°N ${forecast.longitude.toFixed(2)}°E 天气预报：`,
    ...lines,
    "",
    "逐日：",
    ...dailyLines,
  ].join("\n");
}

export function formatWeatherAlerts(forecast: WeatherForecast): string {
  const alerts: string[] = [];
  const cold = detectColdWaveAlert(forecast);
  const heat = detectHeatAlert(forecast);
  if (cold) alerts.push(`【寒潮/低温】${cold.message}`);
  if (heat) alerts.push(`【高温】${heat.message}`);
  const heavyRain = forecast.daily.some((d) => d.precipitation_sum_mm >= 25);
  if (heavyRain) {
    alerts.push("【强降雨】未来有日降水超过 25mm，注意排水与卷膜。");
  }
  if (alerts.length === 0) {
    return "未来 48 小时暂无显著灾害性天气预警。";
  }
  return alerts.join("\n");
}

export function clearWeatherCacheForTests(): void {
  cache = undefined;
}
