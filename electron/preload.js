const { contextBridge, ipcRenderer } = require("electron");

// ─── 工具箱 API ───
contextBridge.exposeInMainWorld("appApi", {
  getSettings: () => ipcRenderer.invoke("app:get-settings"),
  getUpdateStatus: () => ipcRenderer.invoke("app:get-update-status"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("app:download-update"),
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  saveSettings: (patch) => ipcRenderer.invoke("app:save-settings", patch || {}),
  openMain: (route) => ipcRenderer.invoke("app:open-main", route || "/"),
  onSettingsChanged: (callback) => {
    const listener = (_, settings) => callback(settings);
    ipcRenderer.on("app:settings-changed", listener);
    return () => ipcRenderer.removeListener("app:settings-changed", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on("app:update-status", listener);
    return () => ipcRenderer.removeListener("app:update-status", listener);
  },
  onNavigate: (callback) => {
    const listener = (_, route) => callback(route);
    ipcRenderer.on("app:navigate", listener);
    return () => ipcRenderer.removeListener("app:navigate", listener);
  }
});

// ─── 饮水提醒 API ───
contextBridge.exposeInMainWorld("waterApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  addDrink: (payload) => ipcRenderer.invoke("drink:add", payload),
  undoDrink: () => ipcRenderer.invoke("drink:undo"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  requestClose: () => ipcRenderer.invoke("app:request-close"),
  getRuntimeStatus: () => ipcRenderer.invoke("app:runtime-status"),
  resolveCloseChoice: (choice) => ipcRenderer.invoke("app:resolve-close-choice", choice),
  onStateChanged: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onClosePrompt: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("close:prompt", listener);
    return () => ipcRenderer.removeListener("close:prompt", listener);
  }
});

// ─── 待办清单 API ───
contextBridge.exposeInMainWorld("todoApi", {
  getAll: () => ipcRenderer.invoke("todo:getAll"),
  add: (task) => ipcRenderer.invoke("todo:add", task || {}),
  update: (id, patch) => ipcRenderer.invoke("todo:update", { id, patch }),
  delete: (ids) => ipcRenderer.invoke("todo:delete", ids),
  toggleComplete: (id) => ipcRenderer.invoke("todo:toggleComplete", id),
  toggleSubtask: (taskId, subtaskId) => ipcRenderer.invoke("todo:toggleSubtask", { taskId, subtaskId }),
  reorderTasks: (orderedIds) => ipcRenderer.invoke("todo:reorderTasks", orderedIds),
  reorderSubtasks: (taskId, orderedIds) => ipcRenderer.invoke("todo:reorderSubtasks", { taskId, orderedIds }),
  addTag: (tag) => ipcRenderer.invoke("todo:addTag", tag),
  deleteTag: (tag) => ipcRenderer.invoke("todo:deleteTag", tag),
  onChanged: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("todo:changed", listener);
    return () => ipcRenderer.removeListener("todo:changed", listener);
  }
});

// ─── 番茄钟 API ───
contextBridge.exposeInMainWorld("pomodoroApi", {
  getAll: () => ipcRenderer.invoke("pomodoro:getAll"),
  clearSessions: () => ipcRenderer.invoke("pomodoro:clearSessions"),
  start: (task) => ipcRenderer.invoke("pomodoro:start", task || {}),
  finish: (status) => ipcRenderer.invoke("pomodoro:finish", status),
  addTask: (task) => ipcRenderer.invoke("pomodoro:task-add", task || {}),
  updateTask: (id, patch) => ipcRenderer.invoke("pomodoro:task-update", { id, patch }),
  deleteTask: (id) => ipcRenderer.invoke("pomodoro:task-delete", id),
  addTag: (tag) => ipcRenderer.invoke("pomodoro:addTag", tag),
  deleteTag: (tag) => ipcRenderer.invoke("pomodoro:deleteTag", tag),
  saveSettings: (settings) => ipcRenderer.invoke("pomodoro:saveSettings", settings),
  setImmersive: (enabled) => ipcRenderer.invoke("pomodoro:setImmersive", Boolean(enabled)),
  onChanged: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("pomodoro:changed", listener);
    return () => ipcRenderer.removeListener("pomodoro:changed", listener);
  }
});

// ─── 记账助手 API ───
contextBridge.exposeInMainWorld("financeApi", {
  getAll: () => ipcRenderer.invoke("finance:getAll"),
  add: (entry) => ipcRenderer.invoke("finance:add", entry || {}),
  update: (id, patch) => ipcRenderer.invoke("finance:update", { id, patch }),
  delete: (id) => ipcRenderer.invoke("finance:delete", id),
  addTag: (type, name) => ipcRenderer.invoke("finance:tag-add", { type, name }),
  renameTag: (type, oldName, newName) => ipcRenderer.invoke("finance:tag-rename", { type, oldName, newName }),
  deleteTag: (type, name) => ipcRenderer.invoke("finance:tag-delete", { type, name }),
  exportJson: () => ipcRenderer.invoke("finance:export"),
  importJson: () => ipcRenderer.invoke("finance:import"),
  onChanged: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("finance:changed", listener);
    return () => ipcRenderer.removeListener("finance:changed", listener);
  }
});
