const { contextBridge, ipcRenderer } = require("electron");

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
  addTag: (tag) => ipcRenderer.invoke("todo:addTag", tag),
  deleteTag: (tag) => ipcRenderer.invoke("todo:deleteTag", tag),
  onChanged: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("todo:changed", listener);
    return () => ipcRenderer.removeListener("todo:changed", listener);
  }
});
