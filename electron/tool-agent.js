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
    for (let step = 0; step < this.maxIterations; step += 1) {
      const raw = await this._ask(messages); let plan;
      try { plan = this.validatePlan(JSON.parse(raw)); } catch { plan = null; }
      if (plan?.kind === "final") return { status: "completed", text: plan.message, result: lastResult, steps: step };
      if (plan?.kind === "clarify") return { status: "clarify", text: plan.message, result: lastResult, steps: step };
      if (plan?.kind !== "tool_calls") {
        messages.push({ role: "assistant", content: raw }, { role: "user", content: "输出无效。只可输出 tool_calls、clarify 或 final JSON。请重新决策。" });
        continue;
      }
      lastResult = await this.registry.executeCalls(plan.calls);
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `真实工具执行结果（不可编造）：${JSON.stringify(lastResult)}。请继续调用工具，或输出 final 总结。` });
    }
    return { status: "completed", text: lastResult?.text || "操作已执行。", result: lastResult, steps: this.maxIterations, maxed: true };
  }
}
module.exports = { ToolAgent, ToolRegistry };
