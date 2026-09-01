const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.js"), "utf8");
const checks = [
  [main.includes('const isStartupLaunch = process.argv.includes("--hidden")'), "缺少后台启动参数识别"],
  [main.includes('const args = isDev ? [app.getAppPath(), "--hidden"] : ["--hidden"]'), "开发环境开机启动未携带应用路径"],
  [main.includes("process.env.PORTABLE_EXECUTABLE_FILE || process.execPath"), "便携版启动路径未兼容"],
  [main.includes("if (isDev && !isStartupLaunch)") && main.includes('window.loadFile(path.join(__dirname, "../dist/index.html")'), "开发环境开机启动缺少本地构建页面兜底"],
  [main.includes("syncLoginItemSettings(getAppSettings().launchAtLogin)"), "启动时不会修复旧登录项"],
  [main.includes("if (!isStartupLaunch) mainWindow.show()"), "开机启动仍会弹出主窗口"]
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join("\n"));
  process.exit(1);
}
console.log("开机启动路径、后台启动和旧登录项修复检查通过。");
