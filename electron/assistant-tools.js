// 模型可见的唯一能力目录。每个名字都必须由本地执行器实现，不能把 UI 文案当成工具能力。
const ASSISTANT_TOOLS = [
  { name: "math.calculate", description: "安全计算一个纯数值算式，供后续工具引用。", required: ["expression"], properties: { expression: "仅含数字、+ - * / () 和小数点的算式", resultKey: "结果引用名，可选；后续参数写 $该名称" } },
  { name: "water.add", description: "记录饮水；未传 ml 时使用当前选中水杯容量。可按指定日期和时间补记。", required: [], properties: { ml: "number，可选", date: "YYYY-MM-DD，可选，默认今天", time: "HH:mm，可选，例如 10:00；默认当前时间" } },
  { name: "water.status", description: "查询今日饮水进度。", required: [], properties: {} },
  { name: "water.undo_last", description: "撤回刚刚记录的一杯水。", required: [], properties: {} },
  { name: "todo.create", description: "创建待办。", required: ["title"], properties: { title: "string", priority: "P0-P3，默认 P3", description: "string，可选", dueDate: "ISO 日期时间，可选", tags: "string[]，可选" } },
  { name: "todo.list", description: "查询待办，可按关键词、完成状态或截止日期筛选。", required: [], properties: { text: "string，可选", completed: "boolean，可选", dueDate: "YYYY-MM-DD，可选" } },
  { name: "todo.update", description: "修改已引用的待办。", required: ["taskId", "patch"], properties: { taskId: "真实 ID 或 $last_todo", patch: "title/priority/description/dueDate/tags" } },
  { name: "todo.complete", description: "完成或恢复已引用的待办。", required: ["taskId"], properties: { taskId: "真实 ID 或 $last_todo", completed: "boolean，默认 true" } },
  { name: "pomodoro.start", description: "开始专注计时。", required: ["title"], properties: { title: "string", minutes: "number，倒计时分钟，省略则正计时", tags: "string[]，可选" } },
  { name: "pomodoro.finish", description: "结束当前专注。", required: [], properties: { status: "completed 或 abandoned，默认 completed" } },
  { name: "pomodoro.create_task", description: "创建可供开始专注的任务。", required: ["title"], properties: { title: "string", minutes: "number，可选", tags: "string[]，可选" } },
  { name: "finance.create", description: "新增一笔收入或支出。", required: ["amount"], properties: { type: "expense 或 income，默认 expense", amount: "number 或仅含数字、+ - * / () 的算式；必须计算为大于 0", tag: "string，可选", note: "string，可选", date: "YYYY-MM-DD，可选" } },
  { name: "finance.batch_create", description: "一次新增多笔账单；每条记录独立校验，全部有效才写入。", required: ["entries"], properties: { entries: "至少一条 finance.create 参数的数组" } },
  { name: "finance.summary", description: "按本地完整账单精确统计某月支出及分类。", required: [], properties: { month: "YYYY-MM，可选，默认本月" } },
  { name: "finance.create_and_link_total", description: "新建每日账单并关联到总计项目，绝不创建总计独立记录替代关联。", required: ["entry", "totalName"], properties: { entry: "finance.create 参数", totalName: "string" } },
  { name: "finance.update", description: "修改账单。优先传先前 finance.list 返回的真实 entryId 或 $last_finance；也可传 match（按备注/金额/日期/标签定位）。定位到多笔时不会写入，必须向用户澄清。", required: ["patch"], properties: { entryId: "真实 ID 或 $last_finance，可选", match: "{text,amount,date,tag}，未持有真实 ID 时使用", patch: "amount/tag/note/date/type" } },
  { name: "finance.list", description: "查询并定位账单；结果会返回真实 entryId，之后修改或关联必须引用该 ID，不能把账单描述当作 ID。", required: [], properties: { text: "string，可选", month: "YYYY-MM，可选", date: "YYYY-MM-DD，可选", amount: "number，可选", tag: "string，可选" } },
  { name: "total.create", description: "创建总计项目。", required: ["name"], properties: { name: "string" } },
  { name: "total.link_bill", description: "把已有每日账单关联到总计项目。", required: ["entryId", "totalName"], properties: { entryId: "真实 ID 或 $last_finance", totalName: "string" } },
  { name: "academic.schedule.query", description: "查询已导入课表。", required: [], properties: { date: "YYYY-MM-DD，可选" } },
  { name: "academic.exams.query", description: "查询已导入考试。", required: [], properties: { date: "YYYY-MM-DD，可选" } }
];

const ASSISTANT_TOOL_NAMES = new Set(ASSISTANT_TOOLS.map(tool => tool.name));
function assistantToolProtocol() {
  return JSON.stringify(ASSISTANT_TOOLS);
}
function normalizeMathExpression(value) {
  return String(value ?? "").replace(/（/g, "(").replace(/）/g, ")").trim();
}
module.exports = { ASSISTANT_TOOLS, ASSISTANT_TOOL_NAMES, assistantToolProtocol, normalizeMathExpression };
