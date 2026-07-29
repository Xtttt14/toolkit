const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, Notification, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");

const isDev = !app.isPackaged;
const userDataPath = process.env.PERSONAL_TOOLBOX_USER_DATA
  || path.join(app.getPath("appData"), "personal-toolbox");
app.setPath("userData", userDataPath);
app.setName("个人工具箱");

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
  showClosePrompt: true,
  closeAction: "hide",
  progressMode: "cups"
};

// ─── 待办 默认设置 ───
const defaultTodoData = {
  tasks: [],
  tags: []
};

// ─── 记账 默认设置 ───
const defaultFinanceData = {
  entries: [],
  customTags: { income: [], expense: [] }
};
const fixedFinanceTags = {
  income: ["工资", "生活费", "红包", "外快", "股票", "其他"],
  expense: ["三餐", "零食", "衣服", "交通", "旅行", "孩子", "宠物", "话费网费", "烟酒", "学习", "日用品", "住房", "美妆", "医疗", "发红包", "汽车/加油", "娱乐", "请客送礼", "电器数码", "运动", "其他", "水电煤"]
};

let waterStore;
let todoStore;
let financeStore;
let mainWindow;
let tray;
let reminderTimer;
let todoReminderTimer;
let snoozedUntil = null;
let lastReminder = null;
let pendingClose = false;
let isQuitting = false;
let trayHintShown = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function initStores() {
  waterStore = new Store({ name: "water-data", defaults: { settings: defaultWaterSettings, days: {} } });
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
      }
    }
  });
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
        { label: "显示主窗口", click: showWindow },
        { label: "加一杯", click: () => addDrink({ source: "menu" }) },
        { type: "separator" },
        { label: "退出", accelerator: "Alt+F4", click: () => quitApp() }
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
  snoozedUntil = null;
  lastReminder = null;
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
  snoozedUntil = null;
  lastReminder = null;
  broadcastState();
  return getWaterState();
}

function inWorkWindow(now, settings) {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= minutesOfDay(settings.workStart) && current <= minutesOfDay(settings.workEnd);
}
function progressIsBehind(now, settings, cups) {
  const start = minutesOfDay(settings.workStart);
  const end = minutesOfDay(settings.workEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  const elapsed = Math.max(0, Math.min(current, end) - start);
  const total = Math.max(1, end - start);
  const expected = Math.floor((elapsed / total) * settings.targetCups);
  return cups < expected;
}
function maybeWaterNotify() {
  const state = getWaterState();
  const { settings, selectedCup, today } = state;
  const now = new Date();
  if (!inWorkWindow(now, settings)) return;
  if (snoozedUntil && now < snoozedUntil) return;
  if (today.cups >= settings.targetCups) return;
  const lastAt = today.lastEntry ? new Date(today.lastEntry.at) : null;
  const stale = !lastAt || (now - lastAt) / 60000 >= settings.staleMinutes;
  const behind = stale && progressIsBehind(now, settings, today.cups);
  if (!stale && !behind) return;
  const reminderKey = [state.date, selectedCup.id, today.cups, today.lastEntry?.id || "none", stale ? "stale" : "behind"].join("|");
  if (!settings.repeatUntilLogged && lastReminder?.key === reminderKey) return;
  const notification = new Notification({
    title: "该喝水了",
    body: `今天已记录 ${today.cups}/${settings.targetCups} 杯，${today.totalMl}/${today.targetMl}ml。`,
    silent: false
  });
  notification.on("click", showWindow);
  notification.show();
  lastReminder = { key: reminderKey, at: now.toISOString() };
  if (settings.repeatUntilLogged) {
    snoozedUntil = new Date(now.getTime() + settings.snoozeMinutes * 60000);
  } else {
    snoozedUntil = null;
  }
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
  const percent = Math.min(100, Math.round((waterState.today.totalMl / Math.max(1, waterState.today.targetMl)) * 100));
  const { tasks } = getTodoData();
  const todoPending = tasks.filter(t => !t.completed).length;
  tray.setToolTip(`工具箱 · 饮水 ${waterState.today.cups}/${waterState.settings.targetCups}杯 · 待办${todoPending}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `今日饮水 ${waterState.today.cups}/${waterState.settings.targetCups}杯 · ${percent}%`, enabled: false },
    { label: `待办 ${todoPending} 项未完成`, enabled: false },
    { type: "separator" },
    { label: "显示主窗口", click: showWindow },
    { label: `加一杯 (${waterState.selectedCup.ml}ml)`, click: () => addDrink({ source: "tray" }) },
    {
      label: `重复上次容量 (${waterState.today.lastEntry?.ml || waterState.selectedCup.ml}ml)`,
      click: () => addDrink({ source: "tray", ml: waterState.today.lastEntry?.ml || waterState.selectedCup.ml })
    },
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

function hideWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!ensureTray()) {
    dialog.showErrorBox("无法隐藏到托盘", "托盘图标创建失败。为避免程序在后台不可见，窗口将保持打开。");
    mainWindow.show();
    return false;
  }
  mainWindow.hide();
  if (!trayHintShown) {
    trayHintShown = true;
    try {
      tray.displayBalloon({
        title: "个人工具箱仍在运行",
        content: "窗口已最小化到系统托盘。右键托盘图标可退出，单击图标可恢复窗口；若图标被系统收起，可按Ctrl+Shift+T恢复窗口。"
      });
    } catch (error) {
      console.warn("显示托盘提示失败：", error);
    }
  }
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

function getFinanceData() {
  const entries = financeStore.get("entries", [])
    .map(normalizeFinanceEntry)
    .filter(entry => entry.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const customTags = normalizeFinanceTags(financeStore.get("customTags", {}));
  return { version: 1, entries, customTags };
}

function saveFinanceData(data) {
  if (data.entries !== undefined) {
    financeStore.set("entries", data.entries.map(normalizeFinanceEntry).filter(entry => entry.amount > 0));
  }
  if (data.customTags !== undefined) financeStore.set("customTags", normalizeFinanceTags(data.customTags));
}

function broadcastFinance() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("finance:changed", getFinanceData());
  }
}

function broadcastState() {
  const waterState = getWaterState();
  const todoData = getTodoData();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:changed", waterState);
    mainWindow.webContents.send("todo:changed", todoData);
  }
  updateTray();
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
  mainWindow.on("close", (event) => {
    const settings = getWaterState().settings;
    if (isQuitting || pendingClose) return;
    if (!settings.showClosePrompt) {
      if (settings.closeAction === "hide") { event.preventDefault(); hideWindowToTray(); return; }
      event.preventDefault(); quitApp(); return;
    }
    event.preventDefault();
    const { response, checkboxChecked } = dialog.showMessageBoxSync(mainWindow, {
      type: "question", buttons: ["隐藏到托盘", "退出程序", "取消"], defaultId: 0, cancelId: 2,
      title: "关闭工具箱", message: "关闭工具箱？",
      detail: "隐藏后会继续在托盘运行并按设置提醒。",
      checkboxLabel: "不再询问", checkboxChecked: false
    });
    if (response === 2) return;
    const action = response === 0 ? "hide" : "quit";
    if (checkboxChecked) {
      waterStore.set("settings", { ...settings, showClosePrompt: false, closeAction: action });
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
  if (isDev) { mainWindow.loadURL("http://127.0.0.1:5173"); }
  else { mainWindow.loadFile(path.join(__dirname, "../dist/index.html")); }
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startReminderLoop() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(maybeWaterNotify, 60 * 1000);
  setTimeout(maybeWaterNotify, 3000);
  clearInterval(todoReminderTimer);
  todoReminderTimer = setInterval(maybeTodoNotify, 60 * 1000);
  setTimeout(maybeTodoNotify, 5000);
}

function quitApp() {
  isQuitting = true;
  pendingClose = true;
  app.quit();
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
  waterStore.set("settings", nextSettings);
  snoozedUntil = null; lastReminder = null;
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
    const settings = getWaterState().settings;
    waterStore.set("settings", { ...settings, showClosePrompt: false, closeAction: choice.action });
  }
  if (choice.action === "hide") return hideWindowToTray() ? "hidden" : "visible";
  quitApp(); return "quit";
});

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
ipcMain.handle("finance:tag-add", (_, { type, name }) => {
  const safeType = type === "income" ? "income" : "expense";
  const cleanName = String(name || "").trim().slice(0, 12);
  const data = getFinanceData();
  const allTags = [...fixedFinanceTags[safeType], ...data.customTags[safeType]];
  if (cleanName && !allTags.includes(cleanName)) {
    data.customTags[safeType].push(cleanName);
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
  data.customTags[safeType] = data.customTags[safeType].filter(item => item !== cleanName);
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
    saveFinanceData({ entries: parsed.entries, customTags: parsed.customTags });
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
  globalShortcut.register("CommandOrControl+Shift+T", showWindow);
  createWindow();
  updateTray();
  startReminderLoop();
});
app.on("window-all-closed", () => {});
app.on("second-instance", () => showWindow());
app.on("activate", () => showWindow());
app.on("before-quit", () => {
  isQuitting = true;
  pendingClose = true;
  globalShortcut.unregister("CommandOrControl+Shift+T");
  if (tray) { tray.destroy(); tray = null; }
});
