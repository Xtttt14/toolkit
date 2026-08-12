import React, { useEffect, useMemo, useState } from "react";
import {
  Baby, Banknote, BookOpen, BriefcaseBusiness, Bus, CalendarDays, ChevronLeft,
  ChevronRight, CircleDollarSign, Coffee, Download, Dumbbell, Fuel, Gamepad2,
  Gift, HeartPulse, House, LayoutGrid, MonitorSmartphone, MoreHorizontal, PawPrint,
  GripVertical, Pencil, Phone, Plane, Plus, Save, Settings2, Shirt, ShoppingBag, Sparkles, Tag, Trash2,
  TrendingUp, Upload, Users, Utensils, Wallet, Wine, X, Zap
} from "lucide-react";
import MenuSelect from "../../components/MenuSelect";

const expenseTags = [
  ["三餐", Utensils], ["零食", Coffee], ["衣服", Shirt], ["交通", Bus], ["旅行", Plane],
  ["孩子", Baby], ["宠物", PawPrint], ["话费网费", Phone], ["烟酒", Wine], ["学习", BookOpen],
  ["日用品", ShoppingBag], ["住房", House], ["美妆", Sparkles], ["医疗", HeartPulse],
  ["发红包", Gift], ["汽车/加油", Fuel], ["娱乐", Gamepad2], ["请客送礼", Users],
  ["电器数码", MonitorSmartphone], ["运动", Dumbbell], ["其他", LayoutGrid], ["水电煤", Zap]
];

const incomeTags = [
  ["工资", BriefcaseBusiness], ["生活费", Wallet], ["红包", Gift], ["外快", Banknote],
  ["股票", TrendingUp], ["其他", MoreHorizontal]
];

const iconByTag = new Map([...expenseTags, ...incomeTags]);
const money = value => Number(value || 0).toLocaleString("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const dateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const parseDate = key => new Date(`${key}T12:00:00`);
const shiftDate = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const startOfWeek = date => {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(12, 0, 0, 0);
  return result;
};
const sumEntries = entries => entries.reduce((acc, entry) => {
  acc[entry.type] += Number(entry.amount);
  return acc;
}, { income: 0, expense: 0 });
const tagsFor = (data, type) => {
  const defaults = type === "income" ? incomeTags : expenseTags;
  const byName = new Map([...defaults, ...(data.customTags[type] || []).map(item => [item, Tag])]);
  const settings = data.tagSettings?.[type] || {};
  const hidden = new Set(settings.hidden || []);
  const available = [...byName.keys()].filter(name => !hidden.has(name));
  const order = (settings.order || []).filter(name => available.includes(name));
  return [...order, ...available.filter(name => !order.includes(name))].map(name => [name, byName.get(name)]);
};
const datesBetween = (start, end) => {
  const result = [];
  let current = parseDate(start);
  const last = parseDate(end);
  while (current <= last && result.length < 366) {
    result.push(dateKey(current));
    current = shiftDate(current, 1);
  }
  return result;
};

function EmptyState({ text }) {
  return (
    <div className="finance-empty">
      <CircleDollarSign size={28} strokeWidth={1.5} />
      <span>{text}</span>
    </div>
  );
}

function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="finance-pager">
      <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} aria-label="上一页">
        <ChevronLeft size={16} />
      </button>
      <span>{page + 1}/{pages}</span>
      <button onClick={() => onChange(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1} aria-label="下一页">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function EntryList({ entries, onEdit, onDelete, pageSize = 4 }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  useEffect(() => setPage(current => Math.min(current, pages - 1)), [pages]);
  const visible = entries.slice(page * pageSize, page * pageSize + pageSize);

  if (!entries.length) return <EmptyState text="这一天还没有账目" />;

  return (
    <div className="finance-entry-area">
      <div className="finance-entry-list">
        {visible.map(entry => {
          const Icon = iconByTag.get(entry.tag) || Tag;
          return (
            <article className="finance-entry" key={entry.id}>
              <span className={`entry-icon ${entry.type}`}><Icon size={18} /></span>
              <div className="entry-copy">
                <strong>{entry.tag}</strong>
                <span>{entry.note || (entry.type === "income" ? "收入" : "支出")}</span>
              </div>
              <strong className={`entry-amount ${entry.type}`}>
                {entry.type === "income" ? "+" : "−"}¥{money(entry.amount)}
              </strong>
              <div className="entry-actions">
                {onEdit && <button onClick={() => onEdit(entry)} aria-label={`编辑${entry.tag}`}><Pencil size={15} /></button>}
                <button onClick={() => onDelete(entry.id)} aria-label={`删除${entry.tag}`}><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>
      <Pager page={page} pages={pages} onChange={setPage} />
    </div>
  );
}

function TagManager({ data, type, onClose }) {
  const [dragging, setDragging] = useState(null);
  const tags = tagsFor(data, type).map(([item]) => item);

  const moveTag = async target => {
    if (!dragging || dragging === target) return;
    const ordered = [...tags];
    const from = ordered.indexOf(dragging);
    const to = ordered.indexOf(target);
    ordered.splice(from, 1);
    ordered.splice(to, 0, dragging);
    await window.financeApi.reorderTags(type, ordered);
    setDragging(null);
  };

  return (
    <div className="finance-modal-backdrop" onMouseDown={onClose}>
      <section className="finance-modal" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div><span>分类设置</span><h2>{type === "income" ? "收入" : "支出"}标签</h2></div>
          <button onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <div className="custom-tag-list">
          {tags.length ? tags.map(item => (
            <div
              key={item}
              className={dragging === item ? "dragging" : ""}
              draggable
              onDragStart={() => setDragging(item)}
              onDragOver={event => event.preventDefault()}
              onDrop={() => moveTag(item)}
              onDragEnd={() => setDragging(null)}
            >
              <span><GripVertical className="tag-drag-handle" size={17} /><Tag size={16} />{item}</span>
              <div className="visible">
                <button onClick={() => window.financeApi.deleteTag(type, item)} aria-label={`删除${item}`}><Trash2 size={15} /></button>
              </div>
            </div>
          )) : <EmptyState text="暂无标签" />}
        </div>
      </section>
    </div>
  );
}

function CustomTagModal({ type, onClose }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const submit = async event => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    await window.financeApi.addTag(type, clean);
    setName("");
    setMessage("标签已添加");
  };
  return <div className="finance-modal-backdrop" onMouseDown={onClose}>
    <section className="finance-modal custom-tag-modal" onMouseDown={event => event.stopPropagation()}>
      <header><div><span>自定义标签</span><h2>添加{type === "income" ? "收入" : "支出"}标签</h2></div><button onClick={onClose} aria-label="关闭"><X size={20} /></button></header>
      <form onSubmit={submit} className="tag-form">
        <input autoFocus value={name} maxLength={12} onChange={event => setName(event.target.value)} placeholder="输入标签名称" />
        <button type="submit">新增标签</button>
      </form>
      <span className="custom-tag-note">新标签会自动出现在当前标签列表末尾。</span>
      <span className="save-message">{message}</span>
    </section>
  </div>;
}

function BatchEntryModal({ data, initialDate, onClose }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [tag, setTag] = useState(expenseTags[0][0]);
  const [note, setNote] = useState("");
  const [start, setStart] = useState(initialDate);
  const [end, setEnd] = useState(initialDate);
  const [message, setMessage] = useState("");
  const tags = tagsFor(data, type).map(([name]) => name);
  const changeType = nextType => { setType(nextType); setTag(tagsFor(data, nextType)[0]?.[0] || ""); };
  const submit = async event => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return setMessage("请输入大于0的金额");
    if (start > end) return setMessage("结束日期不能早于开始日期");
    const dates = datesBetween(start, end);
    await window.financeApi.batchAdd(dates.map(date => ({ type, amount: numericAmount, tag, note: note.trim(), date })));
    onClose();
  };
  return <div className="finance-modal-backdrop" onMouseDown={onClose}>
    <section className="finance-modal batch-entry-modal" onMouseDown={event => event.stopPropagation()}>
      <header><div><span>连续日期记账</span><h2>批量添加账单</h2></div><button onClick={onClose} aria-label="关闭"><X size={20} /></button></header>
      <form className="calendar-edit-form" onSubmit={submit}>
        <div className="type-switch"><button type="button" className={type === "expense" ? "active expense" : ""} onClick={() => changeType("expense")}>支出</button><button type="button" className={type === "income" ? "active income" : ""} onClick={() => changeType("income")}>收入</button></div>
        <div className="calendar-edit-row"><label><span>金额</span><input className="finance-amount-input" autoFocus value={amount} inputMode="decimal" onChange={event => setAmount(event.target.value)} /></label><label><span>标签</span><MenuSelect value={tag} ariaLabel="批量账单标签" onChange={setTag} options={tags.map(item => ({ value:item, label:item }))} /></label></div>
        <div className="calendar-edit-row"><label><span>开始日期</span><input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label><span>结束日期</span><input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div>
        <label><span>备注</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder="可选备注" /></label>
        <div className="batch-hint">将添加{start <= end ? datesBetween(start, end).length : 0}笔账目（最多366天）</div>
        <div className="calendar-edit-actions"><span className="save-message">{message}</span><button type="button" onClick={onClose}>取消</button><button type="submit"><Save size={16} />批量保存</button></div>
      </form>
    </section>
  </div>;
}

function TodayPage({ data }) {
  const today = dateKey();
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [tag, setTag] = useState(expenseTags[0][0]);
  const [note, setNote] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [editingId, setEditingId] = useState(null);
  const [manageTags, setManageTags] = useState(null);
  const [customTags, setCustomTags] = useState(null);
  const [batchAdding, setBatchAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [tagPage, setTagPage] = useState(0);

  const tags = useMemo(() => {
    return tagsFor(data, type);
  }, [data, type]);
  const selectedEntries = useMemo(
    () => data.entries.filter(entry => entry.date === selectedDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.entries, selectedDate]
  );
  const selectedTotals = sumEntries(selectedEntries);
  const tagPageSize = 23;
  const tagPages = Math.max(1, Math.ceil(tags.length / tagPageSize));
  const visibleTags = tags.slice(tagPage * tagPageSize, tagPage * tagPageSize + tagPageSize);

  useEffect(() => {
    if (!tags.some(([name]) => name === tag)) setTag(tags[0]?.[0] || "");
  }, [tags, tag]);
  useEffect(() => setTagPage(current => Math.min(current, tagPages - 1)), [tagPages]);

  const reset = nextType => {
    const chosenType = nextType || type;
    setAmount("");
    setNote("");
    setEditingId(null);
    setTag((chosenType === "income" ? incomeTags : expenseTags)[0][0]);
  };

  const chooseType = nextType => {
    setType(nextType);
    setTagPage(0);
    reset(nextType);
  };

  const saveEntry = async event => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setMessage("请输入大于0的金额");
      return;
    }
    const payload = { type, amount: numericAmount, tag, note: note.trim(), date: selectedDate };
    if (editingId) await window.financeApi.update(editingId, payload);
    else await window.financeApi.add(payload);
    setMessage(editingId ? "账目已更新" : "账目已保存");
    reset();
    window.setTimeout(() => setMessage(""), 1800);
  };

  const editEntry = entry => {
    setType(entry.type);
    setAmount(String(entry.amount));
    setTag(entry.tag);
    setNote(entry.note || "");
    setEditingId(entry.id);
  };

  return (
    <div className="finance-page today-page">
      <section className="finance-card entry-composer">
        <div className="composer-heading">
          <div><span>快速记录</span><h2>{editingId ? "编辑账目" : "记一笔"}</h2></div>
          <div className="type-switch">
            <button className={type === "expense" ? "active expense" : ""} onClick={() => chooseType("expense")}>支出</button>
            <button className={type === "income" ? "active income" : ""} onClick={() => chooseType("income")}>收入</button>
          </div>
        </div>
        <form onSubmit={saveEntry} className="entry-form">
          <label className="amount-field">
            <span>金额</span>
            <div><b>¥</b><input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></div>
          </label>
          <div className="tag-field">
            <div className="tag-field-label"><span>选择标签</span><button type="button" onClick={() => setManageTags(type)}><Settings2 size={15} />管理</button></div>
            <div className="tag-grid">
              {visibleTags.map(([name, Icon]) => (
                <button type="button" key={name} className={tag === name ? "selected" : ""} onClick={() => setTag(name)}>
                  <Icon size={18} /><span>{name}</span>
                </button>
              ))}
              <button type="button" className="manage-tag" onClick={() => setCustomTags(type)}>
                <Plus size={18} /><span>自定义</span>
              </button>
            </div>
            <Pager page={tagPage} pages={tagPages} onChange={setTagPage} />
          </div>
          <div className="entry-meta">
            <div className="entry-utility">{!editingId && <button type="button" className="batch-add-trigger" onClick={() => setBatchAdding(true)}><Plus size={16} />批量添加</button>}</div>
            <label><span>备注</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder="可选备注" /></label>
          </div>
          <div className="composer-actions">
            <span className="save-message">{message}</span>
            {editingId && <button type="button" className="cancel-edit" onClick={() => reset()}>取消</button>}
            <button type="submit" className="save-entry"><Save size={17} />{editingId ? "保存修改" : "保存账目"}</button>
          </div>
        </form>
      </section>

      <section className="finance-card today-ledger">
        <header className="ledger-heading">
          <div><span>{selectedDate === today ? "今天" : "查看日期"}</span><h2>{selectedDate === today ? "今日账目" : "当天账目"}</h2></div>
          <div className="ledger-date-area">
            <label><span>账单日期</span><input type="date" value={selectedDate} onChange={event => { setSelectedDate(event.target.value); reset(); }} /></label>
            <div className="today-balance">
              <span>收入<b>¥{money(selectedTotals.income)}</b></span>
              <span>支出<b>¥{money(selectedTotals.expense)}</b></span>
            </div>
          </div>
        </header>
        <EntryList entries={selectedEntries} onEdit={editEntry} onDelete={window.financeApi.delete} />
        <div className="backup-actions">
          <button onClick={window.financeApi.importJson}><Upload size={16} />恢复JSON</button>
          <button onClick={window.financeApi.exportJson}><Download size={16} />导出JSON</button>
        </div>
      </section>
      {manageTags && <TagManager data={data} type={manageTags} onClose={() => setManageTags(null)} />}
      {customTags && <CustomTagModal type={customTags} onClose={() => setCustomTags(null)} />}
      {batchAdding && <BatchEntryModal data={data} initialDate={selectedDate} onClose={() => setBatchAdding(false)} />}
    </div>
  );
}

function EntryEditModal({ entry, data, onClose }) {
  const [type, setType] = useState(entry.type);
  const [amount, setAmount] = useState(String(entry.amount));
  const [tag, setTag] = useState(entry.tag);
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note || "");
  const tags = tagsFor(data, type).map(([name]) => name);

  const changeType = nextType => {
    setType(nextType);
    setTag((nextType === "income" ? incomeTags : expenseTags)[0][0]);
  };

  const submit = async event => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;
    await window.financeApi.update(entry.id, {
      type, amount: numericAmount, tag, date, note: note.trim()
    });
    onClose();
  };

  return (
    <div className="finance-modal-backdrop" onMouseDown={onClose}>
      <section className="finance-modal entry-edit-modal" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div><span>{entry.date}</span><h2>编辑账目</h2></div>
          <button onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <form className="calendar-edit-form" onSubmit={submit}>
          <div className="type-switch">
            <button type="button" className={type === "expense" ? "active expense" : ""} onClick={() => changeType("expense")}>支出</button>
            <button type="button" className={type === "income" ? "active income" : ""} onClick={() => changeType("income")}>收入</button>
          </div>
          <label><span>金额</span><input className="finance-amount-input" autoFocus value={amount} inputMode="decimal" onChange={event => setAmount(event.target.value)} /></label>
          <div className="calendar-edit-row">
            <label><span>日期</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label><span>标签</span><MenuSelect value={tag} ariaLabel="账目标签" onChange={setTag} options={tags.map(item => ({ value:item, label:item }))} /></label>
          </div>
          <label><span>备注</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder="可选备注" /></label>
          <div className="calendar-edit-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit"><Save size={16} />保存修改</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CalendarPage({ data }) {
  const today = dateKey();
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(null);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const leading = (first.getDay() || 7) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    const key = dateKey(new Date(year, month, day));
    const entries = data.entries.filter(entry => entry.date === key);
    return { day, key, totals: sumEntries(entries) };
  });
  const monthEntries = data.entries.filter(entry => {
    const date = parseDate(entry.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const totals = sumEntries(monthEntries);
  const selectedEntries = data.entries
    .filter(entry => entry.date === selected)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const changeMonth = delta => {
    const next = new Date(year, month + delta, 1);
    setMonthDate(next);
    setSelected(dateKey(next));
  };

  return (
    <div className="finance-page calendar-page">
      <section className="finance-card calendar-card">
        <header className="calendar-title">
          <div className="month-control">
            <button onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button>
            <strong>{year}年{month + 1}月</strong>
            <button onClick={() => changeMonth(1)}><ChevronRight size={19} /></button>
          </div>
          <div className="month-summary">
            <span>收入<b>¥{money(totals.income)}</b></span>
            <span>支出<b>¥{money(totals.expense)}</b></span>
            <span>结余<b className={totals.income - totals.expense >= 0 ? "positive" : "negative"}>¥{money(totals.income - totals.expense)}</b></span>
          </div>
        </header>
        <div className="finance-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="finance-calendar-grid">
          {cells.map((cell, index) => cell ? (
            <button
              key={cell.key}
              className={`${selected === cell.key ? "selected" : ""} ${today === cell.key ? "today" : ""}`}
              onClick={() => setSelected(cell.key)}
            >
              <b>{cell.day}</b>
              {(cell.totals.income || cell.totals.expense) ? (
                <span className={cell.totals.income - cell.totals.expense >= 0 ? "positive" : "negative"}>
                  {cell.totals.income - cell.totals.expense >= 0 ? "+" : "−"}{money(Math.abs(cell.totals.income - cell.totals.expense))}
                </span>
              ) : <span className="no-entry">—</span>}
            </button>
          ) : <span className="calendar-blank" key={`blank-${index}`} />)}
        </div>
      </section>
      <section className="finance-card calendar-detail">
        <header><div><span>{selected}</span><h2>当日明细</h2></div><b>{selectedEntries.length}笔</b></header>
        <EntryList entries={selectedEntries} onEdit={setEditing} onDelete={window.financeApi.delete} pageSize={3} />
      </section>
      {editing && <EntryEditModal entry={editing} data={data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function buildPeriod(type, anchor) {
  if (type === "week") {
    const start = startOfWeek(anchor);
    const end = shiftDate(start, 6);
    return { start, end, label: `${start.getMonth() + 1}月${start.getDate()}日—${end.getMonth() + 1}月${end.getDate()}日` };
  }
  if (type === "month") {
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12),
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12),
      label: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
    };
  }
  return {
    start: new Date(anchor.getFullYear(), 0, 1, 12),
    end: new Date(anchor.getFullYear(), 11, 31, 12),
    label: `${anchor.getFullYear()}年`
  };
}

function TrendChart({ entries, period, type }) {
  const buckets = [];
  if (type === "week") {
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].forEach((label, index) => {
      const key = dateKey(shiftDate(period.start, index));
      buckets.push({ label, ...sumEntries(entries.filter(entry => entry.date === key)) });
    });
  } else if (type === "month") {
    const days = period.end.getDate();
    for (let day = 1; day <= days; day += 1) {
      const key = dateKey(new Date(period.start.getFullYear(), period.start.getMonth(), day));
      buckets.push({ label: String(day), ...sumEntries(entries.filter(entry => entry.date === key)) });
    }
  } else {
    for (let month = 0; month < 12; month += 1) {
      const monthEntries = entries.filter(entry => parseDate(entry.date).getMonth() === month);
      buckets.push({ label: `${month + 1}月`, ...sumEntries(monthEntries) });
    }
  }
  const max = Math.max(1, ...buckets.flatMap(bucket => [bucket.income, bucket.expense]));
  const width = 760;
  const height = 230;
  const left = 36;
  const bottom = 28;
  const chartWidth = width - left - 12;
  const chartHeight = height - bottom - 10;
  const step = chartWidth / buckets.length;
  const barWidth = Math.max(2, Math.min(10, step * 0.28));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="收支趋势柱状图">
      {[0, 0.5, 1].map(fraction => {
        const y = 10 + chartHeight * (1 - fraction);
        return <g key={fraction}><line x1={left} x2={width - 12} y1={y} y2={y} /><text x={left - 7} y={y + 4}>{money(max * fraction).replace(".00", "")}</text></g>;
      })}
      {buckets.map((bucket, index) => {
        const center = left + step * index + step / 2;
        const incomeHeight = (bucket.income / max) * chartHeight;
        const expenseHeight = (bucket.expense / max) * chartHeight;
        const showLabel = type !== "month" || index === 0 || index === buckets.length - 1 || (index + 1) % 5 === 0;
        return (
          <g key={`${bucket.label}-${index}`}>
            <rect className="income-bar" x={center - barWidth - 1} y={10 + chartHeight - incomeHeight} width={barWidth} height={incomeHeight} rx={barWidth / 2} />
            <rect className="expense-bar" x={center + 1} y={10 + chartHeight - expenseHeight} width={barWidth} height={expenseHeight} rx={barWidth / 2} />
            {showLabel && <text className="axis-label" x={center} y={height - 6}>{bucket.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function CategoryChart({ entries }) {
  const expenses = entries.filter(entry => entry.type === "expense");
  const total = expenses.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const grouped = [...expenses.reduce((map, entry) => {
    map.set(entry.tag, (map.get(entry.tag) || 0) + Number(entry.amount));
    return map;
  }, new Map()).entries()]
    .map(([tagName, value]) => ({ tag: tagName, value, percent: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
  const colors = ["#d96c4f", "#e7a83e", "#519c7b", "#4f7cae", "#8c6eaa", "#6c8793", "#b47d68"];
  let offset = 0;
  const gradient = grouped.length
    ? grouped.map((item, index) => {
      const start = offset;
      offset += item.percent * 100;
      return `${colors[index % colors.length]} ${start}% ${offset}%`;
    }).join(", ")
    : "#e7ebed 0 100%";

  return (
    <div className="category-chart">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div><span>支出</span><strong>¥{money(total)}</strong></div>
      </div>
      <div className="category-legend">
        {grouped.slice(0, 6).map((item, index) => (
          <div key={item.tag}>
            <i style={{ background: colors[index % colors.length] }} />
            <span>{item.tag}</span>
            <b>{(item.percent * 100).toFixed(1)}%</b>
          </div>
        ))}
        {!grouped.length && <EmptyState text="本周期暂无支出" />}
      </div>
    </div>
  );
}

function ReportsPage({ data }) {
  const [type, setType] = useState("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const period = buildPeriod(type, anchor);
  const entries = data.entries.filter(entry => {
    const date = parseDate(entry.date);
    return date >= period.start && date <= period.end;
  });
  const totals = sumEntries(entries);
  const days = Math.max(1, Math.round((period.end - period.start) / 86400000) + 1);
  const changePeriod = direction => {
    const next = new Date(anchor);
    if (type === "week") next.setDate(next.getDate() + direction * 7);
    if (type === "month") next.setMonth(next.getMonth() + direction);
    if (type === "year") next.setFullYear(next.getFullYear() + direction);
    setAnchor(next);
  };
  const chooseType = nextType => {
    setType(nextType);
    setAnchor(new Date());
  };

  return (
    <div className="finance-page reports-page">
      <section className="finance-card report-summary">
        <div className="report-period">
          <div className="period-switch">
            {["week", "month", "year"].map(item => (
              <button key={item} className={type === item ? "active" : ""} onClick={() => chooseType(item)}>
                {{ week: "周", month: "月", year: "年" }[item]}
              </button>
            ))}
          </div>
          <div className="period-nav">
            <button onClick={() => changePeriod(-1)}><ChevronLeft size={18} /></button>
            <strong>{period.label}</strong>
            <button onClick={() => changePeriod(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="summary-metrics">
          <div><span>收入</span><b className="positive">¥{money(totals.income)}</b></div>
          <div><span>支出</span><b className="negative">¥{money(totals.expense)}</b></div>
          <div><span>结余</span><b>¥{money(totals.income - totals.expense)}</b></div>
          <div><span>日均支出</span><b>¥{money(totals.expense / days)}</b></div>
        </div>
      </section>
      <section className="finance-card trend-card">
        <header><div><span>收入与支出</span><h2>趋势统计</h2></div><div className="chart-key"><span><i className="income" />收入</span><span><i className="expense" />支出</span></div></header>
        <TrendChart entries={entries} period={period} type={type} />
      </section>
      <section className="finance-card category-card">
        <header><div><span>标签构成</span><h2>支出分类</h2></div></header>
        <CategoryChart entries={entries} />
      </section>
    </div>
  );
}

export default function FinanceView({ page, data }) {
  if (page === "calendar") return <CalendarPage data={data} />;
  if (page === "reports") return <ReportsPage data={data} />;
  return <TodayPage data={data} />;
}
