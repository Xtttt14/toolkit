function invalid(field, reason) {
  throw new Error(`记账备份中的${field}${reason}`);
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "必须是对象");
}

function array(value, field) {
  if (!Array.isArray(value)) invalid(field, "必须是列表");
}

function stringList(value, field) {
  array(value, field);
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) invalid(`${field}[${index}]`, "必须是非空文字");
  });
}

function optionalText(value, field) {
  if (value !== undefined && typeof value !== "string") invalid(field, "必须是文字");
}

function identifier(value, field) {
  if (typeof value === "string" && value.trim()) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  invalid(field, "必须是有效ID");
}

function date(value, field, nullable = false) {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field, "必须是YYYY-MM-DD日期");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(field, "不是有效日期");
}

function metadata(value, field) {
  if (value.id !== undefined) identifier(value.id, `${field}.id`);
  for (const key of ["createdAt", "updatedAt"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || Number.isNaN(new Date(value[key]).getTime()))) {
      invalid(`${field}.${key}`, "不是有效时间");
    }
  }
}

function amount(value, field) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") invalid(field, "必须是有效金额");
  const number = Number(value);
  const cents = Math.round(number * 100);
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(cents) || cents < 1) invalid(field, "必须是大于0的有效金额");
}

function uniqueIds(items, field) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (item.id === undefined) return;
    const id = String(item.id);
    if (seen.has(id)) invalid(`${field}[${index}].id`, "不能重复");
    seen.add(id);
  });
}

// Validate every nested value before any store write. Older exports omit the
// last two fields; explicit null or malformed fields are never treated as empty.
function validateFinanceBackup(backup) {
  object(backup, "根数据");
  array(backup.entries, "entries");
  object(backup.customTags, "customTags");
  backup.entries.forEach((entry, index) => {
    const field = `entries[${index}]`;
    object(entry, field);
    metadata(entry, field);
    amount(entry.amount, `${field}.amount`);
    if (entry.type !== undefined && !["income", "expense"].includes(entry.type)) invalid(`${field}.type`, "必须是income或expense");
    date(entry.date, `${field}.date`);
    optionalText(entry.tag, `${field}.tag`);
    optionalText(entry.note, `${field}.note`);
  });
  uniqueIds(backup.entries, "entries");
  for (const type of ["income", "expense"]) {
    if (backup.customTags[type] !== undefined) stringList(backup.customTags[type], `customTags.${type}`);
  }

  const tagSettings = backup.tagSettings === undefined ? {} : backup.tagSettings;
  object(tagSettings, "tagSettings");
  for (const type of ["income", "expense"]) {
    if (tagSettings[type] === undefined) continue;
    object(tagSettings[type], `tagSettings.${type}`);
    for (const key of ["order", "hidden"]) {
      if (tagSettings[type][key] !== undefined) stringList(tagSettings[type][key], `tagSettings.${type}.${key}`);
    }
  }

  const totalProjects = backup.totalProjects === undefined ? [] : backup.totalProjects;
  array(totalProjects, "totalProjects");
  if (totalProjects.length > 100) invalid("totalProjects", "不能超过100个项目");
  totalProjects.forEach((project, index) => {
    const field = `totalProjects[${index}]`;
    object(project, field);
    metadata(project, field);
    optionalText(project.name, `${field}.name`);
    if (project.linkedEntryIds !== undefined) {
      array(project.linkedEntryIds, `${field}.linkedEntryIds`);
      project.linkedEntryIds.forEach((id, idIndex) => identifier(id, `${field}.linkedEntryIds[${idIndex}]`));
    }
    if (project.records !== undefined) {
      array(project.records, `${field}.records`);
      project.records.forEach((record, recordIndex) => {
        const recordField = `${field}.records[${recordIndex}]`;
        object(record, recordField);
        metadata(record, recordField);
        amount(record.amount, `${recordField}.amount`);
        optionalText(record.note, `${recordField}.note`);
        date(record.date, `${recordField}.date`, true);
      });
      uniqueIds(project.records, `${field}.records`);
    }
  });
  uniqueIds(totalProjects, "totalProjects");
  return { entries: backup.entries, customTags: backup.customTags, tagSettings, totalProjects };
}

module.exports = { validateFinanceBackup };
