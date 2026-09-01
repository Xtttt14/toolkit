const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");
const settings = fs.readFileSync(path.join(root, "src", "pages", "AppSettings.jsx"), "utf8");

(async () => {
  const { shortcutFromKeyboardEvent, shortcutKeys } = await import(pathToFileURL(path.join(root, "src", "utils", "shortcut.mjs")));
  const event = (code, modifiers = {}) => ({ code, key: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers });
  const checks = [
    [shortcutFromKeyboardEvent(event("KeyK", { ctrlKey: true, altKey: true })).accelerator === "Control+Alt+K", "无法录入字母组合键"],
    [shortcutFromKeyboardEvent(event("ArrowUp", { ctrlKey: true })).accelerator === "Control+Up", "无法录入方向键组合"],
    [shortcutFromKeyboardEvent(event("F8")).accelerator === "F8", "无法录入独立功能键"],
    [shortcutFromKeyboardEvent(event("KeyA")).accelerator === "", "不应接受无修饰字母键"],
    [shortcutKeys("Control+Shift+Space").join("+") === "Ctrl+Shift+空格", "快捷键显示格式错误"],
    [settings.includes("ShortcutRecorder") && !settings.includes("shortcutOptions"), "设置页仍在使用固定快捷键列表"],
    [main.includes("normalizeMainWindowShortcut") && !main.includes("supportedMainWindowShortcuts"), "主进程仍限制为固定快捷键"],
    [main.includes("registerMainWindowShortcut(next.mainWindowShortcut)") && main.includes("恢复原快捷键"), "快捷键冲突回退链路不完整"]
  ];
  const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
  if (failures.length) {
    console.error(failures.map(message => `- ${message}`).join("\n"));
    process.exit(1);
  }
  console.log("自定义快捷键录入、显示、校验和冲突回退检查通过。");
})().catch(error => { console.error(error); process.exit(1); });
