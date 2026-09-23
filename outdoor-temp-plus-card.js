/**
 * Outdoor Temp Plus — Home Assistant Lovelace.
 * White EZ-read outdoor thermometer for a temperature sensor. Not a thermostat.
 */
(function () {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const { html, css } = LitElement.prototype;

  const DEFAULTS = Object.freeze({
    name: "Outdoor",
    look: "ezread",
    size: "100",
    show_history: true,
    history_days: 14,
    show_humidity: true,
    show_feels: true,
    show_thermometer: true,
    show_sun: true,
    compact: false,
    unit_system: "auto",
    scale_min: -20,
    scale_max: 120,
    city: "",
    zip: "",
  });

  const LOOKS = Object.freeze({
    ezread: { label: "EZ-read plaque" },
    glass: { label: "Glass tube" },
  });

  const LEGACY_LOOKS = Object.freeze({
    porch: "ezread",
  });

  function lookIdOf(config) {
    const raw = config?.look;
    const id = LEGACY_LOOKS[raw] || raw;
    return LOOKS[id] ? id : "ezread";
  }

  function sizeOf(config) {
    const id = String(config?.size ?? "100");
    return id === "50" || id === "75" || id === "100" ? id : "100";
  }

  function mergeConfig(config) {
    const merged = { ...DEFAULTS, ...(config || {}) };
    merged.size = sizeOf(merged);
    merged.look = lookIdOf(merged);
    return merged;
  }

  function num(config, key, fallback) {
    const v = config[key];
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function entityState(hass, entityId) {
    if (!entityId || !hass?.states?.[entityId]) return null;
    return hass.states[entityId];
  }

  function parseNumber(v) {
    if (v == null || v === "" || v === "unknown" || v === "unavailable") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function unitOf(st) {
    return String(st?.attributes?.unit_of_measurement || "").toLowerCase();
  }

  function sensorUnit(st) {
    const u = unitOf(st);
    if (u.includes("c") && !u.includes("f")) return "C";
    return "F";
  }

  function displayUnit(cfg, hass, st) {
    if (cfg.unit_system === "c" || cfg.unit_system === "metric") return "C";
    if (cfg.unit_system === "f" || cfg.unit_system === "imperial") return "F";
    if (st) return sensorUnit(st);
    const sys = String(hass?.config?.unit_system?.temperature || "°F");
    return /c/i.test(sys) ? "C" : "F";
  }

  function toDisplay(value, fromUnit, toUnit) {
    if (value == null || !Number.isFinite(value)) return null;
    if (fromUnit === toUnit) return value;
    if (fromUnit === "F" && toUnit === "C") return ((value - 32) * 5) / 9;
    if (fromUnit === "C" && toUnit === "F") return (value * 9) / 5 + 32;
    return value;
  }

  function toF(value, fromUnit) {
    return toDisplay(value, fromUnit, "F");
  }

  function roundTemp(n) {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.round(n * 10) / 10;
  }

  function formatTemp(n, unit, digits) {
    if (n == null || !Number.isFinite(n)) return "—";
    const d = digits != null ? digits : Math.abs(n) >= 100 ? 0 : 1;
    const shown = Number(n).toFixed(d).replace(/\.0$/, "");
    return `${shown}°${unit}`;
  }

  function formatTempShort(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const shown = Number(n).toFixed(Math.abs(n) >= 100 ? 0 : 1).replace(/\.0$/, "");
    return `${shown}°`;
  }

  function heatIndexF(tF, rh) {
    if (tF == null || rh == null || tF < 80) return tF;
    const T = tF;
    const R = Math.max(0, Math.min(100, rh));
    let hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * R -
      0.22475541 * T * R -
      0.00683783 * T * T -
      0.05481717 * R * R +
      0.00122874 * T * T * R +
      0.00085282 * T * R * R -
      0.00000199 * T * T * R * R;
    if (R < 13 && T >= 80 && T <= 112) {
      hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    }
    if (R > 85 && T >= 80 && T <= 87) {
      hi += ((R - 85) / 10) * ((87 - T) / 5);
    }
    return hi;
  }

  function conditionOf(tF) {
    if (tF == null) return { id: "unk", label: "Outdoor" };
    if (tF <= 20) return { id: "arctic", label: "Arctic" };
    if (tF <= 32) return { id: "freeze", label: "Freezing" };
    if (tF <= 45) return { id: "cold", label: "Cold" };
    if (tF <= 60) return { id: "cool", label: "Cool" };
    if (tF <= 78) return { id: "mild", label: "Mild" };
    if (tF <= 85) return { id: "warm", label: "Warm" };
    if (tF <= 95) return { id: "hot", label: "Hot" };
    return { id: "extreme", label: "Extreme heat" };
  }

  function spiritColor(tF) {
    if (tF == null) return "#9aa7b4";
    if (tF <= 20) return "#7ecfff";
    if (tF <= 32) return "#4eb6ff";
    if (tF <= 45) return "#3db8c8";
    if (tF <= 60) return "#5ecf7a";
    if (tF <= 75) return "#c8d44a";
    if (tF <= 85) return "#f0a202";
    if (tF <= 95) return "#ef6c1a";
    return "#e23d28";
  }

  function stamp(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  function dayKey(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }
  }

  function weekdayLetter(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        weekday: "narrow",
      }).format(new Date(ms));
    } catch {
      return ["S", "M", "T", "W", "T", "F", "S"][new Date(ms).getDay()];
    }
  }

  function dayNum(ms) {
    return String(new Date(ms).getDate());
  }

  function monthDay(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
  }

  function stClass(hass, id) {
    return hass?.states?.[id]?.attributes?.device_class || "";
  }

  const WX_ICON = Object.freeze({
    "clear-night": "mdi:weather-night",
    cloudy: "mdi:weather-cloudy",
    fog: "mdi:weather-fog",
    hail: "mdi:weather-hail",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring",
    rainy: "mdi:weather-rainy",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    sunny: "mdi:weather-sunny",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
    exceptional: "mdi:alert-circle-outline",
  });

  const WX_LABEL = Object.freeze({
    "clear-night": "Clear night",
    cloudy: "Cloudy",
    fog: "Fog",
    hail: "Hail",
    lightning: "Thunderstorms",
    "lightning-rainy": "Thunderstorms",
    partlycloudy: "Partly cloudy",
    pouring: "Heavy rain",
    rainy: "Rain",
    snowy: "Snow",
    "snowy-rainy": "Wintry mix",
    sunny: "Sunny",
    windy: "Windy",
    "windy-variant": "Windy",
    exceptional: "Severe weather",
  });

  function weatherIcon(condition) {
    return WX_ICON[condition] || "mdi:weather-partly-cloudy";
  }

  function weatherLabel(condition) {
    return WX_LABEL[condition] || String(condition || "Forecast").replace(/-/g, " ");
  }

  function escHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  function firstWeatherId(hass) {
    const ids = Object.keys(hass?.states || {});
    return (
      ids.find((id) => id === "weather.forecast_home") ||
      ids.find((id) => /^weather\./.test(id) && /home|forecast/i.test(id)) ||
      ids.find((id) => /^weather\./.test(id)) ||
      ""
    );
  }

  function weatherIdOf(cfg, hass) {
    if (cfg?.weather_entity) return cfg.weather_entity;
    const zip = String(cfg?.zip || "").trim();
    const city = String(cfg?.city || "").trim();
    if (zip || (city && !cfg?.entity)) return "";
    return firstWeatherId(hass);
  }

  function wmoCondition(code, isDay) {
    const n = Number(code);
    if (!Number.isFinite(n)) return "partlycloudy";
    if (n === 0) return isDay ? "sunny" : "clear-night";
    if (n <= 2) return "partlycloudy";
    if (n === 3) return "cloudy";
    if (n === 45 || n === 48) return "fog";
    if (n === 51 || n === 53 || n === 55 || n === 61 || n === 63 || n === 80 || n === 81) return "rainy";
    if (n === 65 || n === 82) return "pouring";
    if (n === 56 || n === 57 || n === 66 || n === 67) return "snowy-rainy";
    if ((n >= 71 && n <= 77) || n === 85 || n === 86) return "snowy";
    if (n >= 95) return "lightning-rainy";
    return "partlycloudy";
  }

  const US_STATES = Object.freeze({
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
    kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
    wyoming: "WY", "district of columbia": "DC",
  });

  function stateAbbr(region) {
    const raw = String(region || "").replace(/^US-/, "").trim();
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return US_STATES[raw.toLowerCase()] || "";
  }

  function formatCityName(place) {
    if (!place?.name) return "";
    const region = stateAbbr(place.region);
    if (region && !String(place.name).includes(",")) {
      return `${place.name}, ${region}`;
    }
    return place.name;
  }

  async function geocodeName(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.results || [])[0];
    if (!hit) return null;
    return {
      name: hit.name,
      region: hit.admin1_code || hit.admin1,
      lat: hit.latitude,
      lon: hit.longitude,
    };
  }

  async function geocodeZip(zip) {
    const raw = String(zip || "").trim();
    const us = /^(\d{5})(?:-\d{4})?$/.exec(raw);
    if (us) {
      const res = await fetch(`https://api.zippopotam.us/us/${us[1]}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.places?.[0];
        if (p) {
          return {
            name: p["place name"],
            region: p["state abbreviation"],
            lat: Number(p.latitude),
            lon: Number(p.longitude),
          };
        }
      }
    }
    return geocodeName(raw);
  }

  async function reverseCity(lat, lon) {
    if (lat == null || lon == null) return null;
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const name = data.city || data.locality;
    if (!name) return null;
    return {
      name,
      region: String(data.principalSubdivisionCode || "").replace(/^US-/, ""),
      lat,
      lon,
    };
  }

  async function fetchOpenMeteo(lat, lon, unit) {
    const tempUnit = unit === "C" ? "celsius" : "fahrenheit";
    const windUnit = unit === "C" ? "kmh" : "mph";
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current || {};
    const daily = data.daily || {};
    const forecast = (daily.time || []).map((t, i) => ({
      datetime: t,
      condition: wmoCondition(daily.weather_code?.[i], 1),
      temperature: daily.temperature_2m_max?.[i],
      templow: daily.temperature_2m_min?.[i],
    }));
    return {
      temp: parseNumber(cur.temperature_2m),
      humidity: parseNumber(cur.relative_humidity_2m),
      wind: parseNumber(cur.wind_speed_10m),
      windUnit: unit === "C" ? "km/h" : "mph",
      condition: wmoCondition(cur.weather_code, cur.is_day),
      timezone: data.timezone || "",
      tzAbbr: data.timezone_abbreviation || "",
      todayHi: parseNumber(daily.temperature_2m_max?.[0]),
      todayLo: parseNumber(daily.temperature_2m_min?.[0]),
      sunrise: daily.sunrise?.[0] || "",
      sunset: daily.sunset?.[0] || "",
      forecast,
    };
  }

  function formatSunTime(iso, timeZone) {
    const raw = String(iso || "");
    if (!raw) return "";
    if (!/Z|[+-]\d{2}:\d{2}$/.test(raw)) {
      const hm = raw.match(/T(\d{2}):(\d{2})/);
      if (hm) {
        let hour = Number(hm[1]);
        const minute = hm[2];
        const ap = hour >= 12 ? "PM" : "AM";
        hour = hour % 12 || 12;
        return `${hour}:${minute} ${ap}`;
      }
    }
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || undefined,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .format(d)
        .replace(/\s*(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
    } catch {
      return "";
    }
  }

  function friendlyZone(raw) {
    const u = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (/^(CDT|CST|CT)$/.test(u) || /CENTRAL/.test(String(raw || "").toUpperCase())) return "CT";
    if (/^(EDT|EST|ET)$/.test(u) || /EASTERN/.test(String(raw || "").toUpperCase())) return "ET";
    if (/^(MDT|MST|MT)$/.test(u) || /MOUNTAIN/.test(String(raw || "").toUpperCase())) return "MT";
    if (/^(PDT|PST|PT)$/.test(u) || /PACIFIC/.test(String(raw || "").toUpperCase())) return "PT";
    if (/^(HST|HDT|HAT|HT)$/.test(u) || /HAWAII/.test(String(raw || "").toUpperCase())) return "HT";
    if (/^(AKDT|AKST|AKT)$/.test(u)) return "AKT";
    return u.slice(0, 4) || "";
  }

  function formatLocalClock(timeZone, now, abbr) {
    const d = now instanceof Date ? now : new Date(now || Date.now());
    const tz = timeZone || undefined;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }).formatToParts(d);
      const hour = parts.find((p) => p.type === "hour")?.value;
      const minute = parts.find((p) => p.type === "minute")?.value;
      const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value || "").toUpperCase();
      const rawAbbr = String(abbr || "");
      const skipAbbr = /GMT|UTC|[+-]\d/.test(rawAbbr.toUpperCase());
      const zone =
        (!skipAbbr && friendlyZone(rawAbbr)) ||
        friendlyZone(parts.find((p) => p.type === "timeZoneName")?.value);
      if (!hour || !minute) return "";
      return `${hour}:${minute} ${dayPeriod}${zone ? ` ${zone}` : ""}`.trim();
    } catch {
      return "";
    }
  }

  function hourHiLo(rows, sinceMs, untilMs, live, srcUnit, dispUnit) {
    let hi = null;
    let lo = null;
    for (const row of rows || []) {
      const end = stamp(row.end);
      const start = stamp(row.start);
      if (!Number.isFinite(end)) continue;
      if (untilMs != null && start >= untilMs) continue;
      if (end <= sinceMs) continue;
      const max = toDisplay(parseNumber(row.max), srcUnit, dispUnit);
      const min = toDisplay(parseNumber(row.min), srcUnit, dispUnit);
      if (max != null) hi = hi == null ? max : Math.max(hi, max);
      if (min != null) lo = lo == null ? min : Math.min(lo, min);
    }
    if (live != null) {
      hi = hi == null ? live : Math.max(hi, live);
      lo = lo == null ? live : Math.min(lo, live);
    }
    return { hi: roundTemp(hi), lo: roundTemp(lo) };
  }

  class OutdoorTempPlusCard extends LitElement {
    static get properties() {
      return {
        hass: {},
        config: {},
        _historyDays: { state: true },
        _hours: { state: true },
        _days: { state: true },
        _selectedDay: { state: true },
        _histError: { state: true },
        _forecast: { state: true },
        _place: { state: true },
        _remoteWx: { state: true },
        _wxOpen: { state: true },
        _sun: { state: true },
        _now: { state: true },
      };
    }

    static getConfigElement() {
      return document.createElement("outdoor-temp-plus-card-editor");
    }

    static getStubConfig(hass) {
      const ids = Object.keys(hass?.states || {});
      const entity =
        ids.find((id) => /outside_temp_and_humidity_temperature/i.test(id)) ||
        ids.find((id) => /outside.*temperature|outdoor.*temperature/i.test(id)) ||
        ids.find((id) => stClass(hass, id) === "temperature" && /out/i.test(id)) ||
        ids.find((id) => stClass(hass, id) === "temperature") ||
        "";
      const humidity =
        ids.find((id) => /outside_temp_and_humidity_humidity/i.test(id)) ||
        ids.find((id) => /outside.*humidity|outdoor.*humidity/i.test(id)) ||
        "";
      return {
        type: "custom:outdoor-temp-plus-card",
        entity,
        humidity_entity: humidity,
        weather_entity: firstWeatherId(hass),
        look: "ezread",
        size: "100",
        name: "Outdoor",
      };
    }

    constructor() {
      super();
      this._hours = [];
      this._days = [];
      this._historyDays = 14;
      this._selectedDay = null;
      this._histError = "";
      this._histKey = "";
      this._forecast = [];
      this._fcKey = "";
      this._place = null;
      this._remoteWx = null;
      this._placeKey = "";
      this._remoteKey = "";
      this._wxOpen = false;
      this._wxHost = null;
      this._sun = null;
      this._sunKey = "";
      this._now = Date.now();
      this._clock = 0;
    }

    connectedCallback() {
      super.connectedCallback();
      this._startClock();
    }

    getCardSize() {
      const size = Number(sizeOf(this.config));
      const compact = this.config?.compact || this.config?.show_history === false;
      const base = compact ? 3 : 6;
      return Math.max(2, Math.round((base * size) / 100));
    }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      this.config = mergeConfig(config);
      this._historyDays = num(this.config, "history_days", 14);
      this.dataset.size = sizeOf(this.config);
      this.toggleAttribute("compact", !!this.config.compact);
      this.toggleAttribute("no-thermo", this.config?.show_thermometer === false);
    }

    updated(changed) {
      this.dataset.size = sizeOf(this.config);
      this.toggleAttribute("compact", !!this.config.compact);
      this.toggleAttribute("no-thermo", this.config?.show_thermometer === false);
      if (changed.has("hass") || changed.has("config")) {
        this._loadHistory();
        this._loadPlace().then(async () => {
          await this._loadForecast();
          await this._loadSunTimes();
        });
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this._stopClock();
      this._histKey = "";
      this._fcKey = "";
      this._placeKey = "";
      this._remoteKey = "";
    }

    _startClock() {
      this._now = Date.now();
      if (this._clock) return;
      this._clock = window.setInterval(() => {
        this._now = Date.now();
      }, 15000);
    }

    _stopClock() {
      if (this._clock) {
        window.clearInterval(this._clock);
        this._clock = 0;
      }
    }

    _moreInfo(entityId) {
      if (!entityId) return;
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        })
      );
    }

    _openWeather(ev) {
      if (ev?.target?.closest?.("button, a, input, textarea, select, ha-slider")) return;
      if (this.wantsRemoteWeather()) {
        this._openRemoteWeather();
        return;
      }
      const id = weatherIdOf(this.config, this.hass);
      if (id) this._moreInfo(id);
    }

    _closeRemoteWeather() {
      if (this._onWxKey) {
        window.removeEventListener("keydown", this._onWxKey);
        this._onWxKey = null;
      }
      this._wxHost?.remove();
      this._wxHost = null;
      this._wxOpen = false;
    }

    _openRemoteWeather() {
      const m = this._model();
      const days = this._forecastDays(m.unit, 7);
      const city = m.city || m.title || "Outdoor";
      const cond = this._remoteWx?.condition || days[0]?.condition;
      this._closeRemoteWeather();
      const root = document.createElement("div");
      root.className = "ot-wx-root";
      root.innerHTML = `
        <style>
          .ot-wx-root { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; font-family:var(--ha-font-family, Roboto, Noto, sans-serif); }
          .ot-wx-root .bk { position:absolute; inset:0; background:rgba(0,0,0,.52); }
          .ot-wx-root .panel { position:relative; width:min(440px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; background:var(--card-background-color, #1c1c1e); color:var(--primary-text-color, #fff); border-radius:28px; box-shadow:0 16px 48px rgba(0,0,0,.45); padding:18px 20px 16px; }
          .ot-wx-root .top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
          .ot-wx-root .ttl { font-size:1.35rem; font-weight:650; line-height:1.2; }
          .ot-wx-root .clk { margin-left:auto; font-size:1.05rem; font-weight:650; white-space:nowrap; padding-top:4px; }
          .ot-wx-root .x { border:0; background:none; color:var(--secondary-text-color, #9aa0a6); font-size:1.35rem; line-height:1; cursor:pointer; padding:2px 4px; }
          .ot-wx-root .cond { margin-top:14px; font-size:1.05rem; font-weight:500; }
          .ot-wx-root .now { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:6px; }
          .ot-wx-root .now-l { display:flex; align-items:center; gap:10px; color:var(--secondary-text-color, #9aa0a6); }
          .ot-wx-root ha-icon { --mdc-icon-size:36px; }
          .ot-wx-root .now-t { font-size:2.4rem; font-weight:650; letter-spacing:-0.03em; }
          .ot-wx-root .rows { margin-top:16px; display:grid; gap:10px; }
          .ot-wx-root .row { display:flex; justify-content:space-between; gap:16px; font-size:.95rem; }
          .ot-wx-root .row span:first-child { color:var(--secondary-text-color, #9aa0a6); }
          .ot-wx-root .fc-k { margin-top:18px; font-size:.72rem; font-weight:650; letter-spacing:.04em; text-transform:uppercase; color:var(--secondary-text-color, #9aa0a6); }
          .ot-wx-root .days { display:grid; grid-template-columns:repeat(${Math.max(days.length, 1)}, minmax(0,1fr)); gap:6px; margin-top:10px; text-align:center; }
          .ot-wx-root .day { min-width:0; }
          .ot-wx-root .day-n { font-size:.78rem; font-weight:650; }
          .ot-wx-root .day ha-icon { --mdc-icon-size:22px; margin:6px 0; color:var(--primary-text-color, #fff); }
          .ot-wx-root .hi { font-size:.9rem; font-weight:650; }
          .ot-wx-root .lo { font-size:.78rem; color:var(--secondary-text-color, #9aa0a6); }
          .ot-wx-root .sun { display:flex; align-items:center; gap:16px; margin-top:14px; color:var(--secondary-text-color, #9aa0a6); font-size:.9rem; font-weight:650; }
          .ot-wx-root .sun-item { display:inline-flex; align-items:center; gap:6px; }
          .ot-wx-root .sun ha-icon { --mdc-icon-size:18px; }
          .ot-wx-root .src { margin-top:14px; font-size:.72rem; color:var(--secondary-text-color, #9aa0a6); }
        </style>
        <div class="bk"></div>
        <div class="panel" role="dialog" aria-modal="true" aria-label="${escHtml(city)}">
          <div class="top">
            <div class="ttl">${escHtml(city)}</div>
            ${m.clock ? `<div class="clk">${escHtml(m.clock)}</div>` : ""}
            <button type="button" class="x" aria-label="Close">×</button>
          </div>
          <div class="cond">${escHtml(weatherLabel(cond))}</div>
          <div class="now">
            <div class="now-l"><ha-icon icon="${escHtml(weatherIcon(cond))}"></ha-icon></div>
            <div class="now-t">${escHtml(formatTemp(m.live, m.unit))}</div>
          </div>
          <div class="rows">
            <div class="row"><span>Humidity</span><span>${m.humidity != null ? `${m.humidity}%` : "—"}</span></div>
            <div class="row"><span>Wind speed</span><span>${m.wind != null ? `${m.wind} ${escHtml(m.windUnit)}` : "—"}</span></div>
            <div class="row"><span>Today high / low</span><span>${escHtml(formatTemp(m.hi, m.unit))} / ${escHtml(formatTemp(m.lo, m.unit))}</span></div>
          </div>
          ${(() => {
            const sun = this._sunTimes(m);
            if (!sun) return "";
            return `<div class="sun">${sun.rise ? `<span class="sun-item"><ha-icon icon="mdi:weather-sunset-up"></ha-icon>${escHtml(sun.rise)}</span>` : ""}${sun.set ? `<span class="sun-item"><ha-icon icon="mdi:weather-sunset-down"></ha-icon>${escHtml(sun.set)}</span>` : ""}</div>`;
          })()}
          ${days.length ? `<div class="fc-k">Forecast</div><div class="days">${days.map((d) => `
            <div class="day" title="${escHtml(d.title)}">
              <div class="day-n">${escHtml(weekdayLetter(d.start, this.hass))}</div>
              <ha-icon icon="${escHtml(d.icon)}"></ha-icon>
              <div class="hi">${escHtml(formatTempShort(d.hi))}</div>
              <div class="lo">${escHtml(formatTempShort(d.lo))}</div>
            </div>`).join("")}</div>` : ""}
          <div class="src">Weather from Open-Meteo</div>
        </div>
      `;
      root.querySelector(".bk").addEventListener("click", () => this._closeRemoteWeather());
      root.querySelector(".x").addEventListener("click", () => this._closeRemoteWeather());
      this._onWxKey = (ev) => {
        if (ev.key === "Escape") this._closeRemoteWeather();
      };
      window.addEventListener("keydown", this._onWxKey);
      document.body.appendChild(root);
      this._wxHost = root;
      this._wxOpen = true;
    }

    async _loadHistory() {
      const entity = this.config?.entity;
      const hass = this.hass;
      if (!entity || !hass?.callWS) return;
      const days = Math.max(7, Number(this._historyDays) || 14);
      const key = `${entity}|${days}|${Math.floor(Date.now() / 120000)}`;
      if (key === this._histKey) return;
      this._histKey = key;
      const end = new Date();
      const startDaily = new Date(end.getTime() - (days + 1) * 86400000);
      const startHourly = new Date(end.getTime() - 36 * 3600000);
      try {
        const [daily, hourly] = await Promise.all([
          hass.callWS({
            type: "recorder/statistics_during_period",
            start_time: startDaily.toISOString(),
            end_time: end.toISOString(),
            statistic_ids: [entity],
            period: "day",
            types: ["min", "max", "mean"],
          }),
          hass.callWS({
            type: "recorder/statistics_during_period",
            start_time: startHourly.toISOString(),
            end_time: end.toISOString(),
            statistic_ids: [entity],
            period: "hour",
            types: ["min", "max", "mean"],
          }),
        ]);
        this._days = daily?.[entity] || [];
        this._hours = hourly?.[entity] || [];
        this._histError = "";
      } catch (err) {
        this._histError = err?.message || "history unavailable";
        this._days = [];
        this._hours = [];
      }
    }

    wantsRemoteWeather() {
      const cfg = this.config || {};
      const zip = String(cfg.zip || "").trim();
      const city = String(cfg.city || "").trim();
      if (zip) return true;
      if (city && !cfg.entity) return true;
      return false;
    }

    async _loadPlace() {
      const cfg = this.config || {};
      const city = String(cfg.city || "").trim();
      const zip = String(cfg.zip || "").trim();
      const lat = this.hass?.config?.latitude;
      const lon = this.hass?.config?.longitude;
      const key = `${city}|${zip}|${city || zip ? "" : `${lat},${lon}`}`;
      if (key === this._placeKey && this._place) return this._place;
      this._placeKey = key;
      try {
        if (zip) {
          const geo = await geocodeZip(zip);
          this._place = {
            name: city || geo?.name || zip,
            region: geo?.region,
            lat: geo?.lat,
            lon: geo?.lon,
          };
        } else if (city) {
          const geo = await geocodeName(city);
          this._place = {
            name: city,
            region: geo?.region,
            lat: geo?.lat ?? lat,
            lon: geo?.lon ?? lon,
          };
        } else {
          const geo = await reverseCity(lat, lon);
          const loc = this.hass?.config?.location_name;
          this._place = geo || {
            name: loc && !/^home$/i.test(loc) ? loc : "",
            lat,
            lon,
          };
        }
      } catch {
        this._place = city ? { name: city, lat, lon } : { name: "", lat, lon };
      }
      return this._place;
    }

    async _loadRemoteWeather() {
      if (!this.wantsRemoteWeather()) {
        this._remoteWx = null;
        return null;
      }
      const place = this._place || (await this._loadPlace());
      if (place?.lat == null || place?.lon == null) {
        this._remoteWx = null;
        return null;
      }
      const unit = displayUnit(this.config || {}, this.hass, entityState(this.hass, this.config?.entity));
      const key = `${place.lat},${place.lon}|${unit}|${Math.floor(Date.now() / 300000)}`;
      if (key === this._remoteKey && this._remoteWx) return this._remoteWx;
      this._remoteKey = key;
      try {
        this._remoteWx = await fetchOpenMeteo(place.lat, place.lon, unit);
      } catch {
        this._remoteWx = null;
      }
      return this._remoteWx;
    }

    async _loadSunTimes() {
      if (this.config?.show_sun === false) {
        this._sun = null;
        return null;
      }
      if (this._remoteWx?.sunrise || this._remoteWx?.sunset) {
        this._sun = {
          rise: this._remoteWx.sunrise,
          set: this._remoteWx.sunset,
          tz: this._remoteWx.timezone,
        };
        return this._sun;
      }
      const place = this._place || (await this._loadPlace());
      const sunSt = entityState(this.hass, "sun.sun");
      const fallback = sunSt
        ? {
            rise: sunSt.attributes?.next_rising,
            set: sunSt.attributes?.next_setting,
            tz: this.hass?.config?.time_zone || "",
          }
        : null;
      if (place?.lat == null || place?.lon == null) {
        this._sun = fallback;
        return this._sun;
      }
      const key = `sun|${place.lat},${place.lon}|${Math.floor(Date.now() / 300000)}`;
      if (key === this._sunKey && this._sun) return this._sun;
      this._sunKey = key;
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
            `&daily=sunrise,sunset&timezone=auto`
        );
        if (!res.ok) throw new Error("sun");
        const data = await res.json();
        this._sun = {
          rise: data.daily?.sunrise?.[0] || "",
          set: data.daily?.sunset?.[0] || "",
          tz: data.timezone || this.hass?.config?.time_zone || "",
        };
      } catch {
        this._sun = fallback;
      }
      return this._sun;
    }

    async _loadForecast() {
      await this._loadRemoteWeather();
      if (this._remoteWx?.forecast?.length) {
        this._forecast = this._remoteWx.forecast;
        this._fcKey = `remote|${this._remoteKey}`;
        return;
      }
      const id = weatherIdOf(this.config, this.hass);
      const hass = this.hass;
      if (!id || !hass?.callWS) {
        this._forecast = [];
        return;
      }
      const key = `${id}|${Math.floor(Date.now() / 300000)}`;
      if (key === this._fcKey) return;
      this._fcKey = key;
      try {
        let rows;
        if (typeof hass.callService === "function") {
          const res = await hass.callService(
            "weather",
            "get_forecasts",
            { type: "daily" },
            { entity_id: id },
            false,
            true
          );
          rows = res?.response?.[id]?.forecast;
        }
        if (!Array.isArray(rows)) {
          const res = await hass.callWS({
            type: "weather/get_forecasts",
            entity_id: id,
          });
          rows = res?.[id]?.forecast;
        }
        this._forecast = Array.isArray(rows) ? rows : [];
      } catch {
        const st = entityState(hass, id);
        this._forecast = Array.isArray(st?.attributes?.forecast) ? st.attributes.forecast : [];
      }
    }

    _forecastDays(unit, max = 5) {
      const id = weatherIdOf(this.config, this.hass);
      const wx = entityState(this.hass, id);
      const fromUnit = this._remoteWx
        ? unit
        : /c/i.test(String(wx?.attributes?.temperature_unit || ""))
          ? "C"
          : "F";
      const days = [];
      for (const row of this._forecast || []) {
        const start = stamp(row.datetime || row.date);
        if (!Number.isFinite(start)) continue;
        days.push({
          start,
          condition: row.condition,
          icon: weatherIcon(row.condition),
          label: weatherLabel(row.condition),
          hi: roundTemp(toDisplay(parseNumber(row.temperature), fromUnit, unit)),
          lo: roundTemp(toDisplay(parseNumber(row.templow ?? row.temp_low), fromUnit, unit)),
          title: `${monthDay(start, this.hass)} · ${weatherLabel(row.condition)}`,
        });
        if (days.length >= max) break;
      }
      return days;
    }

    _forecastSummary(m) {
      const id = weatherIdOf(m.cfg, this.hass);
      const wx = entityState(this.hass, id);
      const days = this._forecastDays(m.unit);
      const nowCond = this._remoteWx?.condition || wx?.state || days[0]?.condition;
      const bits = [];
      const nowLabel = weatherLabel(nowCond);
      if (nowLabel) bits.push(nowLabel);
      const today = days[0];
      const tomorrow = days[1];
      if (today?.lo != null) bits.push(`Low ${formatTempShort(today.lo)}`);
      if (tomorrow) {
        let next = `Tomorrow ${String(tomorrow.label || "").toLowerCase()}`;
        if (tomorrow.hi != null) next += `, high ${formatTempShort(tomorrow.hi)}`;
        bits.push(next);
      }
      return {
        id,
        nowCond,
        text: bits.filter(Boolean).join(". ").replace(/\.\./g, ".") + (bits.length ? "." : ""),
      };
    }

    _sunTimes(m) {
      if (m?.cfg?.show_sun === false) return null;
      const tz = this._remoteWx?.timezone || this._sun?.tz || this.hass?.config?.time_zone || "";
      const sunSt = entityState(this.hass, "sun.sun");
      const rise = formatSunTime(
        this._remoteWx?.sunrise || this._sun?.rise || sunSt?.attributes?.next_rising,
        tz
      );
      const set = formatSunTime(
        this._remoteWx?.sunset || this._sun?.set || sunSt?.attributes?.next_setting,
        tz
      );
      if (!rise && !set) return null;
      return { rise, set };
    }

    _renderSun(m) {
      const sun = this._sunTimes(m);
      if (!sun) return html``;
      return html`
        <div class="sun">
          ${sun.rise
            ? html`<span class="sun-item"><ha-icon icon="mdi:weather-sunset-up"></ha-icon>${sun.rise}</span>`
            : ""}
          ${sun.set
            ? html`<span class="sun-item"><ha-icon icon="mdi:weather-sunset-down"></ha-icon>${sun.set}</span>`
            : ""}
        </div>
      `;
    }

    _renderForecast(m) {
      const sum = this._forecastSummary(m);
      if (!sum.id && !sum.text && !this._sunTimes(m)) return html``;
      return html`
        <div class="forecast">
          ${sum.id || sum.text
            ? html`
                <span class="forecast-k">Forecast</span>
                <span class="forecast-v">${sum.text || weatherLabel(sum.nowCond)}</span>
              `
            : ""}
          ${this._renderSun(m)}
        </div>
      `;
    }

    _model() {
      const cfg = mergeConfig(this.config || {});
      const st = entityState(this.hass, cfg.entity);
      const humSt = entityState(this.hass, cfg.humidity_entity);
      const remote = this._remoteWx;
      const wxSt = entityState(this.hass, weatherIdOf(cfg, this.hass));
      const unit = displayUnit(cfg, this.hass, st);
      const srcUnit = st
        ? sensorUnit(st)
        : remote
          ? unit
          : /c/i.test(String(wxSt?.attributes?.temperature_unit || ""))
            ? "C"
            : "F";
      const liveSrc = st
        ? parseNumber(st.state)
        : remote?.temp ?? parseNumber(wxSt?.attributes?.temperature);
      const live = roundTemp(toDisplay(liveSrc, srcUnit, unit));
      const liveF = toF(liveSrc, srcUnit);
      const humidity = humSt
        ? parseNumber(humSt.state)
        : remote?.humidity ?? parseNumber(wxSt?.attributes?.humidity);
      const wind = parseNumber(wxSt?.attributes?.wind_speed) ?? remote?.wind;
      const windUnit = String(
        wxSt?.attributes?.wind_speed_unit || remote?.windUnit || "mph"
      ).replace(/^\s+|\s+$/g, "");
      const city = formatCityName({
        name: String(cfg.city || "").trim() || this._place?.name,
        region: this._place?.region,
      });
      const feelsF = heatIndexF(liveF, humidity);
      const feels = roundTemp(toDisplay(feelsF, "F", unit));
      const now = Date.now();
      const remoteToday = (this._forecastDays(unit) || [])[0];
      const remoteHi = remote?.todayHi ?? remoteToday?.hi;
      const remoteLo = remote?.todayLo ?? remoteToday?.lo;
      let hi;
      let lo;
      if (this.wantsRemoteWeather()) {
        hi = remoteHi;
        lo = remoteLo;
      } else {
        const today = hourHiLo(this._hours, now - now % 86400000, now, live, srcUnit, unit);
        const dailyToday = this._todayFromDays(srcUnit, unit, live);
        hi = dailyToday.hi ?? today.hi ?? remoteHi;
        lo = dailyToday.lo ?? today.lo ?? remoteLo;
      }
      const cond = conditionOf(liveF);
      const unavailable = live == null;
      const timeZone = this._remoteWx?.timezone || this.hass?.config?.time_zone || "";
      const clock = formatLocalClock(timeZone, this._now, this._remoteWx?.tzAbbr);
      return {
        cfg,
        st,
        humSt,
        unit,
        srcUnit,
        city,
        live,
        liveF,
        humidity: humidity != null ? Math.round(humidity) : null,
        wind: wind != null && Number.isFinite(wind) ? Number(wind.toFixed(1).replace(/\.0$/, "")) : null,
        windUnit,
        feels,
        showFeels: cfg.show_feels !== false && feels != null && live != null && Math.abs(feels - live) >= 1,
        hi,
        lo,
        cond,
        color: spiritColor(liveF),
        lookId: lookIdOf(cfg),
        size: sizeOf(cfg),
        compact: !!cfg.compact,
        showThermo: cfg.show_thermometer !== false,
        unavailable,
        title: cfg.name || st?.attributes?.friendly_name || "Outdoor",
        clock,
        scaleMin: num(cfg, "scale_min", unit === "C" ? -30 : -20),
        scaleMax: num(cfg, "scale_max", unit === "C" ? 50 : 120),
      };
    }

    _todayFromDays(srcUnit, dispUnit, live) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const key = dayKey(today.getTime(), this.hass);
      for (const row of this._days || []) {
        if (dayKey(stamp(row.start), this.hass) !== key) continue;
        let hi = toDisplay(parseNumber(row.max), srcUnit, dispUnit);
        let lo = toDisplay(parseNumber(row.min), srcUnit, dispUnit);
        if (live != null) {
          hi = hi == null ? live : Math.max(hi, live);
          lo = lo == null ? live : Math.min(lo, live);
        }
        return { hi: roundTemp(hi), lo: roundTemp(lo) };
      }
      return { hi: null, lo: null };
    }

    _historyBars(unit, srcUnit) {
      const want = Number(this._historyDays) || 14;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const byStart = new Map();
      for (const row of this._days || []) {
        const hi = toDisplay(parseNumber(row.max), srcUnit, unit);
        const lo = toDisplay(parseNumber(row.min), srcUnit, unit);
        byStart.set(stamp(row.start), { hi: roundTemp(hi), lo: roundTemp(lo) });
      }
      const bars = [];
      const live = this._model().live;
      for (let i = want - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const startMs = d.getTime();
        let pair = null;
        for (const [ms, val] of byStart) {
          if (Math.abs(ms - startMs) < 3 * 3600000) {
            pair = val;
            break;
          }
        }
        if (!pair) {
          const key = dayKey(startMs, this.hass);
          for (const [ms, val] of byStart) {
            if (dayKey(ms, this.hass) === key) {
              pair = val;
              break;
            }
          }
        }
        let hi = pair?.hi ?? null;
        let lo = pair?.lo ?? null;
        if (i === 0 && live != null) {
          hi = hi == null ? live : Math.max(hi, live);
          lo = lo == null ? live : Math.min(lo, live);
        }
        bars.push({
          start: startMs,
          hi,
          lo,
          label:
            want <= 7
              ? weekdayLetter(startMs, this.hass)
              : want <= 14 || i === 0 || (want - 1 - i) % 5 === 0
                ? dayNum(startMs)
                : "",
          title: `${monthDay(startMs, this.hass)} · ${formatTemp(hi, unit)} / ${formatTemp(lo, unit)}`,
        });
      }
      return bars;
    }

    _renderThermometer(m) {
      return html`<div class="thermo-svg" .innerHTML=${this._thermometerSvg(m)}></div>`;
    }

    _thermometerSvg(m) {
      const uid = `ot${String(m.cfg.entity || "x").replace(/[^a-z0-9]/gi, "").slice(-10)}`;
      const cMin = -50;
      const cMax = 50;
      const yTop = 84;
      const yBot = 338;
      const scaleH = yBot - yTop;
      const liveC =
        m.live == null
          ? null
          : m.unit === "C"
            ? m.live
            : ((m.live - 32) * 5) / 9;
      const clampC = liveC == null ? cMin : Math.max(cMin, Math.min(cMax, liveC));
      const ySpirit = yBot - ((clampC - cMin) / (cMax - cMin)) * scaleH;
      const red = "#d20f16";
      const ink = "#111";
      const cx = 110;
      const glass = m.lookId === "glass";
      const body = glass ? "#e8edf2" : "#f7f8fa";
      const edge = glass ? "#c5ced6" : "#d5d8dc";
      const yOfC = (c) => yBot - ((c - cMin) / (cMax - cMin)) * scaleH;
      const yOfF = (f) => yBot - ((f - -60) / 180) * scaleH;

      let ticks = "";
      for (let c = cMin; c <= cMax; c += 2) {
        const y = yOfC(c).toFixed(2);
        const major = c % 10 === 0;
        ticks += `<line x1="${major ? 44 : 68}" y1="${y}" x2="96" y2="${y}" stroke="${ink}" stroke-width="${major ? 1.6 : 0.85}"/>`;
        if (major) {
          ticks += `<text x="42" y="${(yOfC(c) + 5.5).toFixed(2)}" text-anchor="end" font-size="17" font-weight="600" font-family="Arial, Helvetica, sans-serif" fill="${ink}">${c}</text>`;
        }
      }
      for (let f = -60; f <= 120; f += 2) {
        const y = yOfF(f).toFixed(2);
        const major = f % 20 === 0;
        ticks += `<line x1="124" y1="${y}" x2="${major ? 176 : 152}" y2="${y}" stroke="${ink}" stroke-width="${major ? 1.6 : 0.85}"/>`;
        if (major) {
          ticks += `<text x="178" y="${(yOfF(f) + 5.5).toFixed(2)}" text-anchor="start" font-size="17" font-weight="600" font-family="Arial, Helvetica, sans-serif" fill="${ink}">${f}</text>`;
        }
      }

      return `
        <svg viewBox="0 0 220 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${m.title} ${formatTemp(m.live, m.unit)}">
          <defs>
            <filter id="${uid}-sh" x="-12%" y="-4%" width="124%" height="110%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.2" flood-color="#000" flood-opacity="0.22"/>
            </filter>
            <linearGradient id="${uid}-body" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="${glass ? "#dce3ea" : "#eef0f2"}"/>
              <stop offset="0.18" stop-color="${body}"/>
              <stop offset="0.82" stop-color="${body}"/>
              <stop offset="1" stop-color="${glass ? "#d4dde5" : "#eceef0"}"/>
            </linearGradient>
          </defs>
          <path d="M18 26 C18 12 36 4 58 4 L162 4 C184 4 202 12 202 26 L202 436 C202 450 188 456 168 456 L52 456 C32 456 18 450 18 436 Z" fill="url(#${uid}-body)" stroke="${edge}" stroke-width="1.2" filter="url(#${uid}-sh)"/>
          <ellipse cx="${cx}" cy="26" rx="10" ry="7.5" fill="none" stroke="#b0b4b8" stroke-width="3.4"/>
          <ellipse cx="${cx}" cy="26" rx="5.6" ry="4.2" fill="#1c1c1e"/>
          <text x="58" y="66" text-anchor="middle" font-size="20" font-weight="500" font-family="Arial, Helvetica, sans-serif" fill="${ink}">°C</text>
          <text x="162" y="66" text-anchor="middle" font-size="20" font-weight="500" font-family="Arial, Helvetica, sans-serif" fill="${ink}">°F</text>
          ${ticks}
          <rect x="${cx - 4}" y="${yTop - 8}" width="8" height="${yBot - yTop + 22}" rx="4" fill="#e4e8eb" fill-opacity="0.55" stroke="#9aa1a6" stroke-width="0.7"/>
          <line x1="${cx}" y1="${ySpirit.toFixed(2)}" x2="${cx}" y2="358" stroke="${red}" stroke-width="3.2" stroke-linecap="round"/>
          <circle cx="${cx}" cy="${ySpirit.toFixed(2)}" r="2.4" fill="${red}"/>
          <circle cx="${cx}" cy="${yTop - 8}" r="3.1" fill="#d5dadd" stroke="#9aa1a6" stroke-width="0.6"/>
          <rect x="18" y="352" width="184" height="58" fill="url(#${uid}-body)"/>
          <rect x="88" y="360" width="44" height="6" rx="2" fill="${red}"/>
          <rect x="88" y="374" width="44" height="6" rx="2" fill="${red}"/>
          <rect x="88" y="388" width="44" height="6" rx="2" fill="${red}"/>
          <text x="${cx}" y="428" text-anchor="middle" font-size="18" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="${ink}" letter-spacing="1.2">OUTDOOR</text>
        </svg>
      `;
    }

    render() {
      if (!this.hass || !this.config) return html``;
      const m = this._model();
      if (!m.cfg.entity && !m.cfg.zip && !m.cfg.city && m.live == null) {
        return html`
          <ha-card>
            <div class="wrap setup">
              <p>Pick an outdoor temperature sensor, or a city / ZIP, in the card editor.</p>
            </div>
          </ha-card>
        `;
      }
      const showHist = m.cfg.show_history !== false && !m.compact;
      const bars = showHist ? this._historyBars(m.unit, m.srcUnit) : [];
      const vals = bars.flatMap((b) => [b.hi, b.lo]).filter((n) => n != null);
      const maxBar = Math.max(m.scaleMax, ...(vals.length ? vals : [m.scaleMax]));
      const minBar = Math.min(m.scaleMin, ...(vals.length ? vals : [m.scaleMin]));
      const span = Math.max(1, maxBar - minBar);
      const selected =
        this._selectedDay != null
          ? bars.find((b) => b.start === this._selectedDay) || null
          : bars[bars.length - 1] || null;

      return html`
        <ha-card @click=${(ev) => this._openWeather(ev)}>
          <div class="wrap ${m.compact ? "compact" : ""} ${m.showThermo ? "" : "no-thermo"}">
            <div class="header">
              <div class="head-l">
                <span class="title">${m.title}</span>
                ${m.unavailable
                  ? html`<span class="badge warn">Unavailable</span>`
                  : html`<span class="badge ${m.cond.id}">${m.cond.label}</span>`}
              </div>
              ${m.clock ? html`<span class="clock">${m.clock}</span>` : ""}
            </div>
            <div class="body">
              <div class="gauge-col">
                ${this._renderThermometer(m)}
              </div>
              <div class="now">
                <span class="now-stack">
                  <span class="now-v" style="color:${m.color}">${formatTempShort(m.live)}<small class="now-u">${m.unit}</small></span>
                  ${m.city ? html`<span class="now-city">${m.city}</span>` : ""}
                </span>
              </div>
              <div class="forecast-col">
                ${this._renderForecast(m)}
              </div>
              <div class="metrics">
                <div class="tiles">
                  ${m.cfg.show_humidity !== false && m.humidity != null
                    ? html`
                        <div class="tile">
                          <span class="tile-k">Humidity</span>
                          <span class="tile-v">${m.humidity}<small>%</small></span>
                        </div>
                      `
                    : html`
                        <div class="tile">
                          <span class="tile-k">Outdoor</span>
                          <span class="tile-v">${formatTemp(m.live, m.unit)}</span>
                        </div>
                      `}
                  <div class="tile">
                    <span class="tile-k">Wind</span>
                    <span class="tile-v">${m.wind != null ? html`${m.wind}<small>${m.windUnit}</small>` : "—"}</span>
                  </div>
                </div>
                <div class="stats">
                  <div class="stat">
                    <span class="stat-k">Today high</span>
                    <span class="stat-v">${formatTemp(m.hi, m.unit)}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-k">Today low</span>
                    <span class="stat-v">${formatTemp(m.lo, m.unit)}</span>
                  </div>
                </div>
                ${m.showThermo ? this._renderSun(m) : ""}
              </div>
                ${showHist
                  ? html`
                      <div class="hist">
                        <div class="hist-head">
                          <span class="hist-title">Daily high / low</span>
                          <div class="pills">
                            ${[7, 14, 30].map(
                              (d) => html`
                                <button class="pill ${Number(this._historyDays) === d ? "on" : ""}" @click=${() => {
                                  this._historyDays = d;
                                  this._histKey = "";
                                  this._loadHistory();
                                }}>${d}d</button>
                              `
                            )}
                          </div>
                        </div>
                        <div class="chart ${bars.length > 16 ? "dense" : ""}">
                          ${bars.map((b) => {
                            const hi = b.hi ?? minBar;
                            const lo = b.lo ?? hi;
                            const topPct = ((maxBar - hi) / span) * 100;
                            const hPct = Math.max(8, ((hi - lo) / span) * 100);
                            return html`
                              <button
                                class="bar-col ${this._selectedDay === b.start ? "sel" : ""}"
                                title=${b.title}
                                @click=${() => {
                                  this._selectedDay = b.start;
                                }}
                              >
                                <span class="bar-track">
                                  <span class="bar" style="top:${topPct}%;height:${hPct}%;background:${spiritColor(toF(hi, m.unit))}"></span>
                                </span>
                                <span class="bar-l">${b.label}</span>
                              </button>
                            `;
                          })}
                        </div>
                        ${selected
                          ? html`
                              <div class="hist-foot">
                                <span>${monthDay(selected.start, this.hass)}</span>
                                <span>H ${formatTemp(selected.hi, m.unit)} · L ${formatTemp(selected.lo, m.unit)}</span>
                              </div>
                            `
                          : ""}
                        ${this._histError ? html`<div class="hist-err">${this._histError}</div>` : ""}
                      </div>
                    `
                  : ""}
            </div>
          </div>
        </ha-card>
      `;
    }

    static get styles() {
      return css`
        :host {
          display: block;
        }
        :host([data-size="75"]) {
          zoom: 0.75;
        }
        :host([data-size="50"]) {
          zoom: 0.5;
        }
        :host([compact]) ha-card {
          height: 100%;
        }
        :host([no-thermo]) ha-card,
        :host([no-thermo]) .wrap {
          height: 100%;
          box-sizing: border-box;
        }
        :host([no-thermo]) .gauge-col {
          display: none;
        }
        :host([no-thermo]) .forecast-col {
          display: block;
          align-self: start;
          padding-top: 0.35rem;
        }
        :host([no-thermo]) .now {
          align-self: start;
        }
        :host([no-thermo]) .body {
          grid-template-columns: minmax(160px, 0.95fr) minmax(180px, 1.15fr);
          grid-template-rows: auto 1fr auto;
          grid-template-areas:
            "now forecast"
            "metrics metrics"
            "hist hist";
          align-content: stretch;
          align-items: stretch;
        }
        :host([no-thermo]) .now-v {
          font-size: 4.45rem;
          line-height: 1;
        }
        :host([no-thermo]) .compact .now-v {
          font-size: 4.2rem;
          line-height: 1;
        }
        :host([no-thermo]) .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          align-self: stretch;
          min-height: 0;
        }
        :host([no-thermo]) .tiles,
        :host([no-thermo]) .stats {
          display: contents;
        }
        :host([no-thermo]) .tile,
        :host([no-thermo]) .stat,
        :host([no-thermo]) .compact .tile,
        :host([no-thermo]) .compact .stat {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          padding: 16px 8px;
          border: 0;
          background: none;
          border-radius: 0;
          cursor: default;
          text-align: center;
        }
        :host([no-thermo]) .tile-k,
        :host([no-thermo]) .stat-k,
        :host([no-thermo]) .tile-v,
        :host([no-thermo]) .stat-v {
          text-align: center;
        }
        :host([no-thermo]) .tile-k,
        :host([no-thermo]) .stat-k {
          font-size: 0.7rem;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        :host([no-thermo]) .tile-v,
        :host([no-thermo]) .stat-v,
        :host([no-thermo]) .compact .tile-v,
        :host([no-thermo]) .compact .stat-v {
          margin-top: 8px;
          font-size: 1.55rem;
        }
        :host([no-thermo]) .wrap.compact {
          padding-bottom: 22px;
        }
        ha-card {
          overflow: hidden;
          cursor: pointer;
          background: var(--card-background-color, var(--ha-card-background));
        }
        .wrap {
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .wrap.compact {
          padding: 8px 10px 10px;
          height: 100%;
          box-sizing: border-box;
        }
        .setup {
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--secondary-text-color);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .compact .header {
          margin-bottom: 4px;
        }
        .head-l {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .clock {
          margin-left: auto;
          font-size: 1.05rem;
          font-weight: 650;
          color: var(--primary-text-color);
          white-space: nowrap;
        }
        .title {
          border: 0;
          background: none;
          padding: 0;
          font-size: 1.05rem;
          font-weight: 650;
          color: var(--primary-text-color);
          cursor: pointer;
          text-align: left;
        }
        .badge {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 3px 8px;
          border-radius: 999px;
          white-space: nowrap;
          color: var(--secondary-text-color);
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
        }
        .badge.warn {
          color: #3b1d00;
          background: #f8c15c;
        }
        .body {
          display: grid;
          grid-template-columns: minmax(120px, 0.85fr) minmax(180px, 1.15fr);
          grid-template-areas:
            "gauge now"
            "gauge metrics"
            "gauge hist";
          gap: 10px 16px;
          align-items: start;
          align-content: start;
          min-height: 0;
          flex: 1;
        }
        .compact .body {
          gap: 8px 12px;
        }
        .gauge-col {
          grid-area: gauge;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 0;
        }
        .now {
          grid-area: now;
          align-self: start;
        }
        .forecast-col {
          grid-area: forecast;
          display: none;
          min-width: 0;
        }
        .metrics {
          grid-area: metrics;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .hist {
          grid-area: hist;
        }
        .forecast {
          color: inherit;
          text-align: left;
        }
        .forecast-k {
          display: block;
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 650;
        }
        .forecast-v {
          display: block;
          margin-top: 4px;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.35;
        }
        .sun {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 8px;
          color: var(--secondary-text-color);
          font-size: 0.82rem;
          font-weight: 650;
        }
        .compact .sun {
          margin-top: 6px;
          font-size: 0.78rem;
        }
        .sun-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }
        .sun ha-icon {
          --mdc-icon-size: 16px;
        }
        .thermo-svg {
          width: 100%;
          max-width: 120px;
          max-height: 100%;
          line-height: 0;
        }
        .thermo-svg svg {
          width: 100%;
          height: auto;
          max-height: 100%;
          display: block;
        }
        .compact .thermo-svg {
          height: 198px;
          max-height: 198px;
          max-width: 96px;
        }
        .compact .thermo-svg svg {
          height: 198px;
          width: auto;
          max-width: 96px;
        }
        .now {
          border: 0;
          background: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          color: inherit;
        }
        .now-stack {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
        }
        .now-v {
          display: block;
          font-size: 3.2rem;
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 0.92;
        }
        .compact .now-v {
          font-size: 2.6rem;
        }
        .now-u {
          display: inline;
          margin-left: 0.08em;
          font-size: 0.32em;
          font-weight: 750;
          vertical-align: 0.92em;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .now-city {
          display: block;
          margin-top: 6px;
          font-size: 0.82rem;
          font-weight: 650;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .compact .now-city {
          margin-top: 4px;
          font-size: 0.76rem;
        }
        .tiles {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .tile,
        .stat {
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
          color: var(--primary-text-color);
          border-radius: 12px;
          padding: 12px 12px 11px;
          text-align: left;
        }
        .tile {
          cursor: pointer;
        }
        .compact .tile,
        .compact .stat {
          padding: 8px 10px 8px;
        }
        .tile-k,
        .stat-k {
          display: block;
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 650;
        }
        .tile-v,
        .stat-v {
          display: block;
          margin-top: 4px;
          font-size: 1.25rem;
          font-weight: 750;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .compact .tile-v,
        .compact .stat-v {
          font-size: 1.05rem;
        }
        .tile-v small {
          margin-left: 3px;
          font-size: 0.72rem;
          font-weight: 650;
          color: var(--secondary-text-color);
        }
        .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .hist {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .hist-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .hist-title {
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--secondary-text-color);
        }
        .pills {
          display: flex;
          gap: 4px;
        }
        .pill {
          border: 0;
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
          color: var(--secondary-text-color);
          font-size: 0.72rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 3px 8px;
          cursor: pointer;
        }
        .pill.on {
          background: #0b6aa2;
          color: #fff;
        }
        .chart {
          display: flex;
          align-items: stretch;
          gap: 3px;
          flex: 1;
          min-height: 132px;
          padding: 6px 0 0;
        }
        .bar-col {
          flex: 1;
          min-width: 0;
          border: 0;
          background: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          height: 100%;
        }
        .bar-track {
          position: relative;
          flex: 1;
          width: 70%;
          max-width: 12px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 6px;
        }
        .bar {
          position: absolute;
          left: 0;
          right: 0;
          border-radius: 6px;
          min-height: 8px;
        }
        .bar-col.sel .bar-track {
          outline: 2px solid #e8f7ff;
          outline-offset: 1px;
        }
        .bar-l {
          margin-top: 4px;
          font-size: 0.62rem;
          color: var(--secondary-text-color);
          line-height: 1;
          min-height: 0.7rem;
          white-space: nowrap;
        }
        .chart.dense {
          gap: 2px;
        }
        .hist-foot {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 6px;
          font-size: 0.78rem;
          color: var(--secondary-text-color);
        }
        .hist-err {
          margin-top: 4px;
          font-size: 0.75rem;
          color: var(--error-color, #f87171);
        }
        @media (max-width: 560px) {
          ha-card,
          .wrap {
            height: 100%;
            box-sizing: border-box;
          }
          .body,
          :host([no-thermo]) .body {
            grid-template-columns: minmax(140px, 0.9fr) minmax(140px, 1.15fr);
            grid-template-rows: auto 1fr auto;
            grid-template-areas:
              "now forecast"
              "metrics metrics"
              "hist hist";
            align-content: stretch;
            align-items: stretch;
          }
          .gauge-col {
            display: none !important;
          }
          .forecast-col,
          .now {
            display: block;
            align-self: start;
          }
          .forecast-col {
            padding-top: 0.35rem;
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            align-self: stretch;
          }
          .tiles,
          .stats {
            display: contents;
          }
          .now-v,
          .compact .now-v {
            font-size: 4.05rem;
            line-height: 1;
          }
          .tile-k,
          .stat-k {
            font-size: 0.68rem;
            letter-spacing: 0.02em;
            white-space: nowrap;
          }
          .tile,
          .stat,
          .compact .tile,
          .compact .stat {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100%;
            padding: 14px 8px;
            border: 0;
            background: none;
            border-radius: 0;
            cursor: default;
            text-align: center;
          }
          .tile-k,
          .stat-k,
          .tile-v,
          .stat-v {
            text-align: center;
          }
          .tile-v,
          .stat-v,
          .compact .tile-v,
          .compact .stat-v {
            margin-top: 8px;
            font-size: 1.35rem;
          }
          .wrap.compact {
            padding-bottom: 22px;
          }
        }
      `;
    }
  }

  class OutdoorTempPlusCardEditor extends LitElement {
    static get properties() {
      return { hass: {}, config: {} };
    }

    setConfig(config) {
      this.config = mergeConfig(config || {});
    }

    _valueChanged(ev) {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: ev.detail.value },
        })
      );
    }

    render() {
      if (!this.hass) return html``;
      const merged = mergeConfig(this.config || {});
      return html`
        <ha-form
          .hass=${this.hass}
          .data=${merged}
          .schema=${[
            { name: "name", selector: { text: {} } },
            { name: "city", selector: { text: {} } },
            { name: "zip", selector: { text: {} } },
            {
              name: "look",
              selector: {
                select: {
                  mode: "dropdown",
                  options: Object.keys(LOOKS).map((value) => ({
                    value,
                    label: LOOKS[value].label,
                  })),
                },
              },
            },
            {
              name: "size",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "100", label: "Full (100%)" },
                    { value: "75", label: "75%" },
                    { value: "50", label: "50%" },
                  ],
                },
              },
            },
            {
              name: "entity",
              selector: {
                entity: { domain: "sensor", device_class: "temperature" },
              },
            },
            {
              name: "humidity_entity",
              selector: {
                entity: { domain: "sensor", device_class: "humidity" },
              },
            },
            {
              name: "weather_entity",
              selector: { entity: { domain: "weather" } },
            },
            {
              name: "unit_system",
              selector: {
                select: {
                  options: [
                    { value: "auto", label: "Auto (from sensor)" },
                    { value: "imperial", label: "°F" },
                    { value: "metric", label: "°C" },
                  ],
                },
              },
            },
            {
              name: "history_days",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "7", label: "7 days" },
                    { value: "14", label: "14 days" },
                    { value: "30", label: "30 days" },
                  ],
                },
              },
            },
            { name: "show_history", selector: { boolean: {} } },
            { name: "show_humidity", selector: { boolean: {} } },
            { name: "show_feels", selector: { boolean: {} } },
            { name: "show_thermometer", selector: { boolean: {} } },
            { name: "show_sun", selector: { boolean: {} } },
            { name: "compact", selector: { boolean: {} } },
          ]}
          .computeLabel=${(s) =>
            ({
              name: "Card title",
              city: "City name (optional)",
              zip: "ZIP code for another city (optional)",
              look: "Thermometer look",
              size: "Card size",
              entity: "Outdoor temperature",
              humidity_entity: "Outdoor humidity (optional)",
              weather_entity: "Weather forecast (optional)",
              unit_system: "Display units",
              history_days: "Default history range",
              show_history: "Show daily high / low history",
              show_humidity: "Show humidity",
              show_feels: "Show heat-index when hot",
              show_thermometer: "Show thermometer plaque",
              show_sun: "Show sunrise / sunset",
              compact: "Compact (activity rotator)",
            })[s.name] || s.name}
          @value-changed=${this._valueChanged}
        ></ha-form>
      `;
    }
  }

  if (!customElements.get("outdoor-temp-plus-card")) {
    customElements.define("outdoor-temp-plus-card", OutdoorTempPlusCard);
  } else {
    const proto = customElements.get("outdoor-temp-plus-card").prototype;
    const src = OutdoorTempPlusCard.prototype;
    for (const name of Object.getOwnPropertyNames(src)) {
      if (name === "constructor") continue;
      proto[name] = src[name];
    }
  }
  if (!customElements.get("outdoor-temp-plus-card-editor")) {
    customElements.define("outdoor-temp-plus-card-editor", OutdoorTempPlusCardEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "outdoor-temp-plus-card")) {
    window.customCards.push({
      type: "outdoor-temp-plus-card",
      name: "Outdoor Temp Plus",
      description: "EZ-read outdoor thermometer with humidity and daily high / low",
      preview: true,
      documentationURL: "https://github.com/randrcomputers/ha-outdoor-temp-card#readme",
    });
  }
})();
