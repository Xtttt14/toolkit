const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const outputDir = path.join(__dirname, "..", "tmp-finance-check");
fs.mkdirSync(outputDir, { recursive: true });

async function inspect(window, name) {
  const metrics = await window.webContents.executeJavaScript(`(() => {
    const root = document.documentElement;
    const body = document.body;
    const page = document.querySelector(".finance-page");
    const rect = page?.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      root: [root.scrollWidth, root.clientWidth, root.scrollHeight, root.clientHeight],
      body: [body.scrollWidth, body.clientWidth, body.scrollHeight, body.clientHeight],
      page: rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)] : null,
      financePage: Boolean(page),
      visibleText: document.body.innerText.slice(0, 240)
    };
  })()`);
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, `${name}.png`), image.toPNG());
  return metrics;
}

async function inspectTheme(window, route, name) {
  await window.loadURL(`http://127.0.0.1:5173/#/${route}`);
  await new Promise(resolve => setTimeout(resolve, 450));
  const metrics = await inspect(window, name);
  metrics.theme = await window.webContents.executeJavaScript(`(() => {
    const shell = document.querySelector(".app-shell");
    const style = shell ? getComputedStyle(shell) : null;
    const tagButtons = [...document.querySelectorAll(".tag-grid button")];
    const ratios = tagButtons.map(button => {
      const rect = button.getBoundingClientRect();
      return rect.height ? rect.width / rect.height : 0;
    });
    const rects = tagButtons.map(button => button.getBoundingClientRect());
    const overlaps = rects.flatMap((rect, index) => rects.slice(index + 1).map(other => (
      Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left))
      * Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top))
    )));
    return {
      backgroundImage: style?.backgroundImage || "",
      brandIconPaths: document.querySelectorAll(".internal-module-mark svg path").length,
      tagCount: tagButtons.length,
      tagWidthMin: rects.length ? Math.min(...rects.map(rect => rect.width)) : null,
      tagWidthMax: rects.length ? Math.max(...rects.map(rect => rect.width)) : null,
      tagHeightMin: rects.length ? Math.min(...rects.map(rect => rect.height)) : null,
      tagHeightMax: rects.length ? Math.max(...rects.map(rect => rect.height)) : null,
      tagRatioMin: ratios.length ? Math.min(...ratios) : null,
      tagRatioMax: ratios.length ? Math.max(...ratios) : null,
      tagOverlapMax: overlaps.length ? Math.max(...overlaps) : 0
    };
  })()`);
  return metrics;
}

app.whenReady().then(async () => {
  const results = {};
  const consoleErrors = [];
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: "#f4f3ef",
    webPreferences: {
      preload: path.join(__dirname, "finance-test-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true
    }
  });
  window.webContents.on("console-message", (_, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });
  await window.loadURL("http://127.0.0.1:5173/#/finance");
  await new Promise(resolve => setTimeout(resolve, 500));
  results.today1280 = await inspect(window, "today-1280x820");

  for (const [label, name] of [["日历", "calendar-1280x820"], ["报表", "reports-1280x820"]]) {
    await window.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(button => button.textContent.trim() === ${JSON.stringify(label)})?.click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    results[name] = await inspect(window, name);
  }

  window.setSize(960, 640);
  await new Promise(resolve => setTimeout(resolve, 300));
  results.reports960 = await inspect(window, "reports-960x640");
  await window.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "日历")?.click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  results.calendar960 = await inspect(window, "calendar-960x640");
  results.calendarEdit = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector(".calendar-detail .entry-actions button")?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      opened: Boolean(document.querySelector(".entry-edit-modal")),
      title: document.querySelector(".entry-edit-modal h2")?.textContent
    };
  })()`);
  await window.webContents.executeJavaScript(`document.querySelector(".entry-edit-modal header button")?.click()`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "今日记账")?.click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  results.today960 = await inspect(window, "today-960x640");
  results.addEntry = await window.webContents.executeJavaScript(`(async () => {
    const setValue = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles:true }));
    };
    setValue(document.querySelector(".amount-field input"), "12.34");
    setValue(document.querySelector(".entry-meta label:last-child input"), "自动化验证");
    [...document.querySelectorAll(".tag-grid button")].find(button => button.textContent.trim() === "零食")?.click();
    document.querySelector(".entry-form").requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      saved: document.body.innerText.includes("12.34"),
      message: document.querySelector(".save-message")?.textContent
    };
  })()`);
  window.setSize(1280, 820);
  results.drinkingTheme = await inspectTheme(window, "drinking", "drinking-warm-1280x820");
  results.todoTheme = await inspectTheme(window, "todo", "todo-warm-1280x820");
  results.financeTag1280 = await inspectTheme(window, "finance", "finance-square-1280x820");
  window.setSize(960, 640);
  await new Promise(resolve => setTimeout(resolve, 250));
  results.financeTag960 = await inspect(window, "finance-square-960x640");
  results.financeTag960.theme = await window.webContents.executeJavaScript(`(() => {
    const ratios = [...document.querySelectorAll(".tag-grid button")].map(button => {
      const rect = button.getBoundingClientRect();
      return rect.height ? rect.width / rect.height : 0;
    });
    const rects = [...document.querySelectorAll(".tag-grid button")].map(button => button.getBoundingClientRect());
    const overlaps = rects.flatMap((rect, index) => rects.slice(index + 1).map(other => (
      Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left))
      * Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top))
    )));
    return { tagRatioMin:Math.min(...ratios), tagRatioMax:Math.max(...ratios), tagOverlapMax:Math.max(0,...overlaps) };
  })()`);

  results.consoleErrors = consoleErrors;
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  window.destroy();
  app.quit();
});
