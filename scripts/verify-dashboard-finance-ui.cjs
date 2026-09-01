const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shifted = days => { const date = new Date(); date.setDate(date.getDate() + days); return date; };

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.setPath("userData", path.join(os.tmpdir(), `personal-toolbox-dashboard-finance-${process.pid}`));

app.whenReady().then(async () => {
  const errors = [];
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "finance-test-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.webContents.on("console-message", (_, level, message) => { if (level >= 3) errors.push(message); });
  await window.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "/" });
  await new Promise(resolve => setTimeout(resolve, 180));
  const result = await window.webContents.executeJavaScript(`(() => ({
    balanceLabel:document.querySelector('.finance-hero-balance span')?.textContent,
    balanceValue:document.querySelector('.finance-hero-balance strong')?.textContent,
    metricLabels:[...document.querySelectorAll('.finance-hero-metrics em')].map(item=>item.textContent),
    metricValues:[...document.querySelectorAll('.finance-hero-metrics strong')].map(item=>item.textContent),
    detail:document.querySelector('.finance-hero-heading p')?.textContent
  }))()`);
  const month = key(new Date()).slice(0, 7);
  const monthExpenses = [[0, 28.5], [0, 16], [-1, 59], [-3, 120], [-8, 260]]
    .filter(([offset]) => key(shifted(offset)).startsWith(month))
    .reduce((sum, [, amount]) => sum + amount, 0);
  const expectedBalance = (8200 - monthExpenses).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const failures = [
    [result.balanceLabel === "本月结余", "首页主金额未切换为本月结余"],
    [result.balanceValue === expectedBalance, `本月结余计算错误：${result.balanceValue}`],
    [result.metricLabels.join("|") === "今日收入|今日支出", "右侧今日收支标签错误"],
    [result.metricValues.join("|") === "¥8,200.00|¥44.50", "右侧今日收支金额错误"],
    [result.detail.includes("本月已记录") && result.detail.includes("今日3笔"), "收支统计说明口径不清晰"],
    [errors.length === 0, `页面控制台出现错误：${errors.join("；")}`]
  ].filter(([passed]) => !passed).map(([, message]) => message);
  await window.close();
  if (failures.length) {
    console.error(failures.map(message => `- ${message}`).join("\n"));
    app.exit(1);
    return;
  }
  console.log("首页本月结余与今日收支显示检查通过。");
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
