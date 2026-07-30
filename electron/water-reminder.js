function safeMinutes(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function timeOnDate(now, value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  const hour = match ? Math.max(0, Math.min(23, Number(match[1]))) : 0;
  const minute = match ? Math.max(0, Math.min(59, Number(match[2]))) : 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
}

function validTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getWaterReminderDueAt({
  now = new Date(),
  settings = {},
  lastEntryAt = null,
  fallbackActivityAt = null,
  lastReminder = null,
  reminderKey = ""
} = {}) {
  const current = now instanceof Date ? now : new Date(now);
  const workStartAt = timeOnDate(current, settings.workStart || "00:00").getTime();
  const lastDrinkAt = validTimestamp(lastEntryAt);
  const fallbackAt = validTimestamp(fallbackActivityAt);
  const activityAt = lastDrinkAt === null
    ? Math.max(workStartAt, fallbackAt ?? workStartAt)
    : Math.max(workStartAt, lastDrinkAt);
  const staleMinutes = safeMinutes(settings.staleMinutes, 60, 1, 24 * 60);

  if (lastReminder?.key === reminderKey) {
    if (!settings.repeatUntilLogged) return null;
    const reminderAt = validTimestamp(lastReminder.at);
    if (reminderAt !== null) {
      const repeatMinutes = safeMinutes(settings.snoozeMinutes, 15, 1, 24 * 60);
      return new Date(reminderAt + repeatMinutes * 60000);
    }
  }

  return new Date(activityAt + staleMinutes * 60000);
}

module.exports = {
  getWaterReminderDueAt,
  safeMinutes
};
