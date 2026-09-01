const { contextBridge } = require("electron");

let settings = {
  showClosePrompt: true,
  closeAction: "hide",
  mainWindowShortcut: "Control+Shift+X",
  launchAtLogin: false,
  showActionConfirmations: true,
  version: "test"
};

contextBridge.exposeInMainWorld("appApi", {
  getSettings: async () => settings,
  saveSettings: async patch => { settings = { ...settings, ...(patch || {}) }; return settings; },
  onSettingsChanged: () => () => {},
  onNavigate: () => () => {},
  getUpdateStatus: async () => ({ status: "unsupported", version: "test", message: "测试环境" }),
  onUpdateStatus: () => () => {}
});
