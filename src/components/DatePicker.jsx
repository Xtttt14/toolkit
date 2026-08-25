import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const pad = value => String(value).padStart(2, "0");
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateFromKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T12:00:00`) : new Date();
const monthNames = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

export default function DatePicker({ value, onChange, min, max, ariaLabel, className = "", disabled = false, allowEmpty = false }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("date");
  const [draft, setDraft] = useState(value || dateKey(new Date()));
  const [panelPosition, setPanelPosition] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const selected = dateFromKey(draft);
  const today = dateKey(new Date());
  const minKey = min || "0000-01-01";
  const maxKey = max || "9999-12-31";

  useEffect(() => { if (!open) setDraft(value || dateKey(new Date())); }, [value, open]);
  useEffect(() => {
    const close = event => { if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) { setOpen(false); setView("date"); } };
    const keydown = event => { if (event.key === "Escape") { setOpen(false); setView("date"); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", keydown); };
  }, []);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const trigger = rootRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gutter = 12;
      const width = Math.min(panel.offsetWidth, window.innerWidth - gutter * 2);
      const height = Math.min(panel.offsetHeight, window.innerHeight - gutter * 2);
      const spaceBelow = window.innerHeight - trigger.bottom - 7;
      const spaceAbove = trigger.top - 7;
      const placeAbove = spaceBelow < height && spaceAbove > spaceBelow;
      setPanelPosition({
        left: Math.min(Math.max(gutter, trigger.left), window.innerWidth - width - gutter),
        top: Math.max(gutter, placeAbove ? trigger.top - height - 7 : trigger.bottom + 7),
        maxHeight: window.innerHeight - gutter * 2
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("resize", updatePosition); document.removeEventListener("scroll", updatePosition, true); };
  }, [open, view]);

  const years = useMemo(() => {
    const fallback = selected.getFullYear();
    const first = Math.max(1900, Number(minKey.slice(0, 4)) || fallback - 50);
    const last = Math.min(2100, Number(maxKey.slice(0, 4)) || fallback + 50);
    return Array.from({ length: Math.max(1, last - first + 1) }, (_, index) => last - index);
  }, [minKey, maxKey, selected]);
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const start = new Date(first); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  const setMonth = (year, month) => {
    const next = dateKey(new Date(year, month, Math.min(selected.getDate(), new Date(year, month + 1, 0).getDate())));
    setDraft(next < minKey ? minKey : next > maxKey ? maxKey : next);
  };
  const changeMonth = delta => setMonth(selected.getFullYear(), selected.getMonth() + delta);
  const pickDay = day => {
    const next = dateKey(day);
    if (next < minKey || next > maxKey) return;
    setDraft(next);
    onChange(next);
    setOpen(false);
    setView("date");
  };
  const confirm = () => { onChange(draft); setOpen(false); setView("date"); };

  return <div className={`date-picker ${className}`} ref={rootRef}>
    <button type="button" className="date-picker-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)}><span>{value ? value.replaceAll("-", ".") : "请选择日期"}</span><CalendarDays size={16} /></button>
    {open && createPortal(<section ref={panelRef} className="date-picker-panel" role="dialog" aria-label={ariaLabel} style={panelPosition || { visibility:"hidden" }} onPointerDown={event => event.stopPropagation()}>
      <header><button type="button" onClick={() => view === "month" ? setView("date") : (setOpen(false), setView("date"))}>取消</button><strong>{view === "date" ? "选择日期" : "选择年/月"}</strong><button type="button" onClick={confirm}>确定</button></header>
      {view === "date" ? <>
        <div className="date-picker-nav"><button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button><button type="button" className="date-picker-month-button" onClick={() => setView("month")}>{selected.getFullYear()}年{selected.getMonth() + 1}月</button><button type="button" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button></div>
        <div className="date-picker-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="date-picker-days">{days.map(day => { const next = dateKey(day); const muted = day.getMonth() !== selected.getMonth(); const unavailable = next < minKey || next > maxKey; return <button type="button" key={next} disabled={unavailable} aria-current={next === today ? "date" : undefined} className={`${muted ? "muted" : ""} ${next === draft ? "selected" : ""} ${next === today ? "today" : ""}`} onClick={() => pickDay(day)}>{day.getDate()}</button>; })}</div>
      </> : <div className="date-picker-year-month"><YearWheel values={years} selected={selected.getFullYear()} onChange={year => setMonth(year, selected.getMonth())}/><div className="date-picker-month-grid">{Array.from({ length: 12 }, (_, index) => index).map(month => <button type="button" key={month} className={month === selected.getMonth() ? "active" : ""} onClick={() => { setMonth(selected.getFullYear(), month); setView("date"); }}>{monthNames[month]}</button>)}</div></div>}
      {allowEmpty && value && <button type="button" className="date-picker-clear" onClick={() => { onChange(""); setOpen(false); setView("date"); }}>清除日期</button>}
    </section>, document.body)}
  </div>;
}

function YearWheel({ values, selected, onChange }) {
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "center" }); }, [selected]);
  return <div className="date-picker-year-wheel">{values.map(year => <button type="button" ref={year === selected ? activeRef : null} key={year} className={year === selected ? "active" : ""} onClick={() => onChange(year)}>{year}年</button>)}</div>;
}
