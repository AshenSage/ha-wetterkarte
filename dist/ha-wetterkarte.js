/* Arandjelovac Wetterkarte 1.0.0 — lokale Karte, keine externen Abhängigkeiten. */
(() => {
  'use strict';
  const TAG = 'arandjelovac-weather-card';
  if (customElements.get(TAG)) return;
  const TEMPLATE = "{# Grenzen: aktuelle HA-Meldung 3 h; Prognoseabfrage in der Karte 2 h. #}\n{% set weather_entities = weather_sources %}\n{% set known_conditions = ['sunny', 'clear-night', 'partlycloudy', 'cloudy',\n  'rainy', 'pouring', 'lightning', 'lightning-rainy', 'snowy', 'snowy-rainy',\n  'fog', 'hail', 'windy', 'windy-variant', 'exceptional'] %}\n{% macro aware_macro(value, returns) -%}\n  {% set dt = as_datetime(value, none) %}\n  {% do returns(dt if dt is not none and dt.tzinfo is not none else none) %}\n{%- endmacro %}\n{% set aware = aware_macro | as_function %}\n{% macro fresh_macro(entity_id, returns) -%}\n  {% set s = states[entity_id] %}\n  {% set dt = aware(s.last_reported) if s is not none and s.last_reported is defined else none %}\n  {% set age = as_timestamp(now()) - as_timestamp(dt) if dt is not none else none %}\n  {% do returns(has_value(entity_id) and age is not none and 0 <= age <= 10800) %}\n{%- endmacro %}\n{% set fresh = fresh_macro | as_function %}\n{% macro convert_macro(value, unit, kind, returns) -%}\n  {% set unit = unit | default('', true) | string | lower | trim %}\n  {% set result = none %}\n  {% if is_number(value) and value is not boolean %}\n    {% set value = value | float %}\n    {% if kind == 'temperature' %}\n      {% if unit in ['°c', 'c', 'celsius'] %}{% set result = value %}\n      {% elif unit in ['°f', 'f', 'fahrenheit'] %}{% set result = (value - 32) / 1.8 %}\n      {% elif unit in ['k', 'kelvin'] %}{% set result = value - 273.15 %}{% endif %}\n    {% elif kind == 'wind' and value >= 0 %}\n      {% set factors = {'km/h': 1, 'kph': 1, 'm/s': 3.6, 'mph': 1.609344,\n        'kn': 1.852, 'kt': 1.852, 'knots': 1.852, 'ft/s': 1.09728} %}\n      {% if unit in factors %}{% set result = value * factors[unit] %}{% endif %}\n    {% elif kind == 'rain' and value >= 0 %}\n      {% set factors = {'mm': 1, 'in': 25.4, 'inches': 25.4, 'cm': 10} %}\n      {% if unit in factors %}{% set result = value * factors[unit] %}{% endif %}\n    {% endif %}\n  {% endif %}\n  {% do returns(result) %}\n{%- endmacro %}\n{% set convert = convert_macro | as_function %}\n{% macro median_macro(values, returns) -%}\n  {% set values = values | sort %}{% set n = values | count %}\n  {% do returns(none if n == 0 else values[n // 2] if n % 2 else\n    (values[n // 2 - 1] + values[n // 2]) / 2) %}\n{%- endmacro %}\n{% set median = median_macro | as_function %}\n{% macro condition_macro(values, returns) -%}\n  {% set ns = namespace(c='unknown', count=0) %}\n  {# Warnende Wetterarten gehen bei widersprüchlichen Quellen vor. #}\n  {% for c in ['exceptional', 'lightning-rainy', 'lightning', 'hail', 'snowy-rainy',\n    'snowy', 'pouring', 'rainy', 'fog', 'windy-variant', 'windy'] %}\n    {% if ns.c == 'unknown' and c in values %}{% set ns.c = c %}{% endif %}\n  {% endfor %}\n  {% if ns.c == 'unknown' %}\n    {% for c in ['partlycloudy', 'cloudy', 'sunny', 'clear-night'] %}\n      {% set n = values | select('eq', c) | list | count %}\n      {% if n > ns.count %}{% set ns.c = c %}{% set ns.count = n %}{% endif %}\n    {% endfor %}\n    {% if ns.count == 1 and 'cloudy' in values and\n      ('sunny' in values or 'clear-night' in values) %}{% set ns.c = 'partlycloudy' %}{% endif %}\n  {% endif %}\n  {% do returns(ns.c) %}\n{%- endmacro %}\n{% set condition = condition_macro | as_function %}\n{% macro current_macro(returns) -%}\n  {% set ns = namespace(temps=[], winds=[], conditions=[], reports=[], old=0) %}\n  {% for e in weather_entities %}\n    {% if fresh(e) %}\n      {% set t = convert(state_attr(e, 'temperature'), state_attr(e, 'temperature_unit'), 'temperature') %}\n      {% set w = convert(state_attr(e, 'wind_speed'), state_attr(e, 'wind_speed_unit'), 'wind') %}\n      {% if t is not none %}\n        {% set ns.temps = ns.temps + [t] %}\n        {% set ns.reports = ns.reports + [as_timestamp(states[e].last_reported)] %}\n      {% endif %}\n      {% if w is not none %}{% set ns.winds = ns.winds + [w] %}{% endif %}\n      {% if states(e) in known_conditions %}{% set ns.conditions = ns.conditions + [states(e)] %}{% endif %}\n    {% elif has_value(e) %}{% set ns.old = ns.old + 1 %}{% endif %}\n  {% endfor %}\n  {% do returns({'temperature': median(ns.temps), 'wind_speed': median(ns.winds),\n    'condition': condition(ns.conditions), 'source_count': ns.temps | count,\n    'condition_source_count': ns.conditions | count, 'wind_source_count': ns.winds | count,\n    'reported_at': (as_local(as_datetime(ns.reports | min)).isoformat() if ns.reports else none),\n    'old_sources': ns.old}) %}\n{%- endmacro %}\n{% set current_data = current_macro | as_function %}\n{% macro forecast_macro(entity, returns) -%}\n  {% set raw = state_attr(entity, 'forecast') %}\n  {% set dt = aware(state_attr(entity, 'last_update')) %}\n  {% set age = as_timestamp(now()) - as_timestamp(dt) if dt is not none else none %}\n  {% set valid = raw is sequence and raw is not string and raw is not mapping %}\n  {# Die Temperatur des Konsens-Sensors darf unknown sein, wenn die Prognose dennoch Daten hat. #}\n  {% set available = states(entity) != 'unavailable' and valid and dt is not none and 0 <= age <= 7200 %}\n  {% do returns({'items': raw if available else [], 'stamp': dt,\n    'reason': 'Veraltet' if dt is not none and age is not none and age > 7200 else 'Keine Daten',\n    'available': available, 'ok': state_attr(entity, 'last_fetch_ok') == true}) %}\n{%- endmacro %}\n{% set forecast_data = forecast_macro | as_function %}\n{% set rise = aware(state_attr('sun.sun', 'next_rising')) %}\n{% set setting = aware(state_attr('sun.sun', 'next_setting')) %}\n{% macro night_macro(dt, returns) -%}\n  {% set value = none %}\n  {% if is_state('sun.sun', 'above_horizon') or is_state('sun.sun', 'below_horizon') %}\n    {% if as_timestamp(dt) <= as_timestamp(now()) %}\n      {% set value = is_state('sun.sun', 'below_horizon') %}\n    {% elif rise is not none and setting is not none %}\n      {% set t = as_timestamp(dt) %}{% set r = as_timestamp(rise) %}{% set s = as_timestamp(setting) %}\n      {% set value = t < r or t >= s if r < s else s <= t < r %}\n    {% endif %}\n  {% endif %}\n  {% do returns(value) %}\n{%- endmacro %}\n{% set night = night_macro | as_function %}\n\n{% set current = current_data() %}\n{% set daily = forecast_data(day_entity) %}\n{% set hourly = forecast_data(hour_entity) %}\n{% set candidates = namespace(items=[]) %}\n{% for h in hourly['items'] %}\n  {% if h is mapping and h.get('time') != 'Jetzt' %}\n    {% set dt = aware(h.get('datetime')) %}\n    {% if dt is not none and as_timestamp(now()) < as_timestamp(dt) <= as_timestamp(now()) + 24 * 3600 %}\n      {% set candidates.items = candidates.items + [dict(h, stamp=as_timestamp(dt))] %}\n    {% endif %}\n  {% endif %}\n{% endfor %}\n{% set result = namespace(hours=[], days=[], seen=[]) %}\n{% for h in candidates.items | sort(attribute='stamp') %}\n  {% if h.stamp not in result.seen %}\n    {% set result.seen = result.seen + [h.stamp] %}\n    {% set dt = as_local(aware(h.get('datetime'))) %}\n    {% set repeated = namespace(n=0) %}\n    {% for x in candidates.items %}\n      {% if x.stamp != h.stamp and as_local(aware(x.get('datetime'))).strftime('%Y-%m-%d %H:%M') == dt.strftime('%Y-%m-%d %H:%M') %}\n        {% set repeated.n = repeated.n + 1 %}\n      {% endif %}\n    {% endfor %}\n    {% set result.hours = result.hours + [{\n      'stamp': h.stamp, 'time': dt.strftime('%H:%M'),\n      'date': dt.strftime('%d.%m.') if dt.date() != now().date() else '',\n      'offset': ('UTC' ~ dt.strftime('%z')[:3]) if repeated.n else '',\n      'temperature': h.get('temperature'), 'condition': h.get('condition', 'unknown'),\n      'precipitation': h.get('precipitation'), 'night': night(dt)}] %}\n  {% endif %}\n{% endfor %}\n{% set weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] %}\n{% for offset in range(7) %}\n  {% set target = now().date() + timedelta(days=offset) %}\n  {% set found = namespace(day={}) %}\n  {% for d in daily['items'] %}\n    {% if d is mapping and d.get('date') == target | string %}{% set found.day = d %}{% endif %}\n  {% endfor %}\n  {% set d = found.day %}\n  {% set result.days = result.days + [{\n    'label': 'Heute' if offset == 0 else weekdays[target.weekday()],\n    'date': target | string, 'condition': d.get('condition', 'unknown'),\n    'temperature': d.get('temperature'), 'templow': d.get('templow'),\n    'precipitation': d.get('precipitation'), 'available': d | count > 0}] %}\n{% endfor %}\n{% set sources = namespace(items=[]) %}\n{% for e in weather_entities %}\n  {% set s = states[e] %}\n  {% set dt = aware(s.last_reported) if s is not none and s.last_reported is defined else none %}\n  {% set sources.items = sources.items + [{'entity': e,\n    'name': state_attr(e, 'friendly_name') or e, 'fresh': fresh(e),\n    'reported_at': dt.isoformat() if dt is not none else none,\n    'has_value': has_value(e)}] %}\n{% endfor %}\n{{ {'current': current, 'current_night': night(now()),\n    'generated_at': now().isoformat(), 'today': now().date() | string,\n    'hours': result.hours, 'days': result.days, 'sources': sources.items,\n    'daily': {'available': daily.available, 'reason': daily.reason, 'ok': daily.ok,\n      'stamp': daily.stamp.isoformat() if daily.stamp is not none else none,\n      'source_count': state_attr(day_entity, 'source_count')},\n    'hourly': {'available': hourly.available, 'reason': hourly.reason, 'ok': hourly.ok,\n      'stamp': hourly.stamp.isoformat() if hourly.stamp is not none else none,\n      'source_count': state_attr(hour_entity, 'source_count')},\n    'sun': {'state': states('sun.sun'),\n      'rise': rise.isoformat() if rise is not none else none,\n      'setting': setting.isoformat() if setting is not none else none}\n  } | tojson }}\n";
  const ICONS = {
    sunny: 'weather-sunny', 'clear-night': 'weather-night', partlycloudy: 'weather-partly-cloudy',
    cloudy: 'weather-cloudy', rainy: 'weather-rainy', pouring: 'weather-pouring',
    lightning: 'weather-lightning', 'lightning-rainy': 'weather-lightning-rainy',
    snowy: 'weather-snowy', 'snowy-rainy': 'weather-snowy-rainy', fog: 'weather-fog',
    hail: 'weather-hail', windy: 'weather-windy', 'windy-variant': 'weather-windy-variant',
    exceptional: 'alert-circle-outline', unknown: 'help-circle-outline'
  };
  const LABELS = {
    sunny: 'Sonnig', 'clear-night': 'Klar', partlycloudy: 'Teilweise bewölkt', cloudy: 'Bewölkt',
    rainy: 'Regen', pouring: 'Starker Regen', lightning: 'Gewitter', 'lightning-rainy': 'Gewitter mit Regen',
    snowy: 'Schnee', 'snowy-rainy': 'Schneeregen', fog: 'Nebel', hail: 'Hagel', windy: 'Windig',
    'windy-variant': 'Windig und bewölkt', exceptional: 'Aussergewöhnliches Wetter', unknown: 'Wetterlage fehlt'
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = v => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  const fmt = (v, d = 0) => number(v) ? Number(v).toLocaleString('de-CH', {minimumFractionDigits:d, maximumFractionDigits:d, useGrouping:false}).replace('.', ',') : '—';
  const degrees = (v, d = 0) => number(v) ? `${fmt(v, d)}°` : '—';
  const dateMs = v => typeof v === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/.test(v) ? Date.parse(v) : NaN;
  const fresh = (stamp, seconds) => { const age = (Date.now() - dateMs(stamp)) / 1000; return Number.isFinite(age) && age >= 0 && age <= seconds; };
  const icon = (name, cls = '', label = '') => `<ha-icon icon="mdi:${esc(name)}" class="${esc(cls)}"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}></ha-icon>`;
  const weather = (condition, night = false, extra = '') => {
    const c = condition === 'sunny' && night === true ? 'clear-night' : condition;
    const name = c === 'partlycloudy' && night === true ? 'weather-night-partly-cloudy' : ICONS[c] || ICONS.unknown;
    const color = ['sunny','partlycloudy'].includes(c) && !night ? 'sunny' : ['rainy','pouring','snowy','snowy-rainy','clear-night'].includes(c) ? 'blue' : ['lightning','lightning-rainy','hail','exceptional'].includes(c) ? 'warning' : '';
    return icon(name, `weather ${color} ${extra}`, LABELS[c] || LABELS.unknown);
  };
  const STYLES = `
    :host{display:block;--wc-accent:var(--weather-card-accent,#9bcbb2);--wc-muted:var(--secondary-text-color,#b6c9c0);--wc-line:color-mix(in srgb,var(--primary-text-color,#edf5ee) 13%,transparent);font-family:var(--ha-font-family-body,Roboto,Arial,sans-serif)}
    *{box-sizing:border-box} [hidden]{display:none!important}
    ha-card{display:block;padding:18px 18px 0;overflow:hidden;background:var(--ha-card-background,var(--card-background-color,#304f41));color:var(--primary-text-color,#edf5ee);border:1px solid var(--ha-card-border-color,#526f60);border-radius:var(--ha-card-border-radius,20px);box-shadow:var(--ha-card-box-shadow,none)}
    button,summary{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}button{border:0;background:none;cursor:pointer}button:focus-visible,summary:focus-visible{outline:2px solid var(--wc-accent);outline-offset:2px;border-radius:8px}ha-icon{display:inline-flex;flex-shrink:0;--mdc-icon-size:22px;width:22px;height:22px;color:inherit}
    .location{display:flex;align-items:center;gap:7px;font-size:17px;font-weight:600;min-width:0}.location span{overflow-wrap:anywhere}.location>ha-icon{color:var(--wc-accent);--mdc-icon-size:20px;width:20px;height:20px}.info{margin-left:auto;min-width:44px;height:44px;display:grid;place-items:center;color:var(--wc-muted)}
    .hero{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0 20px}.temperature{font-size:50px;font-weight:600;line-height:1.08;letter-spacing:-1.6px;font-variant-numeric:tabular-nums}.temperature .unit{font-size:18px;font-weight:400;letter-spacing:0;color:var(--wc-muted);margin-left:4px}.condition{font-size:18px;font-weight:500;margin-top:5px;line-height:1.3}.wind{display:flex;align-items:center;gap:6px;color:var(--wc-muted);font-size:14px;margin-top:7px}.wind ha-icon{--mdc-icon-size:19px;width:19px;height:19px}.hero>.weather{--mdc-icon-size:72px;width:72px;height:72px;margin-right:4px}
    .sunny{color:var(--weather-card-sun,#efc758)}.blue{color:var(--weather-card-rain,#7ac9ef)}.warning{color:var(--warning-color,#efb869)}.weather{color:var(--weather-card-cloud,#bdcbc7)}.weather.sunny{color:var(--weather-card-sun,#efc758)}.weather.blue{color:var(--weather-card-rain,#7ac9ef)}.weather.warning{color:var(--warning-color,#efb869)}
    .tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--wc-line);border-radius:14px;background:color-mix(in srgb,var(--wc-accent) 4%,transparent)}.tab{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:44px;width:50%;border-radius:10px;font-weight:500;font-size:15px;color:var(--wc-muted)}.tab[aria-selected=true]{background:var(--weather-card-tab-background,color-mix(in srgb,var(--wc-accent) 30%,transparent));color:var(--primary-text-color,#edf5ee)}
    .panel{padding-top:12px;min-width:0}.table-heading,.day{display:grid;grid-template-columns:58px 34px minmax(48px,1fr) 43px 43px;column-gap:8px;align-items:center}.table-heading{min-height:33px;color:var(--wc-muted);font-size:12px;border-bottom:1px solid var(--wc-line)}.table-heading .caption{grid-column:1/4;font-size:13px;font-weight:500}.table-heading .min,.table-heading .max{text-align:right}.day{min-height:45px;padding:8px 0;border-bottom:1px solid var(--wc-line);font-variant-numeric:tabular-nums}.day:last-child{border-bottom:0}.day-label{font-size:15px}.today{font-weight:600}.day .weather{--mdc-icon-size:26px;width:26px;height:26px}.rain{display:flex;justify-content:flex-end;align-items:center;gap:2px;white-space:nowrap;color:var(--wc-muted);font-size:12px}.rain ha-icon{--mdc-icon-size:15px;width:15px;height:15px;color:var(--weather-card-rain,#7ac9ef)}.min,.max{text-align:right;white-space:nowrap}.day .min{font-size:16px;color:var(--wc-muted)}.day .max{font-size:17px;font-weight:600}.rain.missing{font-size:11px}
    .hours-caption{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:32px;color:var(--wc-muted);font-size:12px}.hours-caption strong{font-size:13px;font-weight:500}.hour-scroll{display:flex;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;gap:4px;padding:9px 0 14px;scrollbar-width:thin;scrollbar-color:var(--wc-line) transparent}.hour{flex:0 0 calc((100% - 16px)/5);min-width:54px;scroll-snap-align:start;text-align:center;padding:5px 2px;display:flex;align-items:center;flex-direction:column;gap:10px;min-height:112px;font-variant-numeric:tabular-nums}.hour:first-child{border-radius:11px;background:color-mix(in srgb,var(--wc-accent) 8%,transparent)}.hour-time{font-size:13px;color:var(--wc-muted);white-space:nowrap}.hour:first-child .hour-time{font-weight:600;color:inherit}.hour .weather{--mdc-icon-size:30px;width:30px;height:30px}.hour-temp{font-size:21px;font-weight:600;white-space:nowrap}.hour-sub{font-size:10px;color:var(--wc-muted);margin-top:-5px;white-space:nowrap}.hour .rain{font-size:11px}.sun-event{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--wc-muted);padding:0 0 10px}.notice{display:flex;align-items:flex-start;gap:7px;line-height:1.5;padding:10px 0;color:var(--wc-muted);font-size:13px}.notice ha-icon{--mdc-icon-size:18px;width:18px;height:18px;margin-top:1px}.notice.problem{color:var(--warning-color,#efb869)}.retry{display:inline-block;min-height:36px;color:var(--wc-accent);text-decoration:underline;padding:4px}
    .footer{display:flex;align-items:center;gap:8px;min-height:49px;border-top:1px solid var(--wc-line);font-size:11px;color:var(--wc-muted)}.dot{width:7px;height:7px;border-radius:50%;background:var(--wc-accent);flex-shrink:0}.dot.caution{background:var(--warning-color,#efb869)}.dot.offline{background:var(--error-color,#e88787)}.status{min-width:0;line-height:1.4}.sources-button{margin-left:auto;min-height:44px;padding:0 0 0 7px;display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:12px}.sources-button ha-icon{--mdc-icon-size:18px;width:18px;height:18px}.source-details{padding:2px 0 13px;font-size:12px;color:var(--wc-muted);line-height:1.5;overflow-wrap:anywhere}.source-details h4{font-size:12px;color:var(--primary-text-color);font-weight:600;margin:8px 0 3px}.source-details p{margin:2px 0 5px}.source{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:6px 0;border-bottom:1px solid var(--wc-line)}.source button{text-align:left;padding:0;font-size:12px;color:var(--wc-muted)}.source .source-state{text-align:right}.source-note{font-size:11px;margin-top:10px!important}.error-text{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
    @media(max-width:360px){ha-card{padding:14px 12px 0}.table-heading,.day{grid-template-columns:52px 28px minmax(44px,1fr) 36px 36px;column-gap:5px}.temperature{font-size:45px}.hero>.weather{--mdc-icon-size:62px;width:62px;height:62px}.rain{font-size:11px}.day-label{font-size:14px}.hour{min-width:48px}.footer{font-size:10px}.sources-button{font-size:11px}.location{font-size:16px}}
  `;

  class ArandjelovacWeatherCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this._tab = null; this._expanded = false; this._token = 0;
      this.shadowRoot.addEventListener('click', ev => this._onClick(ev));
      this.shadowRoot.addEventListener('keydown', ev => this._onKey(ev));
      this._onReady = () => { this._offline = false; this._stopSubscription(); this._subscribe(); this._render(); };
      this._onDisconnected = () => { this._offline = true; this._render(); };
    }
    setConfig(config) {
      const next = {
        title:'Aranđelovac', daily_entity:'sensor.arandjelovac_wetter_konsens',
        hourly_entity:'sensor.arandjelovac_wetter_stunden',
        weather_entities:['weather.arandjelovac','weather.forecast_home','weather.tomorrow_io_arandjelovac_daily'],
        default_tab:'days', ...config
      };
      if (!['days','hours'].includes(next.default_tab)) throw new Error('default_tab muss days oder hours sein.');
      if (!Array.isArray(next.weather_entities) || !next.weather_entities.length || next.weather_entities.some(v => typeof v !== 'string' || !/^weather\.[a-z0-9_]+$/.test(v))) throw new Error('weather_entities muss eine Liste gültiger Wetter-Entitäten sein.');
      for (const key of ['daily_entity','hourly_entity']) if (typeof next[key] !== 'string' || !/^sensor\.[a-z0-9_]+$/.test(next[key])) throw new Error(`${key}: gültige Sensor-Entität erforderlich.`);
      const changed = this._config && JSON.stringify([next.daily_entity,next.hourly_entity,next.weather_entities]) !== JSON.stringify([this._config.daily_entity,this._config.hourly_entity,this._config.weather_entities]);
      if (this._config?.default_tab !== next.default_tab) this._tab = next.default_tab;
      this._config = next;
      if (changed) { this._data = null; this._error = null; this._stopSubscription(); }
      this._render(); this._syncConnection();
    }
    set hass(hass) { this._hass = hass; this._syncConnection(); }
    get hass() { return this._hass; }
    connectedCallback() {
      this._timer = setInterval(() => this._render(), 60000);
      this._syncConnection(); this._render();
    }
    disconnectedCallback() {
      clearInterval(this._timer); this._timer = null;
      this._stopSubscription(); this._unbindConnection();
    }
    getCardSize() { return this._tab === 'days' ? (this._expanded ? 14 : 11) : (this._expanded ? 10 : 7); }
    getGridOptions() { return {columns:12, min_columns:6}; }
    static getStubConfig() { return {title:'Aranđelovac', default_tab:'days'}; }
    _unbindConnection() {
      if (this._connection?.removeEventListener) {
        this._connection.removeEventListener('ready', this._onReady);
        this._connection.removeEventListener('disconnected', this._onDisconnected);
      }
      this._connection = null;
    }
    _syncConnection() {
      if (!this.isConnected || !this._config || !this._hass?.connection) return;
      const connection = this._hass.connection;
      if (this._connection !== connection) {
        this._stopSubscription(); this._unbindConnection(); this._connection = connection;
        connection.addEventListener?.('ready', this._onReady);
        connection.addEventListener?.('disconnected', this._onDisconnected);
      }
      this._offline = this._hass.connected === false;
      if (!this._offline) this._subscribe();
    }
    _stopSubscription() {
      this._token += 1; this._pending = false; this._failed = false;
      if (this._unsub) { const unsub = this._unsub; this._unsub = null; Promise.resolve().then(unsub).catch(() => {}); }
    }
    async _subscribe() {
      if (!this.isConnected || !this._connection || this._unsub || this._pending || this._failed || !this._config || this._offline) return;
      const token = ++this._token;
      this._pending = true;
      try {
        const unsub = await this._connection.subscribeMessage(message => {
          if (token !== this._token || !this.isConnected) return;
          if (message.error) {
            this._error = String(message.error); this._render(); return;
          }
          try {
            const value = typeof message.result === 'string' ? JSON.parse(message.result) : message.result;
            if (!value || typeof value.current !== 'object' || !Array.isArray(value.days) || !Array.isArray(value.hours)) throw new Error('Unerwartetes Datenformat');
            this._data = value; this._error = null; this._offline = false; this._render();
          } catch (err) { this._error = `Wetterdaten konnten nicht gelesen werden: ${err.message}`; this._render(); }
        }, {type:'render_template', template:TEMPLATE, report_errors:true, variables:{
          weather_sources:this._config.weather_entities, day_entity:this._config.daily_entity, hour_entity:this._config.hourly_entity
        }});
        if (token !== this._token || !this.isConnected) { await unsub(); return; }
        this._unsub = unsub;
      } catch (err) {
        if (token === this._token) { this._failed = true; this._error = err.message || String(err); this._render(); }
      } finally { if (token === this._token) this._pending = false; }
    }
    _time(stamp, date = false) {
      if (!Number.isFinite(dateMs(stamp))) return '—';
      const options = {hour:'2-digit', minute:'2-digit', timeZone:this._hass?.config?.time_zone || 'Europe/Belgrade', ...(date ? {day:'2-digit',month:'2-digit'} : {})};
      try { return new Intl.DateTimeFormat('de-CH', options).format(new Date(stamp)); } catch { return '—'; }
    }
    _effective() {
      const data = this._data;
      if (!data) return null;
      const currentValid = fresh(data.generated_at, 10800) && (!data.current.reported_at || fresh(data.current.reported_at, 10800));
      const current = currentValid ? data.current : {...data.current,temperature:null,wind_speed:null,condition:'unknown',source_count:0,condition_source_count:0,wind_source_count:0,old_sources:1};
      const validForecast = part => ({...part, available:part?.available === true && fresh(part.stamp,7200), reason:part?.stamp && !fresh(part.stamp,7200) ? 'Veraltet' : part?.reason || 'Keine Daten'});
      return {...data,current,daily:validForecast(data.daily),hourly:validForecast(data.hourly)};
    }
    _onClick(ev) {
      const el = ev.composedPath().find(v => v instanceof HTMLElement && v.dataset?.action);
      if (!el) return;
      if (el.dataset.action === 'tab') {
        this._tab = el.dataset.tab; this._render();
        this.shadowRoot.querySelector(`[data-tab="${this._tab}"]`)?.focus({preventScroll:true});
        this.dispatchEvent(new Event('iron-resize', {bubbles:true,composed:true}));
      } else if (el.dataset.action === 'sources') {
        this._expanded = !this._expanded; this._render();
        this.shadowRoot.querySelector('.sources-button')?.focus({preventScroll:true});
      } else if (el.dataset.action === 'info') {
        this._expanded = !this._expanded; this._render();
        if (this._expanded) this.shadowRoot.querySelector('.source-details')?.scrollIntoView({block:'nearest',behavior:'smooth'});
      } else if (el.dataset.action === 'retry') { this._error = null; this._stopSubscription(); this._subscribe(); this._render(); }
      else if (el.dataset.action === 'more') this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId:el.dataset.entity}}));
    }
    _onKey(ev) {
      const tab = ev.composedPath().find(v => v instanceof HTMLElement && v.dataset?.action === 'tab');
      if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) return;
      ev.preventDefault(); this._tab = ev.key === 'Home' ? 'hours' : ev.key === 'End' ? 'days' : this._tab === 'days' ? 'hours' : 'days';
      this._render(); this.shadowRoot.querySelector(`[data-tab="${this._tab}"]`)?.focus({preventScroll:true});
    }
    _rain(value, known = true) {
      if (!known) return '';
      if (!number(value) || Number(value) < 0) return `<span class="rain missing" title="Regenmenge fehlt">Regen —</span>`;
      if (Number(value) === 0) return '';
      const text = Number(value) < 0.05 ? '<0,1' : fmt(value,1);
      return `<span class="rain">${icon('water-outline')}<span>${esc(text)} mm</span></span>`;
    }
    _days(data) {
      if (!data) return this._notice('Wetterdaten werden geladen …');
      if (!data.daily.available) return this._notice(data.daily.reason === 'Veraltet' ? 'Die Tagesprognose ist veraltet.' : 'Keine Tagesprognose verfügbar.', true);
      const missing = data.days.filter(d => !d.available).length;
      return `<div class="table-heading" aria-hidden="true"><span class="caption">Vorhersage</span><span class="min">Min</span><span class="max">Max</span></div>
        <div role="list" aria-label="Wetter der nächsten sieben Tage">${data.days.map((d,i) => `<div class="day" role="listitem" aria-label="${esc(`${d.label}, ${LABELS[d.condition] || LABELS.unknown}, Minimum ${degrees(d.templow)}, Maximum ${degrees(d.temperature)}, Regen ${number(d.precipitation) ? fmt(d.precipitation,1) + ' Millimeter' : 'unbekannt'}`)}">
          <span class="day-label ${i === 0 ? 'today' : ''}" title="${esc(d.date)}">${esc(d.label)}</span>${weather(d.condition)}<span class="rain-cell">${this._rain(d.precipitation,d.available)}</span><span class="min">${degrees(d.templow)}</span><span class="max">${degrees(d.temperature)}</span>
        </div>`).join('')}</div>${missing ? this._notice(`${missing} ${missing === 1 ? 'Tag ohne Prognose' : 'Tage ohne Prognose'}.`) : ''}`;
    }
    _hours(data) {
      if (!data) return this._notice('Wetterdaten werden geladen …');
      const current = data.current;
      const hours = [{time:'Jetzt',temperature:current.temperature,condition:current.condition,night:data.current_night},
        ...(data.hourly.available ? data.hours.filter(h => Number(h.stamp) * 1000 > Date.now()) : [])];
      return `<div class="hours-caption"><strong>Nächste Stunden</strong><span>${hours.length > 5 ? 'Wischen für mehr →' : 'Temperatur in °C'}</span></div>
        <div class="hour-scroll" tabindex="0" aria-label="Stündliche Vorhersage, horizontal scrollbar">${hours.map(h => `<div class="hour"><span class="hour-time">${esc(h.time)}</span>${weather(h.condition,h.night)}<span class="hour-temp">${degrees(h.temperature)}</span>${h.date ? `<span class="hour-sub">${esc(h.date)}</span>` : ''}${h.offset ? `<span class="hour-sub">${esc(h.offset)}</span>` : ''}${h.time !== 'Jetzt' && number(h.precipitation) && Number(h.precipitation)>0 ? this._rain(h.precipitation) : ''}</div>`).join('')}</div>
        ${!data.hourly.available ? this._notice(data.hourly.reason === 'Veraltet' ? 'Die Stundenprognose ist veraltet.' : 'Keine Stundenprognose verfügbar.',true) : hours.length === 1 ? this._notice('Keine zukünftigen Stunden vorhanden.') : ''}${this._sun(data)}`;
    }
    _sun(data) {
      const sun = data.sun || {};
      const rising = sun.state === 'below_horizon';
      const stamp = rising ? sun.rise : sun.setting;
      const delta = dateMs(stamp) - Date.now();
      if (!(delta > 0 && delta <= 4*3600000)) return '';
      return `<div class="sun-event">${icon(rising ? 'weather-sunset-up' : 'weather-sunset-down')}<span>${rising ? 'Sonnenaufgang' : 'Sonnenuntergang'} ${esc(this._time(stamp))}</span></div>`;
    }
    _notice(text, problem = false) { return `<div class="notice ${problem ? 'problem' : ''}">${icon(problem ? 'alert-circle-outline' : 'information-outline')}<span>${esc(text)}</span></div>`; }
    _sourceDetails(data) {
      if (!data) return this._notice('Noch keine Daten vorhanden.');
      const n = this._config.weather_entities.length;
      const forecastInfo = (part,title,total,entity) => `<h4>${esc(title)}</h4><p>${part.available ? `Abfrage ${esc(this._time(part.stamp,true))} · ${number(part.source_count) ? esc(fmt(part.source_count)) + '/' + total + ' Quellen' : 'Quellenzahl fehlt'}` : `${esc(part.reason)} · letzte Abfrage mit Daten ${esc(this._time(part.stamp,true))}`}${part.available && !part.ok ? ' · letzte Abfrage ohne neue Daten' : ''}</p><button class="retry" data-action="more" data-entity="${esc(entity)}">Sensordetails öffnen</button>`;
      return `<h4>Aktuelles Wetter</h4><p>Temperatur: ${esc(data.current.source_count)}/${n} Quellen · Wind: ${esc(data.current.wind_source_count)}/${n} · Wetterlage: ${esc(data.current.condition_source_count)}/${n}</p>
        ${(data.sources || []).map(s => `<div class="source"><button data-action="more" data-entity="${esc(s.entity)}">${esc(s.name)}</button><span class="source-state">${s.fresh && fresh(s.reported_at,10800) ? 'Aktuell' : s.has_value ? 'Veraltet' : 'Keine Daten'}<br>${esc(this._time(s.reported_at,true))}</span></div>`).join('')}
        ${forecastInfo(data.hourly,'Stundenprognose',2,this._config.hourly_entity)}${forecastInfo(data.daily,'Tagesprognose',3,this._config.daily_entity)}
        <p class="source-note">Temperatur und Wind: Median der aktuellen Quellen. Bei widersprüchlichen Wetterlagen haben Regen, Gewitter und andere warnende Wetterarten Vorrang. HA-Meldung ist der Zeitpunkt einer Meldung an Home Assistant.</p>`;
    }
    _render() {
      if (!this._config) return;
      const scroll = this.shadowRoot.querySelector('.hour-scroll')?.scrollLeft || 0;
      const data = this._effective();
      const current = data?.current || {};
      const none = !(current.source_count || current.wind_source_count || current.condition_source_count);
      const displayCondition = current.condition === 'sunny' && data?.current_night ? 'clear-night' : current.condition;
      const conditionText = !data ? 'Wetter wird geladen …' : none ? (current.old_sources ? 'Wetterdaten veraltet' : 'Keine aktuellen Wetterdaten') : LABELS[displayCondition] || LABELS.unknown;
      const part = this._tab === 'hours' ? data?.hourly : data?.daily;
      const count = this._config.weather_entities.length;
      const full = data && !none && current.source_count === count && current.wind_source_count === count && current.condition_source_count === count && part?.available && part?.ok && Number(part.source_count) === (this._tab === 'hours' ? 2 : 3);
      let status = !data ? 'Wetterdaten werden geladen' : part?.available ? `${full ? 'Aktualisiert' : 'Teilweise Daten'} ${this._time(part.stamp)}` : 'Prognose nicht aktuell';
      if (this._offline) status = 'Verbindung unterbrochen';
      else if (this._error) status = 'Wetterabfrage fehlgeschlagen';
      const statusClass = this._offline ? 'offline' : full && !this._error ? '' : 'caution';
      this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card>
        <div class="location">${icon('map-marker-outline')}<span>${esc(this._config.title)}</span><button class="info" data-action="info" aria-label="Wetterquellen und Datenstatus" aria-expanded="${this._expanded}">${icon('information-outline')}</button></div>
        <div class="hero"><div><div class="temperature">${degrees(current.temperature,1)}<span class="unit">C</span></div><div class="condition">${esc(conditionText)}</div><div class="wind">${icon('weather-windy')}<span>${fmt(current.wind_speed)} km/h</span></div></div>${weather(current.condition,data?.current_night)}</div>
        <div class="tabs" role="tablist" aria-label="Vorhersage auswählen">${[['hours','clock-outline','Stunden'],['days','calendar-blank-outline','7 Tage']].map(([key,symbol,label]) => `<button id="tab-${key}" class="tab" role="tab" aria-selected="${this._tab === key}" aria-controls="panel-${key}" tabindex="${this._tab === key ? 0 : -1}" data-action="tab" data-tab="${key}">${icon(symbol)}<span>${label}</span></button>`).join('')}</div>
        <section class="panel" id="panel-hours" role="tabpanel" aria-labelledby="tab-hours" ${this._tab === 'hours' ? '' : 'hidden'}>${this._tab === 'hours' ? this._hours(data) : ''}</section>
        <section class="panel" id="panel-days" role="tabpanel" aria-labelledby="tab-days" ${this._tab === 'days' ? '' : 'hidden'}>${this._tab === 'days' ? this._days(data) : ''}</section>
        ${this._error ? `<div class="notice problem"><div>Die Wetterdaten konnten nicht aktualisiert werden. <button class="retry" data-action="retry">Erneut versuchen</button>${this._expanded ? `<div class="error-text">${esc(this._error)}</div>` : ''}</div></div>` : ''}
        <div class="footer"><span class="dot ${statusClass}" aria-hidden="true"></span><span class="status" role="status">${esc(status)}</span><button class="sources-button" data-action="sources" aria-expanded="${this._expanded}" aria-controls="source-details">Quellen ${icon(this._expanded ? 'chevron-up' : 'chevron-down')}</button></div>
        <div class="source-details" id="source-details" ${this._expanded ? '' : 'hidden'}>${this._expanded ? this._sourceDetails(data) : ''}</div>
      </ha-card>`;
      const hours = this.shadowRoot.querySelector('.hour-scroll'); if (hours) hours.scrollLeft = scroll;
    }
  }
  customElements.define(TAG, ArandjelovacWeatherCard);
  window.customCards = window.customCards || [];
  window.customCards.push({type:TAG,name:'Aranđelovac Wetter',description:'Wetter mit Stunden-/7-Tage-Reitern und Quellenstatus',preview:true});
})();
