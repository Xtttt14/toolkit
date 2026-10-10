const { DEEPSEEK_MAX_TOKENS, DEEPSEEK_MODEL } = require("./deepseek-config");
const fs = require("fs");
const tls = require("tls");
let caDispatcher;
let loadedCaPath;

function createDeepSeekDispatcher() {
  const caPath = String(process.env.DEEPSEEK_CA_CERT || "").trim();
  if (!caPath) return undefined;
  if (caDispatcher && loadedCaPath === caPath) return caDispatcher;
  try {
    const { Agent } = require("undici");
    const next = new Agent({ connect: { ca: [...tls.rootCertificates, fs.readFileSync(caPath, "utf8")] } });
    if (caDispatcher) caDispatcher.close().catch(() => {});
    caDispatcher = next;
    loadedCaPath = caPath;
    return next;
  } catch (error) {
    throw new Error(`无法加载 DEEPSEEK_CA_CERT（${caPath}）：${error.message}`);
  }
}

async function requestDeepSeekCompletion({ apiKey, messages, json = false, fetchImpl = fetch }) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      thinking: { type: "disabled" },
      ...(json ? { response_format: { type: "json_object" } } : {}),
      max_tokens: DEEPSEEK_MAX_TOKENS,
      messages
    })
  };
  const dispatcher = fetchImpl === fetch ? createDeepSeekDispatcher() : undefined;
  if (dispatcher) options.dispatcher = dispatcher;
  // Chromium uses the OS trust store and system proxy settings; Node fetch does not.
  const request = fetchImpl === fetch && !dispatcher && process.versions.electron
    ? require("electron").net.fetch.bind(require("electron").net)
    : fetchImpl;
  let response;
  try {
    response = await request("https://api.deepseek.com/v1/chat/completions", options);
  } catch (error) {
    if (error?.cause?.code === "SELF_SIGNED_CERT_IN_CHAIN" || error?.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      throw new Error("DeepSeek TLS证书校验失败：请在用户数据目录的 .env 中设置 DEEPSEEK_CA_CERT=企业根证书文件的绝对路径，然后重启应用。请勿关闭证书校验。", { cause: error });
    }
    throw error;
  }
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
