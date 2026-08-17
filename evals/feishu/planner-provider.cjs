const path = require("path");
const dotenv = require("dotenv");
const { buildPlannerPrompt } = require("../../electron/feishu-bridge");
const { requestDeepSeekCompletion } = require("../../electron/deepseek-client");
const { DEEPSEEK_MODEL } = require("../../electron/deepseek-config");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), override: false, quiet: true });

module.exports = class FeishuPlannerProvider {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return "feishu-deepseek-planner";
  }

  async callApi(prompt, context = {}) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { error: "缺少DEEPSEEK_API_KEY，无法运行真实Planner评测。" };
    const system = buildPlannerPrompt("", context.vars?.pending || null, []);
    const startedAt = Date.now();
    try {
      const response = await requestDeepSeekCompletion({
        apiKey,
        json: true,
        messages: [{ role: "system", content: system }, { role: "user", content: String(prompt || "") }]
      });
      return {
        output: response.content,
        tokenUsage: {
          prompt: response.usage?.prompt_tokens,
          completion: response.usage?.completion_tokens,
          total: response.usage?.total_tokens
        },
        metadata: { latencyMs: Date.now() - startedAt, model: response.model || DEEPSEEK_MODEL }
      };
    } catch (error) {
      return { error: error.message };
    }
  }
};
