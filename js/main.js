// 保留你原本的路径定义
const DATA_BASE = "data";
const CITY_GEOJSON = `${DATA_BASE}/city1.geojson`;
const REACHABILITY = `${DATA_BASE}/reachability.json`;
const TEN_LINES = `${DATA_BASE}/ten_lines.geojson`;

const MAX_HOURS = 8;
const DEFAULT_HOUR = 5;

let chart = null;
let reachabilityData = {};
let tenLineCoords = [];
let allCityNames = [];

// ---------- 初始化 ----------
async function init() {
  showLoading(true, "正在加载地图与可达性数据...");

  try {
    const [geoJson, reach, tenLines] = await Promise.all([
      fetchJSON(CITY_GEOJSON),
      fetchJSON(REACHABILITY),
      fetchJSON(TEN_LINES),
    ]);

    reachabilityData = reach;

    // 城市名映射补充
    geoJson.features.forEach((f) => {
      if (f.properties) {
        f.properties.name = f.properties.city_name || f.properties.name;
      }
    });

    echarts.registerMap("china-cities", geoJson);

    // ten_lines 几何转坐标数组
    tenLineCoords = geojsonToLineCoords(tenLines);

    // 城市列表提取与拼音排序
    allCityNames = Object.keys(reachabilityData).sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    );

    populateCitySelect(allCityNames);
    populateHourSelect(MAX_HOURS, DEFAULT_HOUR);
    setupCitySearch();

    document.getElementById("city-select").addEventListener("change", render);
    document.getElementById("hour-select").addEventListener("change", render);

    chart = echarts.init(document.getElementById("chart"));
    render();

    // 响应式 Resize 防抖
    window.addEventListener(
      "resize",
      debounce(() => chart?.resize(), 150)
    );
  } catch (err) {
    console.error("加载失败:", err);
    setStatus("数据加载失败：" + err.message, true);
  } finally {
    showLoading(false);
  }
}

// ---------- 工具函数 ----------
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 加载失败 (HTTP ${res.status})`);
  return res.json();
}

function geojsonToLineCoords(geojson) {
  const lines = [];
  (geojson.features || []).forEach((f) => {
    const geom = f.geometry;
    if (!geom) return;
    if (geom.type === "LineString") {
      lines.push(geom.coordinates);
    } else if (geom.type === "MultiLineString") {
      lines.push(...geom.coordinates);
    }
  });
  return lines;
}

function populateCitySelect(cities) {
  const sel = document.getElementById("city-select");
  sel.innerHTML = cities
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

function populateHourSelect(max, defaultVal) {
  const sel = document.getElementById("hour-select");
  let html = "";
  for (let h = 1; h <= max; h++) {
    html += `<option value="${h}" ${h === defaultVal ? "selected" : ""}>${h} 小时</option>`;
  }
  sel.innerHTML = html;
}

function setStatus(text, isError = false) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = text;
    el.style.color = isError ? "#ef4444" : "#1e293b";
  }
}

function showLoading(show, text = "") {
  const overlay = document.getElementById("loading-overlay");
  const textEl = document.getElementById("loading-text");
  if (!overlay) return;
  if (textEl) textEl.textContent = text;
  overlay.style.display = show ? "flex" : "none";
}

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ---------- 构造可达城市数据 ----------
function buildReachableData(originCity, maxHour) {
  const reach = reachabilityData[originCity] || {};
  const data = [];
  let reachableCount = 0;

  for (const [city, hours] of Object.entries(reach)) {
    if (city === originCity) continue;
    if (hours <= maxHour) {
      data.push({ name: city, value: hours });
      reachableCount++;
    }
  }

  return { data, reachableCount };
}

// ---------- 地图渲染 ----------
function render() {
  const originCity = document.getElementById("city-select").value;
  const maxHour = Number(document.getElementById("hour-select").value);

  if (!originCity) return;

  const { data: reachableData, reachableCount } = buildReachableData(
    originCity,
    maxHour
  );
  setStatus(`📍 ${originCity} 出发 · ${maxHour} 小时内可达 ${reachableCount} 个城市`);

  const option = {
    backgroundColor: "transparent",

    tooltip: {
      trigger: "item",
      padding: [8, 12],
      backgroundColor: "rgba(15, 23, 42, 0.88)",
      borderColor: "transparent",
      textStyle: { color: "#ffffff", fontSize: 13 },
      extraCssText: "backdrop-filter: blur(4px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); border-radius: 6px;",
      formatter: (p) => {
        if (p.seriesName === "ten_lines") return "";
        if (p.name === originCity) return `<strong style="color: #fbbf24;">📍 起点城市：${p.name}</strong>`;
        if (p.value == null || isNaN(p.value)) return `<span style="color: #94a3b8;">${p.name} (不可达 / 超时)</span>`;
        return `<strong>${p.name}</strong><br/>⏱ 约 <span style="color: #60a5fa; font-weight: bold;">${p.value}</span> 小时`;
      },
    },

    geo: {
      map: "china-cities",
      roam: true,
      zoom: 1.2,
      label: { show: false },
      itemStyle: {
        areaColor: "#f1f5f9",
        borderColor: "#cbd5e1",
        borderWidth: 0.6,
      },
      emphasis: {
        label: { show: true, color: "#0f172a", fontSize: 11, fontWeight: "bold" },
        itemStyle: { areaColor: "#e2e8f0" },
      },
      regions: [
        {
          name: originCity,
          itemStyle: {
            areaColor: "#f59e0b",
            borderColor: "#ffffff",
            borderWidth: 1.5,
          },
          emphasis: {
            itemStyle: { areaColor: "#d97706" },
            label: { show: true, color: "#ffffff" },
          },
        },
      ],
      z: 1,
    },

    visualMap: {
      type: "continuous",
      min: 0,
      max: maxHour,
      seriesIndex: [0],
      left: 28,
      bottom: 32,
      text: ["远", "近"],
      calculable: true,
      inRange: {
        color: ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#e0f2fe"],
      },
      textStyle: { color: "#64748b", fontSize: 12 },
    },

    series: [
      {
        name: "动车可达",
        type: "map",
        geoIndex: 0,
        z: 2,
        data: reachableData,
      },
      {
        name: "ten_lines",
        type: "lines",
        coordinateSystem: "geo",
        polyline: true,
        z: 3,
        silent: true,
        lineStyle: {
          color: "#0284c7",
          width: 0.8,
          opacity: 0.35,
        },
        data: tenLineCoords.map((coords) => ({ coords })),
      },
    ],
  };

  chart.setOption(option, true);
}

// ---------- 城市搜索 ----------
function setupCitySearch() {
  const select = document.getElementById("city-select");
  const btn = document.getElementById("city-search-btn");
  const panel = document.getElementById("city-search-panel");
  const input = document.getElementById("city-search-input");
  const results = document.getElementById("city-search-results");

  if (!btn || !panel || !input || !results) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      input.value = "";
      renderSearchResults("", results);
      input.focus();
    }
  });

  input.addEventListener("input", () => {
    renderSearchResults(input.value, results);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = results.querySelector("li:not(.empty)");
      if (first) first.click();
    } else if (e.key === "Escape") {
      panel.classList.add("hidden");
    }
  });

  results.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li || li.classList.contains("empty")) return;
    const city = li.dataset.city;
    select.value = city;
    select.dispatchEvent(new Event("change"));
    panel.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });
}

function renderSearchResults(query, container) {
  const q = query.trim().toLowerCase();
  let matched;

  if (!q) {
    matched = allCityNames.slice(0, 6);
  } else {
    matched = allCityNames.filter((name) => {
      const lower = name.toLowerCase();
      if (lower.includes(q)) return true;
      const py = getPinyinInitials(name);
      return py.toLowerCase().includes(q);
    });
  }

  if (matched.length === 0) {
    container.innerHTML = `<li class="empty">未找到匹配城市</li>`;
    return;
  }

  container.innerHTML = matched
    .map(
      (name) =>
        `<li data-city="${name}"><span>${name}</span><span class="py">${getPinyinInitials(name)}</span></li>`
    )
    .join("");
}

// 拼音简易映射
function getPinyinInitials(str) {
  const map = {
    北京: "BJ", 上海: "SH", 重庆: "CQ", 天津: "TJ", 广州: "GZ", 深圳: "SZ",
    成都: "CD", 杭州: "HZ", 武汉: "WH", 西安: "XA", 南京: "NJ", 郑州: "ZZ",
    长沙: "CS", 沈阳: "SY", 青岛: "QD", 福州: "FZ", 厦门: "XM", 昆明: "KM"
  };
  return map[str] || "";
}

init();