function dateKey(date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateKey(date) : null;
}
function extractExplicitDates(text, now = new Date()) {
  const value = String(text || ""); const dates = new Set(); const add = (month, day) => { const date = makeDate(now.getFullYear(), month, day); if (date) dates.add(date); };
  for (const match of value.matchAll(/(\d{1,2})月(\d{1,2})\s*(?:日|号)?/g)) add(Number(match[1]), Number(match[2]));
  for (const match of value.matchAll(/(^|[^\d])(\d{1,2}(?:\s*[、,，]\s*\d{1,2})+)\s*(?:日|号)/g)) match[2].split(/[、,，]/).forEach(day => add(now.getMonth() + 1, Number(day.trim())));
  for (const match of value.matchAll(/(^|[^月\d])(\d{1,2})\s*(?:日|号)/g)) add(now.getMonth() + 1, Number(match[2]));
  return [...dates].sort();
}
function applyExplicitDates(plan, text) {
  const dates = extractExplicitDates(text);
  if (!dates.length) return plan;
  if (plan.kind === "workflow") return { ...plan, steps: plan.steps.map(step => step.action === "finance.create" ? { ...step, data: { ...step.data, date: dates[0], dates } } : step) };
  if (!["add", "select", "add_total_record"].includes(plan.kind)) return plan;
  const patch = { ...plan.patch };
  if (plan.entity === "finance" || plan.kind === "select") { patch.date = dates[0]; if (plan.kind === "add") patch.dates = dates; }
  if (plan.kind === "add_total_record") patch.date = dates[0];
  if (plan.entity === "todo") patch.dueDate = dates[0];
  return { ...plan, patch };
}
function buildPlannerPrompt(text, pending, history) {
  return `你是个人工具箱的工具调用规划器。只输出一个 JSON 对象，不要 Markdown。
工具目录：${assistantToolProtocol()}
只能输出两种结果之一：
1. {"kind":"tool_calls","calls":[{"name":"工具名","arguments":{}}]}。
2. {"kind":"clarify","message":"只问一个关键缺失信息的问题"}。
只要用户请求查看、记录、修改或执行工具箱能力，必须输出 tool_calls，绝不能输出聊天回答或旧版 kind/entity/workflow 格式。多条编号消费、多个待办或多个连续动作必须保留为多个条目或多个 calls，按顺序执行，不能只处理第一条。
金额出现算式时，先调用 math.calculate，并给 resultKey；后续账单 amount 使用 "$resultKey"。中文括号和英文括号都可传给 math.calculate。用户说“16号/16日”时，账单 date 使用本地日期所属年月的 16 日。午餐、晚餐等餐饮默认使用“三餐”标签。
参数缺失、对象指代不唯一、金额含义不能确定时，输出 clarify；不要猜测，不要把写入请求改成待办/聊天查询。
当前本地日期是 ${dateKey(new Date())}。
当前候选会话：${JSON.stringify(pending || null)}
最近对话：${JSON.stringify(history || [])}`;
}

function validatePlan(plan) {
  const kinds = new Set(["tool_calls", "add", "workflow", "finance_summary", "add_and_link_finance", "update_recent_finance", "add_total_record", "undo_last", "find", "select", "link", "chat", "clarify", "cancel"]);
  const entities = new Set(["todo", "finance", "total", "water"]);
  if (!plan || typeof plan !== "object" || !kinds.has(plan.kind)) throw new Error("DeepSeek 返回了无效命令");
  if (plan.kind === "tool_calls") {
    if (!Array.isArray(plan.calls) || !plan.calls.length || plan.calls.length > 8 || plan.calls.some(call => !call || !ASSISTANT_TOOL_NAMES.has(call.name) || !call.arguments || typeof call.arguments !== "object")) throw new Error("DeepSeek 返回了无效工具调用");
    return { kind: "tool_calls", calls: plan.calls.map(call => ({ name: call.name, arguments: call.arguments })) };
  }
  if (plan.kind === "workflow") {
    const actions = new Set(["finance.create", "finance.link_to_total", "finance.update"]);
    if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 6 || plan.steps.some(step => !step || !actions.has(step.action) || typeof step.data !== "object")) throw new Error("DeepSeek 返回了无效工作流");
    return { kind: "workflow", entity: null, steps: plan.steps.map((step, index) => ({ id: String(step.id || `step_${index + 1}`), action: step.action, data: step.data })) };
  }
  if (plan.entity != null && !entities.has(plan.entity)) throw new Error("DeepSeek 返回了不支持的实体");
  return {
    kind: plan.kind,
    entity: plan.entity || null,
    query: plan.query && typeof plan.query === "object" ? plan.query : {},
    totalQuery: plan.totalQuery && typeof plan.totalQuery === "object" ? plan.totalQuery : {},
    patch: plan.patch && typeof plan.patch === "object" ? plan.patch : {},
    operation: plan.operation === "delete" ? "delete" : plan.operation === "update" ? "update" : null,
    selection: Number.isInteger(plan.selection) ? plan.selection : null,
    message: String(plan.message || "请补充必要信息。")
  };
}

async function answerWithDeepSeek(text, context, apiKey) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: { type: "disabled" },
      max_tokens: 1000,
      messages: [
        { role: "system", content: "你是个人工具箱的只读聊天助手。只根据提供的工具箱数据回答；数据不足时明确说明。不得建议或声称已修改数据。总计项目的 records 已合并直接添加和关联账单，source 字段表示来源，并已按日期和创建时间倒序排列。回答简洁、使用中文。\n\n工具箱数据：\n" + JSON.stringify(context) },
        { role: "user", content: String(text || "") }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 聊天请求失败：${response.status} ${await response.text()}`);
  const body = await response.json();
  return String(body.choices?.[0]?.message?.content || "暂时无法生成回答。").trim();
}

async function planWithDeepSeek(text, pending, history, apiKey) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 600,
      messages: [{ role: "system", content: buildPlannerPrompt("", pending, history) }, { role: "user", content: String(text || "") }]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败：${response.status} ${await response.text()}`);
  const body = await response.json();
  return applyExplicitDates(validatePlan(JSON.parse(body.choices?.[0]?.message?.content || "")), text);
}

function formatCandidates(candidates) {
  return candidates.map((item, index) => `${index + 1}. ${item.label}`).join("\n");
}
function parseLinkSelection(text) {
  const values = [...String(text || "").matchAll(/(?:账单|总计(?:项目)?)?\s*(\d+)/g)].map(match => Number(match[1]));
  return values.length >= 2 ? { financeIndex: values[0], totalIndex: values[1] } : null;
}
function parseSingleSelection(text) {
  const match = String(text || "").match(/^\s*(?:总计(?:项目)?\s*)?(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}
function isRecentUndoRequest(text) {
  const value = String(text || "");
  return /(删除|删掉|撤回|取消)/.test(value) && /(刚刚|刚才|最近|上一(?:条|次)?|新(?:增|加))/.test(value);
}
function chineseCount(value) {
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (/^\d+$/.test(value)) return Number(value);
  if (digits[value]) return digits[value];
  if (/^十[一二三四五六七八九]$/.test(value)) return 10 + digits[value[1]];
  if (/^[一二三四五六七八九]十$/.test(value)) return digits[value[0]] * 10;
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(value)) return digits[value[0]] * 10 + digits[value[2]];
  return null;
}
function parseRecentTotalRecordDeletion(text) {
  const value = String(text || "");
  if (!/(删除|删掉|撤回|取消)/.test(value)) return null;
  const project = value.match(/(?:删除|删掉|撤回|取消)\s*(.+?)(?:总计项目|总计)\s*(?:中|里)?/);
  const count = value.match(/(?:最近|刚刚|刚才)\s*([\d一二两三四五六七八九十]+)\s*次(?:直接|独立).{0,12}?记录/);
  const parsedCount = count ? chineseCount(count[1]) : null;
  return project?.[1] && parsedCount && parsedCount > 0 ? { query: { text: project[1].trim() }, count: parsedCount } : null;
}
function parseTotalRecordDeletion(text) {
  const value = String(text || "");
  if (!/(删除|删掉|撤回|取消)/.test(value) || !/(记录|明细)/.test(value) || /(最近|刚刚|刚才|上一(?:条|次)?)/.test(value)) return null;
  const query = value.replace(/删除|删掉|撤回|取消|一条|一笔|记录|明细|用于|总计项目|总计|项目|里面|中|里的|的/g, "").trim();
  return query ? { query: { text: query } } : null;
}
function parseTotalRecordListRequest(text) {
  const match = String(text || "").match(/^\s*(.+?)总计项目中最近\s*(\d+)\s*(?:个|条)?记录/);
  return match ? { query: { text: match[1].trim() }, count: Number(match[2]) } : null;
}
function parseListedRecordDeletion(text) {
  const value = String(text || "");
  if (!/(删除|删掉)/.test(value)) return null;
  const match = value.match(/(?:删除|删掉)\s*(?:[^\d]*?(?:中|里))?\s*(?:第\s*)?(\d+)\s*(?:[.、．]|条|个)/);
  return match ? Number(match[1]) : null;
}
function parseNaturalFinanceCommand(text) {
  const value = String(text || "").trim();
  const amount = value.match(/(?:人民币|¥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)/);
  const explicitTag = value.match(/(?:标签|分类)\s*(?:为|是|改为|改成)?\s*[：:]?\s*([^，,；;。\n]+)/);
  const recentReference = /(这笔|刚刚|刚才|上一笔|刚创建|新建的(?:每日)?账单)/.test(value);
  if (recentReference && (/(修改|改|更改|设置).{0,12}(?:标签|分类)/.test(value) || /(?:标签|分类).{0,12}(?:改为|改成|为|是)/.test(value))) {
    const tag = explicitTag?.[1]?.trim();
    return tag ? { kind: "workflow", entity: null, steps: [{ id: "update_bill", action: "finance.update", data: { financeId: "$last_finance", patch: { tag } } }] } : null;
  }
  if (!amount || !/(新增|增加|添加|记一笔|记账|支出|计入)/.test(value) || /(修改|改|删除|撤回)/.test(value)) return null;
  let tag = explicitTag?.[1]?.trim();
  if (!tag) tag = value.match(/(?:记账|账单)\s*[,，]\s*([^,，;；\s]+)\s*[,，]\s*\d/)?.[1];
  if (!tag) tag = value.match(/(?:新增|增加|添加)\s*(?:一笔)?\s*([^，,；;。\s]{1,12})\s*(?:支出)?记账/)?.[1];
  if (tag === "一笔") tag = "";
  if (!tag) tag = ["三餐", "零食", "衣服", "交通", "旅行", "孩子", "宠物", "话费网费", "烟酒", "学习", "日用品", "住房", "美妆", "医疗", "发红包", "汽车/加油", "娱乐", "请客送礼", "电器数码", "运动", "水电煤"].find(item => value.includes(item));
  const note = value.match(/(?:备注|说明)\s*[：:]?\s*([\s\S]*?)(?=(?:[，,；;。\n]\s*)?(?:(?:同时|并且|并|再).{0,16})?关联(?:到|至|给)?.{0,30}(?:总计(?:项目)?|项目)|$)/)?.[1]?.replace(/[，,；;。]\s*(?:标签|分类).+$/, "").trim();
  const project = value.match(/关联(?:到|至|给)?\s*(?:[「“"])?(.+?)(?:[」”"])?(?:总计(?:项目)?|项目)(?:中|里)?/)?.[1]?.replace(/[的\s]+$/g, "").trim();
  const patch = { type: "expense", amount: Number(amount[1]), tag: tag || "其他", note: note || "" };
  const steps = [{ id: "created_bill", action: "finance.create", data: patch }];
  if (project) steps.push({ id: "link_project", action: "finance.link_to_total", data: { financeRef: "$created_bill", totalName: project } });
  return { kind: "workflow", entity: null, steps };
}

function parseNaturalFinanceSummary(text, now = new Date()) {
  const value = String(text || "").trim();
  if (!/(花了多少|支出(?:多少|合计|统计)|(?:本月|这个月|这月).*(?:花|支出)|(?:花费|消费).*(?:多少|合计))/.test(value)) return null;
  const month = value.match(/(\d{1,2})月/)?.[1];
  const year = value.match(/(\d{4})年/)?.[1] || now.getFullYear();
  const numericMonth = month ? Number(month) : now.getMonth() + 1;
  if (numericMonth < 1 || numericMonth > 12) return null;
  return { kind: "finance_summary", entity: "finance", query: { month: `${year}-${String(numericMonth).padStart(2, "0")}` } };
}

function parseNaturalWaterCommand(text) {
  const value = String(text || "").trim();
  // 饮水是独立领域动作，必须在记账/模型规划前路由，不能把“杯”误解释为金额或分类。
  if (!/(?:加|喝|饮|记录).{0,8}(?:杯|瓶|毫升|ml)?\s*水|水\s*(?:一|两|\d+)?\s*(?:杯|瓶)/i.test(value)) return null;
  const ml = value.match(/(\d{2,4})\s*(?:毫升|ml)/i)?.[1];
  return { kind: "add", entity: "water", patch: ml ? { ml: Number(ml) } : {} };
}

function parseTodoAddition(text) {
  const match = String(text || "").match(/^\s*(?:新增|增加|添加|加)(?:一个|一条)?待办(?:事项|任务)?\s*(?:[，,：:]\s*)?(.*)$/);
  if (!match) return null;
  const raw = match[1].replace(/^标题\s*(?:为|是|[:：])?\s*/, "").trim();
  const priority = raw.match(/(?:[，,；;\s]+)?(?:优先级\s*(?:为|是)?\s*)?(P[0-3])\s*$/i)?.[1]?.toUpperCase();
  const title = raw.replace(/(?:[，,；;\s]+)?(?:优先级\s*(?:为|是)?\s*)?P[0-3]\s*$/i, "").trim();
  return title ? { kind: "add", entity: "todo", patch: { title, ...(priority ? { priority } : {}) } } : null;
}
function isReadOnlyQuestion(text) {
  const value = String(text || "").trim();
  const asksForInfo = /(什么|哪些|多少|几条|查询|查看|列出|统计|情况|吗|？|\?)/.test(value);
  const mutatesData = /(新增|添加|加一|修改|改成|删除|删掉|撤回|取消|关联|记入|支出|收入)/.test(value);
  return asksForInfo && !mutatesData;
}
function isCancellation(text) {
  return /^\s*(取消|算了|不用了|停止|不(?:想|要)?(?:删|删除|操作)了?|我不想(?:删|删除|操作)了?)\s*[。！!]?\s*$/.test(String(text || ""));
}

function startFeishuBridge({ appId, appSecret, allowedOpenId, deepSeekApiKey, onAction, onChatContext, onConversationLoad, onConversationSave, onRuntimeLoad, onRuntimeSave, logger = console }) {
  if (!appId || !appSecret || !allowedOpenId || !deepSeekApiKey) {
    logger.info("飞书桥接未启动：缺少飞书或 DeepSeek 环境变量。");
    return { started: false };
  }
  const Lark = require("@larksuiteoapi/node-sdk");
  const client = new Lark.Client({ appId, appSecret });
  const inFlight = new Set();
  const pendingByUser = new Map();
  const conversationByUser = new Map();
  const presentedCandidatesByUser = new Map();
  const referencesByUser = new Map();
  const runtimeLoaded = new Set();
  const loadRuntime = openId => {
    if (runtimeLoaded.has(openId)) return;
    runtimeLoaded.add(openId);
    const runtime = onRuntimeLoad?.(openId) || {}; const presented = runtime.presentedCandidates;
    if (presented?.expiresAt > Date.now() && Array.isArray(presented.items)) presentedCandidatesByUser.set(openId, presented);
    const refs = runtime.references;
    if (refs && Object.values(refs).some(ref => ref?.expiresAt == null || ref.expiresAt > Date.now())) referencesByUser.set(openId, refs);
  };
  const saveRuntime = openId => onRuntimeSave?.(openId, { presentedCandidates: presentedCandidatesByUser.get(openId) || null, references: referencesByUser.get(openId) || null });
  const rememberPresentedCandidates = (openId, items) => {
    loadRuntime(openId);
    presentedCandidatesByUser.set(openId, { items, expiresAt: Date.now() + 10 * 60 * 1000 });
    saveRuntime(openId);
  };
  const presentedCandidates = openId => {
    loadRuntime(openId);
    const value = presentedCandidatesByUser.get(openId);
    if (!value || value.expiresAt < Date.now()) { presentedCandidatesByUser.delete(openId); saveRuntime(openId); return []; }
    return value.items;
  };
  const rememberReferences = (openId, references) => {
    if (!references) return; loadRuntime(openId); referencesByUser.set(openId, references); saveRuntime(openId);
  };
  const bindWorkflowReferences = (plan, openId) => {
    const references = referencesByUser.get(openId) || {}; const lastFinanceId = references.last_finance?.id || references.lastFinance?.id; const lastTodoId = references.last_todo?.id;
    if (plan.kind === "tool_calls") return { ...plan, calls: plan.calls.map(call => ({ ...call, arguments: { ...call.arguments, entryId: call.arguments?.entryId === "$last_finance" ? lastFinanceId : call.arguments?.entryId, taskId: call.arguments?.taskId === "$last_todo" ? lastTodoId : call.arguments?.taskId } })) };
    if (plan.kind !== "workflow") return plan;
    return { ...plan, steps: plan.steps.map(step => ({ ...step, data: { ...step.data, financeId: step.data?.financeId === "$last_finance" ? lastFinanceId : step.data?.financeId, financeRef: step.data?.financeRef === "$last_finance" ? lastFinanceId : step.data?.financeRef } })) };
  };
  const rememberConversation = (openId, role, text) => {
    if (!conversationByUser.has(openId)) conversationByUser.set(openId, (onConversationLoad?.(openId) || []).slice(-80));
    const history = [...(conversationByUser.get(openId) || []), { role, text: String(text).slice(0, 1000), at: new Date().toISOString() }].slice(-80);
    conversationByUser.set(openId, history);
    onConversationSave?.(openId, history);
  };
  const askDeleteConfirmation = async (messageId, openId, action, description) => {
    pendingByUser.set(openId, { kind: "confirm-delete", action });
    await reply(messageId, `${description}\n\n回复“确认删除”执行，回复“取消”放弃。`, openId);
  };
  const requestUndo = async (messageId, openId) => {
    const preview = await onAction({ kind: "undo-last-preview" });
    if (!preview.undoPreview) return reply(messageId, preview.text, openId);
    if (preview.undoPreview.requiresConfirmation) return askDeleteConfirmation(messageId, openId, { kind: "undo_last" }, preview.undoPreview.text);
    const result = await onAction({ kind: "undo_last" });
    return reply(messageId, result.text, openId);
  };

  const reply = async (messageId, text, openId) => {
    const result = await client.im.v1.message.reply({
      path: { message_id: messageId },
      data: { msg_type: "text", content: JSON.stringify({ text }) }
    });
    if (result.code !== 0) throw new Error(`飞书回复失败：${result.code} ${result.msg}`);
    if (openId) rememberConversation(openId, "assistant", text);
  };

  const processMessage = async (data) => {
    const messageId = data.message.message_id;
    const openId = data.sender.sender_id?.open_id;
    if (inFlight.has(messageId)) return;
    inFlight.add(messageId);
    try {
      const text = JSON.parse(data.message.content || "{}").text || "";
      const pending = pendingByUser.get(openId) || null;
      rememberConversation(openId, "user", text);
      const plannerContext = { pending: pending?.summary || null, presented: presentedCandidates(openId).map((item, index) => ({ index: index + 1, label: item.label })), references: referencesByUser.get(openId) || null };
      const fallback = parseNaturalFinanceSummary(text) || parseNaturalWaterCommand(text) || parseTodoAddition(text) || parseNaturalFinanceCommand(text);
      let planned;
      try { planned = await planWithDeepSeek(text, plannerContext, conversationByUser.get(openId)?.slice(-48), deepSeekApiKey); }
      catch (error) { if (!fallback) throw error; planned = fallback; }
      if (planned.kind !== "tool_calls" && fallback) planned = fallback;
      planned = applyExplicitDates(planned, text);
      const plan = bindWorkflowReferences(planned, openId);
      if (pending && (plan.kind === "cancel" || isCancellation(text))) {
        pendingByUser.delete(openId);
        return void await reply(messageId, "已取消本次操作，未修改任何数据。", openId);
      }
      if (pending?.kind === "confirm-delete") {
        if (/^\s*(确认删除|确认|确定|是)\s*$/.test(text)) {
          const result = await onAction(pending.action); pendingByUser.delete(openId);
          return void await reply(messageId, result.text, openId);
        }
        if (/^\s*(取消|不|否)\s*$/.test(text)) {
          pendingByUser.delete(openId);
          return void await reply(messageId, "已取消删除。", openId);
        }
        return void await reply(messageId, "请回复“确认删除”执行，或回复“取消”放弃。", openId);
      }
      const batchDeletion = !pending && parseRecentTotalRecordDeletion(text);
      if (batchDeletion) {
        const result = await onAction({ kind: "preview-delete-recent-total-records", ...batchDeletion });
        if (result.deletePreview) return void await askDeleteConfirmation(messageId, openId, result.deletePreview.action, result.deletePreview.text);
        return void await reply(messageId, result.text, openId);
      }
      const listedIndex = !pending && parseListedRecordDeletion(text);
      if (listedIndex) {
        const selected = presentedCandidates(openId)[listedIndex - 1];
        if (!selected) return void await reply(messageId, "没有可引用的候选序号，请先查询或列出记录。", openId);
        if (selected.kind === "total-record") return void await askDeleteConfirmation(messageId, openId, { kind: "delete-total-record-select", target: selected.target }, `将删除：${selected.label}`);
        if (selected.kind === "entity") return void await askDeleteConfirmation(messageId, openId, { kind: "select", entity: selected.target.entity, target: selected.target, patch: {}, operation: "delete" }, `将删除：${selected.label}`);
        return void await reply(messageId, "该候选项不支持删除。", openId);
      }
      const listRequest = !pending && parseTotalRecordListRequest(text);
      if (listRequest) {
        const result = await onAction({ kind: "list-total-records", ...listRequest });
        if (!result.totalRecordList) return void await reply(messageId, result.text, openId);
        const { projectName, records } = result.totalRecordList;
        const listed = records.map(record => ({ ...record, projectName }));
        rememberPresentedCandidates(openId, listed.map(record => ({ kind: "total-record", target: record, label: `总计「${projectName}」·${record.label}` })));
        return void await reply(messageId, `总计「${projectName}」最近${listed.length}条记录：\n${listed.map((record, index) => `${index + 1}. ${record.label}`).join("\n")}`, openId);
      }
      const recordDeletion = !pending && parseTotalRecordDeletion(text);
      if (recordDeletion) {
        const result = await onAction({ kind: "find-total-record-delete", ...recordDeletion });
        if (result.totalRecordDeleteCandidates) {
          const candidates = result.totalRecordDeleteCandidates;
          pendingByUser.set(openId, { kind: "total-record-delete", candidates, summary: candidates.map((item, index) => ({ index: index + 1, label: item.label })) });
          rememberPresentedCandidates(openId, candidates.map(target => ({ kind: "total-record", target, label: target.label })));
          return void await reply(messageId, `请选择要从总计中删除的明细：\n${formatCandidates(candidates)}\n\n回复序号即可。关联账单只会取消关联，不会删除原账单。`, openId);
        }
        return void await reply(messageId, result.text, openId);
      }
      if (!pending && isRecentUndoRequest(text)) {
        return void await requestUndo(messageId, openId);
      }
      if (isReadOnlyQuestion(text) && plan.kind === "chat") {
        pendingByUser.delete(openId);
        return void await reply(messageId, await answerWithDeepSeek(text, onChatContext?.() || {}, deepSeekApiKey), openId);
      }
      if (pending?.kind === "link") {
        const selection = parseLinkSelection(text);
        if (!selection || !pending.finance[selection.financeIndex - 1] || !pending.total[selection.totalIndex - 1]) {
          return void await reply(messageId, "请回复“账单序号，总计序号”，例如：账单1，总计1。", openId);
        }
        const result = await onAction({ kind: "link-select", financeId: pending.finance[selection.financeIndex - 1].id, totalId: pending.total[selection.totalIndex - 1].id });
        pendingByUser.delete(openId);
        return void await reply(messageId, result.text, openId);
      }
      if (pending?.kind === "total-record") {
        const index = parseSingleSelection(text);
        const project = pending.total[index - 1];
        if (!project) return void await reply(messageId, "请回复总计项目序号，例如：1。", openId);
        const result = await onAction({ kind: "add-total-record-select", totalId: project.id, record: pending.record });
        pendingByUser.delete(openId);
        return void await reply(messageId, result.text, openId);
      }
      if (pending?.kind === "total-record-delete") {
        const index = parseSingleSelection(text);
        const target = pending.candidates[index - 1];
        if (!target) return void await reply(messageId, "请回复要删除的明细序号，例如：1。", openId);
        return void await askDeleteConfirmation(messageId, openId, { kind: "delete-total-record-select", target }, `将删除：${target.label}`);
      }
      if (pending?.candidates && /^\s*\d+\s*$/.test(text)) {
        return void await reply(messageId, "已选中该记录。请继续说明要修改什么，或回复“序号，撤回”。", openId);
      }
      if (plan.kind === "clarify") return void await reply(messageId, plan.message, openId);
      if (plan.kind === "cancel") return void await reply(messageId, "当前没有待取消的操作。", openId);
      if (plan.kind === "chat") return void await reply(messageId, await answerWithDeepSeek(text, onChatContext?.() || {}, deepSeekApiKey), openId);
      if (plan.kind === "undo_last") return void await requestUndo(messageId, openId);
      if (plan.kind === "select") {
        const index = plan.selection || Number(String(text).match(/^\s*(\d+)/)?.[1]);
        const selected = pending?.candidates?.[index - 1];
        if (!selected) return void await reply(messageId, "当前没有待选择的候选项。若要关联账单，请直接说明要关联的账单和总计项目。", openId);
        const action = applyExplicitDates({ ...plan, entity: selected.entity, target: selected }, text);
        if (action.operation === "delete") return void await askDeleteConfirmation(messageId, openId, action, `将删除：${selected.label}`);
        const result = await onAction(action);
        pendingByUser.delete(openId);
        return void await reply(messageId, result.text, openId);
      }
      const result = await onAction(plan);
      rememberReferences(openId, result.references);
      if (result.linkCandidates) {
        const { finance, total } = result.linkCandidates;
        pendingByUser.set(openId, { kind: "link", finance, total, summary: { finance: finance.map((item, index) => ({ index: index + 1, label: item.label })), total: total.map((item, index) => ({ index: index + 1, label: item.label })) } });
        return void await reply(messageId, `请选择要关联的账单和总计项目：\n账单：\n${formatCandidates(finance)}\n\n总计项目：\n${formatCandidates(total)}\n\n回复“账单序号，总计序号”，例如：账单1，总计1。`, openId);
      }
      if (result.totalRecordCandidates) {
        const { total, record } = result.totalRecordCandidates;
        pendingByUser.set(openId, { kind: "total-record", total, record, summary: { total: total.map((item, index) => ({ index: index + 1, label: item.label })), record } });
        return void await reply(messageId, `请选择要新增独立记录的总计项目：\n${formatCandidates(total)}\n\n回复总计项目序号，例如：1。`, openId);
      }
      if (result.candidates) {
        pendingByUser.set(openId, { candidates: result.candidates, summary: result.candidates.map((item, index) => ({ index: index + 1, entity: item.entity, label: item.label })) });
        rememberPresentedCandidates(openId, result.candidates.map(target => ({ kind: "entity", target, label: target.label })));
        return void await reply(messageId, `找到以下记录，请回复“序号 + 修改内容”或“序号，撤回”：\n${formatCandidates(result.candidates)}`, openId);
      }
      await reply(messageId, result.text, openId);
    } catch (error) {
      logger.error("飞书命令处理失败：", error);
      await reply(messageId, "处理失败，请稍后重试。", openId).catch(replyError => logger.error("飞书失败回复发送失败：", replyError));
    } finally {
      inFlight.delete(messageId);
    }
  };

  const wsClient = new Lark.WSClient({ appId, appSecret, loggerLevel: Lark.LoggerLevel.info });
  wsClient.start({ eventDispatcher: new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": async data => {
      if (data.sender.sender_id?.open_id === allowedOpenId && data.message.chat_type === "p2p") void processMessage(data);
    }
  }) });
  logger.info("飞书桥接已启动：DeepSeek V4 Pro，仅处理授权账号的私聊消息。");
  return { started: true };
}

module.exports = { answerWithDeepSeek, applyExplicitDates, buildPlannerPrompt, chineseCount, extractExplicitDates, isCancellation, isReadOnlyQuestion, isRecentUndoRequest, parseLinkSelection, parseListedRecordDeletion, parseNaturalFinanceCommand, parseNaturalFinanceSummary, parseNaturalWaterCommand, parseRecentTotalRecordDeletion, parseSingleSelection, parseTodoAddition, parseTotalRecordDeletion, parseTotalRecordListRequest, planWithDeepSeek, startFeishuBridge, validatePlan };
const { ASSISTANT_TOOL_NAMES, assistantToolProtocol } = require("./assistant-tools");
