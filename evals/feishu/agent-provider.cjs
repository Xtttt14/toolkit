const path = require("path");
const dotenv = require("dotenv");
const { ASSISTANT_TOOLS } = require("../../electron/assistant-tools");
const { buildPlannerPrompt, validatePlan } = require("../../electron/feishu-bridge");
const { DEEPSEEK_MODEL } = require("../../electron/deepseek-config");
const { ToolAgent, ToolRegistry } = require("../../electron/tool-agent");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), override: false, quiet: true });

function fakeToolResult(calls) {
  const references = {};
  calls.forEach((call, index) => {
    if (call.name === "math.calculate") {
      const expression = String(call.arguments?.expression || "0");
      const key = String(call.arguments?.resultKey || "last_calculation");
      const value = /^[\d\s+\-*/().]+$/.test(expression) ? Function(`"use strict"; return (${expression});`)() : 0;
      references[key] = { value, label: `${expression} = ${value}` };
      references.last_calculation = references[key];
    }
    if (call.name === "todo.create") references.last_todo = { id: `fake-todo-${index}`, label: call.arguments?.title || "待办" };
    if (call.name === "finance.create" || call.name === "finance.batch_create") references.last_finance = { id: `fake-finance-${index}`, label: "账单" };
  });
  return {
    text: calls.map((call, index) => `${index + 1}. ${call.name}执行成功`).join("\n"),
    references: Object.keys(references).length ? references : null
  };
}

module.exports = class FeishuAgentProvider {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return "feishu-deepseek-agent-dry-run";
  }

  async callApi(prompt) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { error: "缺少DEEPSEEK_API_KEY，无法运行真实Agent评测。" };
    const executedCalls = [];
    const registry = new ToolRegistry({
      tools: ASSISTANT_TOOLS,
      execute: async plan => {
        executedCalls.push(...plan.calls);
        return fakeToolResult(plan.calls);
      }
    });
    const agent = new ToolAgent({
      apiKey,
      registry,
      validatePlan,
      systemPrompt: () => buildPlannerPrompt("", null, []),
      maxIterations: Number(this.config.maxIterations) || 5
    });
    const startedAt = Date.now();
    const result = await agent.run(String(prompt || ""));
    return {
      output: JSON.stringify({
        status: result.status,
        finalText: result.text,
        executedCalls
      }),
      metadata: { latencyMs: Date.now() - startedAt, model: DEEPSEEK_MODEL }
    };
  }
};
