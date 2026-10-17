"use strict";

const ENDPOINTS = {
  geocode: "https://geocoding-api.open-meteo.com/v1/search?name=",
  forecast: "https://api.open-meteo.com/v1/forecast?latitude="
};

const FIELDS = {
  current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure",
  hourly: "temperature_2m,weather_code,visibility",
  daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max"
};

const DEFAULT_CITY = "Karachi";
const OTHER_CITIES = ["Dubai", "Sydney", "New York", "Athens"];
const REQUEST_TIMEOUT_MS = 10000;
const HOURS_SHOWN = 24;

const FALLBACK_WEATHER = { label: "Unknown conditions", day: "fa-cloud", night: "fa-cloud", tone: "cloud" };
const WEATHER_CODES = new Map();

[
  [[0], { label: "Clear sky", day: "fa-sun", night: "fa-moon", tone: "sun", nightTone: "moon" }],
  [[1], { label: "Mainly clear", day: "fa-sun", night: "fa-moon", tone: "sun", nightTone: "moon" }],
  [[2], { label: "Partly cloudy", day: "fa-cloud-sun", night: "fa-cloud-moon", tone: "mixed", nightTone: "moon" }],
  [[3], { label: "Overcast", day: "fa-cloud", night: "fa-cloud", tone: "cloud" }],
  [[45, 48], { label: "Foggy", day: "fa-smog", night: "fa-smog", tone: "cloud" }],
  [[51, 53, 55], { label: "Drizzle", day: "fa-cloud-sun-rain", night: "fa-cloud-moon-rain", tone: "rain" }],
  [[56, 57], { label: "Freezing drizzle", day: "fa-cloud-rain", night: "fa-cloud-rain", tone: "rain" }],
  [[61], { label: "Light rain", day: "fa-cloud-rain", night: "fa-cloud-rain", tone: "rain" }],
  [[63, 65], { label: "Rain", day: "fa-cloud-showers-heavy", night: "fa-cloud-showers-heavy", tone: "rain" }],
  [[66, 67], { label: "Freezing rain", day: "fa-cloud-showers-heavy", night: "fa-cloud-showers-heavy", tone: "rain" }],
  [[71, 73, 75, 77], { label: "Snow", day: "fa-snowflake", night: "fa-snowflake", tone: "snow" }],
  [[80, 81, 82], { label: "Rain showers", day: "fa-cloud-sun-rain", night: "fa-cloud-moon-rain", tone: "rain" }],
  [[85, 86], { label: "Snow showers", day: "fa-snowflake", night: "fa-snowflake", tone: "snow" }],
  [[95], { label: "Thunderstorm", day: "fa-cloud-bolt", night: "fa-cloud-bolt", tone: "storm" }],
  [[96, 99], { label: "Thunderstorm with hail", day: "fa-cloud-bolt", night: "fa-cloud-bolt", tone: "storm" }]
].forEach(([codes, meta]) => codes.forEach((code) => WEATHER_CODES.set(code, meta)));

const WIND_SCALE = [[1, "Calm"], [6, "Light air"], [12, "Light breeze"], [20, "Gentle breeze"], [29, "Moderate breeze"], [39, "Fresh breeze"], [Infinity, "Strong wind"]];
const UV_SCALE = [[3, "Low"], [6, "Moderate"], [8, "High"], [11, "Very high"], [Infinity, "Extreme"]];
const HUMIDITY_SCALE = [[30, "Dry"], [60, "Comfortable"], [80, "Humid"], [Infinity, "Very humid"]];
const PRESSURE_SCALE = [[1000, "Low"], [1020, "Steady"], [Infinity, "High"]];
const VISIBILITY_SCALE = [[1000, "Very poor"], [4000, "Poor"], [10000, "Moderate"], [Infinity, "Clear"]];

class AppError extends Error {
  constructor(message, retryable = true) {
    super(message);
    this.name = "AppError";
    this.retryable = retryable;
  }
}

const $ = (id) => document.getElementById(id);

const dom = {
  form: $("search-form"),
  input: $("city-input"),
  dashboard: $("dashboard"),
  errorBar: $("error-bar"),
  errorMessage: $("error-message"),
  retry: $("retry-button"),
  live: $("live-region"),
  tablist: document.querySelector(".tabs"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  hourly: $("hourly-track"),
  weekly: $("weekly-track"),
  heroIcon: $("hero-icon"),
  sunCard: $("sun-card"),
  cityList: $("city-list")
};

const state = {
  controller: null,
  hasData: false,
  lastQuery: DEFAULT_CITY,
  place: null
};

const locationCache = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const setText = (id, text) => {
  $(id).textContent = text;
};

const createNode = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const orDash = (value, format) => (Number.isFinite(value) ? format(value) : "--");
const scaleLabel = (value, scale) => scale.find(([limit]) => value < limit)[1];
const formatTemp = (value) => orDash(value, (v) => `${Math.round(v)}°`);
const formatHour = (iso) => {
  const hour = Number(iso.slice(11, 13));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
};
const parseDay = (isoDate) => new Date(`${isoDate}T12:00:00`);

function isDaytime(iso, daily) {
  const index = daily.time.indexOf(iso.slice(0, 10));
  if (index === -1 || !daily.sunrise?.[index] || !daily.sunset?.[index]) return true;
  return iso >= daily.sunrise[index] && iso < daily.sunset[index];
}

function describe(code, daytime) {
  const meta = WEATHER_CODES.get(code) ?? FALLBACK_WEATHER;
  return {
    label: meta.label,
    icon: daytime ? meta.day : meta.night,
    tone: daytime ? meta.tone : meta.nightTone ?? meta.tone
  };
}

function createIcon(weather) {
  const icon = createNode("i", `fa-solid ${weather.icon} tone tone-${weather.tone}`);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

async function fetchJson(url, signal) {
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");

  const requestController = new AbortController();
  const relayAbort = () => requestController.abort();
  const timer = setTimeout(relayAbort, REQUEST_TIMEOUT_MS);
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const response = await fetch(url, {
      signal: requestController.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new AppError(`The weather service responded with status ${response.status}. Please try again shortly.`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      if (signal?.aborted) throw error;
      throw new AppError("The request timed out. Check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new AppError("Network connection lost. Check your internet connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

async function getLocation(city, signal) {
  const key = city.toLowerCase();
  if (locationCache.has(key)) return locationCache.get(key);

  const url = ENDPOINTS.geocode + encodeURIComponent(city) + "&count=1&language=en&format=json";
  const data = await fetchJson(url, signal);
  const match = Array.isArray(data?.results) ? data.results[0] : undefined;

  if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
    throw new AppError(`No location found for "${city}". Check the spelling or try a nearby city.`, false);
  }

  const location = {
    name: match.name,
    country: match.country ?? "",
    latitude: match.latitude,
    longitude: match.longitude
  };

  locationCache.set(key, location);
  return location;
}

async function getForecast({ latitude, longitude }, signal) {
  const url =
    ENDPOINTS.forecast + latitude +
    "&longitude=" + longitude +
    "&current=" + FIELDS.current +
    "&hourly=" + FIELDS.hourly +
    "&daily=" + FIELDS.daily +
    "&timezone=auto";

  const data = await fetchJson(url, signal);

  if (!data?.current || !data?.daily?.time?.length || !data?.hourly?.time?.length) {
    throw new AppError("The weather service returned incomplete data. Please try again.");
  }

  return data;
}

function createPill({ label, weather, temp, low, active }) {
  const item = createNode("li", active ? "pill is-active" : "pill");
  if (active) item.setAttribute("aria-current", "true");

  item.append(
    createNode("span", "pill-label", label),
    createIcon(weather),
    createNode("span", "sr-only", weather.label),
    createNode("span", "pill-temp", formatTemp(temp))
  );

  if (Number.isFinite(low)) item.append(createNode("span", "pill-low", formatTemp(low)));
  return item;
}

function renderHero(place, data, daytime) {
  const { current, daily } = data;
  const weather = describe(current.weather_code, daytime);

  setText("place-name", [place.name, place.country].filter(Boolean).join(", "));
  setText("current-temp", orDash(current.temperature_2m, (v) => String(Math.round(v))));
  setText("current-condition", weather.label);
  setText("current-range", `High ${formatTemp(daily.temperature_2m_max[0])} and low ${formatTemp(daily.temperature_2m_min[0])}`);
  setText("current-date", parseDay(daily.time[0]).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }));

  dom.heroIcon.replaceChildren(createIcon(weather));
}

function renderMetrics(data, hourIndex) {
  const { current, daily, hourly } = data;
  const gap = current.apparent_temperature - current.temperature_2m;
  const uv = daily.uv_index_max?.[0];
  const visibility = hourly.visibility?.[hourIndex];

  setText("feels-value", orDash(current.apparent_temperature, (v) => `${Math.round(v)}°C`));
  setText("feels-note", Number.isFinite(gap) ? (Math.abs(gap) < 2 ? "Close to actual" : gap > 0 ? "Feels warmer" : "Feels cooler") : "");

  setText("wind-value", orDash(current.wind_speed_10m, (v) => `${Math.round(v)} km/h`));
  setText("wind-note", orDash(current.wind_speed_10m, (v) => scaleLabel(v, WIND_SCALE)));

  setText("humidity-value", orDash(current.relative_humidity_2m, (v) => `${Math.round(v)}%`));
  setText("humidity-note", orDash(current.relative_humidity_2m, (v) => scaleLabel(v, HUMIDITY_SCALE)));

  setText("uv-value", orDash(uv, (v) => String(Math.round(v))));
  setText("uv-note", orDash(uv, (v) => scaleLabel(v, UV_SCALE)));

  setText("pressure-value", orDash(current.surface_pressure, (v) => `${Math.round(v)} hPa`));
  setText("pressure-note", orDash(current.surface_pressure, (v) => scaleLabel(v, PRESSURE_SCALE)));

  setText("visibility-value", orDash(visibility, (v) => (v >= 10000 ? "10+ km" : `${(v / 1000).toFixed(1)} km`)));
  setText("visibility-note", orDash(visibility, (v) => scaleLabel(v, VISIBILITY_SCALE)));
}

function renderSun(daily, currentTime) {
  const sunrise = daily.sunrise?.[0];
  const sunset = daily.sunset?.[0];

  setText("sunrise-time", sunrise ? sunrise.slice(11, 16) : "--:--");
  setText("sunset-time", sunset ? sunset.slice(11, 16) : "--:--");

  if (!sunrise || !sunset) return;

  const start = Date.parse(sunrise);
  const end = Date.parse(sunset);
  const now = Date.parse(currentTime);
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const angle = progress * Math.PI;

  dom.sunCard.style.setProperty("--sun-x", `${50 - Math.cos(angle) * 50}%`);
  dom.sunCard.style.setProperty("--sun-y", `${Math.sin(angle) * 100}%`);
  dom.sunCard.classList.toggle("is-night", now < start || now > end);
}

function renderHourly(data, startIndex) {
  const { time, temperature_2m: temps, weather_code: codes } = data.hourly;
  const pills = [];

  for (let index = startIndex; index < Math.min(time.length, startIndex + HOURS_SHOWN); index += 1) {
    pills.push(createPill({
      label: index === startIndex ? "Now" : formatHour(time[index]),
      weather: describe(codes[index], isDaytime(time[index], data.daily)),
      temp: temps[index],
      active: index === startIndex
    }));
  }

  dom.hourly.replaceChildren(...pills);
}

function renderWeekly(daily) {
  const pills = daily.time.map((date, index) => createPill({
    label: index === 0 ? "Today" : parseDay(date).toLocaleDateString("en", { weekday: "short" }),
    weather: describe(daily.weather_code[index], true),
    temp: daily.temperature_2m_max[index],
    low: daily.temperature_2m_min[index],
    active: index === 0
  }));

  dom.weekly.replaceChildren(...pills);
}

function markActiveCity(place) {
  const target = place ? place.name.toLowerCase() : "";

  dom.cityList.querySelectorAll(".city-card").forEach((button) => {
    if (button.dataset.match === target) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function render(place, data) {
  const { current, daily, hourly } = data;
  const daytime = isDaytime(current.time, daily);
  const hourIndex = Math.max(0, hourly.time.findIndex((time) => time.startsWith(current.time.slice(0, 13))));

  document.body.dataset.daylight = daytime ? "day" : "night";
  document.title = `${place.name} Weather Forecast`;

  renderHero(place, data, daytime);
  renderMetrics(data, hourIndex);
  renderSun(daily, current.time);
  renderHourly(data, hourIndex);
  renderWeekly(daily);
  markActiveCity(place);

  const weather = describe(current.weather_code, daytime);
  dom.live.textContent = `Showing weather for ${place.name}. ${formatTemp(current.temperature_2m)} Celsius, ${weather.label}.`;
}

function setState(next) {
  dom.dashboard.dataset.state = next;
  dom.dashboard.setAttribute("aria-busy", String(next === "loading"));
}

function showError(message, retryable) {
  dom.errorMessage.textContent = message;
  dom.retry.hidden = !retryable;
  dom.errorBar.hidden = false;
}

function clearError() {
  dom.errorBar.hidden = true;
}

function messageFor(error) {
  return error instanceof AppError
    ? error.message
    : "Something went wrong while loading the forecast. Please try again.";
}

async function loadCity(query) {
  const city = query.trim();

  if (!city) {
    showError("Enter a city name to search.", false);
    dom.input.focus();
    return;
  }

  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  state.lastQuery = city;

  clearError();
  setState("loading");

  try {
    const place = await getLocation(city, controller.signal);
    const data = await getForecast(place, controller.signal);

    if (controller.signal.aborted) return;

    state.place = place;
    state.hasData = true;
    render(place, data);
    setState("ready");
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
  } catch (error) {
    if (controller.signal.aborted) return;

    showError(messageFor(error), error instanceof AppError ? error.retryable : true);
    setState(state.hasData ? "ready" : "error");
  }
}

function createCityCard(requested, place, data) {
  const daytime = isDaytime(data.current.time, data.daily);
  const weather = describe(data.current.weather_code, daytime);
  const item = createNode("li");
  const button = createNode("button", "city-card");

  button.type = "button";
  button.dataset.city = requested;
  button.dataset.match = place.name.toLowerCase();

  const meta = createNode("span", "city-meta");
  meta.append(createNode("span", "city-condition", weather.label), createNode("span", "city-name", place.name));

  button.append(createNode("span", "city-temp", formatTemp(data.current.temperature_2m)), meta, createIcon(weather));
  button.setAttribute("aria-label", `${place.name}, ${weather.label}, ${formatTemp(data.current.temperature_2m)}. Show forecast`);
  item.append(button);
  return item;
}

async function loadOtherCities() {
  dom.cityList.replaceChildren(...OTHER_CITIES.map(() => createNode("li", "city-skeleton")));

  const results = await Promise.allSettled(OTHER_CITIES.map(async (name) => {
    const place = await getLocation(name);
    const data = await getForecast(place);
    return { name, place, data };
  }));

  const cards = results
    .filter((result) => result.status === "fulfilled")
    .map(({ value }) => createCityCard(value.name, value.place, value.data));

  if (cards.length) {
    dom.cityList.replaceChildren(...cards);
    markActiveCity(state.place);
  } else {
    dom.cityList.replaceChildren(createNode("li", "city-note", "Other cities are unavailable right now."));
  }
}

function selectTab(tab, shouldFocus = false) {
  dom.tabs.forEach((candidate) => {
    const active = candidate === tab;
    candidate.setAttribute("aria-selected", String(active));
    candidate.tabIndex = active ? 0 : -1;
    $(candidate.getAttribute("aria-controls")).hidden = !active;
  });

  if (shouldFocus) tab.focus();
}

function handleTabKeys(event) {
  const index = dom.tabs.indexOf(document.activeElement);
  if (index === -1) return;

  const last = dom.tabs.length - 1;
  const targets = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last
  };

  if (!(event.key in targets)) return;
  event.preventDefault();
  selectTab(dom.tabs[targets[event.key]], true);
}

function init() {
  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadCity(dom.input.value);
  });

  dom.retry.addEventListener("click", () => loadCity(state.lastQuery));

  dom.cityList.addEventListener("click", (event) => {
    const button = event.target.closest(".city-card");
    if (!button) return;
    dom.input.value = "";
    loadCity(button.dataset.city);
  });

  dom.tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab)));
  dom.tablist.addEventListener("keydown", handleTabKeys);

  window.addEventListener("offline", () => showError("You are offline. Reconnect to refresh the forecast.", true));
  window.addEventListener("online", () => {
    if (!dom.errorBar.hidden) loadCity(state.lastQuery);
  });

  loadCity(DEFAULT_CITY);
  loadOtherCities();
}

init();