import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Bell, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileUp, MapPin, X } from "lucide-react";
import DatePicker from "../components/DatePicker";

import { localDateKey as key, startOfLocalWeek as monday, academicWeek, calendarMonthStart, calendarMonthDays } from "../../electron/domain-time.mjs";
import useNow from "../hooks/useNow";
import { useConfirmation } from "../components/Confirmation";

const weekday = [[1,"一"],[2,"二"],[3,"三"],[4,"四"],[5,"五"],[6,"六"],[0,"日"]];
function showAcademicToast(notice) { window.dispatchEvent(new CustomEvent("academic:toast",{detail:notice})); }
function AcademicToastHost() { const [notice,setNotice]=useState(null); useEffect(()=>{const show=event=>setNotice(event.detail);window.addEventListener("academic:toast",show);return()=>window.removeEventListener("academic:toast",show)},[]); useEffect(()=>{if(!notice)return undefined;const timer=window.setTimeout(()=>setNotice(null),4200);return()=>window.clearTimeout(timer)},[notice]); if(!notice)return null; const Icon=notice.type==="error"?AlertCircle:CheckCircle2; return <div className={`academic-toast ${notice.type||"success"}`} role={notice.type==="error"?"alert":"status"}><Icon size={19}/><div><strong>{notice.title}</strong><span>{notice.message}</span></div><button onClick={()=>setNotice(null)} aria-label="关闭提示"><X size={16}/></button></div>; }
function Shell({ title, children }) { const nav=useNavigate(); return <main className="academic-page"><header><button className="icon-button" onClick={()=>nav("/")} aria-label="返回主页"><ArrowLeft size={20}/></button><div><p>本地校园助手</p><h1>{title}</h1></div></header><AcademicToastHost/>{children}</main>; }
function Reminder({ settings, onSave }) { return <label className="academic-reminder"><Bell size={17}/><input type="checkbox" checked={settings.enabled} onChange={e=>onSave({...settings,enabled:e.target.checked})}/><span>开启提醒</span><input type="number" min="0" value={settings.reminderMinutes} disabled={!settings.enabled} onChange={e=>onSave({...settings,reminderMinutes:e.target.value})}/><span>分钟前</span></label>; }
function WeekPicker({ open, selectedWeek, maxWeek, onClose, onConfirm }) { const [draft,setDraft]=useState(selectedWeek); const activeRef=useRef(null); useEffect(()=>{setDraft(selectedWeek); if(open) requestAnimationFrame(()=>activeRef.current?.scrollIntoView({ block:"center" }));},[selectedWeek,open]); if(!open)return null; return <section className="week-picker"><header><button onClick={onClose}>取消</button><strong>选择周次</strong><button onClick={()=>onConfirm(draft)}>确定</button></header><div className="week-picker-list">{Array.from({length:maxWeek},(_,index)=>index+1).map(item=><button ref={item===draft?activeRef:null} key={item} className={item===draft?"active":""} onClick={()=>setDraft(item)}>第{item}周</button>)}</div></section>; }
export function ScheduleApp() {
  const [data,setData]=useState(null); const [day,setDay]=useState(new Date().getDay()); const [start,setStart]=useState(""); const [viewWeek,setViewWeek]=useState(null); const [pickerOpen,setPickerOpen]=useState(false); const [jumpDate,setJumpDate]=useState(key(new Date()));
  useEffect(()=>{window.academicApi.getSchedule().then(d=>{setData(d);setStart(d.startDate||"")});return window.academicApi.onScheduleChanged(setData)},[]);
  const today=useNow(); const currentWeek=academicWeek(data?.startDate,today); const maxWeek=useMemo(()=>Math.max(1,...(data?.courses||[]).map(c=>c.endWeek)),[data?.courses]); const week=viewWeek??currentWeek??1; const weekStart=useMemo(()=>{if(!data?.startDate)return null;const d=monday(new Date(`${data.startDate}T12:00:00`));d.setDate(d.getDate()+(week-1)*7);return d},[data?.startDate,week]);
  const courses=useMemo(()=>!data||!week?[]:data.courses.filter(c=>c.weekday===day&&week>=c.startWeek&&week<=c.endWeek&&(c.pattern==="每周"||(c.pattern==="单周"?week%2:week%2===0))).sort((a,b)=>a.period-b.period),[data,day,week]);
  async function importFile(){try{const r=await window.academicApi.importSchedule(start);if(r.status==="imported")showAcademicToast({title:"课表导入完成",message:`已识别并保存${r.count}节课程。`})}catch(e){showAcademicToast({type:"error",title:"课表导入失败",message:e.message||"请检查文件格式后重试。"})}}
  function jumpToDate(value){setJumpDate(value);if(!data?.startDate||!value)return;const target=new Date(`${value}T12:00:00`);const targetWeek=academicWeek(data.startDate,target);setViewWeek(targetWeek);setDay(target.getDay());}
  if(!data)return null; return <Shell title="日常课表"><section className="academic-toolbar"><div><label>开学日期 <DatePicker value={start} onChange={setStart} ariaLabel="开学日期"/></label><button className="primary-button" disabled={!start} onClick={importFile}><FileUp size={17}/>导入课表</button><label className="jump-date"><CalendarDays size={16}/>查看日期 <DatePicker value={jumpDate} onChange={jumpToDate} ariaLabel="查看日期"/></label></div><Reminder settings={data.settings} onSave={s=>window.academicApi.saveScheduleSettings(s)}/></section><div className="week-title"><div className="week-switch"><button className="week-prev" onClick={()=>setViewWeek(week-1)} disabled={week<=1} aria-label="上一教学周"><ChevronLeft size={19}/></button><button className="week-select" onClick={()=>setPickerOpen(value=>!value)}>第 {week} 教学周 <ChevronDown size={18}/></button><button className="week-next" onClick={()=>setViewWeek(week+1)} disabled={week>=maxWeek} aria-label="下一教学周"><ChevronRight size={19}/></button>{viewWeek!==null&&<button className="week-today" onClick={()=>setViewWeek(null)}>回到当前周</button>}<WeekPicker open={pickerOpen} selectedWeek={week} maxWeek={maxWeek} onClose={()=>setPickerOpen(false)} onConfirm={next=>{setViewWeek(next);setPickerOpen(false)}}/></div></div><nav className="weekday-tabs">{weekday.map(([value,name])=>{const date=weekStart?new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+((value+6)%7)):null;return <button key={name} className={day===value?"active":""} onClick={()=>setDay(value)}><span>周{name}</span>{date&&<small>{date.getMonth()+1}.{date.getDate()}</small>}</button>})}</nav><section className="course-list">{courses.length?courses.map(c=><article className="course-card" key={c.id}><time><b>{c.startTime}</b><span>至 {c.endTime}</span></time><div><strong>{c.name}</strong>{c.location&&<em><MapPin size={17}/>{c.location}</em>}</div></article>):<div className="academic-empty">当天没有课程</div>}</section></Shell>;
}
export function ExamsApp() {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(() => calendarMonthStart());
  const [selected, setSelected] = useState(key());
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const confirm = useConfirmation();
  useEffect(() => {
    let active = true, revision = 0;
    const off = window.academicApi.onExamsChanged(value => { revision++; if (active) { setData(value); setError(""); } });
    const initial = revision;
    window.academicApi.getExams().then(value => { if (active && revision === initial) { setData(value); setError(""); } }).catch(e => { if (active && revision === initial) setError(e.message); });
    return () => { active = false; off?.(); };
  }, [attempt]);
  const exams = data?.exams || [];
  const selectedExams = exams.filter(exam => exam.date === selected);
  const cells = useMemo(() => calendarMonthDays(month), [month]);
  function imported(result) {
    setData(result.data);
    if (result.focusDate) { setMonth(calendarMonthStart(result.focusDate)); setSelected(result.focusDate); }
    setPreview(null);
    showAcademicToast({ title: "考试信息已保存", message: `新增${result.added || 0}场，更新${result.updated || 0}场；关联待办已同步。` });
  }
  async function run(action) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e.message || "操作失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function cancelPreview() {
    await run(async () => { await window.academicApi.cancelExamImport(preview.token); setPreview(null); });
  }
  return <Shell title="考试信息">
    {error && <div className="academic-error" role="alert">{error}{!data && <button onClick={() => setAttempt(n => n + 1)}>重新加载</button>}</div>}
    {!data ? <p role="status">{error ? "考试信息尚未加载" : "正在读取考试信息…"}</p> : <>
    <section className="academic-toolbar"><button className="primary-button" disabled={busy || !!preview} onClick={() => run(async () => {
      const result = await window.academicApi.importExams();
      if (result.status === "preview") { setPreview(result); setDecisions({}); }
      else if (result.status === "imported") imported(result);
    })}><FileUp size={17}/>导入考试表</button><Reminder settings={data.settings} onSave={settings => run(() => window.academicApi.saveExamSettings(settings))}/></section>
    {preview && <section className="exam-import-review" aria-label="考试导入预览">
      <header><h2>核对考试变更</h2><p>共{preview.count}场。疑似改期需选择替换旧场次或保留两场；确认后同步考试与待办。</p></header>
      {preview.rows.map(row => <article key={row.key}>
        <strong>{({ new: "新增", update: "更新", unchanged: "未变化", conflict: "疑似改期" })[row.kind]} · {row.incoming.name}</strong>
        {row.current && <p>原安排：{row.current.date} {row.current.time} · {row.current.location || "地点待定"} · {row.current.duration} · {row.current.stage} {row.current.method}</p>}
        <p>导入安排：{row.incoming.date} {row.incoming.time} · {row.incoming.location || "地点待定"} · {row.incoming.duration} · {row.incoming.stage} {row.incoming.method}</p>
        {row.kind === "conflict" && <label>处理方式<select aria-label={`${row.incoming.name}处理方式`} value={decisions[row.key]?.action === "keep" ? "keep" : decisions[row.key]?.targetId || ""} onChange={event => setDecisions(old => ({ ...old, [row.key]: event.target.value === "keep" ? { action: "keep" } : { action: "replace", targetId: event.target.value } }))}>
          <option value="">请选择</option><option value="keep">保留两场（新增本场）</option>{row.candidates.map(exam => <option key={exam.id} value={exam.id}>替换：{exam.date} {exam.time} · {exam.location || "地点待定"}</option>)}
        </select></label>}
      </article>)}
      <footer><button disabled={busy} onClick={cancelPreview}>取消导入</button><button className="primary-button" disabled={busy || preview.rows.some(row => row.kind === "conflict" && !decisions[row.key]?.action)} onClick={() => run(async () => imported(await window.academicApi.confirmExamImport(preview.token, decisions)))}>确认导入</button></footer>
    </section>}
    <section className="exam-layout"><div className="exam-calendar"><div className="calendar-head"><button aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft/></button><strong>{month.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</strong><button aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight/></button></div><div className="calendar-grid">{["一", "二", "三", "四", "五", "六", "日"].map(day => <b key={day}>{day}</b>)}{cells.map(date => {
      const id = key(date), count = exams.filter(exam => exam.date === id).length;
      return <button key={id} aria-label={id} onClick={() => setSelected(id)} className={`${date.getMonth() === month.getMonth() ? "" : "muted"} ${selected === id ? "selected" : ""} ${count ? "has-exam" : ""}`}>{date.getDate()}{count > 0 && <i>{count}</i>}</button>;
    })}</div></div><aside className="exam-detail"><p>{new Date(`${selected}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</p>{selectedExams.length ? selectedExams.map(exam => <article key={exam.id}><strong>{exam.name}</strong><span className="exam-time">{exam.time || "时间待定"}</span><em><MapPin size={18}/>{exam.location || "地点待定"}</em><small>{exam.duration}{exam.stage && ` · ${exam.stage}`}</small><div className="exam-actions"><button disabled={busy} onClick={() => setEditing({ ...exam })}>修改</button><button disabled={busy} onClick={() => run(async () => {
      if (!await confirm({ title: `删除${exam.name}？`, message: "将移除本场考试和未完成的关联待办；已完成待办保留为历史记录。", confirmLabel: "删除" })) return;
      const result = await window.academicApi.deleteExam(exam.id); setData(result.data);
    })}>删除</button></div></article>) : <div className="academic-empty">当天没有考试</div>}</aside></section>
    {editing && <div className="confirmation-overlay"><form className="exam-editor" role="dialog" aria-modal="true" aria-label="修改考试" onSubmit={event => { event.preventDefault(); run(async () => { imported(await window.academicApi.updateExam(editing.id, editing)); setEditing(null); }); }}><h2>修改考试</h2>
      {[["name", "科目"], ["date", "日期"], ["time", "时间（如09:00—11:00）"], ["duration", "时长"], ["location", "地点"], ["stage", "考试阶段"], ["method", "考试方式"]].map(([field, label]) => <label key={field}>{label}<input required={field === "name" || field === "date"} type={field === "date" ? "date" : "text"} value={editing[field] || ""} onChange={event => setEditing(old => ({ ...old, [field]: event.target.value }))}/></label>)}
      {error && <p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>取消</button><button className="primary-button" disabled={busy}>保存修改</button></footer>
    </form></div>}
    </>}
  </Shell>;
}
