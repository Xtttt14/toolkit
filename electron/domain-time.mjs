const DAY_MS = 86400000;
const pad = value => String(value).padStart(2, "0");

export function parseLocalDate(value = new Date()) {
  if (value instanceof Date) return new Date(value.getTime());
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : new Date(NaN);
}

export function localDateKey(value = new Date()) {
  const date = parseLocalDate(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Compare calendar days rather than elapsed hours, including across DST changes.
export function calendarDayDifference(target, reference = new Date()) {
  const left = parseLocalDate(target);
  const right = parseLocalDate(reference);
  return (Date.UTC(left.getFullYear(), left.getMonth(), left.getDate())
    - Date.UTC(right.getFullYear(), right.getMonth(), right.getDate())) / DAY_MS;
}

export function startOfLocalWeek(value = new Date()) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function academicWeek(startDate, now = new Date()) {
  if (!startDate) return null;
  const days = calendarDayDifference(startOfLocalWeek(now), startOfLocalWeek(startDate));
  return Number.isFinite(days) ? Math.floor(days / 7) + 1 : null;
}

export function calendarMonthStart(value = new Date()) {
  const date = parseLocalDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function calendarMonthDays(value = new Date()) {
  const first = startOfLocalWeek(calendarMonthStart(value));
  if (Number.isNaN(first.getTime())) return [];
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

export function getExamTiming(exam) {
  const times = String(exam.time || "").match(/(?:[01]?\d|2[0-3]):[0-5]\d/g) || [];
  const startTime = times[0] || "23:59";
  const at = time => new Date(`${exam.date}T${time.padStart(5, "0")}:00`);
  const startAt = at(startTime);
  let endAt = times[1] ? at(times[1]) : null;
  if (endAt && endAt < startAt) endAt.setDate(endAt.getDate() + 1);
  if (!endAt && times[0]) {
    const durationText = String(exam.duration || "");
    const hours = durationText.match(/(\d+(?:\.\d+)?)\s*(?:小时|h)/i);
    const minutes = durationText.match(/(\d+)\s*(?:分钟|分|min)/i);
    const duration = Math.round((Number(hours?.[1]) || 0) * 60 + (Number(minutes?.[1]) || 0));
    if (duration > 0) endAt = new Date(startAt.getTime() + duration * 60000);
  }
  if (!endAt || Number.isNaN(endAt.getTime())) endAt = at("23:59");
  return { startTime, startAt, endAt, hasStartTime: times.length > 0 };
}

export function examStatus(exam, now = new Date()) {
  const { startAt, endAt, hasStartTime } = getExamTiming(exam);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return "invalid";
  if (endAt <= now) return "ended";
  return hasStartTime && startAt <= now ? "ongoing" : "upcoming";
}
