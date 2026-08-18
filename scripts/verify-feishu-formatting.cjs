const assert = require("assert");
const { ASSISTANT_TOOLS } = require("../electron/assistant-tools");
const { buildPlannerPrompt } = require("../electron/feishu-bridge");
const { formatFinanceEntries, formatWaterHistory, resolveDateRange } = require("../electron/assistant-formatters");

const now = new Date("2026-08-17T12:00:00");
assert.deepEqual(resolveDateRange({ days: 7 }, now), { start: "2026-08-11", end: "2026-08-17" });

const financeText = formatFinanceEntries([
  { id: "1", type: "expense", amount: 12, tag: "交通", note: "地铁", date: "2026-08-11", createdAt: "2026-08-11T09:00:00" },
  { id: "2", type: "expense", amount: 19.7, tag: "娱乐", note: "特价纸张", date: "2026-08-13", createdAt: "2026-08-13T09:00:00" }
], { range: { start: "2026-08-11", end: "2026-08-17" }, groupByDate: true, includeEmptyDates: true });
assert(financeText.includes("【2026-08-11】\n1. 备注：地铁\n   金额：-¥12.00\n   标签：交通"));
assert(financeText.includes("【2026-08-12】\n暂无记录"));
assert(financeText.indexOf("备注：地铁") < financeText.indexOf("金额：-¥12.00"));
assert(financeText.indexOf("金额：-¥12.00") < financeText.indexOf("标签：交通"));
assert(!financeText.includes("**"));

const waterState = {
  date: "2026-08-17",
  settings: { targetCups: 8 },
  selectedCup: { id: "cup-300", name: "大杯", ml: 300 },
  today: { targetMl: 2400 },
  history: { days: {
    "2026-08-16": { entries: [{ id: "w1", cupId: "cup-300", ml: 300, at: "2026-08-16T02:00:00.000Z" }] },
    "2026-08-17": { entries: [{ id: "w2", cupId: "cup-300", ml: 300, at: "2026-08-17T02:00:00.000Z" }] }
  } }
};
const waterText = formatWaterHistory(waterState, { days: 7 }, now);
for (const field of ["范围：2026-08-11 至 2026-08-17", "总饮水：600ml", "记录：2杯", "有记录：2/7天", "日均：86ml", "每日明细：", "【2026-08-17】300ml｜1杯"]) assert(waterText.includes(field), field);

const prompt = buildPlannerPrompt("", null, []);
for (const rule of ["备注、金额、标签、日期", "不要输出 Markdown 标记", "饮水历史必须保留查询范围", "近N天"]) assert(prompt.includes(rule), rule);

const toolNames = new Set(ASSISTANT_TOOLS.map(tool => tool.name));
for (const name of [
  "water.history", "water.settings.update", "todo.subtask.add", "todo.delete",
  "pomodoro.history", "pomodoro.task.update", "finance.list", "finance.summary",
  "finance.backup.export", "total.record.update", "total.unlink_bill",
  "academic.schedule.import", "academic.exams.settings.update", "app.update.status"
]) assert(toolNames.has(name), `缺少工具：${name}`);

console.log("飞书统一格式、近7天饮水统计与工具覆盖检查通过。");
