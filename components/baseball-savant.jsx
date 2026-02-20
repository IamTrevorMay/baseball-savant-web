import { useState, useEffect, useCallback, useRef } from "react";
import * as Plotly from "plotly";

const SUPABASE_URL = "https://xgzxfsqwtemlcosglhzr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnenhmc3F3dGVtbGNvc2dsaHpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjUwMzksImV4cCI6MjA4NzIwMTAzOX0.moB9yEprm_4libfN-m9bFbKyuCcp5EhQrx0DohsuuaQ";
const EDGE_URL = `${SUPABASE_URL}/functions/v1/viz-data`;

const PITCH_COLORS = {
  "4-Seam Fastball": "#E63946",
  "Sinker": "#F4845F",
  "Cutter": "#F7B267",
  "Changeup": "#2A9D8F",
  "Slider": "#457B9D",
  "Curveball": "#6A4C93",
  "Knuckle Curve": "#9B5DE5",
  "Sweeper": "#00BBF9",
  "Split-Finger": "#00F5D4",
  "Knuckleball": "#F15BB5",
  "Eephus": "#FEE440",
  "Slow Curve": "#BDB2FF",
  "Slurve": "#A0C4FF",
  "Forkball": "#CAFFBF",
  "Screwball": "#FFD6A5",
  "Other": "#888888",
};

const getPitchColor = (name) => PITCH_COLORS[name] || "#888888";

const DARK = {
  bg: "#0a0e17",
  card: "#111827",
  cardBorder: "#1e293b",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  accent: "#E63946",
  accentGlow: "rgba(230, 57, 70, 0.3)",
  grid: "#1e293b",
  plotBg: "rgba(0,0,0,0)",
  plotPaper: "rgba(0,0,0,0)",
};

const plotLayout = (title, extra = {}) => ({
  title: { text: title, font: { color: DARK.text, size: 15, family: "'JetBrains Mono', monospace" }, x: 0.01, xanchor: "left" },
  paper_bgcolor: DARK.plotPaper,
  plot_bgcolor: DARK.plotBg,
  font: { color: DARK.textMuted, family: "'JetBrains Mono', monospace", size: 11 },
  margin: { l: 55, r: 20, t: 45, b: 50 },
  xaxis: { gridcolor: DARK.grid, zerolinecolor: DARK.grid, ...(extra.xaxis || {}) },
  yaxis: { gridcolor: DARK.grid, zerolinecolor: DARK.grid, ...(extra.yaxis || {}) },
  legend: { bgcolor: "rgba(0,0,0,0)", font: { size: 10, color: DARK.textMuted }, orientation: "h", y: -0.2 },
  hoverlabel: { bgcolor: "#1e293b", bordercolor: "#334155", font: { color: "#e2e8f0", family: "'JetBrains Mono', monospace", size: 11 } },
  ...extra,
});

const plotConfig = { displayModeBar: false, responsive: true };

// ─── Plot Component ───
function PlotChart({ id, data, layout, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && data && data.length > 0) {
      Plotly.newPlot(ref.current, data, layout, plotConfig);
      return () => { if (ref.current) Plotly.purge(ref.current); };
    }
  }, [data, layout]);
  return <div ref={ref} id={id} style={{ width: "100%", height: "100%", ...style }} />;
}

// ─── Data Fetching ───
async function fetchViz(chart, player, year) {
  const params = new URLSearchParams({ chart });
  if (player) params.set("player", player);
  if (year) params.set("year", year);
  const res = await fetch(`${EDGE_URL}?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function searchPlayers(search) {
  const params = new URLSearchParams({ chart: "players", search });
  const res = await fetch(`${EDGE_URL}?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
}

// ─── Chart Builders ───
function buildPitchArsenal(data) {
  if (!data?.length) return null;
  const total = data.reduce((s, d) => s + parseInt(d.count), 0);
  const traces = data.map((d) => ({
    type: "bar",
    name: d.pitch_name,
    x: [d.pitch_name],
    y: [parseInt(d.count)],
    marker: { color: getPitchColor(d.pitch_name), line: { width: 0 } },
    text: [`${((parseInt(d.count) / total) * 100).toFixed(1)}%`],
    textposition: "outside",
    textfont: { color: DARK.textMuted, size: 10 },
    hovertemplate: `<b>%{x}</b><br>Count: %{y}<br>Avg Velo: ${d.avg_velo} mph<br>Avg Spin: ${d.avg_spin} rpm<extra></extra>`,
    showlegend: false,
  }));
  return { traces, layout: plotLayout("Pitch Arsenal", { barmode: "group", xaxis: { title: "" }, yaxis: { title: "Count" } }) };
}

function buildVeloTrend(data) {
  if (!data?.length) return null;
  const byPitch = {};
  data.forEach((d) => {
    if (!byPitch[d.pitch_name]) byPitch[d.pitch_name] = { x: [], y: [] };
    byPitch[d.pitch_name].x.push(d.game_date);
    byPitch[d.pitch_name].y.push(parseFloat(d.avg_velo));
  });
  const traces = Object.entries(byPitch).map(([name, { x, y }]) => ({
    type: "scatter",
    mode: "lines",
    name,
    x, y,
    line: { color: getPitchColor(name), width: 2 },
    hovertemplate: `<b>${name}</b><br>%{x}<br>%{y:.1f} mph<extra></extra>`,
  }));
  return { traces, layout: plotLayout("Velocity Over Time", { xaxis: { title: "Date" }, yaxis: { title: "Avg Velocity (mph)" } }) };
}

function buildPitchLocation(data) {
  if (!data?.length) return null;
  const strikes = data.filter((d) => d.type === "S" || d.type === "X");
  const balls = data.filter((d) => d.type === "B");
  const traces = [
    {
      type: "histogram2dcontour",
      x: strikes.map((d) => parseFloat(d.x)),
      y: strikes.map((d) => parseFloat(d.z)),
      colorscale: [[0, "rgba(230,57,70,0)"], [0.3, "rgba(230,57,70,0.3)"], [0.6, "rgba(247,178,103,0.6)"], [1, "rgba(255,255,0,0.9)"]],
      showscale: false,
      ncontours: 15,
      hovertemplate: "x: %{x}<br>z: %{y}<extra>Strikes</extra>",
      name: "Strikes",
    },
  ];
  // Add strike zone box
  const layout = plotLayout("Pitch Location Heatmap", {
    xaxis: { title: "Horizontal (ft)", range: [-2.5, 2.5] },
    yaxis: { title: "Vertical (ft)", range: [0, 5] },
    shapes: [
      { type: "rect", x0: -0.83, x1: 0.83, y0: 1.5, y1: 3.5, line: { color: "#ffffff44", width: 2 }, fillcolor: "rgba(255,255,255,0.03)" },
    ],
    annotations: [{ x: 0, y: 3.6, text: "Strike Zone", showarrow: false, font: { color: "#ffffff44", size: 10 } }],
  });
  return { traces, layout };
}

function buildMovement(data) {
  if (!data?.length) return null;
  const byPitch = {};
  data.forEach((d) => {
    if (!byPitch[d.pitch_name]) byPitch[d.pitch_name] = { x: [], y: [], velo: [] };
    byPitch[d.pitch_name].x.push(parseFloat(d.h_break) * 12);
    byPitch[d.pitch_name].y.push(parseFloat(d.v_break) * 12);
    byPitch[d.pitch_name].velo.push(parseFloat(d.velo));
  });
  const traces = Object.entries(byPitch).map(([name, { x, y, velo }]) => ({
    type: "scatter",
    mode: "markers",
    name,
    x, y,
    marker: { color: getPitchColor(name), size: 5, opacity: 0.5, line: { width: 0 } },
    hovertemplate: `<b>${name}</b><br>H-Break: %{x:.1f}″<br>V-Break: %{y:.1f}″<extra></extra>`,
  }));
  return {
    traces,
    layout: plotLayout("Pitch Movement Profile", {
      xaxis: { title: "Horizontal Break (in)", zeroline: true, zerolinecolor: "#ffffff33" },
      yaxis: { title: "Induced Vertical Break (in)", zeroline: true, zerolinecolor: "#ffffff33" },
    }),
  };
}

function buildLaunch(data) {
  if (!data?.length) return null;
  const colorMap = { home_run: "#E63946", triple: "#F4845F", double: "#F7B267", single: "#2A9D8F" };
  const hitEvents = ["single", "double", "triple", "home_run"];
  const hits = data.filter((d) => hitEvents.includes(d.events));
  const outs = data.filter((d) => !hitEvents.includes(d.events));
  const traces = [
    {
      type: "scatter", mode: "markers", name: "Outs",
      x: outs.map((d) => parseFloat(d.launch_angle)),
      y: outs.map((d) => parseFloat(d.launch_speed)),
      marker: { color: "#334155", size: 3, opacity: 0.3 },
      hovertemplate: "<b>%{text}</b><br>LA: %{x}°<br>EV: %{y:.1f} mph<extra></extra>",
      text: outs.map((d) => d.events),
    },
    ...hitEvents.reverse().map((evt) => {
      const subset = hits.filter((d) => d.events === evt);
      return {
        type: "scatter", mode: "markers", name: evt.replace("_", " "),
        x: subset.map((d) => parseFloat(d.launch_angle)),
        y: subset.map((d) => parseFloat(d.launch_speed)),
        marker: { color: colorMap[evt], size: 5, opacity: 0.7 },
        hovertemplate: `<b>${evt.replace("_", " ")}</b><br>LA: %{x}°<br>EV: %{y:.1f} mph<extra></extra>`,
      };
    }),
  ];
  return {
    traces,
    layout: plotLayout("Launch Speed vs. Angle", {
      xaxis: { title: "Launch Angle (°)", range: [-60, 60] },
      yaxis: { title: "Exit Velocity (mph)", range: [40, 120] },
    }),
  };
}

function buildCountUsage(data) {
  if (!data?.length) return null;
  const counts = {};
  data.forEach((d) => {
    const key = `${d.balls}-${d.strikes}`;
    if (!counts[key]) counts[key] = {};
    counts[key][d.pitch_name] = parseInt(d.count);
  });
  const allPitches = [...new Set(data.map((d) => d.pitch_name))];
  const countLabels = ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"];
  const traces = allPitches.map((pitch) => {
    const total = countLabels.map((c) => {
      const vals = counts[c] || {};
      return Object.values(vals).reduce((s, v) => s + v, 0);
    });
    return {
      type: "bar",
      name: pitch,
      x: countLabels,
      y: countLabels.map((c, i) => {
        const val = (counts[c] || {})[pitch] || 0;
        return total[i] > 0 ? (val / total[i]) * 100 : 0;
      }),
      marker: { color: getPitchColor(pitch) },
      hovertemplate: `<b>${pitch}</b><br>Count: %{x}<br>Usage: %{y:.1f}%<extra></extra>`,
    };
  });
  return {
    traces,
    layout: plotLayout("Pitch Usage by Count", {
      barmode: "stack",
      xaxis: { title: "Count (B-S)" },
      yaxis: { title: "Usage %", range: [0, 100] },
    }),
  };
}

function buildSpinDist(data) {
  if (!data?.length) return null;
  const byPitch = {};
  data.forEach((d) => {
    if (!byPitch[d.pitch_name]) byPitch[d.pitch_name] = [];
    byPitch[d.pitch_name].push(parseFloat(d.spin));
  });
  const traces = Object.entries(byPitch).map(([name, vals]) => ({
    type: "violin",
    y: vals,
    name,
    box: { visible: true },
    meanline: { visible: true },
    line: { color: getPitchColor(name) },
    fillcolor: getPitchColor(name) + "33",
    hovertemplate: `<b>${name}</b><br>Spin: %{y:.0f} rpm<extra></extra>`,
  }));
  return {
    traces,
    layout: plotLayout("Spin Rate Distribution", { yaxis: { title: "Spin Rate (rpm)" } }),
  };
}

function buildWhiffZone(data) {
  if (!data?.length) return null;
  // Zones 1-9 form a 3x3 grid, 11-14 are edges
  const zonePositions = {
    1: [0, 2], 2: [1, 2], 3: [2, 2],
    4: [0, 1], 5: [1, 1], 6: [2, 1],
    7: [0, 0], 8: [1, 0], 9: [2, 0],
  };
  const z = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const textArr = [["", "", ""], ["", "", ""], ["", "", ""]];
  data.filter((d) => parseInt(d.zone) >= 1 && parseInt(d.zone) <= 9).forEach((d) => {
    const pos = zonePositions[parseInt(d.zone)];
    if (pos) {
      const whiffRate = parseInt(d.swings) > 0 ? (parseInt(d.whiffs) / parseInt(d.swings)) * 100 : 0;
      z[pos[1]][pos[0]] = whiffRate;
      textArr[pos[1]][pos[0]] = `${whiffRate.toFixed(1)}%`;
    }
  });
  const traces = [{
    type: "heatmap",
    z, text: textArr, texttemplate: "%{text}",
    colorscale: [[0, "#1a1a2e"], [0.3, "#457B9D"], [0.6, "#F4845F"], [1, "#E63946"]],
    showscale: true,
    colorbar: { title: { text: "Whiff%", font: { color: DARK.textMuted } }, tickfont: { color: DARK.textMuted } },
    hovertemplate: "Zone: %{z:.1f}% whiff rate<extra></extra>",
  }];
  return {
    traces,
    layout: plotLayout("Whiff Rate by Zone", {
      xaxis: { showticklabels: false, showgrid: false },
      yaxis: { showticklabels: false, showgrid: false },
      annotations: [
        { x: 1, y: 2.35, text: "TOP", showarrow: false, font: { color: "#ffffff33", size: 10 } },
        { x: 1, y: -0.35, text: "BOTTOM", showarrow: false, font: { color: "#ffffff33", size: 10 } },
      ],
    }),
  };
}

function buildExpectedStats(data) {
  if (!data?.length) return null;
  const traces = [
    {
      type: "bar", name: "xBA",
      x: data.map((d) => d.pitch_name),
      y: data.map((d) => parseFloat(d.xba)),
      marker: { color: "#E63946" },
      hovertemplate: "<b>%{x}</b><br>xBA: %{y:.3f}<extra></extra>",
    },
    {
      type: "bar", name: "xwOBA",
      x: data.map((d) => d.pitch_name),
      y: data.map((d) => parseFloat(d.xwoba)),
      marker: { color: "#457B9D" },
      hovertemplate: "<b>%{x}</b><br>xwOBA: %{y:.3f}<extra></extra>",
    },
    {
      type: "bar", name: "xSLG",
      x: data.map((d) => d.pitch_name),
      y: data.map((d) => parseFloat(d.xslg)),
      marker: { color: "#2A9D8F" },
      hovertemplate: "<b>%{x}</b><br>xSLG: %{y:.3f}<extra></extra>",
    },
  ];
  return {
    traces,
    layout: plotLayout("Expected Stats by Pitch Type", {
      barmode: "group",
      xaxis: { title: "" },
      yaxis: { title: "Expected Stat Value" },
    }),
  };
}

function buildReleasePoint(data) {
  if (!data?.length) return null;
  const byPitch = {};
  data.forEach((d) => {
    if (!byPitch[d.pitch_name]) byPitch[d.pitch_name] = { x: [], y: [] };
    byPitch[d.pitch_name].x.push(parseFloat(d.x));
    byPitch[d.pitch_name].y.push(parseFloat(d.z));
  });
  const traces = Object.entries(byPitch).map(([name, { x, y }]) => ({
    type: "scatter",
    mode: "markers",
    name,
    x, y,
    marker: { color: getPitchColor(name), size: 4, opacity: 0.4 },
    hovertemplate: `<b>${name}</b><br>X: %{x:.2f} ft<br>Z: %{y:.2f} ft<extra></extra>`,
  }));
  return {
    traces,
    layout: plotLayout("Release Point", {
      xaxis: { title: "Horizontal Release (ft)", scaleanchor: "y" },
      yaxis: { title: "Vertical Release (ft)" },
    }),
  };
}

function buildInningPerf(data) {
  if (!data?.length) return null;
  const byPitch = {};
  data.forEach((d) => {
    if (!byPitch[d.pitch_name]) byPitch[d.pitch_name] = { x: [], velo: [], spin: [] };
    byPitch[d.pitch_name].x.push(parseInt(d.inning));
    byPitch[d.pitch_name].velo.push(parseFloat(d.avg_velo));
    byPitch[d.pitch_name].spin.push(parseFloat(d.avg_spin));
  });
  const traces = Object.entries(byPitch).map(([name, { x, velo }]) => ({
    type: "scatter",
    mode: "lines+markers",
    name,
    x, y: velo,
    line: { color: getPitchColor(name), width: 2 },
    marker: { color: getPitchColor(name), size: 6 },
    hovertemplate: `<b>${name}</b><br>Inning: %{x}<br>Velo: %{y:.1f} mph<extra></extra>`,
  }));
  return {
    traces,
    layout: plotLayout("Velocity by Inning", {
      xaxis: { title: "Inning", dtick: 1 },
      yaxis: { title: "Avg Velocity (mph)" },
    }),
  };
}

// ─── Viz Card ───
function VizCard({ title, subtitle, children, loading, span = 1 }) {
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: `linear-gradient(135deg, ${DARK.card} 0%, #0d1321 100%)`,
      border: `1px solid ${DARK.cardBorder}`,
      borderRadius: 12,
      overflow: "hidden",
      position: "relative",
      minHeight: 380,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${DARK.accent}, transparent)`,
      }} />
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(10,14,23,0.8)", zIndex: 10, backdropFilter: "blur(4px)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, border: `3px solid ${DARK.cardBorder}`, borderTopColor: DARK.accent,
              borderRadius: "50%", animation: "spin 1s linear infinite",
            }} />
            <span style={{ color: DARK.textMuted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Loading data...</span>
          </div>
        </div>
      )}
      <div style={{ padding: "16px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        {subtitle && <span style={{ color: DARK.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{subtitle}</span>}
      </div>
      <div style={{ height: 340, padding: "0 8px 8px" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function BaseballSavant() {
  const [player, setPlayer] = useState("");
  const [year, setYear] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [playerSuggestions, setPlayerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [charts, setCharts] = useState({});
  const [loading, setLoading] = useState({});
  const [activeTab, setActiveTab] = useState("pitching");
  const searchRef = useRef(null);

  const CHART_DEFS = {
    pitching: [
      { key: "pitch_arsenal", builder: buildPitchArsenal, title: "Pitch Arsenal", sub: "Distribution & velocity" },
      { key: "movement", builder: buildMovement, title: "Movement Profile", sub: "Horizontal & vertical break" },
      { key: "velo_trend", builder: buildVeloTrend, title: "Velocity Trend", sub: "Speed over time", span: 2 },
      { key: "spin_distribution", builder: buildSpinDist, title: "Spin Rate", sub: "Distribution by pitch" },
      { key: "release_point", builder: buildReleasePoint, title: "Release Point", sub: "Arm slot consistency" },
      { key: "count_usage", builder: buildCountUsage, title: "Count Usage", sub: "Pitch selection by count", span: 2 },
      { key: "inning_perf", builder: buildInningPerf, title: "Inning Performance", sub: "Stamina & fatigue" },
    ],
    results: [
      { key: "pitch_location", builder: buildPitchLocation, title: "Pitch Location", sub: "Strike zone heatmap" },
      { key: "whiff_zone", builder: buildWhiffZone, title: "Whiff Rate", sub: "Swing-and-miss by zone" },
      { key: "launch", builder: buildLaunch, title: "Launch Speed vs Angle", sub: "Batted ball outcomes", span: 2 },
      { key: "expected_stats", builder: buildExpectedStats, title: "Expected Stats", sub: "xBA / xwOBA / xSLG" },
    ],
  };

  const loadChart = useCallback(async (key, builder) => {
    setLoading((p) => ({ ...p, [key]: true }));
    try {
      const data = await fetchViz(key, player, year);
      const result = builder(data);
      setCharts((p) => ({ ...p, [key]: result }));
    } catch (e) {
      console.error(`Error loading ${key}:`, e);
      setCharts((p) => ({ ...p, [key]: null }));
    }
    setLoading((p) => ({ ...p, [key]: false }));
  }, [player, year]);

  const loadAll = useCallback(() => {
    const allCharts = [...CHART_DEFS.pitching, ...CHART_DEFS.results];
    allCharts.forEach(({ key, builder }) => loadChart(key, builder));
  }, [loadChart]);

  useEffect(() => { loadAll(); }, [player, year]);

  useEffect(() => {
    if (searchInput.length < 2) { setPlayerSuggestions([]); return; }
    const t = setTimeout(async () => {
      const results = await searchPlayers(searchInput);
      setPlayerSuggestions(results?.map((r) => r.player_name) || []);
      setShowSuggestions(true);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentCharts = CHART_DEFS[activeTab] || [];

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(ellipse at 20% 0%, #1a1030 0%, ${DARK.bg} 50%)`,
      color: DARK.text,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${DARK.bg}; }
        ::-webkit-scrollbar-thumb { background: ${DARK.cardBorder}; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: "20px 32px",
        borderBottom: `1px solid ${DARK.cardBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
        background: "rgba(10,14,23,0.9)", backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${DARK.accent}, #c1121f)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#fff",
            boxShadow: `0 0 20px ${DARK.accentGlow}`,
          }}>⚾</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>BASEBALL SAVANT</div>
            <div style={{ fontSize: 10, color: DARK.textMuted, letterSpacing: "0.1em" }}>STATCAST ANALYTICS</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Player Search */}
          <div ref={searchRef} style={{ position: "relative" }}>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => playerSuggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Search pitcher..."
              style={{
                width: 240, padding: "8px 12px", fontSize: 12,
                background: DARK.card, border: `1px solid ${DARK.cardBorder}`,
                borderRadius: 8, color: DARK.text, outline: "none",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            {player && (
              <button onClick={() => { setPlayer(""); setSearchInput(""); }} style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: DARK.accent, cursor: "pointer", fontSize: 14,
              }}>✕</button>
            )}
            {showSuggestions && playerSuggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: DARK.card, border: `1px solid ${DARK.cardBorder}`, borderRadius: 8,
                maxHeight: 240, overflow: "auto", zIndex: 200,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}>
                {playerSuggestions.map((name) => (
                  <div key={name} onClick={() => { setPlayer(name); setSearchInput(name); setShowSuggestions(false); }}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 12, color: DARK.textMuted,
                      borderBottom: `1px solid ${DARK.cardBorder}`,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.target.style.background = DARK.accent + "22"; e.target.style.color = DARK.text; }}
                    onMouseLeave={(e) => { e.target.style.background = "transparent"; e.target.style.color = DARK.textMuted; }}
                  >{name}</div>
                ))}
              </div>
            )}
          </div>

          {/* Year Filter */}
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{
            padding: "8px 12px", fontSize: 12, background: DARK.card,
            border: `1px solid ${DARK.cardBorder}`, borderRadius: 8,
            color: DARK.text, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
          }}>
            <option value="">All Years</option>
            <option value="2015">2015</option>
            <option value="2016">2016</option>
            <option value="2017">2017</option>
          </select>
        </div>
      </header>

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 0, padding: "0 32px",
        borderBottom: `1px solid ${DARK.cardBorder}`,
        background: "rgba(10,14,23,0.6)",
      }}>
        {[
          { key: "pitching", label: "PITCHING", count: 7 },
          { key: "results", label: "RESULTS", count: 4 },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "12px 24px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            background: "none", border: "none", cursor: "pointer",
            color: activeTab === tab.key ? DARK.accent : DARK.textMuted,
            borderBottom: activeTab === tab.key ? `2px solid ${DARK.accent}` : "2px solid transparent",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.2s",
          }}>
            {tab.label}
            <span style={{
              marginLeft: 8, fontSize: 9, padding: "2px 6px",
              background: activeTab === tab.key ? DARK.accent + "33" : DARK.cardBorder,
              borderRadius: 4,
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Player Banner */}
      {player && (
        <div style={{
          padding: "16px 32px", display: "flex", alignItems: "center", gap: 12,
          background: `linear-gradient(90deg, ${DARK.accent}11, transparent)`,
          borderBottom: `1px solid ${DARK.cardBorder}`,
          animation: "fadeIn 0.3s ease-out",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: `linear-gradient(135deg, ${DARK.accent}, #c1121f)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700,
          }}>{player.split(",")[0]?.[0] || "?"}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{player}</div>
            <div style={{ fontSize: 10, color: DARK.textMuted }}>
              {year ? `${year} Season` : "2015-2017 Seasons"} • Statcast Data
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div style={{
        padding: "24px 32px 48px",
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 20,
      }}>
        {currentCharts.map(({ key, builder, title, sub, span }) => (
          <VizCard key={key} title={title} subtitle={sub} loading={loading[key]} span={span || 1}>
            {charts[key] ? (
              <PlotChart id={`chart-${key}`} data={charts[key].traces} layout={charts[key].layout} />
            ) : !loading[key] ? (
              <div style={{
                height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                color: DARK.textMuted, fontSize: 12,
              }}>No data available</div>
            ) : null}
          </VizCard>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 32px", borderTop: `1px solid ${DARK.cardBorder}`,
        textAlign: "center", fontSize: 10, color: DARK.textMuted,
        background: "rgba(10,14,23,0.6)",
      }}>
        Data sourced from Statcast (2015–2017) • 1.4M+ pitches
      </div>
    </div>
  );
}
