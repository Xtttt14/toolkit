function parseMessageContent(content) {
  if (content && typeof content === "object") return content;
  try { return JSON.parse(String(content || "{}")); }
  catch { return {}; }
}

function extractRichText(value, depth = 0) {
  if (depth > 12 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const separator = value.some(item => Array.isArray(item)) ? "\n" : "";
    return value.map(item => extractRichText(item, depth + 1)).filter(Boolean).join(separator);
  }
  if (typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  const parts = [];
  if (typeof value.title === "string") parts.push(value.title);
  for (const key of ["content", "elements", "body", "items", "messages"]) {
    if (value[key] != null) parts.push(extractRichText(value[key], depth + 1));
  }
  return parts.filter(Boolean).join(parts.length > 1 ? "\n" : "");
}

function extractFeishuMessageText(message = {}) {
  const parsed = parseMessageContent(message.content);
  const messageType = String(message.message_type || message.msg_type || "");
  if (messageType === "text" || typeof parsed.text === "string") return String(parsed.text || "").trim();
  return extractRichText(parsed).replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { extractFeishuMessageText, extractRichText, parseMessageContent };
