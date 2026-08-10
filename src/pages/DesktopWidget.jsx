import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Calculator, Check, Circle, Clock3, Expand, Flag,
  ListTodo, Play, Plus, ReceiptText, Timer, WalletCards, X
} from "lucide-react";
import MenuSelect from "../components/MenuSelect";

const PRIORITY_LABELS = { P0: "紧急", P1: "高", P2: "中", P3: "低" };
const FINANCE_TAGS = {
  income: ["工资", "生活费", "红包", "外快", "股票", "其他"],
  expense: ["三餐", "零食", "衣服", "交通", "旅行", "孩子", "宠物", "话费网费", "烟酒", "学习", "日用品", "住房", "美妆", "医疗", "发红包", "汽车/加油", "娱乐", "请客送礼", "电器数码", "运动", "其他", "水电煤"]
};

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

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function AddButton({ onClick, label }) {
  return (
    <button type="button" className="widget-new-button" onClick={onClick}>
      <Plus size={13} /><span>{label}</span>
    </button>
  );
}

function AddSheet({ title, subtitle, onClose, children }) {
  return (
    <div className="widget-add-sheet">
      <header>
        <div><strong>{title}</strong><span>{subtitle}</span></div>
        <button type="button" onClick={onClose} aria-label="关闭新增表单"><X size={15} /></button>
      </header>
      {children}
    </div>
  );
}

function PomodoroWidget({ data, now, setData }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("countdown");
  const [minutes, setMinutes] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const active = data?.active;
  const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000)) : 0;
  const display = active?.mode === "countdown" ? Math.max(0, active.plannedSeconds - elapsed) : elapsed;
  const progress = active?.mode === "countdown" ? Math.min(1, elapsed / Math.max(1, active.plannedSeconds)) : 0;
  const tasks = data?.tasks || [];

  const addTask = async event => {
    event.preventDefault();
    if (!title.trim()) {
      setError("请输入任务名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await window.pomodoroApi.addTask({
        title: title.trim(),
        mode,
        plannedSeconds: mode === "countdown" ? Math.max(1, Number(minutes) || 30) * 60 : null,
        tags: []
      });
      if (next) setData(next);
      setTitle("");
      setMinutes("30");
      setAdding(false);
    } catch (reason) {
      setError(reason?.message || "新增失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const finishFocus = async status => {
    if (actionBusy) return;
    if (status === "abandoned" && !window.confirm("确定放弃本次专注吗？本次用时会保留在放弃记录中。")) return;
    setActionBusy(true);
    setActionError("");
    try {
      const next = await window.pomodoroApi.finish(status);
      if (next) setData(next);
    } catch (reason) {
      setActionError(reason?.message || "操作失败，请重试");
    } finally {
      setActionBusy(false);
    }
  };

  const openImmersive = () => {
    setActionError("");
    window.appApi.openMain(`/pomodoro?immersive=${Date.now()}`);
  };

  return (
    <section className={`widget-panel widget-pomodoro ${active ? "active" : "idle"}`}>
      <div className="widget-section-head">
        <div>
          <span>{active ? "FOCUSING NOW" : "FOCUS TASKS"}</span>
          <strong>{active ? "专注进行中" : `${tasks.length}个专注任务`}</strong>
        </div>
        <AddButton onClick={() => { setError(""); setAdding(true); }} label="任务" />
      </div>

      {active ? (
        <div className="widget-active-focus">
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
          <div className="widget-focus-actions">
            <button className="immersive" onClick={openImmersive}><Expand size={14} />沉浸式全屏</button>
            {active.mode === "countup" && (
              <button className="complete" disabled={actionBusy} onClick={() => finishFocus("completed")}><Check size={14} />{actionBusy ? "处理中" : "完成"}</button>
            )}
            {active.mode === "countdown" && (
              <button className="abandon" disabled={actionBusy} onClick={() => finishFocus("abandoned")}><Flag size={13} />{actionBusy ? "处理中" : "放弃"}</button>
            )}
          </div>
          {actionError && <p className="widget-focus-action-error">{actionError}</p>}
        </div>
      ) : (
        <div className="widget-quick-tasks widget-scroll">
          {tasks.map(task => (
            <button key={task.id} onClick={() => window.pomodoroApi.start(task)}>
              <span><b>{task.title}</b><em>{task.mode === "countup" ? "正计时" : `${Math.round(task.plannedSeconds / 60)}分钟`}</em></span>
              <Play size={14} />
            </button>
          ))}
          {!tasks.length && (
            <div className="widget-no-items">
              <span><Timer size={24} /></span><strong>还没有专注任务</strong><em>点击右上角新增一个</em>
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddSheet title="新增专注任务" subtitle="保存后可在列表中直接开始" onClose={() => setAdding(false)}>
          <form className="widget-compact-form" onSubmit={addTask}>
            <label className="wide"><span>任务名称</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="准备专注什么？" maxLength={60} /></label>
            <label><span>计时方式</span><MenuSelect value={mode} ariaLabel="计时方式" onChange={setMode} options={[{ value:"countdown", label:"倒计时" }, { value:"countup", label:"正计时" }]} /></label>
            <label><span>时长</span><input type="number" min="1" max="720" disabled={mode === "countup"} value={minutes} onChange={event => setMinutes(event.target.value)} /><em>分钟</em></label>
            {error && <p className="widget-form-error">{error}</p>}
            <button className="widget-form-submit" type="submit" disabled={busy}>{busy ? "保存中…" : "保存任务"}</button>
          </form>
        </AddSheet>
      )}
    </section>
  );
}

function TodoWidget({ data, setData }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("P3");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useMemo(() => (data?.tasks || []).filter(task => !task.completed), [data]);

  const toggle = async id => {
    const next = await window.todoApi.toggleComplete(id);
    if (next) setData(next);
  };

  const addTodo = async event => {
    event.preventDefault();
    if (!title.trim()) {
      setError("请输入待办名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await window.todoApi.add({
        title: title.trim(),
        description: "",
        priority,
        tags: [],
        dueDate: dueDate ? `${dueDate}T23:59:00` : null,
        reminderMinutes: 30,
        subtasks: []
      });
      if (next) setData(next);
      setTitle("");
      setDueDate("");
      setPriority("P3");
      setAdding(false);
    } catch (reason) {
      setError(reason?.message || "新增失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="widget-panel widget-todos">
      <div className="widget-section-head widget-todo-summary">
        <div><span>今日待办</span><strong>{pending.length}</strong><em>项未完成</em></div>
        <AddButton onClick={() => { setError(""); setAdding(true); }} label="待办" />
      </div>
      <div className="widget-todo-list widget-scroll">
        {pending.map(task => (
          <button key={task.id} className={`priority-${task.priority}`} onClick={() => toggle(task.id)}>
            <span className="widget-check"><Circle size={17} /><Check size={12} /></span>
            <span className="widget-todo-copy"><b>{task.title}</b><em>{dueLabel(task.dueDate) || PRIORITY_LABELS[task.priority]}</em></span>
            <i />
          </button>
        ))}
        {!pending.length && (
          <div className="widget-all-done"><span><Check size={23} /></span><strong>今天都完成了</strong><em>给自己留一点轻松时间</em></div>
        )}
      </div>
      <div className="widget-footnote">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</div>

      {adding && (
        <AddSheet title="新增待办" subtitle="新增后保持固定行高并进入列表" onClose={() => setAdding(false)}>
          <form className="widget-compact-form" onSubmit={addTodo}>
            <label className="wide"><span>待办名称</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="接下来要做什么？" maxLength={80} /></label>
            <label><span>优先级</span><MenuSelect value={priority} ariaLabel="优先级" onChange={setPriority} options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label:`${value} · ${label}` }))} /></label>
            <label><span>截止日期</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
            {error && <p className="widget-form-error">{error}</p>}
            <button className="widget-form-submit" type="submit" disabled={busy}>{busy ? "保存中…" : "保存待办"}</button>
          </form>
        </AddSheet>
      )}
    </section>
  );
}

function FinanceWidget({ data, setData }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [tag, setTag] = useState(FINANCE_TAGS.expense[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localDateKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const entries = data?.entries || [];
  const today = localDateKey();
  const todayEntries = entries.filter(entry => entry.date === today);
  const todayExpense = todayEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const todayIncome = todayEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const tags = [...new Set([...(FINANCE_TAGS[type] || []), ...(data?.customTags?.[type] || [])])];

  const changeType = nextType => {
    setType(nextType);
    setTag(FINANCE_TAGS[nextType][0]);
  };

  const addEntry = async event => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("请输入大于0的金额");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await window.financeApi.add({
        type,
        amount: numericAmount,
        tag,
        note: note.trim(),
        date
      });
      if (next) setData(next);
      setAmount("");
      setNote("");
      setAdding(false);
    } catch (reason) {
      setError(reason?.message || "记账失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="widget-panel widget-finance">
      <div className="widget-section-head">
        <div><span>TODAY'S LEDGER</span><strong>今日收支</strong></div>
        <AddButton onClick={() => { setError(""); setAdding(true); }} label="记账" />
      </div>
      <div className="widget-finance-summary">
        <div className="expense"><span>支出</span><strong>¥{todayExpense.toFixed(2)}</strong></div>
        <div className="income"><span>收入</span><strong>¥{todayIncome.toFixed(2)}</strong></div>
      </div>
      <div className="widget-finance-list widget-scroll">
        {entries.map(entry => (
          <div className={`widget-finance-row ${entry.type}`} key={entry.id}>
            <span className="widget-finance-icon">{entry.type === "income" ? <WalletCards size={15} /> : <ReceiptText size={15} />}</span>
            <span><b>{entry.note || entry.tag}</b><em>{entry.tag} · {entry.date === today ? "今天" : entry.date.slice(5).replace("-", "/")}</em></span>
            <strong>{entry.type === "income" ? "+" : "-"}¥{entry.amount.toFixed(2)}</strong>
          </div>
        ))}
        {!entries.length && (
          <div className="widget-no-items"><span><Calculator size={24} /></span><strong>还没有账目</strong><em>点击右上角记下第一笔</em></div>
        )}
      </div>

      {adding && (
        <AddSheet title="新增账目" subtitle="记录一笔收入或支出" onClose={() => setAdding(false)}>
          <form className="widget-compact-form finance" onSubmit={addEntry}>
            <div className="widget-type-switch wide">
              <button type="button" className={type === "expense" ? "active expense" : ""} onClick={() => changeType("expense")}>支出</button>
              <button type="button" className={type === "income" ? "active income" : ""} onClick={() => changeType("income")}>收入</button>
            </div>
            <label><span>金额</span><input autoFocus type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
            <label><span>分类</span><MenuSelect value={tag} ariaLabel="账目分类" onChange={setTag} options={tags.map(item => ({ value:item, label:item }))} /></label>
            <label><span>日期</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label><span>备注</span><input value={note} onChange={event => setNote(event.target.value)} placeholder="可选" maxLength={120} /></label>
            {error && <p className="widget-form-error">{error}</p>}
            <button className="widget-form-submit" type="submit" disabled={busy}>{busy ? "保存中…" : "保存账目"}</button>
          </form>
        </AddSheet>
      )}
    </section>
  );
}

export default function DesktopWidget() {
  const [settings, setSettings] = useState(null);
  const [todos, setTodos] = useState(null);
  const [pomodoro, setPomodoro] = useState(null);
  const [finance, setFinance] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.body.classList.add("widget-body");
    Promise.all([
      window.appApi.getSettings(),
      window.todoApi.getAll(),
      window.pomodoroApi.getAll(),
      window.financeApi.getAll()
    ]).then(([appSettings, todoData, pomodoroData, financeData]) => {
      setSettings(appSettings);
      setTodos(todoData);
      setPomodoro(pomodoroData);
      setFinance(financeData);
    });
    const offSettings = window.appApi.onSettingsChanged(setSettings);
    const offTodos = window.todoApi.onChanged(setTodos);
    const offPomodoro = window.pomodoroApi.onChanged(setPomodoro);
    const offFinance = window.financeApi.onChanged(setFinance);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.body.classList.remove("widget-body");
      offSettings();
      offTodos();
      offPomodoro();
      offFinance();
      window.clearInterval(timer);
    };
  }, []);

  const setMode = mode => {
    setSettings(current => ({ ...current, widgetMode: mode }));
    window.appApi.saveSettings({ widgetMode: mode });
  };

  if (!settings || !todos || !pomodoro || !finance) return null;
  const mode = ["pomodoro", "todo", "finance"].includes(settings.widgetMode) ? settings.widgetMode : "pomodoro";
  const routes = { pomodoro: "/pomodoro", todo: "/todo", finance: "/finance" };

  return (
    <main className={`desktop-widget mode-${mode}`}>
      <header className="widget-titlebar">
        <div className="widget-brand"><span><Timer size={15} /></span><b>TOOLBOX</b></div>
        <div className="widget-tabs">
          <button className={mode === "pomodoro" ? "active" : ""} onClick={() => setMode("pomodoro")} title="专注"><Timer size={14} /><span>专注</span></button>
          <button className={mode === "todo" ? "active" : ""} onClick={() => setMode("todo")} title="待办"><ListTodo size={14} /><span>待办</span></button>
          <button className={mode === "finance" ? "active" : ""} onClick={() => setMode("finance")} title="记账"><Calculator size={14} /><span>记账</span></button>
        </div>
        <div className="widget-window-actions">
          <button onClick={() => window.appApi.openMain(routes[mode])} title="在主窗口打开"><ArrowUpRight size={15} /></button>
          <button onClick={() => window.appApi.closeWidget()} title="关闭桌面组件"><X size={15} /></button>
        </div>
      </header>
      {mode === "todo" && <TodoWidget data={todos} setData={setTodos} />}
      {mode === "finance" && <FinanceWidget data={finance} setData={setFinance} />}
      {mode === "pomodoro" && <PomodoroWidget data={pomodoro} setData={setPomodoro} now={now} />}
    </main>
  );
}
