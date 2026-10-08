const CONFIG = {
  DATA_BASE: "data",
  CITY_GEOJSON: "data/city.geojson",
  REACHABILITY: "data/reachability.json",
  TEN_LINES: "data/ten_lines.geojson",
  MAX_HOURS: 8,
  DEFAULT_HOUR: 5,
};

// 状态控制
let chart = null;
let reachabilityData = {};
let tenLineCoords = [];
let allCityNames = [];

// ---------- 初始化 ----------
async function init() {
  showLoading(true, "正在初始化地图与铁路网络...");

  try {
    const [geoJson, reach, tenLines] = await Promise.all([
      fetchJSON(CONFIG.CITY_GEOJSON),
      fetchJSON(CONFIG.REACHABILITY),
      fetchJSON(CONFIG.TEN_LINES),
    ]);

    reachabilityData = reach;

    // 预处理 GeoJSON
    geoJson.features.forEach((f) => {
      if (f.properties) {
        f.properties.name = f.properties.city_name || f.properties.name;
      }
    });

    echarts.registerMap("china-cities", geoJson);

    // 提取线路坐标
    tenLineCoords = geojsonToLineCoords(tenLines);

    // 提取所有城市名列表（去重 + 拼音排序）
    allCityNames = Object.keys(reachabilityData).sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    );

    // 初始化下拉框选项
    populateCitySelect(allCityNames);
    populateHourSelect(CONFIG.MAX_HOURS, CONFIG.DEFAULT_HOUR);

    // 建立事件监听
    setupEventListeners();

    // 初始化 ECharts
    chart = echarts.init(document.getElementById("chart"));
    
    // 渲染地图
    render();

    // 响应式 Resize 防抖
    const resizeObserver = new ResizeObserver(debounce(() => chart?.resize(), 100));
    resizeObserver.observe(document.getElementById("chart"));

  } catch (err) {
    console.error("初始化错误:", err);
    setStatus("数据加载失败，请刷新重试：" + err.message, true);
  } finally {
    showLoading(false);
  }
}

// ---------- 工具函数 ----------
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${url}`);
  return res.json();
}

function geojsonToLineCoords(geojson) {
  const lines = [];
  if (!geojson || !geojson.features) return lines;

  for (const f of geojson.features) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === "LineString") {
      lines.push(geom.coordinates);
    } else if (geom.type === "MultiLineString") {
      lines.push(...geom.coordinates);
    }
  }
  return lines;
}

function populateCitySelect(cities) {
  const sel = document.getElementById("city-select");
  sel.innerHTML = cities
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

function populateHourSelect(max, defaultHour) {
  const sel = document.getElementById("hour-select");
  let html = "";
  for (let h = 1; h <= max; h++) {
    html += `<option value="${h}" ${h === defaultHour ? "selected" : ""}>${h} 小时</option>`;
  }
  sel.innerHTML = html;
}

function setStatus(text, isError = false) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = text;
    el.style.color = isError ? "#ef4444" : "#1e293b";
    el.style.borderColor = isError ? "#fca5a5" : "#e2e8f0";
  }
}

function showLoading(show, text = "加载中...") {
  const overlay = document.getElementById("loading-overlay");
  const textEl = document.getElementById("loading-text");
  if (!overlay) return;

  if (textEl) textEl.textContent = text;
  if (show) {
    overlay.classList.remove("fade-out");
  } else {
    overlay.classList.add("fade-out");
  }
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ---------- 构造数据 ----------
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

  const { data: reachableData, reachableCount } = buildReachableData(originCity, maxHour);
  setStatus(`📍 ${originCity} 出发 · ${maxHour}h 内直达 ${reachableCount} 个城市`);

  const option = {
    backgroundColor: "transparent",

    tooltip: {
      trigger: "item",
      padding: [8, 12],
      backgroundColor: "rgba(15, 23, 42, 0.85)",
      borderColor: "transparent",
      textStyle: { color: "#ffffff", fontSize: 13 },
      extraCssText: "backdrop-filter: blur(4px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); border-radius: 6px;",
      formatter: (p) => {
        if (p.seriesName === "十纵十横网络") return "";
        if (p.name === originCity) {
          return `<strong style="color: #fbbf24;">📍 出发地：${p.name}</strong>`;
        }
        if (p.value == null || isNaN(p.value)) {
          return `<span style="color: #94a3b8;">${p.name} (不可达 / 超出限时)</span>`;
        }
        return `<strong>${p.name}</strong><br/>⏱ 预计耗时：<span style="color: #60a5fa; font-weight: bold;">${p.value}</span> 小时`;
      },
    },

    geo: {
      map: "china-cities",
      roam: true,
      zoom: 1.25,
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
      // 高亮起点城市
      regions: [
        {
          name: originCity,
          itemStyle: {
            areaColor: "#f59e0b",
            borderColor: "#b45309",
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
      text: ["长时间", "短时间"],
      calculable: true,
      orient: "vertical",
      inRange: {
        // 由近及远更符合心理预期的颜色序列（暖红/橙 -> 深蓝）
        color: [
          "#3b82f6",
          "#60a5fa",
          "#93c5fd",
          "#bfdbfe",
          "#e0f2fe"
        ],
      },
      textStyle: {
        color: "#64748b",
        fontSize: 12,
      },
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
        name: "十纵十横网络",
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

// ---------- 事件监听与搜索 ----------
function setupEventListeners() {
  document.getElementById("city-select").addEventListener("change", render);
  document.getElementById("hour-select").addEventListener("change", render);

  setupCitySearch();
}

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
  let matched = [];

  if (!q) {
    matched = allCityNames.slice(0, 6);
  } else {
    matched = allCityNames.filter((name) => {
      const lower = name.toLowerCase();
      if (lower.includes(q)) return true;
      
      // 拼音首字母简易匹配机制
      const py = getSimplePinyinInitial(name);
      return py.toLowerCase().includes(q);
    });
  }

  if (matched.length === 0) {
    container.innerHTML = `<li class="empty">未找到匹配城市</li>`;
    return;
  }

  container.innerHTML = matched
    .map((name) => {
      const py = getSimplePinyinInitial(name);
      return `<li data-city="${name}"><span>${name}</span><span class="py">${py}</span></li>`;
    })
    .join("");
}

// 更加轻量健壮的常见汉字拼音首字母提取（支持常见地名补全）
function getSimplePinyinInitial(str) {
  const customMap = {
    '北京':'BJ','上海':'SH','重庆':'CQ','天津':'TJ','广州':'GZ','深圳':'SZ','成都':'CD',
    '杭州':'HZ','武汉':'WH','西安':'XA','南京':'NJ','郑州':'ZZ','长沙':'CS','沈阳':'SY',
    '青岛':'QD','福州':'FZ','厦门':'XM','昆明':'KM','合肥':'HF','哈尔滨':'HRB','长春':'CC'
  };
  
  if (customMap[str]) return customMap[str];

  // 兜底返回字符串简写
  return str.split('').map(ch => {
    return ch.localeCompare('a') >= 0 ? ch.toUpperCase() : ch;
  }).join('');
}

// 启动应用
document.addEventListener("DOMContentLoaded", init);