const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow } = require("electron");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.setPath("userData", path.join(os.tmpdir(), `personal-toolbox-shortcut-ui-${process.pid}`));
app.whenReady().then(async () => {
  const errors = [];
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "shortcut-test-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.webContents.on("console-message", (_, level, message) => { if (level >= 3) errors.push(message); });
  await window.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "/settings" });
  await new Promise(resolve => setTimeout(resolve, 160));
  const recorderExists = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.shortcut-recorder'))`);
  if (!recorderExists) throw new Error(`快捷键录入器未渲染：${errors.join("；") || "页面无控制台错误"}`);
  await window.webContents.executeJavaScript(`document.querySelector('.shortcut-recorder').click()`);
  await new Promise(resolve => setTimeout(resolve, 80));
  await window.webContents.executeJavaScript(`document.querySelector('.shortcut-recorder').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK',key:'k',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}))`);
  await new Promise(resolve => setTimeout(resolve, 120));
  const result = await window.webContents.executeJavaScript(`(() => {
    const recorder=document.querySelector('.shortcut-recorder');
    const reset=document.querySelector('.shortcut-reset');
    const recorderRect=recorder.getBoundingClientRect();
    const resetRect=reset.getBoundingClientRect();
    return {
      keys:[...recorder.querySelectorAll('kbd')].map(item=>item.textContent),
      recording:recorder.classList.contains('recording'),
      recorderWidth:recorderRect.width,
      resetRightOfRecorder:resetRect.left>recorderRect.right,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
    };
  })()`);
  const failures = [
    [result.keys.join("+") === "Ctrl+Alt+K", "录入后的键帽显示不正确"],
    [!result.recording, "完成组合键后仍处于录制状态"],
    [result.recorderWidth >= 280 && result.resetRightOfRecorder, "快捷键录入区布局异常"],
    [!result.horizontalOverflow, "设置页出现横向溢出"],
    [errors.length === 0, `页面控制台出现错误：${errors.join("；")}`]
  ].filter(([passed]) => !passed).map(([, message]) => message);
  await window.close();
  if (failures.length) {
    console.error(failures.map(message => `- ${message}`).join("\n"));
    app.exit(1);
    return;
  }
  console.log("自定义快捷键设置页录入与布局检查通过。");
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
