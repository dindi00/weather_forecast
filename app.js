const el = id => document.getElementById(id);
const cityInput = el('city');
const dropdown = el('dropdown');
const unitBtn = el('unitBtn');
const unitLabel = el('unitLabel');
const searchBtn = el('searchBtn');
const geoBtn = el('geoBtn');

let units = 'metric'; // 'metric' (°C) or 'imperial' (°F)

// Debounce search
let t;
cityInput.addEventListener('input', () => {
  clearTimeout(t);
  const q = cityInput.value.trim();
  if (!q) { dropdown.classList.remove('show'); dropdown.innerHTML = ''; return; }
  t = setTimeout(() => suggestCities(q), 220);
});

document.addEventListener('click', (e) => {
  if (!dropdown.contains(e.target) && e.target !== cityInput) {
    dropdown.classList.remove('show');
  }
});

unitBtn.addEventListener('click', () => {
  units = (units === 'metric') ? 'imperial' : 'metric';
  unitBtn.setAttribute('aria-pressed', units === 'imperial');
  unitLabel.textContent = (units === 'metric') ? '°C' : '°F';
  if (window.__lastCoords) {
    fetchWeather(window.__lastCoords.lat, window.__lastCoords.lon, window.__lastCoords.place);
  }
});

searchBtn.addEventListener('click', () => {
  const q = cityInput.value.trim();
  if (!q) { flash(cityInput); return; }
  if (dropdown.classList.contains('show') && dropdown.firstChild) {
    dropdown.firstChild.click();
  } else {
    resolveCity(q);
  }
});

geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  geoBtn.classList.add('ring');
  navigator.geolocation.getCurrentPosition(
    pos => {
      geoBtn.classList.remove('ring');
      const { latitude:lat, longitude:lon } = pos.coords;
      fetchWeather(lat, lon, 'Your location');
    },
    err => {
      geoBtn.classList.remove('ring');
      alert('Could not get location: ' + err.message);
    },
    { enableHighAccuracy:true, timeout:10000, maximumAge:300000 }
  );
});

async function suggestCities(q){
  try{
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    const results = (data.results || []);
    if (!results.length){ dropdown.classList.remove('show'); dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = results.map(r => `
      <button data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${escapeHtml(r.name)}" data-country="${escapeHtml(r.country)}" data-admin="${escapeHtml(r.admin1 || '')}">
        ${escapeHtml(r.name)}${r.admin1 ? ', ' + escapeHtml(r.admin1) : ''}, ${escapeHtml(r.country)}
      </button>
    `).join('');
    Array.from(dropdown.children).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        cityInput.value = `${btn.dataset.name}${btn.dataset.admin ? ', ' + btn.dataset.admin : ''}, ${btn.dataset.country}`;
        dropdown.classList.remove('show');
        fetchWeather(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon), cityInput.value);
      });
    });
    dropdown.classList.add('show');
  } catch(e){
    console.error(e);
  }
}

async function resolveCity(q){
  try{
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    const r = (data.results && data.results[0]);
    if(!r){ alert('Could not find that city. Try a different name.'); return; }
    const place = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}, ${r.country}`;
    fetchWeather(r.latitude, r.longitude, place);
  }catch(e){ alert(e.message || 'Error resolving city'); }
}

async function fetchWeather(lat, lon, placeLabel){
  try{
    const tempParam = (units === 'metric') ? 'celsius' : 'fahrenheit';
    const windParam = (units === 'metric') ? 'kmh' : 'mph';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,cloud_cover,is_day,weather_code`
      + `&temperature_unit=${tempParam}&wind_speed_unit=${windParam}&timezone=auto`;

    const res = await fetch(url);
    if(!res.ok) throw new Error('Weather request failed');
    const data = await res.json();
    const c = data.current;

    window.__lastCoords = {lat, lon, place: placeLabel};

    el('temp').textContent = fmtTemp(c.temperature_2m);
    el('feels').textContent = `Feels like ${fmtTemp(c.apparent_temperature)}`;
    el('summary').textContent = codeToText(c.weather_code) + (c.is_day ? ' (day)' : ' (night)');
    el('place').textContent = placeLabel || `Lat ${lat.toFixed(3)}, Lon ${lon.toFixed(3)}`;

    el('humidity').textContent = `${c.relative_humidity_2m}%`;
    el('pressure').textContent = `${Math.round(c.pressure_msl)} hPa`;
    el('wind').textContent = `${c.wind_speed_10m} ${units === 'metric' ? 'km/h' : 'mph'}`;
    el('clouds').textContent = `${c.cloud_cover}%`;

    el('winddir').textContent = `${c.wind_direction_10m}° (${degToCompass(c.wind_direction_10m)})`;
    el('isday').textContent = c.is_day ? 'Yes' : 'No';
    el('wcode').textContent = c.weather_code;
    el('latlon').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    el('updated').textContent = `Updated ${new Date(data.current.time).toLocaleString()}`;
  }catch(e){
    console.error(e);
    alert(e.message || 'Could not load weather.');
  }
}

function fmtTemp(v){
  if (v == null || isNaN(v)) return '—';
  const suffix = (units === 'metric') ? '°C' : '°F';
  return `${Math.round(v)}${suffix}`;
}

function degToCompass(deg){
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg/22.5) % 16];
}

function codeToText(code){
  const map = {
    0:"Clear sky", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast",
    45:"Fog", 48:"Depositing rime fog",
    51:"Light drizzle", 53:"Moderate drizzle", 55:"Dense drizzle",
    56:"Freezing drizzle (light)", 57:"Freezing drizzle (dense)",
    61:"Slight rain", 63:"Moderate rain", 65:"Heavy rain",
    66:"Freezing rain (light)", 67:"Freezing rain (heavy)",
    71:"Slight snow", 73:"Moderate snow", 75:"Heavy snow",
    77:"Snow grains",
    80:"Rain showers (slight)", 81:"Rain showers (moderate)", 82:"Rain showers (violent)",
    85:"Snow showers (slight)", 86:"Snow showers (heavy)",
    95:"Thunderstorm (slight/moderate)", 96:"Thunderstorm with hail (slight)", 99:"Thunderstorm with hail (heavy)"
  };
  return map[code] ?? `Code ${code}`;
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function flash(node){
  const prev = node.style.boxShadow;
  node.style.boxShadow = '0 0 0 6px #ff5a5a33';
  setTimeout(()=> node.style.boxShadow = prev, 300);
}

// Prefill with quick geolocation if allowed
setTimeout(()=> {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeather(pos.coords.latitude, pos.coords.longitude, 'Your location'),
      ()=>{}, {timeout:2000}
    );
  }
}, 400);
