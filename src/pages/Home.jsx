import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CalendarSearch, Check, CheckSquare, Clock3, CupSoda, Droplets, Plus, Settings2, Sparkles, Timer, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

const dateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monday = value => { const date = new Date(value); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); date.setHours(12, 0, 0, 0); return date; };
const money = value => Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function OpenIcon({ label, onOpen }) {
  return <button type="button" className="dashboard-open-icon" onClick={event => { event.stopPropagation(); onOpen(); }} aria-label={`打开${label}`}><ArrowUpRight size={18} /></button>;
}

function DashboardCard({ className = "", icon: Icon, eyebrow, title, detail, onOpen, children }) {
  return <article className={`dashboard-card ${className}`} onClick={onOpen}>
    <header><span className="dashboard-card-icon"><Icon size={20} /></span><div><small>{eyebrow}</small><h2>{title}</h2></div><OpenIcon label={eyebrow} onOpen={onOpen} /></header>
    {detail && <p className="dashboard-card-detail">{detail}</p>}
    {children}
  </article>;
}

export default function Home() {
  const navigate = useNavigate();
  const [water, setWater] = useState(null);
  const [todos, setTodos] = useState(null);
  const [pomodoro, setPomodoro] = useState(null);
  const [finance, setFinance] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [exams, setExams] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = (api, method, setter) => api?.[method]?.().then(value => alive && setter(value)).catch(() => undefined);
    load(window.waterApi, "getState", setWater); load(window.todoApi, "getAll", setTodos); load(window.pomodoroApi, "getAll", setPomodoro);
    load(window.financeApi, "getAll", setFinance); load(window.academicApi, "getSchedule", setSchedule); load(window.academicApi, "getExams", setExams);
    const off = [window.waterApi?.onStateChanged?.(setWater), window.todoApi?.onChanged?.(setTodos), window.pomodoroApi?.onChanged?.(setPomodoro), window.financeApi?.onChanged?.(setFinance), window.academicApi?.onScheduleChanged?.(setSchedule), window.academicApi?.onExamsChanged?.(setExams)];
    return () => { alive = false; off.forEach(unsubscribe => unsubscribe?.()); };
  }, []);

  const today = new Date();
  const todayId = dateKey(today);
  const pendingTodos = useMemo(() => (todos?.tasks || []).filter(task => !task.completed).sort((a, b) => ["P0", "P1", "P2", "P3"].indexOf(a.priority) - ["P0", "P1", "P2", "P3"].indexOf(b.priority) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))), [todos]);
  const todayCourses = useMemo(() => {
    if (!schedule?.startDate) return [];
    const start = monday(new Date(`${schedule.startDate}T12:00:00`));
    const week = Math.floor((monday(new Date(`${todayId}T12:00:00`)) - start) / 604800000) + 1;
    return (schedule.courses || []).filter(course => course.weekday === today.getDay() && week >= course.startWeek && week <= course.endWeek && (course.pattern === "每周" || (course.pattern === "单周" ? week % 2 : week % 2 === 0))).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedule, todayId]);
  const futureExams = useMemo(() => (exams?.exams || []).filter(exam => exam.date >= todayId).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))), [exams, todayId]);
  const todayEntries = (finance?.entries || []).filter(entry => entry.date === todayId);
  const todayExpense = todayEntries.filter(entry => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const todayIncome = todayEntries.filter(entry => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const todayBalance = todayIncome - todayExpense;
  const todaySessions = (pomodoro?.sessions || []).filter(session => String(session.endedAt || "").startsWith(todayId) && session.status === "completed");
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
      <div className="finance-hero-heading"><span className="dashboard-card-icon"><WalletCards size={21} /></span><div><small>今日收支</small>{todayEntries.length ? <h2 className="finance-hero-balance"><span>今日结余</span><strong>¥{money(Math.abs(todayBalance))}</strong></h2> : <h2>今天还没有收支记录</h2>}<p>{todayEntries.length ? `已记录${todayEntries.length}笔，点击查看明细` : "从记录每一笔开始，更从容地安排生活"}</p></div></div>
      <div className="finance-hero-metrics"><span><TrendingUp size={16} /><em>收入</em><strong>¥{money(todayIncome)}</strong></span><span><TrendingDown size={16} /><em>支出</em><strong>¥{money(todayExpense)}</strong></span></div>
      <OpenIcon label="今日收支" onOpen={() => navigate("/finance")} />
    </section>

    <section className="dashboard-grid">
      <DashboardCard className="schedule-card schedule-card-large" icon={CalendarClock} eyebrow="今日课表" title={todayCourses.length ? `${todayCourses.length}节课程` : "今天没课"} detail={todayCourses.length ? "按上课时间排列，点击进入完整课表" : "可以安排一段完整的学习时间"} onOpen={() => navigate("/schedule")}>
        <div className="dashboard-course-strip">{todayCourses.slice(0, 5).map(course => <span key={course.id}><b>{course.startTime}</b><strong>{course.name}</strong><em>{course.location || "地点待定"}</em></span>)}{!todayCourses.length && <div className="dashboard-course-empty"><CalendarClock size={21} />今天的时间由你安排</div>}</div>
      </DashboardCard>

      <DashboardCard className="water-card water-card-medium" icon={CupSoda} eyebrow="饮水" title={`今日${water?.today?.cups || 0}杯`} detail={`目标${water?.today?.targetMl || 0}ml`} onOpen={() => navigate("/drinking")}>
        <div className="dashboard-water-ring" style={{ "--percent": `${waterPercent}%` }}><div><Droplets size={29} strokeWidth={1.7} /><strong>{water?.today?.totalMl || 0}<small>ml</small></strong><span>已完成{waterPercent}%</span></div></div>
        <button type="button" className="dashboard-water-action" onClick={event => { event.stopPropagation(); addWater(); }}><Plus size={16} />加一杯</button>
      </DashboardCard>

      <DashboardCard className="todo-card todo-card-medium" icon={CheckSquare} eyebrow="待办" title={`${pendingTodos.length}项未完成`} detail="点击圆圈即可完成任务" onOpen={() => navigate("/todo")}>
        <div className="dashboard-todo-list">{pendingTodos.slice(0, 5).map(task => <div key={task.id} className="dashboard-todo-item"><button type="button" onClick={event => completeTodo(event, task)} aria-label={`完成任务${task.title}`}><Check size={13} /></button><span>{task.title}</span><em className={`priority-${task.priority}`}>{task.priority}</em></div>)}{!pendingTodos.length && <div className="dashboard-todo-empty"><Check size={18} />今天的任务已全部完成</div>}</div>
      </DashboardCard>

      <DashboardCard className="focus-card dashboard-small-card" icon={Timer} eyebrow="专注" title={pomodoro?.active ? pomodoro.active.title : `${focusMinutes}分钟`} detail={pomodoro?.active ? "当前正在专注" : `今日完成${todaySessions.length}次专注`} onOpen={() => navigate("/pomodoro")}><div className={`dashboard-focus-pulse ${pomodoro?.active ? "active" : ""}`}><Clock3 size={16} /><span>{pomodoro?.active ? "计时进行中" : "保持自己的节奏"}</span></div></DashboardCard>
      <DashboardCard className="exam-card dashboard-small-card" icon={CalendarSearch} eyebrow="考试" title={nextExam ? nextExam.name : "暂无考试"} detail={nextExam ? `${nextExam.date} · ${nextExam.time || "时间待定"}` : "导入考试表后会自动创建P0待办"} onOpen={() => navigate("/exams")}>{nextExam && <div className="dashboard-exam-countdown"><CalendarSearch size={15} />还有{Math.max(0, Math.ceil((new Date(`${nextExam.date}T23:59:00`) - today) / 86400000))}天</div>}</DashboardCard>
    </section>
  </main>;
}
