import React, { useEffect, useMemo, useState } from "react";
import DatePicker from "../components/DatePicker";
import { useConfirmation } from "../components/Confirmation";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Check, ChevronRight, Clock3, Expand,
  Flag, Focus, ImageOff, ImagePlus, LineChart, Pencil, Plus, RotateCcw, Settings2, Tag, Timer, Trash2, X
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

function DurationValue({ seconds }) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) {
    return <span className="pomo-duration-value"><b>{minutes}</b><em>分钟</em></span>;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return (
    <span className="pomo-duration-value">
      <b>{hours}</b><em>小时</em>
      {rest > 0 && <><b>{rest}</b><em>分</em></>}
    </span>
  );
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
  return {
    elapsed,
    display,
    progress: active.mode === "countup" ? 0 : Math.min(1, elapsed / Math.max(1, active.plannedSeconds))
  };
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
        {active.mode === "countdown" && <i style={{ width: `${Math.max(2, timer.progress * 100)}%` }} />}
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
        <small>{active.mode === "countdown" ? `${Math.round(timer.progress * 100)}%` : "正计时"}</small>
      </div>
    </div>
  );
}

function ImmersiveView({ data, timer, onExit, onFinish, onAbandon, onSettings }) {
  const { active, settings } = data;
  const [backgroundError, setBackgroundError] = useState("");
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  useEffect(() => {
    const handleKey = event => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onExit]);

  const importBackground = async () => {
    setBackgroundBusy(true); setBackgroundError("");
    try { await window.pomodoroApi.importBackground(); }
    catch (error) { setBackgroundError(error?.message || "导入背景失败"); }
    finally { setBackgroundBusy(false); }
  };
  const clearBackground = async () => {
    setBackgroundError("");
    try { await window.pomodoroApi.clearBackground(); }
    catch (error) { setBackgroundError(error?.message || "移除背景失败"); }
  };

  return (
    <section className={`pomo-immersive ambience-${settings.ambience}`} style={settings.ambience === "custom" && settings.customBackground ? { backgroundImage: `linear-gradient(rgba(10,15,16,.38),rgba(10,15,16,.62)),url(${settings.customBackground})` } : undefined}>
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
          {active.mode === "countdown" && <button className="abandon" onClick={onAbandon}><Flag size={18} />放弃</button>}
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
          {settings.customBackground && <button className={settings.ambience === "custom" ? "active" : ""} onClick={() => onSettings({ ambience: "custom" })}>自定义</button>}
        </div>
        <div className="immersive-options background-options">
          <span>背景</span>
          <button onClick={importBackground} disabled={backgroundBusy}><ImagePlus size={13}/>{backgroundBusy ? "导入中" : "导入图片"}</button>
          {settings.customBackground && <button onClick={clearBackground}><ImageOff size={13}/>移除</button>}
          {backgroundError && <em>{backgroundError}</em>}
        </div>
      </footer>
    </section>
  );
}

function TaskEditor({ data, task, onClose }) {
  const confirmAction = useConfirmation();
  const [title, setTitle] = useState(task?.title || "");
  const [mode, setMode] = useState(task?.mode || "countdown");
  const initialMinutes = task?.plannedSeconds ? Math.round(task.plannedSeconds / 60) : 30;
  const [minutes, setMinutes] = useState(PRESETS.includes(initialMinutes) ? initialMinutes : 30);
  const [custom, setCustom] = useState(PRESETS.includes(initialMinutes) ? "" : String(initialMinutes));
  const [tags, setTags] = useState(task?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (!title.trim()) {
      setError("请输入任务名称");
      return;
    }
    const duration = mode === "countdown" ? Number(custom) || minutes : null;
    if (mode === "countdown" && (duration < 1 || duration > 720)) {
      setError("时长应在1—720分钟之间");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        mode,
        plannedSeconds: mode === "countdown" ? duration * 60 : null,
        tags
      };
      if (task) await window.pomodoroApi.updateTask(task.id, payload);
      else await window.pomodoroApi.addTask(payload);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "保存任务失败");
    } finally {
      setSaving(false);
    }
  };

  const addTag = async () => {
    const clean = newTag.trim();
    if (!clean) return;
    await window.pomodoroApi.addTag(clean);
    setTags(current => [...new Set([...current, clean])]);
    setNewTag("");
    setAddingTag(false);
  };

  const deleteTag = async tag => {
    if (!(await confirmAction({ title: `删除标签“${tag}”？`, message: "已有历史记录会保留，但不再带有这个标签。", confirmLabel: "删除标签" }))) return;
    await window.pomodoroApi.deleteTag(tag);
    setTags(current => current.filter(item => item !== tag));
  };

  return (
    <div className="pomo-task-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="pomo-task-modal" onSubmit={submit}>
        <header>
          <div><span>{task ? "EDIT FOCUS TASK" : "NEW FOCUS TASK"}</span><h2>{task ? "编辑专注任务" : "新建专注任务"}</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
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
          <p>{mode === "countdown" ? "时间归零后自动完成并发送系统通知" : "从00:00开始计时，由你手动标记完成"}</p>
        </div>
        {mode === "countdown" && (
          <div className="pomo-section duration-section">
            <span className="field-label">专注时长</span>
            <div className="duration-presets">
              {PRESETS.map(value => (
                <button type="button" key={value} className={!custom && minutes === value ? "active" : ""} onClick={() => { setMinutes(value); setCustom(""); }}>
                  <strong>{value}</strong><span>分钟</span>
                </button>
              ))}
              <label className={`custom-duration ${custom ? "active" : ""}`}>
                <span>自定义</span>
                <div><input type="number" min="1" max="720" value={custom} onChange={event => setCustom(event.target.value)} placeholder="--" /><em>分钟</em></div>
              </label>
            </div>
          </div>
        )}
        <div className="pomo-section task-tag-editor">
          <div className="tag-editor-heading">
            <span className="field-label">任务标签 <em>可多选</em></span>
            <button type="button" className={managingTags ? "active" : ""} onClick={() => setManagingTags(value => !value)}><Settings2 size={14} />{managingTags ? "完成管理" : "管理"}</button>
          </div>
          <div className="tag-chips">
            {data.tags.map(tag => (
              <span className={`editable-tag ${tags.includes(tag) ? "active" : ""} ${managingTags ? "managing" : ""}`} key={tag}>
                <button type="button" onClick={() => setTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}>
                  {tags.includes(tag) && <Check size={13} />}{tag}
                </button>
                {managingTags && <button type="button" className="delete-tag" onClick={() => deleteTag(tag)} aria-label={`删除标签${tag}`}><Trash2 size={11} /></button>}
              </span>
            ))}
            {!addingTag && <button type="button" className="new-tag-chip" onClick={() => setAddingTag(true)}><Plus size={13} />新建</button>}
          </div>
          {addingTag && (
            <div className="inline-new-tag">
              <input value={newTag} maxLength={16} onChange={event => setNewTag(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="标签名称" autoFocus />
              <button type="button" onClick={addTag}>添加</button>
              <button type="button" onClick={() => { setAddingTag(false); setNewTag(""); }}>取消</button>
            </div>
          )}
        </div>
        <footer>
          <span className="form-error">{error}</span>
          <button type="button" className="modal-cancel" onClick={onClose}>取消</button>
          <button className="save-focus-task" type="submit" disabled={saving}><Check size={17} />{saving ? "保存中" : "保存任务"}</button>
        </footer>
      </form>
    </div>
  );
}

function FocusDashboard({ data, onStart, onImmersive, onFinish, onAbandon, busy }) {
  const confirmAction = useConfirmation();
  const timer = useTicker(data.active);
  const [selectedId, setSelectedId] = useState(data.tasks[0]?.id || "");
  const [editingTask, setEditingTask] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const todaySessions = data.sessions.filter(item => localDateKey(item.endedAt) === localDateKey());
  const completed = todaySessions.filter(item => item.status === "completed");
  const todaySeconds = completed.reduce((sum, item) => sum + item.durationSeconds, 0);
  const selectedTask = data.tasks.find(task => task.id === selectedId) || data.tasks[0] || null;

  useEffect(() => {
    if (!data.tasks.some(task => task.id === selectedId)) setSelectedId(data.tasks[0]?.id || "");
  }, [data.tasks, selectedId]);

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
            {data.active.mode === "countdown" && <button className="abandon-button" onClick={onAbandon}><Flag size={17} />放弃</button>}
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
      <section className="pomo-task-library">
        <header>
          <div><span>FOCUS TASKS</span><h2>选择专注任务</h2><p>保存常用任务，需要时直接开始。</p></div>
          <button onClick={() => { setEditingTask(null); setEditorOpen(true); }}><Plus size={18} />新建任务</button>
        </header>
        <div className="focus-task-list">
          {data.tasks.map((task, index) => (
            <article
              key={task.id}
              className={`focus-task-card ${selectedTask?.id === task.id ? "selected" : ""}`}
              onClick={() => setSelectedId(task.id)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedId(task.id); }}
              role="button"
              tabIndex={0}
            >
              <span className="task-index">{pad(index + 1)}</span>
              <div className="task-card-copy">
                <strong>{task.title}</strong>
                <div>
                  <em>{task.mode === "countup" ? "正计时" : `${Math.round(task.plannedSeconds / 60)}分钟`}</em>
                  {task.tags.map(tag => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <span className="task-mode-icon">{task.mode === "countup" ? <Clock3 size={19} /> : <Timer size={19} />}</span>
              <span className="task-card-actions">
                <button type="button" onClick={event => { event.stopPropagation(); setEditingTask(task); setEditorOpen(true); }} aria-label={`编辑任务${task.title}`}><Pencil size={15} /></button>
                <button type="button" onClick={async event => { event.stopPropagation(); if (await confirmAction({ title: `删除专注任务“${task.title}”？`, message: "历史统计不会受影响。", confirmLabel: "删除任务" })) await window.pomodoroApi.deleteTask(task.id); }} aria-label={`删除任务${task.title}`}><Trash2 size={15} /></button>
              </span>
              {selectedTask?.id === task.id && <i className="selected-mark"><Check size={14} /></i>}
            </article>
          ))}
          {!data.tasks.length && (
            <div className="empty-task-library">
              <Focus size={34} />
              <strong>还没有专注任务</strong>
              <span>新建一个任务，把每次开始的阻力降到最低。</span>
              <button onClick={() => { setEditingTask(null); setEditorOpen(true); }}><Plus size={17} />新建第一个任务</button>
            </div>
          )}
        </div>
        <footer>
          {selectedTask ? (
            <>
              <div><span>即将开始</span><strong>{selectedTask.title}</strong></div>
              <button className="start-focus" onClick={() => onStart(selectedTask)} disabled={busy}><Focus size={19} />开始专注<ChevronRight size={18} /></button>
            </>
          ) : <span>选择或新建一个专注任务</span>}
        </footer>
      </section>
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
      {editorOpen && <TaskEditor data={data} task={editingTask} onClose={() => { setEditorOpen(false); setEditingTask(null); }} />}
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
      <div className="pomo-donut-visual">
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
      </div>
      <div className="pomo-legend">
        {items.slice(0, 6).map((item, index) => (
          <button key={item.label} onClick={() => onSelect?.(item.label)} className={selected === item.label ? "active" : ""}>
            <i style={{ background: PALETTE[index % PALETTE.length] }} />
            <span><strong>{item.label}</strong><small>{formatMinutes(item.value)}</small></span>
            <b>{total ? `${(item.value / total * 100).toFixed(1)}%` : "0%"}</b>
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
  const completedSessions = sessions.filter(item => item.status === "completed");
  completedSessions.forEach(item => {
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
    y: 52 - (item[1] / max) * 40
  }));
  const line = coords.map(point => `${point.x},${point.y}`).join(" ");
  return (
    <div className="pomo-trend">
      <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet">
        {[12, 25.3, 38.6, 52].map(y => <line key={y} x1="5" y1={y} x2="96" y2={y} />)}
        {completedSessions.length > 0 && line && <polyline points={line} className="trend-area-line" />}
        {coords.map((point, index) => (
          <g key={point[0]}>
            <rect x={point.x - 1.8} y={point.y} width="3.6" height={52 - point.y} rx="1.8" className="trend-bar" />
            {completedSessions.length > 0 && <circle cx={point.x} cy={point.y} r="1.6" />}
            {point[1] > 0 && <text className="trend-value" x={point.x} y={Math.max(5, point.y - 3)}>{Math.round(point[1])}m</text>}
            {(points.length <= 10 || index % 2 === 0) && <text x={point.x} y="60">{point[0].slice(5)}</text>}
          </g>
        ))}
        {!completedSessions.length && (
          <g className="trend-empty-state">
            <text x="50" y="29">暂无统计数据</text>
            <text x="50" y="35">完成一次专注后，这里会生成趋势</text>
          </g>
        )}
      </svg>
      <div className="trend-key"><span><i />柱状：每日专注</span><span><i />曲线：专注趋势</span></div>
    </div>
  );
}

function Reports({ data, onClearSessions }) {
  const today = localDateKey();
  const [period, setPeriod] = useState("week");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [selectedTag, setSelectedTag] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const range = useMemo(() => rangeFor(period, new Date(), customStart, customEnd), [period, customStart, customEnd]);
  const filtered = useMemo(() => data.sessions.filter(item => {
    const time = new Date(item.endedAt).getTime();
    return time >= range.start.getTime() && time <= range.end.getTime();
  }), [data.sessions, range.start.getTime(), range.end.getTime()]);
  const complete = filtered.filter(item => item.status === "completed");
  const total = complete.reduce((sum, item) => sum + item.durationSeconds, 0);
  const allCompleted = data.sessions.filter(item => item.status === "completed");
  const allTotal = allCompleted.reduce((sum, item) => sum + item.durationSeconds, 0);
  const focusDays = new Set(allCompleted.map(item => localDateKey(item.endedAt))).size;
  const todaySessions = data.sessions.filter(item => localDateKey(item.endedAt) === today);
  const todayCompleted = todaySessions.filter(item => item.status === "completed");
  const todayTotal = todayCompleted.reduce((sum, item) => sum + item.durationSeconds, 0);
  const taskDistribution = aggregateBy(filtered, item => item.title);
  const tagDistribution = aggregateBy(filtered, item => item.tags.length ? item.tags : ["无标签"]);
  const drilled = selectedTag
    ? aggregateBy(filtered.filter(item => selectedTag === "无标签" ? !item.tags.length : item.tags.includes(selectedTag)), item => item.title)
    : [];

  useEffect(() => {
    if (!clearDialogOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key !== "Escape" || clearing) return;
      setClearDialogOpen(false);
      setClearError("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearDialogOpen, clearing]);

  const closeClearDialog = () => {
    if (clearing) return;
    setClearDialogOpen(false);
    setClearError("");
  };

  const clearSessions = async () => {
    setClearing(true);
    setClearError("");
    try {
      await onClearSessions();
      setSelectedTag("");
      setClearDialogOpen(false);
    } catch (error) {
      setClearError(error?.message || "清空统计记录失败，请稍后重试。");
    } finally {
      setClearing(false);
    }
  };

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
            <DatePicker value={customStart} max={customEnd} ariaLabel="统计开始日期" onChange={setCustomStart} />
            <span>至</span>
            <DatePicker value={customEnd} min={customStart} ariaLabel="统计结束日期" onChange={setCustomEnd} />
          </label>
        )}
        <span className="range-label">{range.label}</span>
        <button
          type="button"
          className="clear-statistics-button"
          onClick={() => setClearDialogOpen(true)}
          disabled={!data.sessions.length}
          title={data.sessions.length ? "清空全部历史专注记录" : "暂无可清空的统计记录"}
        >
          <Trash2 size={14} />清空统计记录
        </button>
      </section>
      <section className="report-overview">
        <div className="focus-summary-group">
          <header><span>ALL TIME</span><strong>累计专注</strong></header>
          <div className="focus-summary-metrics">
            <StatBlock label="次数" value={allCompleted.length} />
            <StatBlock label="时长" value={<DurationValue seconds={allTotal} />} />
            <StatBlock label="日均时长" value={<DurationValue seconds={focusDays ? allTotal / focusDays : 0} />} />
          </div>
        </div>
        <div className="focus-summary-group">
          <header><span>TODAY</span><strong>今日专注</strong></header>
          <div className="focus-summary-metrics">
            <StatBlock label="次数" value={todayCompleted.length} />
            <StatBlock label="时长" value={<DurationValue seconds={todayTotal} />} />
            <StatBlock label="放弃次数" value={todaySessions.filter(item => item.status === "abandoned").length} />
          </div>
        </div>
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
      {clearDialogOpen && (
        <div className="pomo-task-modal-backdrop pomo-confirm-backdrop" onMouseDown={event => event.target === event.currentTarget && closeClearDialog()}>
          <section
            className="pomo-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-pomodoro-title"
            aria-describedby="clear-pomodoro-description"
          >
            <div className="pomo-confirm-icon"><Trash2 size={21} /></div>
            <div className="pomo-confirm-copy">
              <span>CLEAR FOCUS HISTORY</span>
              <h2 id="clear-pomodoro-title">确定清空所有番茄钟记录吗？</h2>
              <p id="clear-pomodoro-description">此操作不可恢复。</p>
              <small>只会删除历史专注记录，任务、标签、设置和当前计时状态将保留。</small>
            </div>
            {clearError && <p className="pomo-confirm-error" role="alert">{clearError}</p>}
            <footer>
              <button type="button" className="modal-cancel" onClick={closeClearDialog} disabled={clearing} autoFocus>取消</button>
              <button type="button" className="clear-confirm-button" onClick={clearSessions} disabled={clearing}>
                <Trash2 size={15} />{clearing ? "清空中…" : "确认清空"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

const pages = [
  { id: "focus", label: "专注任务", icon: Focus },
  { id: "reports", label: "专注统计", icon: BarChart3 }
];

export default function PomodoroApp() {
  const confirmAction = useConfirmation();
  const navigate = useNavigate();
  const location = useLocation();
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

  useEffect(() => {
    const requested = new URLSearchParams(location.search).has("immersive");
    if (!requested || !data?.active) return;
    setImmersive(true);
    window.pomodoroApi.setImmersive(true);
    navigate("/pomodoro", { replace: true });
  }, [location.search, data?.active?.id, navigate]);

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
    if (!(await confirmAction({ title: "放弃本次专注？", message: "本次用时会保留在放弃记录中。", confirmLabel: "放弃专注" }))) return;
    await window.pomodoroApi.finish("abandoned");
    await exitImmersive();
  };
  const clearSessions = async () => {
    const next = await window.pomodoroApi.clearSessions();
    setData(next);
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
            <div><p>{pages.find(item => item.id === page)?.label}</p><h1>{page === "focus" ? "选择任务" : "看见投入"}</h1></div>
          </div>
          {data.active && <button className="top-active-pill" onClick={() => setPage("focus")}><i /><span>{data.active.title}</span><b>{formatClock(timer.display)}</b></button>}
        </header>
        <div className={`pomodoro-content ${page === "reports" ? "reports-scroll" : ""}`}>
          {page === "focus" && <FocusDashboard data={data} onStart={start} onImmersive={() => { setImmersive(true); window.pomodoroApi.setImmersive(true); }} onFinish={finish} onAbandon={abandon} busy={busy} />}
          {page === "reports" && <Reports data={data} onClearSessions={clearSessions} />}
        </div>
      </section>
    </main>
  );
}
