const assert = require("node:assert/strict");
const { getWaterReminderDueAt, safeMinutes } = require("../electron/water-reminder");

const at = value => new Date(`2026-07-30T${value}:00`);
const settings = {
  workStart: "09:30",
  staleMinutes: 60,
  repeatUntilLogged: true,
  snoozeMinutes: 15
};

assert.equal(
  getWaterReminderDueAt({
    now: at("12:00"),
    settings,
    fallbackActivityAt: at("12:00"),
    reminderKey: "today"
  }).getTime(),
  at("13:00").getTime(),
  "没有饮水记录时，应从本次启动时间计算首次间隔"
);

assert.equal(
  getWaterReminderDueAt({
    now: at("08:00"),
    settings,
    fallbackActivityAt: at("08:00"),
    reminderKey: "today"
  }).getTime(),
  at("10:30").getTime(),
  "工作开始前启动时，应从工作开始时间计算"
);

assert.equal(
  getWaterReminderDueAt({
    now: at("11:00"),
    settings,
    lastEntryAt: at("10:15"),
    fallbackActivityAt: at("08:00"),
    reminderKey: "one-cup"
  }).getTime(),
  at("11:15").getTime(),
  "已有饮水记录时，应从最后一次饮水计算"
);

assert.equal(
  getWaterReminderDueAt({
    now: at("12:10"),
    settings,
    lastReminder: { key: "today", at: at("12:00").toISOString() },
    reminderKey: "today"
  }).getTime(),
  at("12:15").getTime(),
  "重复提醒应从上一次通知时间计算"
);

assert.equal(
  getWaterReminderDueAt({
    now: at("12:10"),
    settings: { ...settings, repeatUntilLogged: false },
    lastReminder: { key: "today", at: at("12:00").toISOString() },
    reminderKey: "today"
  }),
  null,
  "关闭重复提醒后，同一饮水状态只能提醒一次"
);

assert.equal(
  getWaterReminderDueAt({
    now: at("12:10"),
    settings: { ...settings, snoozeMinutes: 30 },
    lastReminder: { key: "today", at: at("12:00").toISOString() },
    reminderKey: "today"
  }).getTime(),
  at("12:30").getTime(),
  "修改重复间隔后，应基于上次通知重新计算而不是立即提醒"
);

assert.equal(safeMinutes("3", 60, 10, 240), 10);
assert.equal(safeMinutes("999", 60, 10, 240), 240);
assert.equal(safeMinutes("invalid", 60, 10, 240), 60);

process.stdout.write("喝水提醒时间计算验证通过。\n");
