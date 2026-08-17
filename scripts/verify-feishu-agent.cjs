const assert = require("assert");
const { requestDeepSeekCompletion } = require("../electron/deepseek-client");
const { DEEPSEEK_MAX_TOKENS, DEEPSEEK_MODEL } = require("../electron/deepseek-config");
const { extractFeishuMessageText } = require("../electron/feishu-message");
const { validatePlan } = require("../electron/feishu-bridge");
const { ToolAgent, ToolRegistry } = require("../electron/tool-agent");

assert.equal(DEEPSEEK_MODEL, "deepseek-v4-flash");
assert.equal(DEEPSEEK_MAX_TOKENS, 3000);

assert.equal(extractFeishuMessageText({ message_type: "text", content: JSON.stringify({ text: "第一项\n第二项" }) }), "第一项\n第二项");
assert.equal(extractFeishuMessageText({ message_type: "post", content: JSON.stringify({ title: "批量任务", content: [[{ tag: "text", text: "1. 新增待办" }], [{ tag: "text", text: "2. 记录饮水" }]] }) }), "批量任务\n1. 新增待办\n2. 记录饮水");
assert.equal(extractFeishuMessageText({ message_type: "interactive", content: JSON.stringify({ elements: [{ tag: "markdown", content: "新增待办并记录饮水" }] }) }), "新增待办并记录饮水");
assert.equal(extractFeishuMessageText({ message_type: "image", content: JSON.stringify({ image_key: "img_xxx" }) }), "");

(async () => {
  let responseIndex = 0;
  let executedCalls = [];
  const responses = [
    { kind: "tool_calls", calls: [{ name: "water.add", arguments: { ml: 250 } }, { name: "todo.create", arguments: { title: "提交周报" } }] },
    { kind: "final", message: "两项任务均已完成。" }
  ];
  const agent = new ToolAgent({
    apiKey: "test",
    registry: new ToolRegistry({
      tools: [],
      execute: async plan => {
        executedCalls = plan.calls;
        return { text: `${plan.calls.length}项任务执行成功` };
      }
    }),
    validatePlan,
    systemPrompt: () => "test",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, "deepseek-v4-flash");
      assert.equal(body.max_tokens, 3000);
      assert.deepEqual(body.thinking, { type: "disabled" });
      assert.deepEqual(body.response_format, { type: "json_object" });
      return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(responses[responseIndex++]) } }] }) };
    }
  });
  const result = await agent.run("记录饮水250ml并新增待办提交周报");
  assert.equal(result.status, "completed");
  assert.equal(executedCalls.length, 2);

  await assert.rejects(
    requestDeepSeekCompletion({
      apiKey: "test",
      messages: [],
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "截断" } }] }) })
    }),
    /3000 tokens/
  );
  console.log("飞书Agent消息解析、固定模型配置与多工具调用检查通过。");
})().catch(error => { console.error(error); process.exitCode = 1; });
