const { DEEPSEEK_MAX_TOKENS, DEEPSEEK_MODEL } = require("./deepseek-config");

async function requestDeepSeekCompletion({ apiKey, messages, json = false, fetchImpl = fetch }) {
  const response = await fetchImpl("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      thinking: { type: "disabled" },
      ...(json ? { response_format: { type: "json_object" } } : {}),
      max_tokens: DEEPSEEK_MAX_TOKENS,
      messages
    })
  });
  if (!response.ok) throw new Error(`DeepSeek请求失败：${response.status} ${await response.text()}`);
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error(`DeepSeek输出超过${DEEPSEEK_MAX_TOKENS} tokens，结果已截断`);
  return {
    content: String(choice?.message?.content || ""),
    finishReason: choice?.finish_reason || null,
    model: body.model || DEEPSEEK_MODEL,
    usage: body.usage || null
  };
}

module.exports = { requestDeepSeekCompletion };
