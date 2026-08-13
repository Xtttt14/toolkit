const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (Object.prototype.hasOwnProperty.call(node, "w:t")) return textOf(node["w:t"]);
  return Object.entries(node).filter(([key]) => !key.startsWith("@_") && !["w:tcPr", "w:pPr", "w:rPr"].includes(key)).map(([, value]) => textOf(value)).join("");
}
function tableRows(table) {
  return asArray(table?.["w:tr"]).map(row => asArray(row["w:tc"]).map(cell => ({
    text: textOf(cell).replace(/\s+/g, " ").trim(), span: Number(cell?.["w:tcPr"]?.["w:gridSpan"]?.["@_w:val"] || 1)
  })));
}
function documentTables(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.includes("<pkg:package")) throw new Error("仅支持学校导出的 Word XML 表格（与示例文件相同格式）");
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(raw);
  const parts = asArray(parsed?.["pkg:package"]?.["pkg:part"]);
  const part = parts.find(item => item?.["@_pkg:name"] === "/word/document.xml");
  return asArray(part?.["pkg:xmlData"]?.["w:document"]?.["w:body"]?.["w:tbl"]);
}
function parsePeriod(label) {
  const match = String(label).match(/第(\d+)节\s*(\d{1,2}:\d{2})~(\d{1,2}:\d{2})/);
  return match ? { period: Number(match[1]), startTime: match[2], endTime: match[3] } : null;
}
function parseCourse(text, weekday, periodInfo) {
  const parts = text.split("/"); const first = parts.shift() || "";
  const week = first.match(/(\d+)-(\d+).*?(单周|双周|每周)/);
  if (!week || !parts[0]) return null;
  return { id: `${weekday}-${periodInfo.period}-${text}`, weekday, ...periodInfo, startWeek: Number(week[1]), endWeek: Number(week[2]), pattern: week[3], name: parts[0].replace(/^本\([^)]*\)/, ""), teacher: parts[1] || "", location: parts[2] || "", raw: text };
}
function parseSchedule(filePath) {
  const table = documentTables(filePath)[0]; const rows = tableRows(table); const headers = rows[0] || [];
  const weekdays = headers.map(cell => ({ "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 0 }[cell.text]));
  const courses = [];
  rows.slice(1).forEach(row => { const period = parsePeriod(row[0]?.text); if (!period) return; row.slice(1).forEach((cell, index) => { const weekday = weekdays[index + 1]; if (weekday === undefined) return; const chunks = cell.text.split(/(?=\d+-\d+(?:每周|单周|双周)\/)/); chunks.map(chunk => parseCourse(chunk, weekday, period)).filter(Boolean).forEach(course => courses.push(course)); }); });
  if (!courses.length) throw new Error("未在课表中识别到课程，请确认使用的是示例格式的文件");
  return courses;
}
function parseExamText(text) {
  const fields = {}; const re = /(考试科目|考试日期|开始时间|考试时长|考试地点|考试阶段|考核方式):([\s\S]*?)(?=(?:考试科目|考试日期|开始时间|考试时长|考试地点|考试阶段|考核方式):|$)/g;
  for (const match of text.matchAll(re)) fields[match[1]] = match[2].trim();
  return fields.考试科目 && /^\d{4}-\d{2}-\d{2}$/.test(fields.考试日期 || "") ? { id: `${fields.考试日期}-${fields.考试科目}`, name: fields.考试科目, date: fields.考试日期, time: fields.开始时间 || "", duration: fields.考试时长 || "", location: fields.考试地点 || "", stage: fields.考试阶段 || "", method: fields.考核方式 || "" } : null;
}
function parseExams(filePath) {
  const exams = documentTables(filePath).flatMap(table => tableRows(table).flatMap(row => row.map(cell => parseExamText(cell.text)).filter(Boolean)));
  const unique = [...new Map(exams.map(item => [item.id, item])).values()];
  if (!unique.length) throw new Error("未在考试表中识别到考试，请确认使用的是示例格式的文件");
  return unique;
}
module.exports = { parseSchedule, parseExams };
