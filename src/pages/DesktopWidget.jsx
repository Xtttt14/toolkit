import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Check, Circle, Clock3, ListTodo, Play,
  Timer, X
} from "lucide-react";

const PRIORITY_LABELS = { P0: "紧急", P1: "高", P2: "中", P3: "低" };

function pad(value) {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function dueLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((target - dayStart) / 86400000);
  if (days < 0) return "已逾期";
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function PomodoroWidget({ data, now }) {
  const active = data?.active;
  const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000)) : 0;
  const display = active?.mode === "countdown" ? Math.max(0, active.plannedSeconds - elapsed) : elapsed;
  const progress = active?.mode === "countdown" ? Math.min(1, elapsed / Math.max(1, active.plannedSeconds)) : 0;
  const quickTasks = (data?.tasks || []).slice(0, 3);

  if (!active) {
    return (
      <section className="widget-panel widget-pomodoro idle">
        <div className="widget-idle-orbit"><Timer size={30} /></div>
        <div className="widget-empty-copy">
          <span>READY WHEN YOU ARE</span>
          <strong>开始一段专注</strong>
          <p>主窗口隐藏后，计时仍会在这里持续显示。</p>
        </div>
        <div className="widget-quick-tasks">
          {quickTasks.map(task => (
            <button key={task.id} onClick={() => window.pomodoroApi.start(task)}>
              <span><b>{task.title}</b><em>{task.mode === "countup" ? "正计时" : `${Math.round(task.plannedSeconds / 60)}分钟`}</em></span>
              <Play size={14} />
            </button>
          ))}
          {!quickTasks.length && <div className="widget-no-items">还没有专注任务</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="widget-panel widget-pomodoro active">
      <div className="widget-focus-meta"><i /><span>{active.mode === "countdown" ? "正在倒计时" : "正在正计时"}</span></div>
      <h2 title={active.title}>{active.title}</h2>
      <div className="widget-clock">{formatClock(display)}</div>
      <div className={`widget-progress ${active.mode === "countup" ? "countup" : ""}`}>
        <span style={{ width: active.mode === "countup" ? "42%" : `${progress * 100}%` }} />
      </div>
      <div className="widget-focus-footer">
        <span><Clock3 size={14} />已专注 {formatClock(elapsed)}</span>
        {active.tags?.[0] && <b>{active.tags[0]}</b>}
      </div>
    </section>
  );
}

function TodoWidget({ data, setData }) {
  const pending = useMemo(() => (data?.tasks || []).filter(task => !task.completed), [data]);
  const visible = pending.slice(0, 6);

  const toggle = async id => {
    const next = await window.todoApi.toggleComplete(id);
    if (next) setData(next);
  };

  return (
    <section className="widget-panel widget-todos">
      <div className="widget-todo-summary">
        <div><span>今日待办</span><strong>{pending.length}</strong><em>项未完成</em></div>
        <span className="widget-todo-date">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span>
      </div>
      <div className="widget-todo-list">
        {visible.map(task => (
          <button key={task.id} className={`priority-${task.priority}`} onClick={() => toggle(task.id)}>
            <span className="widget-check"><Circle size={17} /><Check size={12} /></span>
            <span className="widget-todo-copy"><b>{task.title}</b><em>{dueLabel(task.dueDate) || PRIORITY_LABELS[task.priority]}</em></span>
            <i />
          </button>
        ))}
        {!visible.length && (
          <div className="widget-all-done"><span><Check size={23} /></span><strong>今天都完成了</strong><em>给自己留一点轻松时间</em></div>
        )}
      </div>
      {pending.length > visible.length && <div className="widget-more">还有{pending.length - visible.length}项，请在主窗口查看</div>}
    </section>
  );
}

export default function DesktopWidget() {
  const [settings, setSettings] = useState(null);
  const [todos, setTodos] = useState(null);
  const [pomodoro, setPomodoro] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.body.classList.add("widget-body");
    Promise.all([
      window.appApi.getSettings(),
      window.todoApi.getAll(),
      window.pomodoroApi.getAll()
    ]).then(([appSettings, todoData, pomodoroData]) => {
      setSettings(appSettings);
      setTodos(todoData);
      setPomodoro(pomodoroData);
    });
    const offSettings = window.appApi.onSettingsChanged(setSettings);
    const offTodos = window.todoApi.onChanged(setTodos);
    const offPomodoro = window.pomodoroApi.onChanged(setPomodoro);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.body.classList.remove("widget-body");
      offSettings();
      offTodos();
      offPomodoro();
      window.clearInterval(timer);
    };
  }, []);

  const setMode = mode => {
    setSettings(current => ({ ...current, widgetMode: mode }));
    window.appApi.saveSettings({ widgetMode: mode });
  };

  if (!settings || !todos || !pomodoro) return null;
  const mode = settings.widgetMode === "todo" ? "todo" : "pomodoro";

  return (
    <main className={`desktop-widget mode-${mode}`}>
      <header className="widget-titlebar">
        <div className="widget-brand"><span><Timer size={15} /></span><b>TOOLBOX</b></div>
        <div className="widget-tabs">
          <button className={mode === "pomodoro" ? "active" : ""} onClick={() => setMode("pomodoro")}><Timer size={14} />专注</button>
          <button className={mode === "todo" ? "active" : ""} onClick={() => setMode("todo")}><ListTodo size={14} />待办</button>
        </div>
        <div className="widget-window-actions">
          <button onClick={() => window.appApi.openMain(mode === "todo" ? "/todo" : "/pomodoro")} title="在主窗口打开"><ArrowUpRight size={15} /></button>
          <button onClick={() => window.appApi.closeWidget()} title="关闭桌面组件"><X size={15} /></button>
        </div>
      </header>
      {mode === "todo"
        ? <TodoWidget data={todos} setData={setTodos} />
        : <PomodoroWidget data={pomodoro} now={now} />}
    </main>
  );
}
