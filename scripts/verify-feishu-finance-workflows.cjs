const assert = require("assert");
const { applyExplicitDates, isRelevantClarification, parseListedRecordDeletion, parseNaturalFinanceCommand, parseNaturalFinanceSummary, parseNaturalWaterCommand, parseTodoAddition, validatePlan } = require("../electron/feishu-bridge");
const { ASSISTANT_TOOL_NAMES, normalizeMathExpression } = require("../electron/assistant-tools");
const { ToolAgent, ToolRegistry } = require("../electron/tool-agent");

const createAndLink = parseNaturalFinanceCommand("增加一笔记账，娱乐，59.9元，备注265张25cm生态纸+8张21cm棉箔纸，同时把这个账单关联到折纸总计项目中");
assert.equal(createAndLink.kind, "workflow");
assert.deepEqual(createAndLink.steps, [
  { id: "created_bill", action: "finance.create", data: { type: "expense", amount: 59.9, tag: "娱乐", note: "265张25cm生态纸+8张21cm棉箔纸" } },
  { id: "link_project", action: "finance.link_to_total", data: { financeRef: "$created_bill", totalName: "折纸" } }
]);

const explicitTag = parseNaturalFinanceCommand("增加一笔记账，59.9元，备注纸张，标签为娱乐");
assert.equal(explicitTag.steps[0].data.tag, "娱乐");
assert.equal(explicitTag.steps[0].data.note, "纸张");

const updateRecent = parseNaturalFinanceCommand("修改这笔支出的标签为娱乐");
assert.deepEqual(updateRecent.steps, [{ id: "update_bill", action: "finance.update", data: { financeId: "$last_finance", patch: { tag: "娱乐" } } }]);

assert.equal(validatePlan(createAndLink).kind, "workflow");
assert.throws(() => validatePlan({ kind: "workflow", steps: [{ action: "shell.execute", data: {} }] }));
const dated = applyExplicitDates(parseNaturalFinanceCommand("8月15日增加一笔娱乐记账，59.9元"), "8月15日增加一笔娱乐记账，59.9元");
assert.equal(dated.steps[0].data.date, "2026-08-15");
assert.deepEqual(parseNaturalWaterCommand("加一杯水"), { kind: "add", entity: "water", patch: {} });
assert.deepEqual(parseNaturalWaterCommand("喝了300ml水"), { kind: "add", entity: "water", patch: { ml: 300 } });
assert.equal(parseNaturalWaterCommand("增加一笔娱乐记账，59.9元"), null);
assert.deepEqual(parseTodoAddition("加一个待办，简单意图评估创建"), { kind: "add", entity: "todo", patch: { title: "简单意图评估创建" } });
assert.deepEqual(parseTodoAddition("加一个待办，简单意图评估集创建，优先级为P0"), { kind: "add", entity: "todo", patch: { title: "简单意图评估集创建", priority: "P0" } });
assert.deepEqual(parseNaturalFinanceSummary("这个月花了多少", new Date("2026-08-14T12:00:00")), { kind: "finance_summary", entity: "finance", query: { month: "2026-08" } });
assert.deepEqual(parseNaturalFinanceSummary("2026年7月支出合计", new Date("2026-08-14T12:00:00")), { kind: "finance_summary", entity: "finance", query: { month: "2026-07" } });
assert(ASSISTANT_TOOL_NAMES.has("math.calculate") && ASSISTANT_TOOL_NAMES.has("water.add") && ASSISTANT_TOOL_NAMES.has("todo.create") && ASSISTANT_TOOL_NAMES.has("finance.batch_create") && ASSISTANT_TOOL_NAMES.has("pomodoro.start"));
assert.deepEqual(validatePlan({ kind: "tool_calls", calls: [{ name: "water.add", arguments: {} }] }), { kind: "tool_calls", calls: [{ name: "water.add", arguments: {} }] });
assert.throws(() => validatePlan({ kind: "tool_calls", calls: [{ name: "system.delete", arguments: {} }] }));
assert.equal(validatePlan({ kind: "clarify", message: "请补充金额" }).kind, "clarify");
assert.equal(parseListedRecordDeletion("删掉1."), 1);
assert.equal(normalizeMathExpression("（123 + 28） / 3"), "(123 + 28) / 3");
assert.equal(isRelevantClarification("请问要删除哪一项待办？", "16号计入消费"), false);
assert.equal(isRelevantClarification("三笔消费是否都按列出的金额入账？", "16号计入消费"), true);
(async () => {
  let agentCalls = 0;
  const fakeFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: agentCalls++ === 0 ? JSON.stringify({ kind: "tool_calls", calls: [{ name: "water.add", arguments: {} }] }) : JSON.stringify({ kind: "final", message: "已记录一杯水。" }) } }] }) });
  const agent = new ToolAgent({ apiKey: "test", model: "test", registry: new ToolRegistry({ tools: [], execute: async () => ({ text: "饮水200ml", references: null }) }), validatePlan, systemPrompt: () => "test", fetchImpl: fakeFetch });
  const result = await agent.run("加一杯水");
  assert.equal(result.text, "已记录一杯水。");

  let repairCalls = 0;
  let executeCalls = 0;
  const repairedFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([
    { kind: "final", message: "请问您需要我做什么？" },
    { kind: "tool_calls", calls: [{ name: "water.add", arguments: {} }] },
    { kind: "final", message: "已新增一杯水。" }
  ][repairCalls++]) } }] }) });
  const repairedAgent = new ToolAgent({
    apiKey: "test",
    model: "test",
    registry: new ToolRegistry({ tools: [], execute: async () => { executeCalls += 1; return { text: "饮水200ml" }; } }),
    validatePlan,
    systemPrompt: () => "test",
    fetchImpl: repairedFetch
  });
  const repairedResult = await repairedAgent.run("给我加一杯水");
  assert.equal(executeCalls, 1);
  assert.equal(repairedResult.text, "已新增一杯水。");
  console.log("飞书多步骤记账工作流检查通过。");
})().catch(error => { console.error(error); process.exitCode = 1; });
