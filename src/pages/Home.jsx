import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CalendarSearch, Check, CheckSquare, Clock3, CupSoda, Droplets, Eye, EyeOff, Plus, Settings2, Sparkles, Timer, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

import { localDateKey as dateKey, academicWeek, calendarDayDifference, examStatus, getExamTiming } from "../../electron/domain-time.mjs";
import useNow from "../hooks/useNow";

const money = value => Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function OpenIcon({ label, onOpen }) {
  return <button type="button" className="dashboard-open-icon" onClick={event => { event.stopPropagation(); onOpen(); }} aria-label={`打开${label}`}><ArrowUpRight size={18} /></button>;
}

function DashboardCard({ className = "", icon: Icon, eyebrow, title, detail, onOpen, children, status = "ready", onRetry }) {
  if (status !== "ready") return <article className={`dashboard-card ${className}`}><header><span className="dashboard-card-icon"><Icon size={20}/></span><h2>{eyebrow}</h2></header><LoadState status={status} onRetry={onRetry}/></article>;
  return <article className={`dashboard-card ${className}`} onClick={onOpen}>
    <header><span className="dashboard-card-icon"><Icon size={20} /></span><div><small>{eyebrow}</small><h2>{title}</h2></div><OpenIcon label={eyebrow} onOpen={onOpen} /></header>
    {detail && <p className="dashboard-card-detail">{detail}</p>}
    {children}
  </article>;
}

function LoadState({ status, onRetry }) {
  return <div className="dashboard-load-state" role={status === "error" ? "alert" : "status"}>{status === "error" ? <><span>读取失败，请重试</span><button type="button" onClick={onRetry}>重新加载</button></> : "正在读取…"}</div>;
}

export default function Home() {
  const navigate = useNavigate();
  const [water, setWater] = useState(null);
  const [todos, setTodos] = useState(null);
  const [pomodoro, setPomodoro] = useState(null);
  const [finance, setFinance] = useState(null);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [exams, setExams] = useState(null);

  const [statuses, setStatuses] = useState({});
  const [attempt, setAttempt] = useState(0);
  const retry = event => { event?.stopPropagation(); setAttempt(value => value + 1); };
  const stateProps = name => ({ status: statuses[name] || "loading", onRetry: retry });
  useEffect(() => {
    let alive = true;
    setStatuses({});
    const sources = [
      ["water", window.waterApi, "getState", "onStateChanged", setWater],
      ["todos", window.todoApi, "getAll", "onChanged", setTodos],
      ["pomodoro", window.pomodoroApi, "getAll", "onChanged", setPomodoro],
      ["finance", window.financeApi, "getAll", "onChanged", setFinance],
      ["schedule", window.academicApi, "getSchedule", "onScheduleChanged", setSchedule],
      ["exams", window.academicApi, "getExams", "onExamsChanged", setExams]
    ];
    const off = sources.map(([name, api, method, subscribe, setter]) => {
      let revision = 0;
      const fail = () => { if (alive) setStatuses(old => ({ ...old, [name]: "error" })); };
      const receive = value => {
        if (!alive) return;
        const field = { todos: "tasks", pomodoro: "sessions", finance: "entries", schedule: "courses", exams: "exams" }[name];
        if (!value || (field && !Array.isArray(value[field])) || (name === "water" && !value.today)) { fail(); return; }
        setter(value);
        setStatuses(old => ({ ...old, [name]: "ready" }));
      };
      try {
        const unsubscribe = api?.[subscribe]?.(value => { revision += 1; receive(value); });
        const initial = revision;
        Promise.resolve().then(() => api[method]()).then(value => { if (revision === initial) receive(value); }).catch(() => { if (revision === initial) fail(); });
        return unsubscribe;
      } catch { fail(); }
    });
    return () => { alive = false; off.forEach(unsubscribe => unsubscribe?.()); };
  }, [attempt]);

  const today = useNow();
  const todayId = dateKey(today);
  const pendingTodos = useMemo(() => (todos?.tasks || []).filter(task => !task.completed).sort((a, b) => ["P0", "P1", "P2", "P3"].indexOf(a.priority) - ["P0", "P1", "P2", "P3"].indexOf(b.priority) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))), [todos]);
  const todayCourses = useMemo(() => {
    if (!schedule?.startDate) return [];
    const week = academicWeek(schedule.startDate, today);
    return (schedule.courses || []).filter(course => course.weekday === today.getDay() && week >= course.startWeek && week <= course.endWeek && (course.pattern === "每周" || (course.pattern === "单周" ? week % 2 : week % 2 === 0))).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedule, todayId]);
  const futureExams = useMemo(() => (exams?.exams || []).filter(exam => ["upcoming", "ongoing"].includes(examStatus(exam, today))).sort((a, b) => getExamTiming(a).startAt - getExamTiming(b).startAt), [exams, today]);
  const financeEntries = finance?.entries || [];
  const monthId = todayId.slice(0, 7);
  const monthEntries = financeEntries.filter(entry => String(entry.date || "").startsWith(`${monthId}-`));
  const monthExpense = monthEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const monthIncome = monthEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const monthBalance = monthIncome - monthExpense;
  const balanceSign = monthBalance < 0 ? "-" : "";
  const todayEntries = financeEntries.filter(entry => entry.date === todayId);
  const todayExpense = todayEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const todayIncome = todayEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const todaySessions = (pomodoro?.sessions || []).filter(session => session.endedAt && dateKey(session.endedAt) === todayId && session.status === "completed");
  const focusMinutes = Math.round(todaySessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
  const waterPercent = Math.min(100, Math.round(((water?.today?.totalMl || 0) / Math.max(1, water?.today?.targetMl || 1)) * 100));
  const nextExam = futureExams[0];
  const greeting = today.getHours() < 11 ? "早上好" : today.getHours() < 18 ? "下午好" : "晚上好";

  const addWater = async () => {
    const next = await window.waterApi?.addDrink?.({ source: "home" });
    if (next) setWater(next);
  };
  const completeTodo = async (event, task) => {
    event.stopPropagation();
    const next = await window.todoApi?.toggleComplete?.(task.id);
    if (next) setTodos(next);
  };

  return <main className="home-page dashboard-page">
    <header className="dashboard-header"><div><span className="dashboard-kicker"><Sparkles size={15} />TODAY AT A GLANCE</span><h1>{greeting}，今天也稳稳向前</h1><p>{today.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p></div><button className="home-settings-button" type="button" onClick={() => navigate("/settings")} aria-label="打开设置"><Settings2 size={20} /><span>设置</span></button></header>

    <section className="dashboard-finance-hero" onClick={() => navigate("/finance")}>
      {statuses.finance !== "ready" ? <LoadState {...stateProps("finance")}/> : <>
      <div className="finance-hero-heading"><span className="dashboard-card-icon"><WalletCards size={21} /></span><div><small>收支概览</small>{monthEntries.length ? <h2 className="finance-hero-balance"><span className="finance-balance-heading"><span>本月结余</span><button type="button" className="finance-balance-toggle" aria-label={balanceVisible ? "隐藏结余金额" : "显示结余金额"} aria-pressed={balanceVisible} onClick={event => { event.stopPropagation(); setBalanceVisible(value => !value); }}>{balanceVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button></span><strong aria-live="polite">{balanceVisible ? <>{balanceSign}{money(Math.abs(monthBalance))}</> : "****"}</strong></h2> : <h2>本月还没有收支记录</h2>}<p>{monthEntries.length ? `本月已记录${monthEntries.length}笔 · 今日${todayEntries.length}笔` : "从记录每一笔开始，更从容地安排生活"}</p></div></div>
      <div className="finance-hero-metrics"><span><TrendingUp size={16} /><em>今日收入</em><strong>¥{money(todayIncome)}</strong></span><span><TrendingDown size={16} /><em>今日支出</em><strong>¥{money(todayExpense)}</strong></span></div>
      <OpenIcon label="收支概览" onOpen={() => navigate("/finance")} />
      </>}
    </section>

    <section className="dashboard-grid">
      <DashboardCard {...stateProps("schedule")} className={`schedule-card schedule-card-large ${!todayCourses.length ? "schedule-is-empty" : ""}`} icon={CalendarClock} eyebrow="今日课表" title={todayCourses.length ? `${todayCourses.length}节课程` : "今天没课"} detail={todayCourses.length ? "按上课时间排列，点击进入完整课表" : "可以安排一段完整的学习时间"} onOpen={() => navigate("/schedule")}>
        <div className="dashboard-course-strip">{todayCourses.slice(0, 5).map(course => <span key={course.id}><b>{course.startTime}</b><strong>{course.name}</strong><em>{course.location || "地点待定"}</em></span>)}{!todayCourses.length && <div className="dashboard-course-empty"><CalendarClock size={21} />今天的时间由你安排</div>}</div>
      </DashboardCard>

      <DashboardCard {...stateProps("water")} className="water-card water-card-medium" icon={CupSoda} eyebrow="饮水" title={`今日${water?.today?.cups || 0}杯`} detail={`目标${water?.today?.targetMl || 0}ml`} onOpen={() => navigate("/drinking")}>
        <div className="dashboard-water-ring" style={{ "--percent": `${waterPercent}%` }}><div><Droplets size={29} strokeWidth={1.7} /><strong>{water?.today?.totalMl || 0}<small>ml</small></strong><span>已完成{waterPercent}%</span></div></div>
        <button type="button" className="dashboard-water-action" onClick={event => { event.stopPropagation(); addWater(); }}><Plus size={16} />加一杯</button>
      </DashboardCard>

      <DashboardCard {...stateProps("todos")} className="todo-card todo-card-medium" icon={CheckSquare} eyebrow="待办" title={`${pendingTodos.length}项未完成`} detail="点击圆圈即可完成任务" onOpen={() => navigate("/todo")}>
        <div className="dashboard-todo-list">{pendingTodos.slice(0, 5).map(task => <div key={task.id} className="dashboard-todo-item"><button type="button" onClick={event => completeTodo(event, task)} aria-label={`完成任务${task.title}`}><Check size={13} /></button><span>{task.title}</span><em className={`priority-${task.priority}`}>{task.priority}</em></div>)}{!pendingTodos.length && <div className="dashboard-todo-empty"><Check size={18} />今天的任务已全部完成</div>}</div>
      </DashboardCard>

      <DashboardCard {...stateProps("pomodoro")} className="focus-card dashboard-small-card" icon={Timer} eyebrow="专注" title={pomodoro?.active ? pomodoro.active.title : `${focusMinutes}分钟`} detail={pomodoro?.active ? "当前正在专注" : `今日完成${todaySessions.length}次专注`} onOpen={() => navigate("/pomodoro")}><div className={`dashboard-focus-pulse ${pomodoro?.active ? "active" : ""}`}><Clock3 size={16} /><span>{pomodoro?.active ? "计时进行中" : "保持自己的节奏"}</span></div></DashboardCard>
      <DashboardCard {...stateProps("exams")} className="exam-card dashboard-small-card" icon={CalendarSearch} eyebrow="考试" title={nextExam ? nextExam.name : "暂无考试"} detail={nextExam ? `${nextExam.date} · ${nextExam.time || "时间待定"}` : "导入考试表后会自动创建P0待办"} onOpen={() => navigate("/exams")}>{nextExam && <div className="dashboard-exam-countdown"><CalendarSearch size={15} />{examStatus(nextExam, today) === "ongoing" ? "进行中" : calendarDayDifference(nextExam.date, today) === 0 ? "今天" : `还有${calendarDayDifference(nextExam.date, today)}天`}</div>}</DashboardCard>
    </section>
  </main>;
}
