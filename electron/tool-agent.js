class ToolRegistry {
  constructor({ tools, execute }) { this.tools = tools; this.execute = execute; }
  description() { return JSON.stringify(this.tools); }
  async executeCalls(calls) { return this.execute({ kind: "tool_calls", calls }); }
}

class ToolAgent {
  constructor({ apiKey, model, registry, validatePlan, systemPrompt, maxIterations = 5, fetchImpl = fetch }) {
    this.apiKey = apiKey; this.model = model; this.registry = registry; this.validatePlan = validatePlan; this.systemPrompt = systemPrompt; this.maxIterations = maxIterations; this.fetch = fetchImpl;
  }
  async _ask(messages) {
    const response = await this.fetch("https://api.deepseek.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, thinking: { type: "disabled" }, response_format: { type: "json_object" }, max_tokens: 900, messages }) });
    if (!response.ok) throw new Error(`DeepSeek 请求失败：${response.status} ${await response.text()}`);
    const body = await response.json(); return String(body.choices?.[0]?.message?.content || "");
  }
  async run(input, context = {}) {
    const system = this.systemPrompt(this.registry.description(), context);
    const messages = [{ role: "system", content: system }, { role: "user", content: input }]; let lastResult = null;
    const requiresTool = /(计入|消费|记账|账单|支出|收入|新增|增加|添加|加(?:一|个|一杯)|待办|todo|喝水|饮水|专注|查询|查看|多少|哪些)/i.test(String(input || ""));
    for (let step = 0; step < this.maxIterations; step += 1) {
      const raw = await this._ask(messages); let plan;
      try { plan = this.validatePlan(JSON.parse(raw)); } catch { plan = null; }
      if (plan?.kind === "final" && (!requiresTool || lastResult)) return { status: "completed", text: plan.message, result: lastResult, steps: step };
      if (plan?.kind === "clarify" && (!requiresTool || !/(请问您需要我做什么|请告诉我您想做什么|需要我做什么)/.test(plan.message))) return { status: "clarify", text: plan.message, result: lastResult, steps: step };
      if (plan?.kind !== "tool_calls") {
        messages.push({ role: "assistant", content: raw }, { role: "user", content: requiresTool ? "当前用户明确请求使用工具，但尚未有任何真实工具结果。不要输出 final 或泛化问候；请选择合适工具，或只询问一个确实缺失的参数。" : "输出无效。只可输出 tool_calls、clarify 或 final JSON。请重新决策。" });
        continue;
      }
      lastResult = await this.registry.executeCalls(plan.calls);
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `真实工具执行结果（不可编造）：${JSON.stringify(lastResult)}。请继续调用工具，或输出 final 总结。` });
    }
    return lastResult ? { status: "completed", text: lastResult.text || "操作已执行。", result: lastResult, steps: this.maxIterations, maxed: true } : { status: "clarify", text: "我还不能确定要执行的具体操作。请补充最关键的对象或金额。", steps: this.maxIterations, maxed: true };
  }
}
module.exports = { ToolAgent, ToolRegistry };
