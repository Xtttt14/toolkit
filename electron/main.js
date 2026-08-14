const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, Notification, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const { getWaterReminderDueAt, safeMinutes } = require("./water-reminder");
const { parseSchedule, parseExams } = require("./academic-parser");
const { startFeishuBridge } = require("./feishu-bridge");

const isDev = !app.isPackaged;
const waterReminderSessionStartedAt = new Date();
const userDataPath = process.env.PERSONAL_TOOLBOX_USER_DATA
  || path.join(app.getPath("appData"), "personal-toolbox");
app.setPath("userData", userDataPath);
app.setName("个人工具箱");

function loadBridgeEnvironment() {
  const installedConfig = path.join(userDataPath, ".env");
  // 开发版继续兼容项目根目录的 .env；安装版只读取用户数据目录，避免凭据进入安装包。
  const paths = [installedConfig];
  if (isDev) paths.push(path.join(__dirname, "..", ".env"));
  paths.forEach(envPath => dotenv.config({ path: envPath, override: false, quiet: true }));
  const examplePath = path.join(userDataPath, "feishu-bridge.env.example");
  if (!fs.existsSync(installedConfig) && !fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, "FEISHU_APP_ID=\nFEISHU_APP_SECRET=\nFEISHU_ALLOWED_OPEN_ID=\nDEEPSEEK_API_KEY=\n", "utf8");
  }
}

loadBridgeEnvironment();

// ─── 饮水提醒 默认设置 ───
const defaultWaterSettings = {
  targetCups: 8,
  cupProfiles: [
    { id: "cup-200", name: "日常水杯", ml: 200 },
    { id: "cup-300", name: "大杯", ml: 300 },
    { id: "cup-500", name: "瓶装水", ml: 500 }
  ],
  selectedCupId: null,
  hasChosenCup: false,
  targetCupsByCupId: {},
  workStart: "09:30",
  workEnd: "18:30",
  staleMinutes: 60,
  repeatUntilLogged: true,
  snoozeMinutes: 15,
  progressMode: "cups"
};

// ─── 工具箱默认设置 ───
const defaultAppSettings = {
  showClosePrompt: true,
  closeAction: "hide",
  mainWindowShortcut: "Control+Shift+X",
  launchAtLogin: false
};
const supportedMainWindowShortcuts = ["Control+Shift+X", "Control+Shift+Z", "Control+Alt+X", "Control+Alt+Z"];

// ─── 待办 默认设置 ───
const defaultTodoData = {
  tasks: [],
  tags: []
};

// ─── 记账 默认设置 ───
const defaultFinanceData = {
  entries: [],
  customTags: { income: [], expense: [] },
  tagSettings: {
    income: { order: [], hidden: [] },
    expense: { order: [], hidden: [] }
  }
};
// ─── 番茄钟 默认数据 ───
const defaultPomodoroData = {
  tasks: [],
  sessions: [],
  tags: ["深度工作", "学习", "阅读"],
  active: null,
  settings: { clockStyle: "halo", ambience: "sunset" }
};
const fixedFinanceTags = {
  income: ["工资", "生活费", "红包", "外快", "股票", "其他"],
  expense: ["三餐", "零食", "衣服", "交通", "旅行", "孩子", "宠物", "话费网费", "烟酒", "学习", "日用品", "住房", "美妆", "医疗", "发红包", "汽车/加油", "娱乐", "请客送礼", "电器数码", "运动", "其他", "水电煤"]
};

let waterStore;
let todoStore;
let financeStore;
let pomodoroStore;
let appStore;
let scheduleStore;
let examsStore;
let mainWindow;
let tray;
let reminderTimer;
let todoReminderTimer;
let academicReminderTimer;
let waterStartupTimer;
let todoStartupTimer;
let pomodoroTimer;
let pomodoroWindowWasMaximized = false;
let quitFallbackTimer;
let lastReminder = null;
let pendingClose = false;
let isQuitting = false;
let closeDialogOpen = false;
let updateState = { status: isDev ? "unsupported" : "idle", version: app.getVersion(), message: "" };
let registeredMainWindowShortcut = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function initStores() {
  waterStore = new Store({ name: "water-data", defaults: { settings: defaultWaterSettings, days: {} } });
  const savedReminder = waterStore.get("_lastReminder", null);
  lastReminder = savedReminder?.key && !Number.isNaN(new Date(savedReminder.at).getTime())
    ? { key: String(savedReminder.key), at: new Date(savedReminder.at).toISOString() }
    : null;
  const legacyWaterSettings = waterStore.get("settings", {});
  appStore = new Store({
    name: "app-data",
    defaults: { settings: defaultAppSettings },
    schema: {
      settings: {
        type: "object",
        default: defaultAppSettings,
        properties: {
          showClosePrompt: { type: "boolean", default: true },
          closeAction: { type: "string", enum: ["hide", "quit"], default: "hide" },
          mainWindowShortcut: { type: "string", enum: supportedMainWindowShortcuts, default: "Control+Shift+X" },
          launchAtLogin: { type: "boolean", default: false }
        }
      }
    }
  });
  if (!appStore.get("_migratedFromWaterSettings", false)) {
    appStore.set("settings", {
      ...defaultAppSettings,
      showClosePrompt: legacyWaterSettings.showClosePrompt ?? defaultAppSettings.showClosePrompt,
      closeAction: legacyWaterSettings.closeAction === "quit" ? "quit" : "hide",
      mainWindowShortcut: defaultAppSettings.mainWindowShortcut
    });
    appStore.set("_migratedFromWaterSettings", true);
  }
  todoStore = new Store({
    name: "todo-data",
    defaults: defaultTodoData,
    schema: {
      tasks: { type: "array", default: [] },
      tags: { type: "array", default: [] }
    }
  });
  financeStore = new Store({
    name: "finance-data",
    defaults: defaultFinanceData,
    schema: {
      entries: { type: "array", default: [] },
      customTags: {
        type: "object",
        default: { income: [], expense: [] },
        properties: {
          income: { type: "array", default: [] },
          expense: { type: "array", default: [] }
        }
      },
      tagSettings: {
        type: "object",
        default: defaultFinanceData.tagSettings
      }
    }
  });
  pomodoroStore = new Store({
    name: "pomodoro-data",
    defaults: defaultPomodoroData,
    schema: {
      tasks: { type: "array", default: [] },
      sessions: { type: "array", default: [] },
      tags: { type: "array", default: [] },
      active: { type: ["object", "null"], default: null },
      settings: { type: "object", default: defaultPomodoroData.settings }
    }
  });
  scheduleStore = new Store({ name: "schedule-data", defaults: { courses: [], startDate: null, settings: { enabled: false, reminderMinutes: 15 } } });
  examsStore = new Store({ name: "exams-data", defaults: { exams: [], settings: { enabled: false, reminderMinutes: 30 } } });
}

function getScheduleData() { return { courses: scheduleStore.get("courses", []), startDate: scheduleStore.get("startDate", null), settings: { enabled: false, reminderMinutes: 15, ...(scheduleStore.get("settings", {}) || {}) } }; }
function getExamsData() { return { exams: examsStore.get("exams", []), settings: { enabled: false, reminderMinutes: 30, ...(examsStore.get("settings", {}) || {}) } }; }
function broadcastAcademic() { sendToAppWindows("academic:schedule-changed", getScheduleData()); sendToAppWindows("academic:exams-changed", getExamsData()); }
function maybeAcademicNotify() {
  const now = new Date(); const key = todayKey(now); const current = now.getHours() * 60 + now.getMinutes(); const sent = new Set(appStore.get("_academicNotified", []));
  const schedule = getScheduleData();
  if (schedule.settings.enabled && schedule.startDate) {
    const start = new Date(`${schedule.startDate}T12:00:00`); const week = Math.floor((new Date(`${key}T12:00:00`) - start) / 604800000) + 1; const weekday = now.getDay();
    schedule.courses.filter(c => c.weekday === weekday && week >= c.startWeek && week <= c.endWeek && (c.pattern === "每周" || (c.pattern === "单周" ? week % 2 : week % 2 === 0))).forEach(c => { const [h,m] = c.startTime.split(":").map(Number); const due = h * 60 + m - Number(schedule.settings.reminderMinutes || 0); const id = `course-${key}-${c.id}`; if (current >= due && current <= due + 1 && !sent.has(id)) { new Notification({ title: "即将上课", body: `${c.name} · ${c.startTime}${c.location ? ` · ${c.location}` : ""}` }).show(); sent.add(id); } });
  }
  const exams = getExamsData();
  if (exams.settings.enabled) exams.exams.filter(e => e.date === key).forEach(e => { const time = (e.time.match(/\d{1,2}:\d{2}/) || [""])[0]; if (!time) return; const [h,m] = time.split(":").map(Number); const due = h * 60 + m - Number(exams.settings.reminderMinutes || 0); const id = `exam-${e.id}`; if (current >= due && current <= due + 1 && !sent.has(id)) { new Notification({ title: "即将考试", body: `${e.name} · ${e.time}${e.location ? ` · ${e.location}` : ""}` }).show(); sent.add(id); } });
  appStore.set("_academicNotified", [...sent].filter(id => !id.includes(`-${key}-`) || sent.has(id)).slice(-500));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
}

function normalizeTodoTask(task = {}) {
  const now = new Date().toISOString();
  const subtasks = Array.isArray(task.subtasks)
    ? task.subtasks.slice(0, 8).map((subtask, index) => ({
        id: String(subtask?.id || `sub-${Date.now()}-${index}`),
        title: String(subtask?.title || "").trim(),
        completed: Boolean(subtask?.completed)
      })).filter(subtask => subtask.title)
    : [];

  return {
    id: String(task.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(task.title || "").trim(),
    description: String(task.description || ""),
    priority: ["P0", "P1", "P2", "P3"].includes(task.priority) ? task.priority : "P3",
    tags: normalizeStringList(task.tags),
    dueDate: task.dueDate && !Number.isNaN(new Date(task.dueDate).getTime()) ? task.dueDate : null,
    reminderMinutes: Math.max(0, Number(task.reminderMinutes) || 0),
    completed: Boolean(task.completed),
    completedAt: task.completedAt || null,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
    subtasks
  };
}

// ─── 应用菜单 ───
function createAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "文件",
      submenu: [
        { label: "显示/隐藏主窗口", accelerator: "Control+Shift+X", click: toggleMainWindow },
        { label: "设置…", accelerator: "CommandOrControl+,", click: () => navigateMainWindow("/settings") },
        { type: "separator" },
        { label: "退出", click: () => quitApp() }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" }
      ]
    }
  ]));
}

function normalizeAppSettings(settings = {}) {
  return {
    showClosePrompt: settings.showClosePrompt !== false,
    closeAction: settings.closeAction === "quit" ? "quit" : "hide",
    mainWindowShortcut: supportedMainWindowShortcuts.includes(settings.mainWindowShortcut)
      ? settings.mainWindowShortcut
      : defaultAppSettings.mainWindowShortcut,
    launchAtLogin: Boolean(settings.launchAtLogin)
  };
}

function getAppSettings() {
  return normalizeAppSettings({
    ...defaultAppSettings,
    ...(appStore?.get("settings", {}) || {})
  });
}

// ─── 日期工具 ───
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function minutesOfDay(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ═══════ 饮水提醒逻辑 ═══════
function getDay(key = todayKey()) {
  const days = waterStore.get("days", {});
  if (!days[key]) { days[key] = { entries: [] }; waterStore.set("days", days); }
  return days[key];
}
function setDay(key, day) {
  const days = waterStore.get("days", {});
  days[key] = day;
  waterStore.set("days", days);
}
function getAllDays() {
  const days = waterStore.get("days", {});
  return Object.fromEntries(
    Object.entries(days).map(([key, day]) => [
      key,
      { entries: Array.isArray(day.entries) ? [...day.entries].sort((a, b) => new Date(a.at) - new Date(b.at)) : [] }
    ])
  );
}
function entryMatchesCup(entry, cup) {
  if (entry.cupId) return entry.cupId === cup.id;
  return Number(entry.ml) === Number(cup.ml);
}
function getWaterState() {
  const settings = { ...defaultWaterSettings, ...waterStore.get("settings", {}) };
  settings.cupProfiles = Array.isArray(settings.cupProfiles) && settings.cupProfiles.length
    ? settings.cupProfiles : defaultWaterSettings.cupProfiles;
  settings.targetCupsByCupId = settings.targetCupsByCupId && typeof settings.targetCupsByCupId === "object"
    ? settings.targetCupsByCupId : {};
  const selectedCup = settings.cupProfiles.find((cup) => cup.id === settings.selectedCupId)
    || settings.cupProfiles[0];
  const selectedTargetCups = Number(settings.targetCupsByCupId[selectedCup.id] || settings.targetCups) || defaultWaterSettings.targetCups;
  settings.targetCups = selectedTargetCups;
  const key = todayKey();
  const day = getDay(key);
  const selectedEntries = day.entries.filter((entry) => entryMatchesCup(entry, selectedCup));
  const totalMl = selectedEntries.reduce((sum, item) => sum + item.ml, 0);
  const cups = selectedEntries.length;
  const targetMl = selectedTargetCups * selectedCup.ml;
  const lastEntry = selectedEntries[selectedEntries.length - 1] || null;
  const days = getAllDays();
  return {
    date: key,
    settings,
    selectedCup,
    today: { entries: selectedEntries, cups, totalMl, targetMl, lastEntry },
    history: { days }
  };
}

function addDrink(payload = {}) {
  const state = getWaterState();
  const settings = state.settings;
  const selectedCup = state.selectedCup;
  const key = payload.date || todayKey();
  const at = payload.time ? new Date(`${key}T${payload.time}:00`) : new Date();
  const day = getDay(key);
  day.entries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: at.toISOString(),
    ml: Number(payload.ml || selectedCup.ml),
    cupId: selectedCup.id,
    source: payload.source || "button"
  });
  day.entries.sort((a, b) => new Date(a.at) - new Date(b.at));
  setDay(key, day);
  clearWaterReminderState();
  broadcastState();
  if (payload.source === "tray" || payload.source === "menu") {
    new Notification({ title: "已记录一杯水", body: `今天已记录 ${getWaterState().today.cups}/${settings.targetCups} 杯。`, silent: true }).show();
  }
  return getWaterState();
}

function undoDrink() {
  const key = todayKey();
  const state = getWaterState();
  const day = getDay(key);
  const index = [...day.entries]
    .map((entry, idx) => ({ entry, idx }))
    .reverse()
    .find((item) => entryMatchesCup(item.entry, state.selectedCup))?.idx;
  if (index !== undefined) day.entries.splice(index, 1);
  setDay(key, day);
  clearWaterReminderState();
  broadcastState();
  return getWaterState();
}

function inWorkWindow(now, settings) {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= minutesOfDay(settings.workStart) && current <= minutesOfDay(settings.workEnd);
}
function clearWaterReminderState() {
  lastReminder = null;
  waterStore?.delete("_lastReminder");
}

function maybeWaterNotify() {
  const state = getWaterState();
  const { settings, selectedCup, today } = state;
  const now = new Date();
  if (!inWorkWindow(now, settings)) return;
  if (today.cups >= settings.targetCups) return;
  const reminderKey = [state.date, selectedCup.id, today.cups, today.lastEntry?.id || "none"].join("|");
  const dueAt = getWaterReminderDueAt({
    now,
    settings,
    lastEntryAt: today.lastEntry?.at,
    fallbackActivityAt: waterReminderSessionStartedAt,
    lastReminder,
    reminderKey
  });
  if (!dueAt || now < dueAt) return;
  const notification = new Notification({
    title: "该喝水了",
    body: `今天已记录 ${today.cups}/${settings.targetCups} 杯，${today.totalMl}/${today.targetMl}ml。`,
    silent: false
  });
  notification.on("click", showWindow);
  notification.show();
  lastReminder = { key: reminderKey, at: now.toISOString() };
  waterStore.set("_lastReminder", lastReminder);
}

// ═══════ 待办清单逻辑 ═══════
function getTodoData() {
  const tasks = todoStore.get("tasks", []).map(normalizeTodoTask);
  const tags = normalizeStringList(todoStore.get("tags", []));
  return { tasks, tags };
}

function saveTodoData(data) {
  if (data.tasks !== undefined) todoStore.set("tasks", data.tasks.map(normalizeTodoTask));
  if (data.tags !== undefined) todoStore.set("tags", normalizeStringList(data.tags));
}

function maybeTodoNotify() {
  const { tasks } = getTodoData();
  const now = new Date();
  for (const task of tasks) {
    if (task.completed || !task.dueDate || task.reminderMinutes <= 0) continue;
    const dueAt = new Date(task.dueDate);
    if (Number.isNaN(dueAt.getTime())) continue;
    const reminderAt = new Date(dueAt.getTime() - task.reminderMinutes * 60000);
    if (now >= reminderAt && now < dueAt) {
      const lastId = `${task.id}-${task.dueDate}`;
      // avoid spamming the same task repeatedly within 5 min
      const reminded = todoStore.get("_lastTodoReminders", {});
      if (reminded[lastId] && (now - new Date(reminded[lastId])) < 300000) continue;
      const timeLeft = Math.round((dueAt - now) / 60000);
      const notification = new Notification({
        title: `待办提醒: ${task.title}`,
        body: `截止时间还有 ${timeLeft} 分钟 · 优先级 ${task.priority}`,
        silent: false
      });
      notification.on("click", showWindow);
      notification.show();
      reminded[lastId] = now.toISOString();
      todoStore.set("_lastTodoReminders", reminded);
    }
  }
}

// ═══════ 窗口 & 托盘 ═══════
function getAssetPath(name) {
  return isDev ? path.join(__dirname, "assets", name) : path.join(process.resourcesPath, "assets", name);
}

function loadRendererRoute(window, route = "/") {
  if (isDev) {
    return window.loadURL(`http://127.0.0.1:8000/#${route}`);
  }
  return window.loadFile(path.join(__dirname, "../dist/index.html"), { hash: route });
}

function sendToAppWindows(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function navigateMainWindow(route = "/") {
  showWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const send = () => mainWindow?.webContents.send("app:navigate", route);
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
  else send();
}

function applyAppSettings(patch = {}) {
  const current = getAppSettings();
  const next = normalizeAppSettings({ ...current, ...(patch || {}) });
  appStore.set("settings", next);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "launchAtLogin")) {
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, path: process.execPath });
  }
  broadcastAppSettings();
  updateTray();
  return getAppSettings();
}

function broadcastAppSettings() {
  if (!appStore) return;
  sendToAppWindows("app:settings-changed", {
    ...getAppSettings(),
    version: app.getVersion()
  });
}

function createTrayImage() {
  // Windows notification areas render multi-resolution ICO files most reliably.
  for (const name of ["app.ico", "app.png"]) {
    try {
      const assetPath = getAssetPath(name);
      const image = nativeImage.createFromPath(assetPath);
      if (!image.isEmpty()) return image;
    } catch (error) {
      console.warn(`加载托盘图标失败：${name}`, error);
    }
  }

  // Last-resort toolbox mark; keep it aligned with the packaged executable icon.
  const svg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#1179e5"/><path d="M11 12v-1.5A2.5 2.5 0 0 1 13.5 8h5a2.5 2.5 0 0 1 2.5 2.5V12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><rect x="6" y="12" width="20" height="13" rx="3" fill="white"/><path d="M6 17h20" stroke="#1179e5" stroke-width="1.5"/><rect x="14" y="15.5" width="4" height="4" rx="1" fill="#ffbb49"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return true;
  try {
    tray = new Tray(createTrayImage());
    if (tray.isDestroyed()) throw new Error("托盘图标已被系统销毁");
    tray.setTitle("");
    tray.on("click", showWindow);
    tray.on("double-click", showWindow);
    tray.on("right-click", () => tray?.popUpContextMenu());
    updateTray();
    return true;
  } catch (error) {
    tray = null;
    console.error("创建托盘图标失败：", error);
    return false;
  }
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const waterState = getWaterState();
  const appSettings = getAppSettings();
  const percent = Math.min(100, Math.round((waterState.today.totalMl / Math.max(1, waterState.today.targetMl)) * 100));
  const { tasks } = getTodoData();
  const todoPending = tasks.filter(t => !t.completed).length;
  const focus = pomodoroStore ? getPomodoroData().active : null;
  const focusLabel = focus ? ` · 专注中「${focus.title}」` : "";
  tray.setToolTip(`工具箱 · 饮水 ${waterState.today.cups}/${waterState.settings.targetCups}杯 · 待办${todoPending}${focusLabel}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `今日饮水 ${waterState.today.cups}/${waterState.settings.targetCups}杯 · ${percent}%`, enabled: false },
    { label: `待办 ${todoPending} 项未完成`, enabled: false },
    ...(focus ? [{ label: `专注中 · ${focus.title}`, enabled: false }] : []),
    { type: "separator" },
    { label: "加一杯", click: () => addDrink({ source: "tray" }) },
    { label: "显示主窗口", click: showWindow },
    { label: "设置…", click: () => navigateMainWindow("/settings") },
    { type: "separator" },
    { label: "退出", click: () => quitApp() }
  ]));
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) {
    showWindow();
    return;
  }
  hideWindowToTray();
}

function registerMainWindowShortcut(shortcut) {
  const previousShortcut = registeredMainWindowShortcut;
  if (previousShortcut === shortcut && globalShortcut.isRegistered(shortcut)) return true;
  if (previousShortcut) globalShortcut.unregister(previousShortcut);
  if (globalShortcut.register(shortcut, toggleMainWindow)) {
    registeredMainWindowShortcut = shortcut;
    return true;
  }
  if (previousShortcut && globalShortcut.register(previousShortcut, toggleMainWindow)) {
    registeredMainWindowShortcut = previousShortcut;
  }
  return false;
}

function hideWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!ensureTray()) {
    dialog.showErrorBox("无法隐藏到托盘", "托盘图标创建失败。为避免程序在后台不可见，窗口将保持打开。");
    mainWindow.show();
    return false;
  }
  mainWindow.hide();
  broadcastState();
  return true;
}

function normalizeFinanceEntry(entry = {}) {
  const now = new Date().toISOString();
  const amount = Math.round(Math.abs(Number(entry.amount) || 0) * 100) / 100;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || "")) ? String(entry.date) : todayKey();
  return {
    id: String(entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    type: entry.type === "income" ? "income" : "expense",
    amount,
    tag: String(entry.tag || "其他").trim().slice(0, 24) || "其他",
    note: String(entry.note || "").trim().slice(0, 120),
    date,
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now
  };
}

function normalizeFinanceTags(tags = {}) {
  return {
    income: normalizeStringList(tags.income).map(item => item.slice(0, 12)),
    expense: normalizeStringList(tags.expense).map(item => item.slice(0, 12))
  };
}

function normalizeFinanceTagSettings(settings = {}, customTags = {}) {
  return Object.fromEntries(["income", "expense"].map(type => {
    const available = [...fixedFinanceTags[type], ...normalizeFinanceTags(customTags)[type]];
    const value = settings?.[type] || {};
    const hidden = normalizeStringList(value.hidden).filter(tag => available.includes(tag));
    const listed = normalizeStringList(value.order).filter(tag => available.includes(tag) && !hidden.includes(tag));
    return [type, { order: [...listed, ...available.filter(tag => !hidden.includes(tag) && !listed.includes(tag))], hidden }];
  }));
}

function normalizeTotalProjectRecord(record = {}) {
  const now = new Date().toISOString();
  return {
    id: String(record.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    amount: Math.round(Math.abs(Number(record.amount) || 0) * 100) / 100,
    note: String(record.note || "").trim().slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || "")) ? String(record.date) : null,
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now
  };
}

function normalizeTotalProjects(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.slice(0, 100).map((project, index) => {
    const now = new Date().toISOString();
    const linkedEntryIds = [...new Set((Array.isArray(project.linkedEntryIds) ? project.linkedEntryIds : [])
      .map(id => String(id)).filter(Boolean))];
    return {
      id: String(project.id || `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
      name: String(project.name || "未命名项目").trim().slice(0, 40) || "未命名项目",
      linkedEntryIds,
      records: (Array.isArray(project.records) ? project.records : [])
        .map(normalizeTotalProjectRecord).filter(record => record.amount > 0),
      createdAt: project.createdAt || now,
      updatedAt: project.updatedAt || now
    };
  });
}

function getFinanceData() {
  const entries = financeStore.get("entries", [])
    .map(normalizeFinanceEntry)
    .filter(entry => entry.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const customTags = normalizeFinanceTags(financeStore.get("customTags", {}));
  const tagSettings = normalizeFinanceTagSettings(financeStore.get("tagSettings", {}), customTags);
  const totalProjects = normalizeTotalProjects(financeStore.get("totalProjects", []));
  return { version: 3, entries, customTags, tagSettings, totalProjects };
}

function saveFinanceData(data) {
  if (data.entries !== undefined) {
    financeStore.set("entries", data.entries.map(normalizeFinanceEntry).filter(entry => entry.amount > 0));
  }
  if (data.customTags !== undefined) financeStore.set("customTags", normalizeFinanceTags(data.customTags));
  if (data.tagSettings !== undefined) {
    financeStore.set("tagSettings", normalizeFinanceTagSettings(data.tagSettings, data.customTags ?? financeStore.get("customTags", {})));
  }
  if (data.totalProjects !== undefined) financeStore.set("totalProjects", normalizeTotalProjects(data.totalProjects));
}

function broadcastFinance() {
  sendToAppWindows("finance:changed", getFinanceData());
}

function feishuHistory() { return appStore.get("_feishuActionHistory", []); }
function saveFeishuHistory(history) { appStore.set("_feishuActionHistory", history.slice(-100)); }
function remember(action) { saveFeishuHistory([...feishuHistory(), action]); }
function getFeishuConversation(openId) {
  const conversations = appStore.get("_feishuConversations", {});
  return Array.isArray(conversations[String(openId)]) ? conversations[String(openId)] : [];
}
function saveFeishuConversation(openId, messages) {
  const conversations = appStore.get("_feishuConversations", {});
  conversations[String(openId)] = (Array.isArray(messages) ? messages : []).slice(-80);
  appStore.set("_feishuConversations", conversations);
}
function getFeishuRuntimeState(openId) {
  const states = appStore.get("_feishuRuntimeStates", {});
  const state = states[String(openId)];
  return state && typeof state === "object" ? state : {};
}
function saveFeishuRuntimeState(openId, state) {
  const states = appStore.get("_feishuRuntimeStates", {});
  states[String(openId)] = state && typeof state === "object" ? state : {};
  appStore.set("_feishuRuntimeStates", states);
}
function label(entity, item) {
  if (entity === "todo") return `待办「${item.title}」${item.dueDate ? `（${item.dueDate.slice(0, 10)}）` : ""}`;
  if (entity === "finance") return `${item.type === "income" ? "收入" : "支出"}${item.amount}元·${item.tag}${item.note ? `·${item.note}` : ""}（${item.date}）`;
  if (entity === "total") return `总计「${item.name}」`;
  return `饮水${item.ml}ml（${new Date(item.at).toLocaleString("zh-CN", { hour12: false })}）`;
}
function candidates(entity, query = {}) {
  const includes = (value) => !query.text || String(value).toLowerCase().includes(String(query.text).toLowerCase());
  if (entity === "todo") return getTodoData().tasks.filter(item => includes(`${item.title} ${item.description}`) && (!query.date || item.dueDate?.startsWith(query.date))).slice(0, 8).map(item => ({ entity, id: item.id, label: label(entity, item) }));
  if (entity === "finance") return getFinanceData().entries.filter(item => includes(`${item.tag} ${item.note}`) && (query.amount == null || Number(item.amount) === Number(query.amount)) && (!query.date || item.date === query.date) && (!query.tag || item.tag === query.tag)).slice(0, 8).map(item => ({ entity, id: item.id, label: label(entity, item) }));
  if (entity === "total") return getFinanceData().totalProjects.filter(item => includes(item.name)).slice(0, 8).map(item => ({ entity, id: item.id, label: label(entity, item) }));
  if (entity === "water") return Object.entries(getAllDays()).flatMap(([date, day]) => day.entries.map(item => ({ ...item, date }))).filter(item => (!query.date || item.date === query.date) && (query.ml == null || Number(item.ml) === Number(query.ml))).slice(-8).reverse().map(item => ({ entity, id: item.id, date: item.date, label: label(entity, item) }));
  return [];
}
function removeWater(id, date) { const day = getDay(date); const index = day.entries.findIndex(item => item.id === id); if (index < 0) throw new Error("饮水记录不存在"); const [item] = day.entries.splice(index, 1); setDay(date, day); clearWaterReminderState(); broadcastState(); return item; }
function restore(entity, item, date) {
  if (entity === "todo") { const data = getTodoData(); data.tasks.push(item); saveTodoData(data); broadcastState(); }
  else if (entity === "finance") { const data = getFinanceData(); data.entries.push(item); saveFinanceData(data); broadcastFinance(); }
  else if (entity === "total") { const data = getFinanceData(); data.totalProjects.push(item); saveFinanceData(data); broadcastFinance(); }
  else { const day = getDay(date); day.entries.push(item); setDay(date, day); broadcastState(); }
}
function undoLast() {
  const history = feishuHistory(); const last = history.pop(); if (!last) return "没有可撤回的飞书操作。";
  if (last.kind === "total-record-add") {
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === last.projectId);
    if (!project) throw new Error("总计项目不存在");
    const index = project.records.findIndex(item => item.id === last.id); if (index < 0) throw new Error("总计独立记录不存在");
    project.records.splice(index, 1); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
  }
  else if (last.kind === "total-record-delete") {
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === last.projectId);
    if (!project) throw new Error("总计项目不存在");
    const restored = last.records.filter(record => !project.records.some(item => item.id === record.id));
    project.records.unshift(...restored); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
  }
  else if (last.kind === "total-link-delete") {
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === last.projectId);
    if (!project) throw new Error("总计项目不存在");
    if (!project.linkedEntryIds.includes(last.entryId)) project.linkedEntryIds.push(last.entryId);
    project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
  }
  else if (last.kind === "add-linked-finance") {
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === last.projectId);
    if (project) project.linkedEntryIds = project.linkedEntryIds.filter(id => !last.entryIds.includes(id));
    data.entries = data.entries.filter(item => !last.entryIds.includes(item.id));
    saveFinanceData(data); broadcastFinance();
  }
  else if (last.kind === "add") applySelection({ entity: last.entity, id: last.id, date: last.date }, {}, "delete", false);
  else if (last.kind === "delete") restore(last.entity, last.before, last.date);
  else applySelection({ entity: last.entity, id: last.id, date: last.date }, last.before, "update", false);
  saveFeishuHistory(history); return `已撤回：${last.label}`;
}
function undoPreview() {
  const last = feishuHistory().at(-1); if (!last) return { text: "没有可撤回的飞书操作。" };
  const deletesData = (last.kind === "add" && last.entity !== "water") || last.kind === "total-record-add";
  return { undoPreview: { requiresConfirmation: deletesData, label: last.label, text: deletesData ? `将撤回并删除：${last.label}` : `将撤回：${last.label}` } };
}
function applySelection(target, patch, operation, track = true) {
  const { entity, id, date } = target;
  if (entity === "todo") { const data = getTodoData(); const index = data.tasks.findIndex(item => item.id === id); if (index < 0) throw new Error("待办不存在"); const before = data.tasks[index]; if (operation === "delete") data.tasks.splice(index, 1); else data.tasks[index] = normalizeTodoTask({ ...before, ...patch, id, createdAt: before.createdAt, updatedAt: new Date().toISOString() }); saveTodoData(data); broadcastState(); const current = operation === "delete" ? before : data.tasks[index]; if (track) remember({ kind: operation === "delete" ? "delete" : "update", entity, id, before, label: label(entity, current) }); return `${operation === "delete" ? "已撤回" : "已修改"}${label(entity, current)}`; }
  if (entity === "finance") { const data = getFinanceData(); const index = data.entries.findIndex(item => item.id === id); if (index < 0) throw new Error("账单不存在"); const before = data.entries[index]; if (operation === "delete") data.entries.splice(index, 1); else { const next = normalizeFinanceEntry({ ...before, ...patch, id, createdAt: before.createdAt, updatedAt: new Date().toISOString() }); if (next.amount <= 0) throw new Error("金额必须大于0"); data.entries[index] = next; } saveFinanceData(data); broadcastFinance(); const current = operation === "delete" ? before : data.entries[index]; if (track) remember({ kind: operation === "delete" ? "delete" : "update", entity, id, before, label: label(entity, current) }); return `${operation === "delete" ? "已撤回" : "已修改"}${label(entity, current)}`; }
  if (entity === "total") { const data = getFinanceData(); const index = data.totalProjects.findIndex(item => item.id === id); if (index < 0) throw new Error("总计项目不存在"); const before = data.totalProjects[index]; if (operation === "delete") data.totalProjects.splice(index, 1); else data.totalProjects[index] = normalizeTotalProjects([{ ...before, ...patch, id, createdAt: before.createdAt, updatedAt: new Date().toISOString() }])[0]; saveFinanceData(data); broadcastFinance(); const current = operation === "delete" ? before : data.totalProjects[index]; if (track) remember({ kind: operation === "delete" ? "delete" : "update", entity, id, before, label: label(entity, current) }); return `${operation === "delete" ? "已撤回" : "已修改"}${label(entity, current)}`; }
  const day = getDay(date); const index = day.entries.findIndex(item => item.id === id); if (index < 0) throw new Error("饮水记录不存在"); const before = day.entries[index]; if (operation === "delete") removeWater(id, date); else { day.entries[index] = { ...before, ml: Number(patch.ml || before.ml) }; if (!(day.entries[index].ml > 0)) throw new Error("饮水量必须大于0"); setDay(date, day); broadcastState(); } const current = operation === "delete" ? before : day.entries[index]; if (track) remember({ kind: operation === "delete" ? "delete" : "update", entity, id, date, before, label: label(entity, current) }); return `${operation === "delete" ? "已撤回" : "已修改"}${label(entity, current)}`;
}
function addTotalProjectRecord(projectId, rawRecord) {
  const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === projectId);
  if (!project) throw new Error("总计项目不存在");
  const record = normalizeTotalProjectRecord(rawRecord);
  if (record.amount <= 0) throw new Error("金额必须大于0");
  project.records.unshift(record); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
  const recordLabel = `${record.amount}元${record.note ? `·${record.note}` : ""}${record.date ? `（${record.date}）` : ""}`;
  remember({ kind: "total-record-add", projectId: project.id, id: record.id, label: `${label("total", project)}中的独立记录${recordLabel}` });
  return { text: `已在${label("total", project)}新增独立记录${recordLabel}` };
}
function normalizeTotalRecordSearchText(value) {
  return String(value || "").toLowerCase().replace(/用于/g, "").replace(/购买/g, "买").replace(/[\s·，,。()（）]/g, "");
}
function totalRecordDeleteCandidates(query = {}) {
  const text = normalizeTotalRecordSearchText(query.text);
  const data = getFinanceData();
  const found = data.totalProjects.flatMap(project => {
    const direct = project.records.map(record => ({ kind: "direct", projectId: project.id, recordId: record.id, label: `${label("total", project)}·直接添加${record.amount}元${record.note ? `·${record.note}` : ""}${record.date ? `（${record.date}）` : ""}`, search: `${project.name} ${record.note}` }));
    const linked = data.entries.filter(entry => project.linkedEntryIds.includes(entry.id)).map(entry => ({ kind: "linked", projectId: project.id, entryId: entry.id, label: `${label("total", project)}·关联账单${entry.amount}元·${entry.tag}${entry.note ? `·${entry.note}` : ""}（${entry.date}）`, search: `${project.name} ${entry.tag} ${entry.note}` }));
    return [...direct, ...linked];
  });
  return found.filter(item => !text || normalizeTotalRecordSearchText(item.search).includes(text)).slice(0, 8).map(({ search, ...item }) => item);
}
function executeFeishuAction(plan) {
  if (plan.kind === "undo_last") return { text: undoLast() };
  if (plan.kind === "undo-last-preview") return undoPreview();
  if (plan.kind === "find") { const found = candidates(plan.entity, plan.query); return found.length ? { candidates: found } : { text: "没有找到匹配的记录。" }; }
  if (plan.kind === "link") {
    const finance = candidates("finance", plan.query); const total = candidates("total", plan.totalQuery);
    if (!finance.length || !total.length) return { text: !finance.length ? "没有找到要关联的账单。" : "没有找到要关联的总计项目。" };
    return { linkCandidates: { finance, total } };
  }
  if (plan.kind === "link-select") {
    const data = getFinanceData(); const entry = data.entries.find(item => item.id === plan.financeId); const project = data.totalProjects.find(item => item.id === plan.totalId);
    if (!entry || !project) throw new Error("账单或总计项目不存在");
    if (!project.linkedEntryIds.includes(entry.id)) { project.linkedEntryIds.push(entry.id); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance(); }
    return { text: `已将${label("finance", entry)}关联到${label("total", project)}` };
  }
  if (plan.kind === "update_recent_finance") {
    const latest = [...feishuHistory()].reverse().find(item => (item.kind === "add" && item.entity === "finance") || item.kind === "add-linked-finance");
    const id = latest?.id || latest?.entryIds?.at(-1);
    if (!id) return { text: "没有找到可修改的最近账单。请说明账单金额、日期或备注。" };
    return { text: applySelection({ entity: "finance", id }, plan.patch || {}, "update") };
  }
  if (plan.kind === "add_and_link_finance") {
    const total = candidates("total", plan.totalQuery);
    if (!total.length) return { text: `没有找到总计项目「${plan.totalQuery?.text || ""}」，未创建账单。` };
    if (total.length > 1) return { text: `找到多个匹配的总计项目「${plan.totalQuery?.text || ""}」，未创建账单。请使用更完整的项目名称。` };
    const dates = [...new Set((Array.isArray(plan.patch?.dates) ? plan.patch.dates : [plan.patch?.date || todayKey()]).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(String(date))))];
    if (!dates.length) throw new Error("账单日期无效");
    const items = dates.map(date => normalizeFinanceEntry({ type: plan.patch?.type === "income" ? "income" : "expense", amount: plan.patch?.amount, tag: plan.patch?.tag || "其他", note: plan.patch?.note || "", date }));
    if (items.some(item => item.amount <= 0)) throw new Error("金额必须大于0");
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === total[0].id);
    data.entries.push(...items);
    project.linkedEntryIds = [...new Set([...project.linkedEntryIds, ...items.map(item => item.id)])];
    project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
    remember({ kind: "add-linked-finance", projectId: project.id, entryIds: items.map(item => item.id), label: `${items.map(item => label("finance", item)).join("、")}与${label("total", project)}的关联` });
    return { text: `${items.map(item => `已新增${label("finance", item)}`).join("\n")}\n已关联到${label("total", project)}。` };
  }
  if (plan.kind === "find-total-record-delete") {
    const candidates = totalRecordDeleteCandidates(plan.query);
    return candidates.length ? { totalRecordDeleteCandidates: candidates } : { text: "没有找到匹配的总计明细，未执行删除。" };
  }
  if (plan.kind === "list-total-records") {
    const total = candidates("total", plan.query);
    if (!total.length) return { text: "没有找到该总计项目。" };
    if (total.length > 1) return { text: "找到多个匹配的总计项目，请提供更完整的项目名称。" };
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === total[0].id);
    const direct = project.records.map(record => ({ kind: "direct", projectId: project.id, recordId: record.id, date: record.date, createdAt: record.createdAt, label: `直接添加${record.amount}元${record.note ? `·${record.note}` : ""}${record.date ? `（${record.date}）` : ""}` }));
    const linked = data.entries.filter(entry => project.linkedEntryIds.includes(entry.id)).map(entry => ({ kind: "linked", projectId: project.id, entryId: entry.id, date: entry.date, createdAt: entry.createdAt, label: `关联账单${entry.amount}元·${entry.tag}${entry.note ? `·${entry.note}` : ""}（${entry.date}）` }));
    const count = Math.max(1, Math.min(20, Math.floor(Number(plan.count) || 5)));
    const records = [...direct, ...linked].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, count);
    return { totalRecordList: { projectName: project.name, records } };
  }
  if (plan.kind === "delete-total-record-select") {
    const target = plan.target || {}; const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === target.projectId);
    if (!project) throw new Error("总计项目不存在");
    if (target.kind === "direct") {
      const index = project.records.findIndex(item => item.id === target.recordId); if (index < 0) throw new Error("总计独立记录不存在");
      const [record] = project.records.splice(index, 1); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
      remember({ kind: "total-record-delete", projectId: project.id, records: [record], label: `${label("total", project)}中的独立记录${record.amount}元${record.note ? `·${record.note}` : ""}` });
      return { text: `已删除${label("total", project)}中的直接记录${record.amount}元${record.note ? `·${record.note}` : ""}。` };
    }
    if (target.kind === "linked") {
      const entry = data.entries.find(item => item.id === target.entryId); if (!entry || !project.linkedEntryIds.includes(entry.id)) throw new Error("关联账单不存在");
      project.linkedEntryIds = project.linkedEntryIds.filter(id => id !== entry.id); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
      remember({ kind: "total-link-delete", projectId: project.id, entryId: entry.id, label: `${label("finance", entry)}与${label("total", project)}的关联` });
      return { text: `已从${label("total", project)}移除关联账单${label("finance", entry)}，原账单未删除。` };
    }
    throw new Error("不支持的总计明细类型");
  }
  if (plan.kind === "add_total_record") {
    const total = candidates("total", plan.query);
    if (!total.length) return { text: "没有找到要新增独立记录的总计项目。" };
    const record = normalizeTotalProjectRecord({ amount: plan.patch?.amount, note: plan.patch?.note || "", date: plan.patch?.date || null });
    if (record.amount <= 0) throw new Error("金额必须大于0");
    if (total.length === 1) return addTotalProjectRecord(total[0].id, record);
    return { totalRecordCandidates: { total, record } };
  }
  if (plan.kind === "add-total-record-select") {
    return addTotalProjectRecord(plan.totalId, plan.record);
  }
  if (plan.kind === "delete-recent-total-records") {
    const total = candidates("total", plan.query);
    if (!total.length) return { text: "没有找到要删除独立记录的总计项目。" };
    if (total.length > 1) return { text: "找到多个匹配的总计项目，请提供更完整的项目名称后重试。" };
    const data = getFinanceData(); const project = data.totalProjects.find(item => item.id === total[0].id);
    const count = Math.max(1, Math.min(50, Math.floor(Number(plan.count) || 1)));
    if (!project || project.records.length < count) return { text: `总计项目「${project?.name || total[0].label}」只有${project?.records.length || 0}条独立记录，未执行删除。` };
    const records = project.records.splice(0, count); project.updatedAt = new Date().toISOString(); saveFinanceData(data); broadcastFinance();
    remember({ kind: "total-record-delete", projectId: project.id, records, label: `${label("total", project)}中的${count}条独立记录` });
    return { text: `已删除${label("total", project)}中最近${count}条独立记录。` };
  }
  if (plan.kind === "preview-delete-recent-total-records") {
    const total = candidates("total", plan.query);
    if (!total.length) return { text: "没有找到要删除独立记录的总计项目。" };
    if (total.length > 1) return { text: "找到多个匹配的总计项目，请提供更完整的项目名称后重试。" };
    const project = getFinanceData().totalProjects.find(item => item.id === total[0].id);
    const count = Math.max(1, Math.min(50, Math.floor(Number(plan.count) || 1)));
    if (!project || project.records.length < count) return { text: `总计项目「${project?.name || total[0].label}」只有${project?.records.length || 0}条独立记录，未执行删除。` };
    return { deletePreview: { text: `将删除${label("total", project)}中最近${count}条直接添加的记录。`, action: { kind: "delete-recent-total-records", query: plan.query, count } } };
  }
  if (plan.kind === "select") return { text: applySelection(plan.target, plan.patch, plan.operation) };
  const { entity, patch } = plan;
  if (entity === "water") { const state = addDrink({ ml: patch.ml, source: "feishu" }); const item = state.today.lastEntry; remember({ kind: "add", entity, id: item.id, date: state.date, label: label(entity, item) }); return { text: `已记录${label(entity, item)}` }; }
  if (entity === "todo") { const title = String(patch.title || "").trim(); if (!title) throw new Error("任务名称不能为空"); const data = getTodoData(); const item = normalizeTodoTask({ title, description: patch.description || "", priority: patch.priority || "P3", dueDate: patch.dueDate || null, reminderMinutes: 30 }); data.tasks.push(item); saveTodoData(data); broadcastState(); remember({ kind: "add", entity, id: item.id, label: label(entity, item) }); return { text: `已新增${label(entity, item)}` }; }
  if (entity === "finance") {
    const dates = [...new Set((Array.isArray(patch.dates) ? patch.dates : [patch.date || todayKey()]).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(String(date))))];
    if (!dates.length) throw new Error("账单日期无效");
    const items = dates.map(date => normalizeFinanceEntry({ type: patch.type === "income" ? "income" : "expense", amount: patch.amount, tag: patch.tag || "其他", note: patch.note || "", date }));
    if (items.some(item => item.amount <= 0)) throw new Error("金额必须大于0");
    const data = getFinanceData(); data.entries.push(...items); saveFinanceData(data); broadcastFinance();
    items.forEach(item => remember({ kind: "add", entity, id: item.id, label: label(entity, item) }));
    return { text: items.map(item => `已新增${label(entity, item)}`).join("\n") };
  }
  if (entity === "total") { const name = String(patch.name || "").trim(); if (!name) throw new Error("项目名称不能为空"); const data = getFinanceData(); const item = normalizeTotalProjects([{ name }])[0]; data.totalProjects.unshift(item); saveFinanceData(data); broadcastFinance(); remember({ kind: "add", entity, id: item.id, label: label(entity, item) }); return { text: `已新增${label(entity, item)}` }; }
  throw new Error("不支持的飞书操作");
}

function getFeishuChatContext() {
  const todo = getTodoData();
  const finance = getFinanceData();
  const water = getWaterState();
  const totalProjects = finance.totalProjects.slice(0, 100).map(project => {
    const directRecords = project.records.map(record => ({ amount: record.amount, note: record.note, date: record.date, createdAt: record.createdAt, source: "直接添加" }));
    const linkedRecords = finance.entries.filter(entry => project.linkedEntryIds.includes(entry.id)).map(entry => ({ amount: entry.amount, note: entry.note, tag: entry.tag, date: entry.date, createdAt: entry.createdAt, source: "关联账单" }));
    const records = [...directRecords, ...linkedRecords].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return { name: project.name, records };
  });
  return {
    generatedAt: new Date().toISOString(),
    todo: todo.tasks.slice(0, 100).map(item => ({ title: item.title, description: item.description, priority: item.priority, dueDate: item.dueDate, completed: item.completed, tags: item.tags })),
    finance: {
      entries: finance.entries.slice(0, 100).map(item => ({ type: item.type, amount: item.amount, tag: item.tag, note: item.note, date: item.date })),
      totalProjects
    },
    water: {
      date: water.date,
      today: { cups: water.today.cups, totalMl: water.today.totalMl, targetMl: water.today.targetMl, lastEntry: water.today.lastEntry },
      recentEntries: Object.entries(water.history.days).flatMap(([date, day]) => day.entries.map(item => ({ date, ml: item.ml, at: item.at }))).slice(-60)
    }
  };
}

// ═══════ 番茄钟逻辑 ═══════
function normalizePomodoroSession(session = {}) {
  const startedAt = session.startedAt && !Number.isNaN(new Date(session.startedAt).getTime())
    ? session.startedAt : new Date().toISOString();
  const endedAt = session.endedAt && !Number.isNaN(new Date(session.endedAt).getTime())
    ? session.endedAt : null;
  return {
    id: String(session.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(session.title || "未命名专注").trim().slice(0, 60) || "未命名专注",
    tags: normalizeStringList(session.tags).slice(0, 8).map(tag => tag.slice(0, 16)),
    mode: session.mode === "countup" ? "countup" : "countdown",
    plannedSeconds: session.mode === "countup"
      ? null
      : Math.max(60, Math.min(12 * 60 * 60, Math.round(Number(session.plannedSeconds) || 1800))),
    status: session.status === "abandoned" ? "abandoned" : "completed",
    startedAt,
    endedAt,
    durationSeconds: Math.max(0, Math.round(Number(session.durationSeconds) || 0))
  };
}

function normalizePomodoroTask(task = {}) {
  const mode = task.mode === "countup" ? "countup" : "countdown";
  const now = new Date().toISOString();
  return {
    id: String(task.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(task.title || "").trim().slice(0, 60),
    tags: normalizeStringList(task.tags).slice(0, 8).map(tag => tag.slice(0, 16)),
    mode,
    plannedSeconds: mode === "countup"
      ? null
      : Math.max(60, Math.min(12 * 60 * 60, Math.round(Number(task.plannedSeconds) || 1800))),
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now
  };
}

function normalizePomodoroActive(active) {
  if (!active || typeof active !== "object") return null;
  const startedAt = new Date(active.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  const mode = active.mode === "countup" ? "countup" : "countdown";
  const plannedSeconds = mode === "countup"
    ? null
    : Math.max(60, Math.min(12 * 60 * 60, Math.round(Number(active.plannedSeconds) || 1800)));
  return {
    id: String(active.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(active.title || "").trim().slice(0, 60),
    tags: normalizeStringList(active.tags).slice(0, 8).map(tag => tag.slice(0, 16)),
    mode,
    plannedSeconds,
    startedAt: startedAt.toISOString(),
    finishAt: mode === "countdown"
      ? new Date(startedAt.getTime() + plannedSeconds * 1000).toISOString()
      : null
  };
}

function getPomodoroData() {
  const tasks = pomodoroStore.get("tasks", [])
    .map(normalizePomodoroTask)
    .filter(task => task.title)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sessions = pomodoroStore.get("sessions", [])
    .map(normalizePomodoroSession)
    .filter(session => session.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const tags = normalizeStringList(pomodoroStore.get("tags", []));
  const active = normalizePomodoroActive(pomodoroStore.get("active", null));
  const settings = {
    ...defaultPomodoroData.settings,
    ...(pomodoroStore.get("settings", {}) || {})
  };
  return { version: 2, tasks, sessions, tags, active, settings, now: new Date().toISOString() };
}

function savePomodoroData(data) {
  if (data.tasks !== undefined) {
    pomodoroStore.set("tasks", data.tasks.map(normalizePomodoroTask).filter(task => task.title));
  }
  if (data.sessions !== undefined) {
    pomodoroStore.set("sessions", data.sessions.map(normalizePomodoroSession).filter(session => session.endedAt));
  }
  if (data.tags !== undefined) pomodoroStore.set("tags", normalizeStringList(data.tags).map(tag => tag.slice(0, 16)));
  if (data.active !== undefined) pomodoroStore.set("active", normalizePomodoroActive(data.active));
  if (data.settings !== undefined) {
    pomodoroStore.set("settings", { ...defaultPomodoroData.settings, ...data.settings });
  }
}

function broadcastPomodoro() {
  sendToAppWindows("pomodoro:changed", getPomodoroData());
  updateTray();
}

function finishPomodoro(status = "completed") {
  const data = getPomodoroData();
  if (!data.active) return data;
  const now = new Date();
  const startedAt = new Date(data.active.startedAt);
  const elapsed = Math.max(1, Math.round((now - startedAt) / 1000));
  const durationSeconds = data.active.mode === "countdown" && status === "completed"
    ? data.active.plannedSeconds
    : elapsed;
  const session = normalizePomodoroSession({
    ...data.active,
    status,
    endedAt: now.toISOString(),
    durationSeconds
  });
  data.sessions.unshift(session);
  data.active = null;
  savePomodoroData(data);
  broadcastPomodoro();
  const notification = new Notification({
    title: status === "completed" ? "专注完成" : "专注已放弃",
    body: status === "completed"
      ? `「${session.title}」完成了 ${Math.max(1, Math.round(durationSeconds / 60))} 分钟专注。`
      : `「${session.title}」本次记录为放弃。`,
    silent: status !== "completed"
  });
  notification.on("click", showWindow);
  notification.show();
  return getPomodoroData();
}

function maybeFinishPomodoro() {
  const active = getPomodoroData().active;
  if (!active || active.mode !== "countdown" || !active.finishAt) return;
  if (Date.now() >= new Date(active.finishAt).getTime()) finishPomodoro("completed");
}

function broadcastState() {
  const waterState = getWaterState();
  const todoData = getTodoData();
  sendToAppWindows("state:changed", waterState);
  sendToAppWindows("todo:changed", todoData);
  updateTray();
}

function sendUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendToAppWindows("app:update-status", updateState);
  return updateState;
}

function configureAutoUpdater() {
  if (isDev) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdateState({ status: "checking", message: "正在检查更新…", error: "" }));
  autoUpdater.on("update-available", info => sendUpdateState({ status: "available", version: info.version, message: `发现 v${info.version}，可立即下载。`, error: "" }));
  autoUpdater.on("update-not-available", () => sendUpdateState({ status: "idle", version: app.getVersion(), message: "当前已是最新版本。", error: "" }));
  autoUpdater.on("download-progress", progress => sendUpdateState({ status: "downloading", percent: Math.round(progress.percent), message: `正在下载更新（${Math.round(progress.percent)}%）…`, error: "" }));
  autoUpdater.on("update-downloaded", info => sendUpdateState({ status: "ready", version: info.version, percent: 100, message: `v${info.version} 已下载，重启后即可完成更新。`, error: "" }));
  autoUpdater.on("error", error => {
    console.error("自动更新失败：", error);
    sendUpdateState({ status: "error", message: "无法检查或下载更新，请稍后重试。", error: error.message });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f4f6f8",
    show: false,
    title: "个人工具箱",
    icon: getAssetPath("app.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", async (event) => {
    const settings = getAppSettings();
    if (isQuitting || pendingClose) return;
    if (!settings.showClosePrompt) {
      if (settings.closeAction === "hide") { event.preventDefault(); hideWindowToTray(); return; }
      event.preventDefault(); quitApp(); return;
    }
    event.preventDefault();
    if (closeDialogOpen) return;
    closeDialogOpen = true;
    let result;
    try {
      result = await dialog.showMessageBox(mainWindow, {
        type: "question", buttons: ["隐藏到托盘", "退出程序", "取消"], defaultId: 0, cancelId: 2,
        title: "关闭工具箱", message: "关闭工具箱？",
        detail: "隐藏后会继续在托盘运行并按设置提醒。",
        checkboxLabel: "不再询问", checkboxChecked: false,
        noLink: true
      });
    } finally {
      closeDialogOpen = false;
    }
    const { response, checkboxChecked } = result;
    if (response === 2) {
      mainWindow?.show();
      mainWindow?.focus();
      return;
    }
    const action = response === 0 ? "hide" : "quit";
    if (checkboxChecked) {
      appStore.set("settings", { ...settings, showClosePrompt: false, closeAction: action });
      broadcastAppSettings();
    }
    if (action === "hide") { hideWindowToTray(); return; }
    quitApp();
  });
  mainWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    console.error(`页面加载失败 (${errorCode})：${errorDescription}`);
    dialog.showErrorBox("工具箱启动失败", `页面资源加载失败：${errorDescription} (${errorCode})`);
  });
  mainWindow.webContents.on("render-process-gone", (_, details) => {
    console.error("页面进程异常退出：", details);
    if (!isQuitting) dialog.showErrorBox("工具箱页面异常", "页面进程异常退出，请重新启动工具箱。");
  });
  loadRendererRoute(mainWindow);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startReminderLoop() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(maybeWaterNotify, 15 * 1000);
  clearTimeout(waterStartupTimer);
  waterStartupTimer = setTimeout(maybeWaterNotify, 3000);
  clearInterval(todoReminderTimer);
  todoReminderTimer = setInterval(maybeTodoNotify, 60 * 1000);
  clearTimeout(todoStartupTimer);
  todoStartupTimer = setTimeout(maybeTodoNotify, 5000);
  clearInterval(academicReminderTimer);
  academicReminderTimer = setInterval(maybeAcademicNotify, 60 * 1000);
  setTimeout(maybeAcademicNotify, 6000);
  clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(maybeFinishPomodoro, 1000);
  maybeFinishPomodoro();
}

function stopBackgroundWork() {
  clearInterval(reminderTimer);
  clearInterval(todoReminderTimer);
  clearInterval(academicReminderTimer);
  clearTimeout(waterStartupTimer);
  clearTimeout(todoStartupTimer);
  clearInterval(pomodoroTimer);
  reminderTimer = null;
  todoReminderTimer = null;
  academicReminderTimer = null;
  waterStartupTimer = null;
  todoStartupTimer = null;
  pomodoroTimer = null;
  if (registeredMainWindowShortcut) globalShortcut.unregister(registeredMainWindowShortcut);
  registeredMainWindowShortcut = null;
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  pendingClose = true;
  // Leave the active close callback before tearing Electron down. Calling
  // app.quit() synchronously from a prevented close event can leave the main
  // process alive on Windows even though the window and tray are already gone.
  setImmediate(() => {
    stopBackgroundWork();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners("close");
      mainWindow.destroy();
      mainWindow = null;
    }
    quitFallbackTimer = setTimeout(() => app.exit(0), 1500);
    quitFallbackTimer.unref?.();
    app.quit();
  });
}

// ═══════ IPC 饮水 ═══════
ipcMain.handle("state:get", () => getWaterState());
ipcMain.handle("drink:add", (_, payload) => addDrink(payload));
ipcMain.handle("drink:undo", () => undoDrink());
ipcMain.handle("settings:save", (_, settings) => {
  const nextSettings = { ...defaultWaterSettings, ...settings };
  nextSettings.cupProfiles = Array.isArray(nextSettings.cupProfiles) && nextSettings.cupProfiles.length
    ? nextSettings.cupProfiles.map((cup) => ({ ...cup, ml: Number(cup.ml) || 200 }))
    : defaultWaterSettings.cupProfiles;
  const selectedCup = nextSettings.cupProfiles.find((cup) => cup.id === nextSettings.selectedCupId)
    || nextSettings.cupProfiles[0];
  const targetCups = Number(nextSettings.targetCups) || defaultWaterSettings.targetCups;
  const targetCupsByCupId = nextSettings.targetCupsByCupId && typeof nextSettings.targetCupsByCupId === "object"
    ? nextSettings.targetCupsByCupId : {};
  nextSettings.targetCupsByCupId = { ...targetCupsByCupId, [selectedCup.id]: targetCups };
  nextSettings.targetCups = targetCups;
  nextSettings.staleMinutes = safeMinutes(nextSettings.staleMinutes, defaultWaterSettings.staleMinutes, 10, 240);
  nextSettings.snoozeMinutes = safeMinutes(nextSettings.snoozeMinutes, defaultWaterSettings.snoozeMinutes, 5, 120);
  nextSettings.repeatUntilLogged = nextSettings.repeatUntilLogged !== false;
  waterStore.set("settings", nextSettings);
  broadcastState();
  return getWaterState();
});
ipcMain.handle("app:request-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle("app:runtime-status", () => ({
  trayReady: Boolean(tray && !tray.isDestroyed()),
  windowVisible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible())
}));
ipcMain.handle("app:resolve-close-choice", (_, choice) => {
  if (choice.remember) {
    const settings = getAppSettings();
    appStore.set("settings", { ...settings, showClosePrompt: false, closeAction: choice.action });
    broadcastAppSettings();
  }
  if (choice.action === "hide") return hideWindowToTray() ? "hidden" : "visible";
  quitApp(); return "quit";
});
ipcMain.handle("app:get-settings", () => ({
  ...getAppSettings(),
  version: app.getVersion()
}));
ipcMain.handle("app:get-update-status", () => updateState);
ipcMain.handle("app:check-for-updates", async () => {
  if (isDev) return sendUpdateState({ status: "unsupported", message: "开发环境不检查更新。" });
  try {
    await autoUpdater.checkForUpdates();
    return updateState;
  } catch (error) {
    console.error("检查更新失败：", error);
    return sendUpdateState({ status: "error", message: "无法检查更新，请稍后重试。", error: error.message });
  }
});
ipcMain.handle("app:download-update", async () => {
  if (isDev) return sendUpdateState({ status: "unsupported", message: "开发环境不下载更新。" });
  try {
    await autoUpdater.downloadUpdate();
    return updateState;
  } catch (error) {
    console.error("下载更新失败：", error);
    return sendUpdateState({ status: "error", message: "无法下载更新，请稍后重试。", error: error.message });
  }
});
ipcMain.handle("app:install-update", () => {
  if (updateState.status !== "ready") return false;
  isQuitting = true;
  pendingClose = true;
  autoUpdater.quitAndInstall(false, true);
  return true;
});
ipcMain.handle("app:save-settings", (_, patch) => {
  const nextShortcut = patch?.mainWindowShortcut;
  if (nextShortcut && nextShortcut !== getAppSettings().mainWindowShortcut && !registerMainWindowShortcut(nextShortcut)) {
    throw new Error("该快捷键可能已被其他程序占用，请选择另一个快捷键。");
  }
  return { ...applyAppSettings(patch), version: app.getVersion() };
});
ipcMain.handle("app:open-main", (_, route) => {
  navigateMainWindow(typeof route === "string" ? route : "/");
  return true;
});

ipcMain.handle("academic:schedule-get", () => getScheduleData());
ipcMain.handle("academic:exams-get", () => getExamsData());
ipcMain.handle("academic:schedule-import", async (_, startDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))) throw new Error("请选择有效的开学日期");
  const picked = await dialog.showOpenDialog(mainWindow, { title: "导入日常课表", properties: ["openFile"], filters: [{ name: "学校课表（DOC）", extensions: ["doc"] }] });
  if (picked.canceled || !picked.filePaths[0]) return { status: "canceled" };
  const courses = parseSchedule(picked.filePaths[0]); scheduleStore.set("courses", courses); scheduleStore.set("startDate", startDate); broadcastAcademic(); return { status: "imported", count: courses.length };
});
ipcMain.handle("academic:exams-import", async () => {
  const picked = await dialog.showOpenDialog(mainWindow, { title: "导入考试信息", properties: ["openFile"], filters: [{ name: "学校考试表（DOC）", extensions: ["doc"] }] });
  if (picked.canceled || !picked.filePaths[0]) return { status: "canceled" };
  const exams = parseExams(picked.filePaths[0]); examsStore.set("exams", exams); broadcastAcademic(); return { status: "imported", count: exams.length };
});
ipcMain.handle("academic:schedule-settings", (_, settings = {}) => { scheduleStore.set("settings", { ...getScheduleData().settings, enabled: Boolean(settings.enabled), reminderMinutes: Math.max(0, Math.min(1440, Number(settings.reminderMinutes) || 0)) }); broadcastAcademic(); return getScheduleData(); });
ipcMain.handle("academic:exam-settings", (_, settings = {}) => { examsStore.set("settings", { ...getExamsData().settings, enabled: Boolean(settings.enabled), reminderMinutes: Math.max(0, Math.min(10080, Number(settings.reminderMinutes) || 0)) }); broadcastAcademic(); return getExamsData(); });

// ═══════ IPC 待办 ═══════
ipcMain.handle("todo:getAll", () => getTodoData());
ipcMain.handle("todo:save", (_, data) => { saveTodoData(data); broadcastState(); return getTodoData(); });
ipcMain.handle("todo:add", (_, task) => {
  const data = getTodoData();
  const title = String(task?.title || "").trim();
  if (!title) throw new Error("任务名称不能为空");
  const newTask = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    description: task.description || "",
    priority: task.priority || "P3",
    tags: task.tags || [],
    dueDate: task.dueDate || null,
    reminderMinutes: task.reminderMinutes ?? 30,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: (Array.isArray(task.subtasks) ? task.subtasks : []).slice(0, 8).map((s, index) => ({
      id: String(s.id || `sub-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
      title: String(s.title || "").trim(),
      completed: Boolean(s.completed)
    })).filter(s => s.title)
  };
  // add new tags
  const taskTags = Array.isArray(task.tags) ? task.tags : [];
  const allTags = new Set([...data.tags, ...taskTags]);
  data.tasks.push(newTask);
  saveTodoData({ tasks: data.tasks, tags: [...allTags] });
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:update", (_, { id, patch }) => {
  const data = getTodoData();
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) return data;
  if (patch.title !== undefined && !String(patch.title).trim()) throw new Error("任务名称不能为空");
  const updated = { ...data.tasks[idx], ...patch, updatedAt: new Date().toISOString() };
  // sync tags
  if (patch.tags) {
    const allTags = new Set([...data.tags, ...patch.tags]);
    data.tags = [...allTags];
  }
  data.tasks[idx] = updated;
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:delete", (_, ids) => {
  const data = getTodoData();
  const safeIds = Array.isArray(ids) ? ids.map(String) : [];
  data.tasks = data.tasks.filter(t => !safeIds.includes(t.id));
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:toggleComplete", (_, id) => {
  const data = getTodoData();
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) return data;
  const task = data.tasks[idx];
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  task.updatedAt = new Date().toISOString();
  // complete all subtasks too
  if (task.completed) task.subtasks.forEach(s => { s.completed = true; });
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:toggleSubtask", (_, { taskId, subtaskId }) => {
  const data = getTodoData();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return data;
  const sub = task.subtasks.find(s => s.id === subtaskId);
  if (!sub) return data;
  sub.completed = !sub.completed;
  task.updatedAt = new Date().toISOString();
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:reorderTasks", (_, orderedIds) => {
  const data = getTodoData();
  const safeIds = normalizeStringList(orderedIds);
  const taskById = new Map(data.tasks.map(task => [task.id, task]));
  const reordered = safeIds.map(id => taskById.get(id)).filter(Boolean);
  if (reordered.length < 2) return data;
  let nextIndex = 0;
  const reorderedIds = new Set(reordered.map(task => task.id));
  data.tasks = data.tasks.map(task => (
    reorderedIds.has(task.id) ? reordered[nextIndex++] : task
  ));
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:reorderSubtasks", (_, { taskId, orderedIds }) => {
  const data = getTodoData();
  const task = data.tasks.find(item => item.id === taskId);
  if (!task) return data;
  const safeIds = normalizeStringList(orderedIds);
  if (safeIds.length !== task.subtasks.length) return data;
  const subtaskById = new Map(task.subtasks.map(subtask => [subtask.id, subtask]));
  const reordered = safeIds.map(id => subtaskById.get(id)).filter(Boolean);
  if (reordered.length !== task.subtasks.length) return data;
  task.subtasks = reordered;
  task.updatedAt = new Date().toISOString();
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});
ipcMain.handle("todo:addTag", (_, tag) => {
  const data = getTodoData();
  const cleanTag = String(tag || "").trim();
  if (cleanTag && !data.tags.includes(cleanTag)) {
    data.tags.push(cleanTag);
    saveTodoData(data);
    broadcastState();
  }
  return getTodoData();
});
ipcMain.handle("todo:deleteTag", (_, tag) => {
  const data = getTodoData();
  data.tags = data.tags.filter(t => t !== tag);
  data.tasks = data.tasks.map(t => ({ ...t, tags: t.tags.filter(tg => tg !== tag) }));
  saveTodoData(data);
  broadcastState();
  return getTodoData();
});

// ═══════ IPC 番茄钟 ═══════
ipcMain.handle("pomodoro:getAll", () => {
  maybeFinishPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:clearSessions", () => {
  pomodoroStore.set("sessions", []);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:start", (_, payload = {}) => {
  const data = getPomodoroData();
  if (data.active) throw new Error("已有正在进行的专注任务");
  const title = String(payload.title || "").trim().slice(0, 60);
  if (!title) throw new Error("任务名称不能为空");
  const mode = payload.mode === "countup" ? "countup" : "countdown";
  const plannedSeconds = mode === "countup"
    ? null
    : Math.max(60, Math.min(12 * 60 * 60, Math.round(Number(payload.plannedSeconds) || 1800)));
  const startedAt = new Date();
  const active = normalizePomodoroActive({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    tags: payload.tags,
    mode,
    plannedSeconds,
    startedAt: startedAt.toISOString()
  });
  data.active = active;
  data.tags = normalizeStringList([...data.tags, ...(Array.isArray(payload.tags) ? payload.tags : [])]);
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:finish", (_, status) => finishPomodoro(status === "abandoned" ? "abandoned" : "completed"));
ipcMain.handle("pomodoro:task-add", (_, payload = {}) => {
  const data = getPomodoroData();
  const task = normalizePomodoroTask(payload);
  if (!task.title) throw new Error("任务名称不能为空");
  data.tasks.unshift(task);
  data.tags = normalizeStringList([...data.tags, ...task.tags]);
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:task-update", (_, { id, patch } = {}) => {
  const data = getPomodoroData();
  const index = data.tasks.findIndex(task => task.id === String(id));
  if (index === -1) return data;
  const next = normalizePomodoroTask({
    ...data.tasks[index],
    ...(patch || {}),
    id: data.tasks[index].id,
    createdAt: data.tasks[index].createdAt,
    updatedAt: new Date().toISOString()
  });
  if (!next.title) throw new Error("任务名称不能为空");
  data.tasks[index] = next;
  data.tags = normalizeStringList([...data.tags, ...next.tags]);
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:task-delete", (_, id) => {
  const data = getPomodoroData();
  data.tasks = data.tasks.filter(task => task.id !== String(id));
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:addTag", (_, tag) => {
  const data = getPomodoroData();
  const clean = String(tag || "").trim().slice(0, 16);
  if (clean && !data.tags.includes(clean)) {
    data.tags.push(clean);
    savePomodoroData(data);
    broadcastPomodoro();
  }
  return getPomodoroData();
});
ipcMain.handle("pomodoro:deleteTag", (_, tag) => {
  const data = getPomodoroData();
  data.tags = data.tags.filter(item => item !== String(tag));
  data.tasks = data.tasks.map(task => ({ ...task, tags: task.tags.filter(item => item !== String(tag)) }));
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:saveSettings", (_, settings) => {
  const data = getPomodoroData();
  data.settings = { ...data.settings, ...(settings || {}) };
  savePomodoroData(data);
  broadcastPomodoro();
  return getPomodoroData();
});
ipcMain.handle("pomodoro:setImmersive", (_, enabled) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (enabled) {
    pomodoroWindowWasMaximized = mainWindow.isMaximized();
    if (!pomodoroWindowWasMaximized) mainWindow.maximize();
  } else if (!pomodoroWindowWasMaximized && mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
  return mainWindow.isMaximized();
});

// ═══════ IPC 记账 ═══════
ipcMain.handle("finance:getAll", () => getFinanceData());
ipcMain.handle("finance:add", (_, entry) => {
  const normalized = normalizeFinanceEntry(entry);
  if (normalized.amount <= 0) throw new Error("金额必须大于0");
  const data = getFinanceData();
  data.entries.push(normalized);
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:batch-add", (_, entries) => {
  if (!Array.isArray(entries) || !entries.length) return getFinanceData();
  const normalized = entries.slice(0, 366).map(normalizeFinanceEntry).filter(entry => entry.amount > 0);
  if (!normalized.length) throw new Error("金额必须大于0");
  const data = getFinanceData();
  data.entries.push(...normalized);
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:update", (_, { id, patch }) => {
  const data = getFinanceData();
  const index = data.entries.findIndex(entry => entry.id === String(id));
  if (index === -1) return data;
  const updated = normalizeFinanceEntry({
    ...data.entries[index],
    ...patch,
    id: data.entries[index].id,
    createdAt: data.entries[index].createdAt,
    updatedAt: new Date().toISOString()
  });
  if (updated.amount <= 0) throw new Error("金额必须大于0");
  data.entries[index] = updated;
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:delete", (_, id) => {
  const data = getFinanceData();
  data.entries = data.entries.filter(entry => entry.id !== String(id));
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-project-add", (_, project = {}) => {
  const name = String(project.name || "").trim().slice(0, 40);
  if (!name) throw new Error("项目名称不能为空");
  const data = getFinanceData();
  data.totalProjects.unshift(normalizeTotalProjects([{ ...project, name }])[0]);
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-project-update", (_, { id, patch } = {}) => {
  const data = getFinanceData();
  const index = data.totalProjects.findIndex(project => project.id === String(id));
  if (index === -1) return data;
  const current = data.totalProjects[index];
  const next = normalizeTotalProjects([{ ...current, ...(patch || {}), id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() }])[0];
  if (!next.name) throw new Error("项目名称不能为空");
  data.totalProjects[index] = next;
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-project-delete", (_, id) => {
  const data = getFinanceData();
  data.totalProjects = data.totalProjects.filter(project => project.id !== String(id));
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-record-add", (_, { projectId, record } = {}) => {
  const data = getFinanceData();
  const project = data.totalProjects.find(item => item.id === String(projectId));
  if (!project) throw new Error("项目不存在");
  const next = normalizeTotalProjectRecord(record);
  if (next.amount <= 0) throw new Error("金额必须大于0");
  project.records.unshift(next);
  project.updatedAt = new Date().toISOString();
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-record-update", (_, { projectId, recordId, patch } = {}) => {
  const data = getFinanceData();
  const project = data.totalProjects.find(item => item.id === String(projectId));
  const index = project?.records.findIndex(record => record.id === String(recordId)) ?? -1;
  if (index < 0) return data;
  const current = project.records[index];
  const next = normalizeTotalProjectRecord({ ...current, ...(patch || {}), id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  if (next.amount <= 0) throw new Error("金额必须大于0");
  project.records[index] = next;
  project.updatedAt = new Date().toISOString();
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:total-record-delete", (_, { projectId, recordId } = {}) => {
  const data = getFinanceData();
  const project = data.totalProjects.find(item => item.id === String(projectId));
  if (!project) return data;
  project.records = project.records.filter(record => record.id !== String(recordId));
  project.updatedAt = new Date().toISOString();
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:tag-add", (_, { type, name }) => {
  const safeType = type === "income" ? "income" : "expense";
  const cleanName = String(name || "").trim().slice(0, 12);
  const data = getFinanceData();
  const allTags = [...fixedFinanceTags[safeType], ...data.customTags[safeType]];
  if (cleanName && !allTags.includes(cleanName)) {
    data.customTags[safeType].push(cleanName);
    data.tagSettings[safeType].order.push(cleanName);
    saveFinanceData(data);
    broadcastFinance();
  }
  return getFinanceData();
});
ipcMain.handle("finance:tag-rename", (_, { type, oldName, newName }) => {
  const safeType = type === "income" ? "income" : "expense";
  const oldTag = String(oldName || "").trim();
  const nextTag = String(newName || "").trim().slice(0, 12);
  const data = getFinanceData();
  const index = data.customTags[safeType].indexOf(oldTag);
  const allTags = [...fixedFinanceTags[safeType], ...data.customTags[safeType].filter(item => item !== oldTag)];
  if (index >= 0 && nextTag && !allTags.includes(nextTag)) {
    data.customTags[safeType][index] = nextTag;
    data.tagSettings[safeType].order = data.tagSettings[safeType].order.map(item => item === oldTag ? nextTag : item);
    data.entries = data.entries.map(entry => (
      entry.type === safeType && entry.tag === oldTag ? { ...entry, tag: nextTag, updatedAt: new Date().toISOString() } : entry
    ));
    saveFinanceData(data);
    broadcastFinance();
  }
  return getFinanceData();
});
ipcMain.handle("finance:tag-delete", (_, { type, name }) => {
  const safeType = type === "income" ? "income" : "expense";
  const cleanName = String(name || "").trim();
  const data = getFinanceData();
  if (data.customTags[safeType].includes(cleanName)) {
    data.customTags[safeType] = data.customTags[safeType].filter(item => item !== cleanName);
  } else if (fixedFinanceTags[safeType].includes(cleanName) && !data.tagSettings[safeType].hidden.includes(cleanName)) {
    data.tagSettings[safeType].hidden.push(cleanName);
  }
  data.tagSettings[safeType].order = data.tagSettings[safeType].order.filter(item => item !== cleanName);
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:tag-reorder", (_, { type, orderedTags }) => {
  const safeType = type === "income" ? "income" : "expense";
  const data = getFinanceData();
  const available = [...fixedFinanceTags[safeType], ...data.customTags[safeType]]
    .filter(tag => !data.tagSettings[safeType].hidden.includes(tag));
  const ordered = normalizeStringList(orderedTags).filter(tag => available.includes(tag));
  data.tagSettings[safeType].order = [...ordered, ...available.filter(tag => !ordered.includes(tag))];
  saveFinanceData(data);
  broadcastFinance();
  return getFinanceData();
});
ipcMain.handle("finance:export", async () => {
  const defaultName = `记账备份-${todayKey()}.json`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出记账备份",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "JSON文件", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { status: "canceled" };
  const backup = {
    app: "个人工具箱-记账助手",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...getFinanceData()
  };
  await fs.promises.writeFile(result.filePath, JSON.stringify(backup, null, 2), "utf8");
  return { status: "exported", filePath: result.filePath };
});
ipcMain.handle("finance:import", async () => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "选择记账JSON备份",
    properties: ["openFile"],
    filters: [{ name: "JSON文件", extensions: ["json"] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return { status: "canceled" };
  try {
    const raw = await fs.promises.readFile(picked.filePaths[0], "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries) || !parsed.customTags || typeof parsed.customTags !== "object") {
      throw new Error("文件中缺少账目或标签数据");
    }
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "恢复记账备份",
      message: "恢复后将覆盖当前全部记账数据",
      detail: `备份中包含${parsed.entries.length}笔账目。此操作无法撤销，建议先导出当前数据。`,
      buttons: ["取消", "确认恢复"],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmation.response !== 1) return { status: "canceled" };
    saveFinanceData({ entries: parsed.entries, customTags: parsed.customTags, totalProjects: parsed.totalProjects || [] });
    broadcastFinance();
    return { status: "imported", count: getFinanceData().entries.length };
  } catch (error) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "无法恢复备份",
      message: "所选文件不是有效的记账备份",
      detail: error.message
    });
    return { status: "error", message: error.message };
  }
});

// ═══════ 启动 ═══════
app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  initStores();
  app.setAppUserModelId("local.personal.toolbox");
  createAppMenu();
  ensureTray();
  if (!registerMainWindowShortcut(getAppSettings().mainWindowShortcut)) {
    console.error("无法注册主窗口快捷键，可能已被其他程序占用。");
  }
  createWindow();
  startFeishuBridge({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    allowedOpenId: process.env.FEISHU_ALLOWED_OPEN_ID,
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
    onAction: executeFeishuAction,
    onChatContext: getFeishuChatContext,
    onConversationLoad: getFeishuConversation,
    onConversationSave: saveFeishuConversation,
    onRuntimeLoad: getFeishuRuntimeState,
    onRuntimeSave: saveFeishuRuntimeState
  });
  updateTray();
  startReminderLoop();
  configureAutoUpdater();
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(error => console.error("启动检查更新失败：", error));
    }, 8000).unref?.();
  }
});
app.on("window-all-closed", () => {});
app.on("second-instance", () => showWindow());
app.on("activate", () => showWindow());
app.on("before-quit", () => {
  isQuitting = true;
  pendingClose = true;
  stopBackgroundWork();
});
app.on("quit", () => clearTimeout(quitFallbackTimer));
