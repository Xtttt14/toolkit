const { randomUUID } = require("node:crypto");

const fields = ["name", "date", "time", "duration", "location", "stage", "method"];
const clean = value => String(value || "").trim().replace(/\s+/g, " ");
const subjectKey = exam => clean(exam.name).toLocaleLowerCase();
function occurrenceKey(exam) {
  const time = clean(exam.time).match(/(\d{1,2}):(\d{2})/);
  return JSON.stringify([subjectKey(exam), exam.date, time ? `${time[1].padStart(2, "0")}:${time[2]}` : ""]);
}
const sameDetails = (a, b) => fields.every(field => clean(a[field]) === clean(b[field]));

function planExamImport(existing, incoming) {
  const unique = [...new Map(incoming.map(exam => [occurrenceKey(exam), exam])).values()];
  const exactIds = new Set(existing.filter(exam => unique.some(item => occurrenceKey(item) === occurrenceKey(exam))).map(exam => exam.id));
  const rows = unique.map((exam, index) => {
    const current = existing.find(item => occurrenceKey(item) === occurrenceKey(exam));
    const candidates = current ? [] : existing.filter(item => subjectKey(item) === subjectKey(exam) && !exactIds.has(item.id));
    return {
      key: `exam-import-${index}`,
      kind: current ? (sameDetails(current, exam) ? "unchanged" : "update") : candidates.length ? "conflict" : "new",
      incoming: { ...exam },
      current: current ? { ...current } : null,
      candidates: candidates.map(item => ({ ...item }))
    };
  });
  return { rows, count: unique.length, hasConflicts: rows.some(row => row.kind === "conflict") };
}

function applyExamImport(existing, plan, decisions = {}) {
  const exams = existing.map(exam => ({ ...exam }));
  const usedTargets = new Set(plan.rows.filter(row => row.current).map(row => row.current.id));
  const rescheduledIds = [];
  const importedIds = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of plan.rows) {
    let targetId = row.current?.id;
    if (row.kind === "conflict") {
      const decision = decisions[row.key];
      if (decision?.action !== "keep" && decision?.action !== "replace") throw new Error("请逐项确认疑似改期的考试：保留两场，或替换已有考试。");
      if (decision.action === "replace") {
        if (!row.candidates.some(item => item.id === decision.targetId) || usedTargets.has(decision.targetId)) throw new Error("替换目标无效或已被其他考试使用，请重新选择。");
        targetId = decision.targetId;
        usedTargets.add(targetId);
        rescheduledIds.push(targetId);
      }
    }
    if (targetId) {
      const index = exams.findIndex(exam => exam.id === targetId);
      if (index < 0) throw new Error("考试数据已变化，请重新导入。");
      if (row.kind === "unchanged") unchanged += 1;
      else {
        if (["date", "time", "duration"].some(field => clean(exams[index][field]) !== clean(row.incoming[field])) && !rescheduledIds.includes(targetId)) rescheduledIds.push(targetId);
        exams[index] = { ...exams[index], ...row.incoming, id: targetId };
        updated += 1;
      }
      importedIds.push(targetId);
    } else {
      let id = String(row.incoming.id || `exam-${randomUUID()}`);
      if (exams.some(exam => exam.id === id)) id = `exam-${randomUUID()}`;
      exams.push({ ...row.incoming, id });
      importedIds.push(id);
      added += 1;
    }
  }
  return { exams, importedIds, rescheduledIds, added, updated, unchanged, count: plan.count };
}

// Completed tasks remain a historical record, independent of later schedule changes.
function unlinkExamTodos(tasks, examIds, removePending = false) {
  const ids = new Set(examIds.map(String));
  return tasks.flatMap(task => {
    if (task.sourceType !== "exam" || !ids.has(String(task.sourceId))) return [task];
    if (!task.completed) return removePending ? [] : [task];
    return [{ ...task, sourceType: null, sourceId: null }];
  });
}

function createPendingExamImports({ ttlMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const pending = new Map();
  const prune = () => { for (const [token, value] of pending) if (value.expiresAt <= now()) pending.delete(token); };
  return {
    prepare(existing, incoming, owner) {
      prune();
      // One review per desktop window; opening another file invalidates its old review.
      for (const [token, value] of pending) if (value.owner === owner) pending.delete(token);
      const token = randomUUID();
      const plan = planExamImport(existing, incoming);
      const expiresAt = now() + ttlMs;
      pending.set(token, { plan, owner, expiresAt, snapshot: JSON.stringify(existing) });
      return { status: "preview", token, expiresAt, ...plan };
    },
    resolve(token, existing, decisions, owner) {
      prune();
      const value = pending.get(token);
      if (!value || value.owner !== owner) throw new Error("导入预览已过期，请重新选择考试表。");
      if (value.snapshot !== JSON.stringify(existing)) throw new Error("考试数据在预览后发生了变化，请重新导入并核对。");
      return applyExamImport(existing, value.plan, decisions);
    },
    discard(token, owner) {
      if (pending.get(token)?.owner === owner) pending.delete(token);
    }
  };
}

module.exports = { occurrenceKey, planExamImport, applyExamImport, unlinkExamTodos, createPendingExamImports };
