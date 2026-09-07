const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

if (!process.env.TODO_DATE_TEST_CHILD) {
  for (const timezone of ["Asia/Shanghai", "America/Los_Angeles"]) {
    const result = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, TZ: timezone, TODO_DATE_TEST_CHILD: "1" },
      encoding: "utf8"
    });
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  verify().catch(error => { console.error(error); process.exitCode = 1; });
}

async function verify() {
  const domainTime = await import(pathToFileURL(path.join(root, "electron/domain-time.mjs")));
  const source = fs.readFileSync(path.join(root, "src/modules/todo/TodoView.jsx"), "utf8");
  const context = vm.createContext({ ...domainTime, Date, Intl });
  vm.runInContext(source.slice(source.indexOf("function formatDateInput"), source.indexOf("export default function TodoView")), context);
  const { formatDateDisplay, formatDateInput, isOverdue, updateDeadlineDate } = context;
  const now = new Date(2026, 8, 7, 10);
  assert.equal(formatDateDisplay("2026-09-07T20:00:00", now), "今天 20:00");
  assert.equal(formatDateDisplay("2026-09-07T09:00:00", now), "今天 09:00");
  assert.equal(isOverdue("2026-09-07T09:00:00", now), true);
  assert.equal(isOverdue("2026-09-07T20:00:00", now), false);
  assert.equal(isOverdue("2026-09-07T10:00:00", now), false);
  assert.equal(isOverdue("2026-09-07T09:59:59", now), true);
  assert.equal(formatDateDisplay("2026-09-08T00:05:00", new Date(2026, 8, 7, 23, 55)), "明天 00:05");
  assert.equal(formatDateDisplay("2026-09-06T23:55:00", new Date(2026, 8, 7, 0, 5)), "昨天 23:55");
  assert.equal(formatDateDisplay("2026-09-07", now), "今天");
  assert.equal(formatDateInput("2026-09-07"), "2026-09-07");
  assert.equal(isOverdue("2026-09-07", new Date(2026, 8, 7, 23, 59, 59, 999)), false);
  assert.equal(isOverdue("2026-09-07", new Date(2026, 8, 8, 0)), true);
  assert.equal(isOverdue(null, now), false);
  assert.equal(isOverdue("invalid", now), false);
  assert.equal(formatDateDisplay("invalid", now), "日期无效");
  assert.equal(formatDateInput("2026-02-30"), "");
  // Calendar labels must survive both the 23-hour and 25-hour DST boundaries.
  assert.equal(formatDateDisplay("2026-03-09T01:00:00", new Date(2026, 2, 8, 1)), "明天 01:00");
  assert.equal(formatDateDisplay("2026-11-02T01:00:00", new Date(2026, 10, 1, 1)), "明天 01:00");
  const imported = "2026-09-06T20:15:40.125Z";
  const importedLocal = new Date(imported);
  const inputDate = domainTime.localDateKey(importedLocal);
  assert.equal(formatDateInput(imported), inputDate);
  assert.equal(updateDeadlineDate(imported, inputDate), imported, "Unchanged date must preserve the original timestamp exactly");
  assert.equal(updateDeadlineDate("2026-09-07", "2026-09-07"), "2026-09-07");
  const followingDay = new Date(importedLocal);
  followingDay.setDate(followingDay.getDate() + 1);
  const changed = new Date(updateDeadlineDate(imported, domainTime.localDateKey(followingDay)));
  assert.equal(changed.getTime(), followingDay.getTime(), "Changing the date must retain local clock time and milliseconds");
  assert.equal(updateDeadlineDate(null, "2026-09-09"), "2026-09-09T23:59:00");
  assert.equal(updateDeadlineDate(imported, ""), null);

  const appSource = fs.readFileSync(path.join(root, "src/modules/TodoApp.jsx"), "utf8");
  vm.runInContext(appSource.slice(appSource.indexOf("function subscribeTodoData"), appSource.indexOf("export default function TodoApp")), context);
  const subscribe = context.subscribeTodoData;
  const empty = { tasks: [], tags: [] };
  const fresh = { tasks: [{ id: "newer" }], tags: [] };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  function setup(request = deferred()) {
    const values = [], errors = [], order = [];
    let listener, offCount = 0;
    const api = {
      onChanged(callback) { order.push("subscribe"); listener = callback; return () => { offCount += 1; }; },
      getAll() { order.push("read"); return request.promise; }
    };
    const off = subscribe(api, data => values.push(data), error => errors.push(error));
    assert.deepEqual(order, ["subscribe", "read"]);
    return { request, values, errors, emit: data => listener(data), off, offCount: () => offCount };
  }
  const initial = setup();
  initial.request.resolve(empty);
  await settle();
  assert.equal(initial.values[0], empty, "A successfully loaded empty collection is valid data");
  initial.off();

  const failed = setup();
  failed.request.reject(new Error("read failed"));
  await settle();
  assert.equal(failed.errors.length, 1);
  assert.equal(failed.values.length, 0);
  failed.off();
  const retry = setup();
  retry.request.resolve(fresh);
  await settle();
  assert.equal(retry.values[0], fresh);
  retry.off();

  for (const rejectRead of [false, true]) {
    const race = setup();
    race.emit(fresh);
    if (rejectRead) race.request.reject(new Error("stale error"));
    else race.request.resolve(empty);
    await settle();
    assert.deepEqual(race.values, [fresh], "Pushed updates must win over a stale initial read");
    assert.equal(race.errors.length, 0, "A stale read error must not hide a newer valid snapshot");
    race.off();
  }
  const unmounted = setup();
  unmounted.off();
  unmounted.emit(fresh);
  unmounted.request.resolve(empty);
  await settle();
  assert.equal(unmounted.offCount(), 1);
  assert.equal(unmounted.values.length, 0);
  assert.equal(unmounted.errors.length, 0);

  const invalid = setup();
  invalid.request.resolve(null);
  await settle();
  assert.equal(invalid.errors.length, 1, "Malformed responses must show failure, not an empty task list");
  invalid.emit(fresh);
  assert.equal(invalid.values[0], fresh, "A later valid push can recover a failed load");
  invalid.off();
  console.log(`待办日期、时区、保留截止时间、加载失败、重试及事件竞态检查通过（${process.env.TZ}）。`);
}
