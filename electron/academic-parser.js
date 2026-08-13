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
    text: textOf(cell).replace(/\s+/g, " ").trim(), span: Number((asArray(cell?.["w:tcPr"])[0] || {})?.["w:gridSpan"]?.["@_w:val"] || 1), merge: asArray(cell?.["w:tcPr"]).some(item => item?.["w:vMerge"]?.["@_w:val"] === "restart") ? "restart" : (asArray(cell?.["w:tcPr"]).some(item => item?.["w:vMerge"] !== undefined) ? "continue" : "")
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
function parseCourse(text, weekday, periodInfo, rowSpan = 1) {
  const parts = text.split("/"); const first = parts.shift() || "";
  const week = first.match(/(\d+)-(\d+).*?(单周|双周|每周)/);
  if (!week || !parts[0]) return null;
  const ends = ["08:45","09:40","10:55","11:50","15:05","16:00","17:15","18:10","19:45","20:40","21:35"];
  const endPeriod = Math.min(11, periodInfo.period + Math.max(1, rowSpan) - 1);
  return { id: `${weekday}-${periodInfo.period}-${text}`, weekday, ...periodInfo, endPeriod, endTime: rowSpan > 1 ? (ends[Math.min(ends.length - 1, endPeriod - 1)] || periodInfo.endTime) : periodInfo.endTime, startWeek: Number(week[1]), endWeek: Number(week[2]), pattern: week[3], name: parts[0].replace(/^本\([^)]*\)/, ""), teacher: parts[1] || "", location: parts[2] || "", raw: text };
}
function parseSchedule(filePath) {
  const table = documentTables(filePath)[0]; const rows = tableRows(table); const headers = rows[0] || [];
  const weekdayOf = text => ({ "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 0 }[text]);
  const weekdays = headers.map(cell => weekdayOf(cell.text)); const gridWeekdays = []; headers.forEach(cell => { for (let i = 0; i < cell.span; i++) gridWeekdays.push(weekdayOf(cell.text)); });
  const courses = [];
  const positioned = rows.map(row => { let column = 1; return row.slice(1).map((cell, index) => { const item = { ...cell, column, index }; column += cell.span; return item; }); });
  rows.slice(1).forEach((row, rowIndex) => { const period = parsePeriod(row[0]?.text); if (!period) return; const tableRowIndex = rowIndex + 1; const complex = row.length > 8 || row.some(cell => cell.span > 1); positioned[tableRowIndex].forEach(cell => { const weekday = complex ? gridWeekdays[cell.column] : weekdays[cell.index + 1]; if (weekday === undefined) return; let rowSpan = 1; if (cell.merge === "restart") for (let next = tableRowIndex + 1; next < positioned.length; next++) { const continuation = positioned[next].find(item => item.column <= cell.column && item.column + item.span > cell.column && item.merge === "continue"); if (!continuation) break; rowSpan += 1; }
    const chunks = cell.text.split(/(?=\d+-\d+(?:每周|单周|双周)\/)/); chunks.map(chunk => parseCourse(chunk, weekday, period, rowSpan)).filter(Boolean).forEach(course => courses.push(course)); }); });
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
