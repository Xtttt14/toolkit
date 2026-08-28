const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const main = read("electron/main.js");
const preload = read("electron/preload.js");
const home = read("src/pages/Home.jsx");
const todo = read("src/modules/todo/TodoView.jsx");
const academic = read("src/modules/AcademicApps.jsx");
const pomodoro = read("src/modules/PomodoroApp.jsx");
const css = read("src/styles.css");
const readme = read("README.md");

const checks = [
  [!readme.includes("桌面组件") && !css.includes("widget-") && !css.includes("desktop-widget"), "桌面组件说明或样式仍有残留"],
  [home.includes("dashboard-finance-hero") && home.includes("schedule-card-large") && home.includes("water-card-medium") && home.includes("todo-card-medium"), "今日仪表盘组件层级不完整"],
  [home.includes("dashboard-water-ring") && home.includes("totalMl") && home.includes("加一杯") && home.includes("toggleComplete") && !home.includes("快速记账") && !home.includes("新建任务"), "首页快捷操作或卡片内交互不符合要求"],
  [home.includes("finance-hero-balance") && home.includes("money(Math.abs(todayBalance))") && !home.includes('todayBalance >= 0 ? "+" : "-"'), "首页今日结余金额排版不符合要求"],
  [main.includes("function syncExamTodos") && main.includes('priority: "P0"') && main.includes('tags: ["考试"]') && main.includes("if (!existing && endAt <= now) continue"), "考试同步Todo规则不完整"],
  [main.includes('sourceType: "exam"') && main.includes('sourceId: exam.id'), "考试Todo缺少稳定来源标识"],
  [main.includes("task.subtasks.forEach(subtask => { subtask.completed = task.completed; })") && main.includes("task.subtasks.every(item => item.completed)"), "Todo父子完成状态联动不完整"],
  [todo.includes("todo-completed-divider") && css.includes(".todo-completed-divider"), "Todo已完成分区未实现"],
  [!academic.includes("alert(") && academic.includes("AcademicToastHost"), "校园模块仍使用阻塞弹窗"],
  [main.includes('pomodoro:importBackground') && preload.includes("importBackground") && pomodoro.includes("导入图片") && css.includes("ambience-custom"), "沉浸模式自定义背景链路不完整"]
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

const timingSource = main.slice(main.indexOf("function examDateTime"), main.indexOf("function syncExamTodos"));
const timingContext = {};
vm.createContext(timingContext);
vm.runInContext(`${timingSource}\nthis.getExamTiming = getExamTiming;`, timingContext);
const rangeTiming = timingContext.getExamTiming({ date: "2030-06-01", time: "09:00—11:00", duration: "" });
const durationTiming = timingContext.getExamTiming({ date: "2030-06-01", time: "09:00", duration: "120分钟" });
const fallbackTiming = timingContext.getExamTiming({ date: "2030-06-01", time: "", duration: "" });
if (rangeTiming.endAt.getHours() !== 11 || durationTiming.endAt.getHours() !== 11 || fallbackTiming.endAt.getHours() !== 23) {
  failures.push("考试结束时间解析未覆盖时间段、时长或缺省时间");
}
if (failures.length) {
  console.error("学生仪表盘工作流检查失败：");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log("学生仪表盘、考试Todo、完成状态、校园反馈和自定义背景检查通过。");
