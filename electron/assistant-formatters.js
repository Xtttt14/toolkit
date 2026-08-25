function money(value) {
  return Number(value || 0).toFixed(2);
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateWithWeekday(value) {
  if (!validDateKey(value)) return String(value || "");
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${value}T12:00:00`).getDay()];
  return `${value} (${weekday})`;
}

function formatDateRange(start, end) {
  return `${dateWithWeekday(start)}${start === end ? "" : ` 至 ${dateWithWeekday(end)}`}`;
}

function resolveDateRange(args = {}, now = new Date()) {
  if (validDateKey(args.date)) return { start: args.date, end: args.date };
  if (/^\d{4}-\d{2}$/.test(String(args.month || ""))) {
    const [year, month] = args.month.split("-").map(Number);
    return {
      start: `${args.month}-01`,
      end: dateKey(new Date(year, month, 0, 12))
    };
  }
  const end = validDateKey(args.endDate) ? args.endDate : dateKey(now);
  if (validDateKey(args.startDate)) return { start: args.startDate, end };
  const days = Math.max(1, Math.min(366, Math.floor(Number(args.days) || 0)));
  if (days) {
    const startDate = new Date(`${end}T12:00:00`);
    startDate.setDate(startDate.getDate() - days + 1);
    return { start: dateKey(startDate), end };
  }
  return { start: null, end: null };
}

function datesInRange(start, end) {
  if (!validDateKey(start) || !validDateKey(end) || start > end) return [];
  const dates = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && dates.length < 366) {
    dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function financeEntryLines(entry, index, includeDate = true) {
  const lines = [
    `${index + 1}. 备注：${entry.note || "无备注"}`,
    `   金额：${entry.type === "income" ? "+" : "-"}¥${money(entry.amount)}`,
    `   标签：${entry.tag}`
  ];
  if (includeDate) lines.push(`   日期：${dateWithWeekday(entry.date)}`);
  return lines;
}

function financeTotals(entries) {
  return entries.reduce((totals, entry) => {
    totals[entry.type === "income" ? "income" : "expense"] += Number(entry.amount || 0);
    return totals;
  }, { income: 0, expense: 0 });
}

function formatFinanceEntries(entries, options = {}) {
  const list = [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const range = options.range || {};
  const grouped = Boolean(options.groupByDate || (range.start && range.end && range.start !== range.end));
  const title = options.title || "账单查询";
  const lines = [title];
  if (range.start && range.end) lines.push(`范围：${formatDateRange(range.start, range.end)}`);
  lines.push("");
  if (!list.length) lines.push("暂无符合条件的账单。\n");
  else if (grouped) {
    const byDate = new Map();
    for (const entry of list) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push(entry);
    }
    const dates = options.includeEmptyDates && range.start && range.end ? datesInRange(range.start, range.end) : [...byDate.keys()];
    dates.forEach((date, dateIndex) => {
      lines.push(`【${dateWithWeekday(date)}】`);
      const daily = byDate.get(date) || [];
      if (!daily.length) lines.push("暂无记录");
      else daily.forEach((entry, index) => lines.push(...financeEntryLines(entry, index, false), ""));
      if (dateIndex < dates.length - 1 && lines.at(-1) !== "") lines.push("");
    });
    if (lines.at(-1) !== "") lines.push("");
  } else {
    list.forEach((entry, index) => lines.push(...financeEntryLines(entry, index, true), ""));
  }
  const totals = financeTotals(list);
  lines.push(`合计：收入¥${money(totals.income)}｜支出¥${money(totals.expense)}｜结余¥${money(totals.income - totals.expense)}`);
  return lines.join("\n").trim();
}

function formatFinanceSummary(entries, range = {}) {
  const totals = financeTotals(entries);
  const expenseEntries = entries.filter(entry => entry.type !== "income");
  const byTag = new Map();
  expenseEntries.forEach(entry => byTag.set(entry.tag, (byTag.get(entry.tag) || 0) + Number(entry.amount || 0)));
  const lines = [
    "账单统计",
    range.start && range.end ? `范围：${formatDateRange(range.start, range.end)}` : "范围：全部记录",
    "",
    `收入：¥${money(totals.income)}`,
    `支出：¥${money(totals.expense)}`,
    `结余：¥${money(totals.income - totals.expense)}`,
    `账单：${entries.length}笔`
  ];
  if (byTag.size) {
    lines.push("", "支出分类：");
    [...byTag.entries()].sort((a, b) => b[1] - a[1]).forEach(([tag, amount]) => lines.push(`- ${tag}：¥${money(amount)}`));
  }
  return lines.join("\n");
}

function selectedWaterEntries(day, selectedCup, scope = "selected") {
  const entries = Array.isArray(day?.entries) ? day.entries : [];
  if (scope === "all") return entries;
  return entries.filter(entry => entry.cupId ? entry.cupId === selectedCup.id : Number(entry.ml) === Number(selectedCup.ml));
}

function formatWaterHistory(state, args = {}, now = new Date()) {
  const range = resolveDateRange(args, now);
  const resolved = range.start && range.end ? range : { start: state.date, end: state.date };
  const dates = datesInRange(resolved.start, resolved.end);
  const daily = dates.map(date => {
    const entries = selectedWaterEntries(state.history?.days?.[date], state.selectedCup, args.scope);
    return { date, entries, totalMl: entries.reduce((sum, entry) => sum + Number(entry.ml || 0), 0) };
  });
  const totalMl = daily.reduce((sum, day) => sum + day.totalMl, 0);
  const cups = daily.reduce((sum, day) => sum + day.entries.length, 0);
  const activeDays = daily.filter(day => day.entries.length).length;
  const targetMl = Number(state.today?.targetMl || state.settings.targetCups * state.selectedCup.ml);
  const achievedDays = daily.filter(day => day.totalMl >= targetMl).length;
  const lines = [
    "饮水统计",
    `范围：${resolved.start}${resolved.start === resolved.end ? "" : ` 至 ${resolved.end}`}`,
    `杯型：${args.scope === "all" ? "全部杯型" : `${state.selectedCup.name}(${state.selectedCup.ml}ml)`}`,
    "",
    `总饮水：${totalMl}ml`,
    `记录：${cups}杯`,
    `有记录：${activeDays}/${daily.length}天`,
    `日均：${Math.round(totalMl / Math.max(1, daily.length))}ml`,
    `达标：${achievedDays}/${daily.length}天`
  ];
  if (args.details !== false) {
    lines.push("", "每日明细：");
    daily.forEach(day => {
      lines.push(`【${day.date}】${day.totalMl}ml｜${day.entries.length}杯`);
      if (!day.entries.length) lines.push("暂无记录");
      else day.entries.forEach((entry, index) => lines.push(`${index + 1}. ${new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}｜${entry.ml}ml`));
    });
  }
  return lines.join("\n");
}

function formatTodoList(tasks) {
  const lines = [`当前待办共${tasks.length}项：`];
  if (!tasks.length) lines.push("暂无符合条件的待办。");
  tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.completed ? "[*]" : "[ ]"}${task.title}(优先级：${task.priority})`);
    if (task.dueDate) lines.push(`   截止：${String(task.dueDate).replace("T", " ").slice(0, 16)}`);
    if (task.tags.length) lines.push(`   标签：${task.tags.join("、")}`);
    if (task.description) lines.push(`   描述：${task.description}`);
    if (task.subtasks.length) {
      lines.push(`   子任务：${task.subtasks.filter(item => item.completed).length}/${task.subtasks.length}`);
      task.subtasks.forEach((item, subtaskIndex) => lines.push(`     ${subtaskIndex + 1}. ${item.completed ? "[*]" : "[ ]"}${item.title}`));
    }
  });
  return lines.join("\n");
}

function weekdayName(value) {
  return "日一二三四五六"[Number(value)] || "未知";
}

function teachingWeeks(course) {
  const pattern = course.pattern && course.pattern !== "每周" ? `(${course.pattern})` : "";
  return `${course.startWeek}-${course.endWeek}周${pattern}`;
}

function formatScheduleCourses(courses, options = {}) {
  const list = [...courses].sort((a, b) => a.period - b.period || a.startWeek - b.startWeek || String(a.name).localeCompare(String(b.name)));
  const title = "课表查询";
  const scope = options.date ? `日期：${options.date}｜第${options.week}教学周｜周${weekdayName(options.weekday)}` : options.week ? `教学周：第${options.week}周${options.weekday == null ? "" : `｜周${weekdayName(options.weekday)}`}` : options.weekday == null ? "范围：全部课程" : `星期：周${weekdayName(options.weekday)}`;
  const lines = [title, scope, ""];
  if (!list.length) return [...lines, "暂无符合条件的课程。"].join("\n");
  list.forEach((course, index) => {
    lines.push(`${index + 1}. ${course.name}`);
    lines.push(`   时间：${course.startTime}-${course.endTime}｜第${course.period}-${course.endPeriod || course.period}节`);
    lines.push(`   教学周：${teachingWeeks(course)}`);
    if (course.location) lines.push(`   地点：${course.location}`);
  });
  return lines.join("\n");
}

function formatExamList(exams, options = {}) {
  const list = [...exams].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)) || String(a.name).localeCompare(String(b.name)));
  const scope = options.start && options.end ? `范围：${options.start}${options.start === options.end ? "" : ` 至 ${options.end}`}` : "范围：全部考试";
  const lines = ["考试查询", scope, ""];
  if (!list.length) return [...lines, "暂无符合条件的考试。"].join("\n");
  const byDate = new Map();
  list.forEach(exam => { if (!byDate.has(exam.date)) byDate.set(exam.date, []); byDate.get(exam.date).push(exam); });
  [...byDate.entries()].forEach(([date, daily], dateIndex) => {
    lines.push(`【${date}】`);
    daily.forEach((exam, index) => {
      lines.push(`${index + 1}. 科目：${exam.name}`);
      lines.push(`   考试时间：${exam.time || "待定"}`);
      lines.push(`   考试地点：${exam.location || "待定"}`);
    });
    if (dateIndex < byDate.size - 1) lines.push("");
  });
  return lines.join("\n");
}

function formatPomodoroReport(data, args = {}, now = new Date()) {
  const range = resolveDateRange(args, now);
  const sessions = data.sessions.filter(session => {
    const key = dateKey(new Date(session.startedAt));
    return (!range.start || key >= range.start) && (!range.end || key <= range.end) && (!args.status || session.status === args.status) && (!args.tag || session.tags.includes(args.tag));
  });
  const completed = sessions.filter(session => session.status === "completed");
  const seconds = completed.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0);
  const lines = [
    "专注统计",
    range.start && range.end ? `范围：${range.start}${range.start === range.end ? "" : ` 至 ${range.end}`}` : "范围：全部记录",
    "",
    `完成：${completed.length}次`,
    `放弃：${sessions.length - completed.length}次`,
    `专注时长：${Math.round(seconds / 60)}分钟`
  ];
  if (args.details !== false) {
    lines.push("", "专注明细：");
    if (!sessions.length) lines.push("暂无记录");
    sessions.slice(0, Math.max(1, Math.min(50, Number(args.limit) || 20))).forEach((session, index) => {
      lines.push(`${index + 1}. ${session.title}`);
      lines.push(`   状态：${session.status === "completed" ? "已完成" : "已放弃"}`);
      lines.push(`   时长：${Math.round(session.durationSeconds / 60)}分钟`);
      lines.push(`   日期：${String(session.startedAt).slice(0, 10)}`);
      if (session.tags.length) lines.push(`   标签：${session.tags.join("、")}`);
    });
  }
  return lines.join("\n");
}

module.exports = {
  dateKey,
  datesInRange,
  financeEntryLines,
  formatFinanceEntries,
  formatFinanceSummary,
  formatExamList,
  formatPomodoroReport,
  formatScheduleCourses,
  formatTodoList,
  formatWaterHistory,
  money,
  resolveDateRange
};
