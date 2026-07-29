import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Check, ChevronRight, Clock3, Expand,
  Flag, Focus, LineChart, Plus, RotateCcw, Tag, Timer, Trash2, X
} from "lucide-react";

const PRESETS = [30, 60, 90, 120];
const PALETTE = ["#d86245", "#e9a23b", "#4f8d72", "#397b9f", "#7466a8", "#b76586", "#7f8c5a", "#a66c42"];

function pad(value) {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function formatMinutes(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}

function dateAtStart(key) {
  return new Date(`${key}T00:00:00`);
}

function rangeFor(period, anchor = new Date(), customStart, customEnd) {
  const endOf = date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  if (period === "custom" && customStart && customEnd) {
    return { start: dateAtStart(customStart), end: endOf(dateAtStart(customEnd)), label: `${customStart} — ${customEnd}` };
  }
  if (period === "day") {
    return { start: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), end: endOf(anchor), label: localDateKey(anchor) };
  }
  if (period === "week") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = endOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
    return { start, end, label: `${localDateKey(start)} — ${localDateKey(end)}` };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = endOf(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  return { start, end, label: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月` };
}

function useTicker(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active?.id]);
  if (!active) return { elapsed: 0, display: 0, progress: 0 };
  const elapsed = Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000));
  const display = active.mode === "countdown" ? Math.max(0, active.plannedSeconds - elapsed) : elapsed;
  return { elapsed, display, progress: Math.min(1, elapsed / Math.max(1, active.plannedSeconds)) };
}

function StatBlock({ label, value, note }) {
  return (
    <div className="pomo-stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function TimerFace({ active, clockStyle, timer, compact = false }) {
  const degrees = timer.progress * 360;
  if (clockStyle === "minimal") {
    return (
      <div className={`pomo-face minimal ${compact ? "compact" : ""}`}>
        <span>{active.mode === "countdown" ? "剩余时间" : "已专注"}</span>
        <strong>{formatClock(timer.display)}</strong>
        <i style={{ width: `${Math.max(2, timer.progress * 100)}%` }} />
      </div>
    );
  }
  if (clockStyle === "digital") {
    return (
      <div className={`pomo-face digital ${compact ? "compact" : ""}`}>
        <div className="digital-dots"><i /><i /><i /></div>
        <strong>{formatClock(timer.display)}</strong>
        <span>{active.mode === "countdown" ? "COUNTING DOWN" : "COUNTING UP"}</span>
      </div>
    );
  }
  return (
    <div className={`pomo-face halo ${compact ? "compact" : ""}`} style={{ "--pomo-progress": `${degrees}deg` }}>
      <div>
        <span>{active.mode === "countdown" ? "剩余" : "专注"}</span>
        <strong>{formatClock(timer.display)}</strong>
        <small>{Math.round(timer.progress * 100)}%</small>
      </div>
    </div>
  );
}

function ImmersiveView({ data, timer, onExit, onFinish, onAbandon, onSettings }) {
  const { active, settings } = data;
  useEffect(() => {
    const handleKey = event => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onExit]);

  return (
    <section className={`pomo-immersive ambience-${settings.ambience}`}>
      <div className="immersive-grain" />
      <header>
        <div className="immersive-brand"><Focus size={18} /> 专注空间</div>
        <button onClick={onExit}><X size={19} />退出沉浸</button>
      </header>
      <main>
        <p>{active.tags.length ? active.tags.join(" · ") : "一次只做一件事"}</p>
        <h1>{active.title}</h1>
        <TimerFace active={active} timer={timer} clockStyle={settings.clockStyle} />
        <div className="immersive-actions">
          {active.mode === "countup" && <button className="finish" onClick={onFinish}><Check size={19} />完成专注</button>}
          <button className="abandon" onClick={onAbandon}><Flag size={18} />放弃</button>
        </div>
      </main>
      <footer>
        <div className="immersive-options">
          <span>时钟</span>
          {[
            ["halo", "光环"],
            ["digital", "数码"],
            ["minimal", "极简"]
          ].map(([id, label]) => (
            <button key={id} className={settings.clockStyle === id ? "active" : ""} onClick={() => onSettings({ clockStyle: id })}>{label}</button>
          ))}
        </div>
        <div className="immersive-options">
          <span>氛围</span>
          {[
            ["sunset", "落日"],
            ["dusk", "暮蓝"],
            ["grove", "林间"]
          ].map(([id, label]) => (
            <button key={id} className={settings.ambience === id ? "active" : ""} onClick={() => onSettings({ ambience: id })}>{label}</button>
          ))}
        </div>
      </footer>
    </section>
  );
}

function Composer({ data, onStart, busy }) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("countdown");
  const [minutes, setMinutes] = useState(30);
  const [custom, setCustom] = useState("");
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState("");

  const submit = async event => {
    event.preventDefault();
    if (!title.trim()) {
      setError("写下这次唯一要完成的事");
      return;
    }
    const duration = Number(custom) || minutes;
    if (duration < 1 || duration > 720) {
      setError("时长应在1—720分钟之间");
      return;
    }
    setError("");
    await onStart({ title: title.trim(), mode, plannedSeconds: duration * 60, tags });
  };

  const addTag = async event => {
    event.preventDefault();
    const clean = newTag.trim();
    if (!clean) return;
    await window.pomodoroApi.addTag(clean);
    setTags(current => [...new Set([...current, clean])]);
    setNewTag("");
  };

  return (
    <form className="pomo-composer" onSubmit={submit}>
      <header>
        <span>NEW SESSION</span>
        <h2>现在，专注于什么？</h2>
      </header>
      <label className="pomo-title-field">
        <span>任务名称</span>
        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={60} placeholder="例如：完成项目方案初稿" autoFocus />
      </label>
      <div className="pomo-section">
        <span className="field-label">计时方式</span>
        <div className="pomo-mode-switch">
          <button type="button" className={mode === "countdown" ? "active" : ""} onClick={() => setMode("countdown")}>倒计时</button>
          <button type="button" className={mode === "countup" ? "active" : ""} onClick={() => setMode("countup")}>正计时</button>
        </div>
        <p>{mode === "countdown" ? "时间归零后自动完成并通知你" : "由你手动完成，预设时长用于显示目标进度"}</p>
      </div>
      <div className="pomo-section">
        <span className="field-label">计划时长</span>
        <div className="duration-presets">
          {PRESETS.map(value => (
            <button type="button" key={value} className={!custom && minutes === value ? "active" : ""} onClick={() => { setMinutes(value); setCustom(""); }}>
              <strong>{value}</strong><span>分钟</span>
            </button>
          ))}
          <label className={custom ? "active" : ""}>
            <input type="number" min="1" max="720" value={custom} onChange={event => setCustom(event.target.value)} placeholder="自定义" />
            <span>分钟</span>
          </label>
        </div>
      </div>
      <div className="pomo-section tag-picker">
        <span className="field-label">标签 <em>可多选</em></span>
        <div className="tag-chips">
          {data.tags.map(tag => (
            <button type="button" key={tag} className={tags.includes(tag) ? "active" : ""} onClick={() => setTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}>
              {tags.includes(tag) && <Check size={13} />}{tag}
            </button>
          ))}
        </div>
        <div className="tag-quick-add">
          <input value={newTag} maxLength={16} onChange={event => setNewTag(event.target.value)} placeholder="新建可复用标签" />
          <button type="button" onClick={addTag}><Plus size={15} />添加</button>
        </div>
      </div>
      <footer>
        <span className="form-error">{error}</span>
        <button className="start-focus" type="submit" disabled={busy}><Focus size={20} />开始专注<ChevronRight size={18} /></button>
      </footer>
    </form>
  );
}

function FocusDashboard({ data, onStart, onImmersive, onFinish, onAbandon, busy }) {
  const timer = useTicker(data.active);
  const todaySessions = data.sessions.filter(item => localDateKey(item.endedAt) === localDateKey());
  const completed = todaySessions.filter(item => item.status === "completed");
  const todaySeconds = completed.reduce((sum, item) => sum + item.durationSeconds, 0);

  if (data.active) {
    return (
      <div className="pomo-running-page">
        <section className="running-card">
          <div className="running-copy">
            <span>FOCUS IN PROGRESS</span>
            <h2>{data.active.title}</h2>
            <p>{data.active.tags.length ? data.active.tags.join(" · ") : "未添加标签"}</p>
          </div>
          <TimerFace active={data.active} timer={timer} clockStyle={data.settings.clockStyle} compact />
          <div className="running-actions">
            <button className="immersive-button" onClick={onImmersive}><Expand size={18} />进入沉浸式全屏</button>
            {data.active.mode === "countup" && <button className="complete-button" onClick={onFinish}><Check size={18} />完成</button>}
            <button className="abandon-button" onClick={onAbandon}><Flag size={17} />放弃</button>
          </div>
        </section>
        <aside className="focus-note">
          <Clock3 size={22} />
          <div><strong>计时由后台守护</strong><span>切换页面、最小化或隐藏到托盘都不会中断。</span></div>
        </aside>
      </div>
    );
  }

  return (
    <div className="pomo-focus-page">
      <Composer data={data} onStart={onStart} busy={busy} />
      <aside className="pomo-today-panel">
        <header><span>TODAY</span><h2>今日足迹</h2></header>
        <div className="today-focus-number">
          <strong>{completed.length}</strong><span>次完成</span>
        </div>
        <div className="today-focus-metrics">
          <StatBlock label="专注时长" value={formatMinutes(todaySeconds)} />
          <StatBlock label="放弃次数" value={todaySessions.filter(item => item.status === "abandoned").length} />
        </div>
        <div className="recent-sessions">
          <span>最近记录</span>
          {data.sessions.slice(0, 4).map(item => (
            <div key={item.id}>
              <i className={item.status} />
              <section><strong>{item.title}</strong><span>{localDateKey(item.endedAt)} · {formatMinutes(item.durationSeconds)}</span></section>
              <em>{item.status === "completed" ? "完成" : "放弃"}</em>
            </div>
          ))}
          {!data.sessions.length && <p>你的第一段专注，会从这里留下痕迹。</p>}
        </div>
      </aside>
    </div>
  );
}

function aggregateBy(sessions, keyFn) {
  const map = new Map();
  sessions.filter(item => item.status === "completed").forEach(session => {
    const keys = keyFn(session);
    (Array.isArray(keys) ? keys : [keys]).filter(Boolean).forEach(key => {
      map.set(key, (map.get(key) || 0) + session.durationSeconds);
    });
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function DonutChart({ items, centerLabel, onSelect, selected }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const polar = (angle, radius = 42) => {
    const rad = (angle - 90) * Math.PI / 180;
    return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
  };
  const arcPath = (start, end) => {
    const [sx, sy] = polar(start);
    const [ex, ey] = polar(end);
    const large = end - start > 180 ? 1 : 0;
    return `M 50 50 L ${sx} ${sy} A 42 42 0 ${large} 1 ${ex} ${ey} Z`;
  };
  return (
    <div className="pomo-donut-wrap">
      <svg viewBox="0 0 100 100" className="pomo-donut-chart">
        {total > 0 ? items.map((item, index) => {
          const start = cursor;
          const portion = item.value / total * 359.6;
          cursor += portion;
          return (
            <path
              key={item.label}
              d={arcPath(start, cursor)}
              fill={PALETTE[index % PALETTE.length]}
              className={selected && selected !== item.label ? "muted" : ""}
              onClick={() => onSelect?.(item.label)}
            />
          );
        }) : <circle cx="50" cy="50" r="42" fill="#e9e5dc" />}
        <circle cx="50" cy="50" r="25" className="donut-hole" />
      </svg>
      <div className="donut-center"><strong>{formatMinutes(total)}</strong><span>{centerLabel}</span></div>
      <div className="pomo-legend">
        {items.slice(0, 6).map((item, index) => (
          <button key={item.label} onClick={() => onSelect?.(item.label)} className={selected === item.label ? "active" : ""}>
            <i style={{ background: PALETTE[index % PALETTE.length] }} /><span>{item.label}</span><b>{formatMinutes(item.value)}</b>
          </button>
        ))}
        {!items.length && <p>这个范围内还没有完成记录</p>}
      </div>
    </div>
  );
}

function TrendChart({ sessions, range }) {
  const days = [];
  const cursor = new Date(range.start);
  while (cursor <= range.end && days.length < 31) {
    days.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const grouped = new Map(days.map(day => [day, 0]));
  sessions.filter(item => item.status === "completed").forEach(item => {
    const key = localDateKey(item.endedAt);
    if (grouped.has(key)) grouped.set(key, grouped.get(key) + item.durationSeconds / 60);
  });
  let points = [...grouped.entries()];
  if (points.length > 14) {
    const bucketSize = Math.ceil(points.length / 10);
    points = Array.from({ length: Math.ceil(points.length / bucketSize) }, (_, index) => {
      const bucket = points.slice(index * bucketSize, (index + 1) * bucketSize);
      return [bucket[0]?.[0] || "", bucket.reduce((sum, item) => sum + item[1], 0)];
    });
  }
  const max = Math.max(30, ...points.map(item => item[1]));
  const coords = points.map((item, index) => ({
    ...item,
    x: points.length === 1 ? 50 : 8 + index * (84 / (points.length - 1)),
    y: 80 - (item[1] / max) * 62
  }));
  const line = coords.map(point => `${point.x},${point.y}`).join(" ");
  return (
    <div className="pomo-trend">
      <svg viewBox="0 0 100 92" preserveAspectRatio="none">
        {[18, 38, 58, 80].map(y => <line key={y} x1="5" y1={y} x2="96" y2={y} />)}
        {line && <polyline points={line} className="trend-area-line" />}
        {coords.map((point, index) => (
          <g key={point[0]}>
            <rect x={point.x - 2.1} y={point.y} width="4.2" height={80 - point.y} rx="2" className="trend-bar" />
            <circle cx={point.x} cy={point.y} r="1.6" />
            {(points.length <= 10 || index % 2 === 0) && <text x={point.x} y="90">{point[0].slice(5)}</text>}
          </g>
        ))}
      </svg>
      <div className="trend-key"><span><i />柱状：每日专注</span><span><i />曲线：专注趋势</span></div>
    </div>
  );
}

function Reports({ data }) {
  const today = localDateKey();
  const [period, setPeriod] = useState("week");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [selectedTag, setSelectedTag] = useState("");
  const range = useMemo(() => rangeFor(period, new Date(), customStart, customEnd), [period, customStart, customEnd]);
  const filtered = useMemo(() => data.sessions.filter(item => {
    const time = new Date(item.endedAt).getTime();
    return time >= range.start.getTime() && time <= range.end.getTime();
  }), [data.sessions, range.start.getTime(), range.end.getTime()]);
  const complete = filtered.filter(item => item.status === "completed");
  const total = complete.reduce((sum, item) => sum + item.durationSeconds, 0);
  const taskDistribution = aggregateBy(filtered, item => item.title);
  const tagDistribution = aggregateBy(filtered, item => item.tags.length ? item.tags : ["无标签"]);
  const drilled = selectedTag
    ? aggregateBy(filtered.filter(item => selectedTag === "无标签" ? !item.tags.length : item.tags.includes(selectedTag)), item => item.title)
    : [];

  return (
    <div className="pomo-reports">
      <section className="report-filter">
        <div>
          {[
            ["day", "日"],
            ["week", "周"],
            ["month", "月"],
            ["custom", "自定义"]
          ].map(([id, label]) => <button key={id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}
        </div>
        {period === "custom" && (
          <label className="custom-range">
            <input type="date" value={customStart} max={customEnd} onChange={event => setCustomStart(event.target.value)} />
            <span>至</span>
            <input type="date" value={customEnd} min={customStart} onChange={event => setCustomEnd(event.target.value)} />
          </label>
        )}
        <span className="range-label">{range.label}</span>
      </section>
      <section className="report-overview">
        <StatBlock label="累计专注时长" value={formatMinutes(data.sessions.filter(item => item.status === "completed").reduce((sum, item) => sum + item.durationSeconds, 0))} note={`全部${data.sessions.filter(item => item.status === "completed").length}次完成`} />
        <StatBlock label="本期专注时长" value={formatMinutes(total)} note={`${complete.length}次完成`} />
        <StatBlock label="本期完成次数" value={complete.length} note={complete.length ? `平均${formatMinutes(total / complete.length)}` : "等待第一条记录"} />
        <StatBlock label="本期放弃次数" value={filtered.filter(item => item.status === "abandoned").length} note="中途结束的记录" />
      </section>
      <section className="report-card trend-report">
        <header><div><span>FOCUS RHYTHM</span><h2>专注节奏</h2></div><LineChart size={22} /></header>
        <TrendChart sessions={filtered} range={range} />
      </section>
      <section className="report-card distribution-report">
        <header><div><span>BY TASK</span><h2>任务时长分布</h2></div><BarChart3 size={22} /></header>
        <DonutChart items={taskDistribution} centerLabel="任务专注" />
      </section>
      <section className="report-card distribution-report tag-report">
        <header>
          <div><span>BY TAG · 可点击下钻</span><h2>{selectedTag ? `「${selectedTag}」任务分布` : "标签时长分布"}</h2></div>
          {selectedTag ? <button className="drill-back" onClick={() => setSelectedTag("")}><RotateCcw size={15} />返回标签</button> : <Tag size={22} />}
        </header>
        <DonutChart
          items={selectedTag ? drilled : tagDistribution}
          centerLabel={selectedTag || "标签专注"}
          selected={selectedTag && !drilled.length ? selectedTag : ""}
          onSelect={selectedTag ? undefined : setSelectedTag}
        />
      </section>
    </div>
  );
}

function TagManager({ data }) {
  const [name, setName] = useState("");
  const add = async event => {
    event.preventDefault();
    if (!name.trim()) return;
    await window.pomodoroApi.addTag(name.trim());
    setName("");
  };
  return (
    <section className="pomo-tag-manager">
      <header><span>REUSABLE LABELS</span><h2>专注标签库</h2><p>标签会在每次创建专注任务时供你快速选择。</p></header>
      <form onSubmit={add}><input value={name} maxLength={16} onChange={event => setName(event.target.value)} placeholder="输入新标签名称" /><button><Plus size={17} />新建标签</button></form>
      <div className="managed-tags">
        {data.tags.map((tag, index) => {
          const count = data.sessions.filter(item => item.tags.includes(tag)).length;
          return (
            <div key={tag}><i style={{ background: PALETTE[index % PALETTE.length] }} /><strong>{tag}</strong><span>{count}次记录</span><button onClick={() => confirm(`删除标签“${tag}”？历史专注记录不会被删除。`) && window.pomodoroApi.deleteTag(tag)}><Trash2 size={16} /></button></div>
          );
        })}
        {!data.tags.length && <p>还没有标签，先创建一个吧。</p>}
      </div>
    </section>
  );
}

const pages = [
  { id: "focus", label: "开始专注", icon: Focus },
  { id: "reports", label: "专注统计", icon: BarChart3 },
  { id: "tags", label: "标签管理", icon: Tag }
];

export default function PomodoroApp() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [page, setPage] = useState("focus");
  const [immersive, setImmersive] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useTicker(data?.active);

  useEffect(() => {
    window.pomodoroApi.getAll().then(setData);
    const off = window.pomodoroApi.onChanged(setData);
    return () => {
      off();
      window.pomodoroApi.setImmersive(false);
    };
  }, []);

  useEffect(() => {
    if (!data?.active && immersive) {
      setImmersive(false);
      window.pomodoroApi.setImmersive(false);
    }
  }, [data?.active, immersive]);

  const start = async task => {
    setBusy(true);
    try {
      const next = await window.pomodoroApi.start(task);
      setData(next);
      setImmersive(true);
      await window.pomodoroApi.setImmersive(true);
    } finally {
      setBusy(false);
    }
  };

  const exitImmersive = async () => {
    setImmersive(false);
    await window.pomodoroApi.setImmersive(false);
  };
  const finish = async () => {
    await window.pomodoroApi.finish("completed");
    await exitImmersive();
  };
  const abandon = async () => {
    if (!confirm("确定放弃本次专注吗？本次用时会保留在放弃记录中。")) return;
    await window.pomodoroApi.finish("abandoned");
    await exitImmersive();
  };
  const saveSettings = patch => window.pomodoroApi.saveSettings({ ...data.settings, ...patch });

  if (!data) return null;
  if (immersive && data.active) {
    return <ImmersiveView data={data} timer={timer} onExit={exitImmersive} onFinish={finish} onAbandon={abandon} onSettings={saveSettings} />;
  }

  return (
    <main className="app-shell pomodoro-shell">
      <aside className="sidebar pomodoro-sidebar">
        <div className="brand">
          <span className="brand-mark internal-module-mark"><Timer size={27} strokeWidth={1.8} /></span>
          <div><strong>番茄钟</strong><span>专注工作室</span></div>
        </div>
        <nav className="nav pomodoro-nav">
          {pages.map(item => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
              <item.icon size={19} /><span>{item.label}</span>
              {item.id === "focus" && data.active && <i />}
            </button>
          ))}
        </nav>
        <div className="pomo-local-note"><span />数据仅保存在本机</div>
      </aside>
      <section className="workspace pomodoro-workspace">
        <header className="topbar pomodoro-topbar">
          <div className="title-row">
            <button className="icon-button" onClick={() => navigate("/")} aria-label="返回主页"><ArrowLeft size={20} /></button>
            <div><p>{pages.find(item => item.id === page)?.label}</p><h1>{page === "focus" ? "专注此刻" : page === "reports" ? "看见投入" : "整理标签"}</h1></div>
          </div>
          {data.active && <button className="top-active-pill" onClick={() => setPage("focus")}><i /><span>{data.active.title}</span><b>{formatClock(timer.display)}</b></button>}
        </header>
        <div className="pomodoro-content">
          {page === "focus" && <FocusDashboard data={data} onStart={start} onImmersive={() => { setImmersive(true); window.pomodoroApi.setImmersive(true); }} onFinish={finish} onAbandon={abandon} busy={busy} />}
          {page === "reports" && <Reports data={data} />}
          {page === "tags" && <TagManager data={data} />}
        </div>
      </section>
    </main>
  );
}
