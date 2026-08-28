import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CalendarSearch, Check, CheckSquare, Clock3, Coins, CupSoda, Droplets, Plus, Settings2, Sparkles, Timer, WalletCards } from "lucide-react";

const dateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monday = value => { const date = new Date(value); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); date.setHours(12, 0, 0, 0); return date; };

function DashboardCard({ className = "", icon: Icon, eyebrow, title, detail, action, onAction, onOpen, children }) {
  return <article className={`dashboard-card ${className}`} onClick={onOpen}>
    <header><span className="dashboard-card-icon"><Icon size={20} /></span><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" className="dashboard-open-icon" onClick={event=>{event.stopPropagation();onOpen();}} aria-label={`打开${eyebrow}`}><ArrowUpRight size={18}/></button></header>
    {detail && <p className="dashboard-card-detail">{detail}</p>}
    {children}
    {action && <button type="button" className="dashboard-quick-action" onClick={event => { event.stopPropagation(); onAction?.(); }}><Plus size={15} />{action}</button>}
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
  const todaySessions = (pomodoro?.sessions || []).filter(session => String(session.endedAt || "").startsWith(todayId) && session.status === "completed");
  const focusMinutes = Math.round(todaySessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
  const waterPercent = Math.min(100, Math.round(((water?.today?.totalMl || 0) / Math.max(1, water?.today?.targetMl || 1)) * 100));
  const nextCourse = todayCourses.find(course => course.endTime >= today.toTimeString().slice(0, 5)) || todayCourses[0];
  const nextExam = futureExams[0];
  const greeting = today.getHours() < 11 ? "早上好" : today.getHours() < 18 ? "下午好" : "晚上好";
  const addWater = async () => { const next = await window.waterApi?.addDrink?.({ source: "home" }); if (next) setWater(next); };

  return <main className="home-page dashboard-page">
    <header className="dashboard-header"><div><span className="dashboard-kicker"><Sparkles size={15} />TODAY AT A GLANCE</span><h1>{greeting}，今天也稳稳向前</h1><p>{today.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p></div><button className="home-settings-button" type="button" onClick={() => navigate("/settings")} aria-label="打开设置"><Settings2 size={20} /><span>设置</span></button></header>

    <section className="dashboard-spotlight"><div className="spotlight-copy"><span>下一件重要的事</span><h2>{nextCourse ? `${nextCourse.startTime} · ${nextCourse.name}` : nextExam ? `${nextExam.name}考试` : pendingTodos[0]?.title || "今天没有紧迫安排"}</h2><p>{nextCourse?.location || (nextExam ? `${nextExam.date} ${nextExam.time || "时间待定"}` : pendingTodos[0]?.dueDate ? `截止于${new Date(pendingTodos[0].dueDate).toLocaleString("zh-CN")}` : "给自己留一点从容，也可以开始一段专注。")}</p></div><button onClick={() => navigate(nextCourse ? "/schedule" : nextExam ? "/exams" : "/pomodoro")}><Timer size={18} />{nextCourse ? "查看课表" : nextExam ? "查看考试" : "开始专注"}</button></section>

    <section className="dashboard-grid">
      <DashboardCard className="water-card" icon={CupSoda} eyebrow="饮水" title={`${water?.today?.totalMl || 0}ml`} detail={`目标${water?.today?.targetMl || 0}ml · 已完成${waterPercent}%`} action="记录一杯" onAction={addWater} onOpen={() => navigate("/drinking")}><div className="dashboard-water-progress"><span style={{ width: `${waterPercent}%` }} /></div></DashboardCard>
      <DashboardCard className="todo-card" icon={CheckSquare} eyebrow="待办" title={`${pendingTodos.length}项未完成`} action="新建任务" onAction={() => navigate(`/todo?create=${Date.now()}`)} onOpen={() => navigate("/todo")}><div className="dashboard-mini-list">{pendingTodos.slice(0, 3).map(task => <span key={task.id}><i className={`priority-${task.priority}`} />{task.title}<em>{task.priority}</em></span>)}{!pendingTodos.length && <span className="dashboard-empty"><Check size={15} />今日任务已清空</span>}</div></DashboardCard>
      <DashboardCard className="focus-card" icon={Timer} eyebrow="专注" title={pomodoro?.active ? pomodoro.active.title : `${focusMinutes}分钟`} detail={pomodoro?.active ? "当前正在专注" : `今日完成${todaySessions.length}次专注`} action={pomodoro?.active ? "继续专注" : "选择任务"} onAction={() => navigate("/pomodoro")} onOpen={() => navigate("/pomodoro")}><div className={`dashboard-focus-pulse ${pomodoro?.active ? "active" : ""}`}><Clock3 size={16} /><span>{pomodoro?.active ? "计时进行中" : "保持自己的节奏"}</span></div></DashboardCard>
      <DashboardCard className="finance-card-home" icon={WalletCards} eyebrow="今日收支" title={`¥${todayExpense.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`} detail={`今日${todayEntries.length}笔记录`} action="快速记账" onAction={() => navigate("/finance?quick=amount")} onOpen={() => navigate("/finance")}><div className="dashboard-finance-note"><Coins size={15} />支出记录得越及时，月底越从容</div></DashboardCard>
      <DashboardCard className="schedule-card" icon={CalendarClock} eyebrow="今日课表" title={todayCourses.length ? `${todayCourses.length}节课程` : "今天没课"} action="查看课表" onAction={() => navigate("/schedule")} onOpen={() => navigate("/schedule")}><div className="dashboard-mini-list">{todayCourses.slice(0, 3).map(course => <span key={course.id}><b>{course.startTime}</b>{course.name}<em>{course.location || ""}</em></span>)}{!todayCourses.length && <span className="dashboard-empty">可以安排一段完整的学习时间</span>}</div></DashboardCard>
      <DashboardCard className="exam-card" icon={CalendarSearch} eyebrow="考试" title={nextExam ? nextExam.name : "暂无考试"} detail={nextExam ? `${nextExam.date} · ${nextExam.time || "时间待定"}` : "导入考试表后会自动创建P0待办"} action="考试信息" onAction={() => navigate("/exams")} onOpen={() => navigate("/exams")}>{nextExam && <div className="dashboard-exam-countdown"><Droplets size={15} />还有{Math.max(0, Math.ceil((new Date(`${nextExam.date}T23:59:00`) - today) / 86400000))}天</div>}</DashboardCard>
    </section>
  </main>;
}
