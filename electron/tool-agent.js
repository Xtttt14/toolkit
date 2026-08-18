const { requestDeepSeekCompletion } = require("./deepseek-client");

class ToolRegistry {
  constructor({ tools, execute }) { this.tools = tools; this.execute = execute; }
  description() { return JSON.stringify(this.tools); }
  async executeCalls(calls) { return this.execute({ kind: "tool_calls", calls }); }
}

// 操作意图和澄清有效性属于 Agent 状态机，不依赖某一句中文措辞。
// 首轮有操作意图时，模型不能用“我能做什么”逃避工具选择；只有指出具体缺失槽位的澄清才可结束本轮。
const ACTION_INTENT = /(计入|消费|记账|账单|支出|收入|新增|增加|添加|加入|录入|写入|加(?:一|个|一杯)|待办|todo|喝水|饮水|专注|番茄|课表|考试|总计|标签|提醒|设置|历史|统计|进度|查询|查看|列出|多少|哪些|修改|更改|改成|改为|删除|撤回|清空|打开)/i;
const GENERIC_CLARIFICATION = /(?:你好|您好).*(?:可以|能).*(?:帮|做)|(?:请问|告诉).*(?:需要|想).*(?:什么|做)|(?:有什么|还能).*(?:帮|做)|(?:我可以|能为您).*(?:记录|帮助|做)/;
const SPECIFIC_CLARIFICATION = /(金额|日期|备注|标签|分类|账单|项目|待办|任务|名称|标题|优先级|数量|毫升|时长|分钟|算式|平摊|时间|哪(?:一|笔|个|条|项)|选择|确认)/;
function acceptsFirstTurnClarification(input, message) {
  const question = String(message || "");
  return ACTION_INTENT.test(String(input || "")) && !GENERIC_CLARIFICATION.test(question) && SPECIFIC_CLARIFICATION.test(question);
}

class ToolAgent {
  constructor({ apiKey, registry, validatePlan, systemPrompt, maxIterations = 5, fetchImpl = fetch }) {
    this.apiKey = apiKey; this.registry = registry; this.validatePlan = validatePlan; this.systemPrompt = systemPrompt; this.maxIterations = maxIterations; this.fetch = fetchImpl;
  }
  async _ask(messages) {
    const response = await requestDeepSeekCompletion({ apiKey: this.apiKey, messages, json: true, fetchImpl: this.fetch });
    return response.content;
  }
  async run(input, context = {}) {
    const system = this.systemPrompt(this.registry.description(), context);
    const messages = [{ role: "system", content: system }, { role: "user", content: input }]; let lastResult = null;
    const requiresTool = ACTION_INTENT.test(String(input || ""));
    for (let step = 0; step < this.maxIterations; step += 1) {
      const raw = await this._ask(messages); let plan;
      try { plan = this.validatePlan(JSON.parse(raw)); } catch { plan = null; }
      if (plan?.kind === "final" && (!requiresTool || lastResult)) {
        return { status: "completed", text: plan.message, result: lastResult, steps: step };
      }
      if (plan?.kind === "clarify" && (!requiresTool || lastResult || acceptsFirstTurnClarification(input, plan.message))) {
        return { status: "clarify", text: plan.message, result: lastResult, steps: step };
      }
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
module.exports = { ToolAgent, ToolRegistry, acceptsFirstTurnClarification };
