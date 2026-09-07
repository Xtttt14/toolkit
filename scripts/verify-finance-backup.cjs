const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Conf = require("conf");
const { validateFinanceBackup } = require("../electron/finance-backup");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
const extractFunction = name => {
  const start = main.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing function ${name}`);
  return main.slice(start, main.indexOf("\n}", start) + 2);
};
const fixedTagsStart = main.indexOf("const fixedFinanceTags =");
const financeStart = main.indexOf("function normalizeFinanceEntry(");
const financeEnd = main.indexOf("function broadcastFinance(", financeStart);
const importStart = main.indexOf('ipcMain.handle("finance:import"');
const importSource = main.slice(importStart, main.indexOf("\n});", importStart) + 4);
const plain = value => JSON.parse(JSON.stringify(value));
const date = "2030-06-01T08:00:00.000Z";
const entry = { id: "backup-entry", type: "expense", amount: 25.5, tag: "学习", note: "书籍", date: "2030-06-01", createdAt: date, updatedAt: date };
const backup = {
  version: 3,
  entries: [entry],
  customTags: { income: ["奖学金"], expense: ["教材"] },
  tagSettings: { income: { order: ["奖学金", "生活费"], hidden: ["股票"] }, expense: { order: ["教材", "学习"], hidden: ["烟酒", "美妆"] } },
  totalProjects: [{ id: "project", name: "学习支出", linkedEntryIds: [entry.id], records: [{ id: "record", amount: 12, note: "文具", date: null, createdAt: date, updatedAt: date }], createdAt: date, updatedAt: date }]
};
const initial = {
  entries: [{ ...entry, id: "original-entry", amount: 99 }],
  customTags: { income: [], expense: ["旧标签"] },
  tagSettings: { income: { order: [], hidden: [] }, expense: { order: ["旧标签"], hidden: ["学习"] } },
  totalProjects: [{ id: "original-project", name: "原项目", records: [], linkedEntryIds: [] }],
  retainedSetting: { keep: true }
};

// Exercise the actual main-process handlers and normalizers, with only dialogs,
// selected-file reads and broadcasts stubbed. Conf is electron-store's backend.
async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "toolkit-finance-backup-"));
  try {
    const store = new Conf({ cwd: directory, configName: "finance-test", projectName: "toolkit-finance-backup-test" });
    let selectedBackup;
    let writes = 0;
    let broadcasts = 0;
    let failWrite = false;
    let confirmation = 1;
    const write = store._write.bind(store);
    store._write = value => {
      writes += 1;
      if (failWrite) throw Object.assign(new Error("模拟写入失败"), { code: "EACCES" });
      return write(value);
    };
    const handlers = new Map();
    const context = vm.createContext({
      financeStore: store,
      validateFinanceBackup,
      todayKey: () => "2030-06-01",
      path,
      mainWindow: null,
      fs: { readFileSync: () => selectedBackup, promises: { readFile: async () => selectedBackup } },
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(directory, "selected.json")] }),
        showMessageBox: async (_, options) => ({ response: options.type === "warning" ? confirmation : 0 })
      },
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      broadcastFinance: () => { broadcasts += 1; }
    });
    vm.runInContext([
      main.slice(fixedTagsStart, main.indexOf("\n};", fixedTagsStart) + 3),
      extractFunction("normalizeStringList"),
      main.slice(financeStart, financeEnd),
      extractFunction("executeAssistantToolCalls"),
      importSource
    ].join("\n"), context);

    const reset = data => {
      failWrite = false;
      confirmation = 1;
      store.store = plain(initial);
      selectedBackup = JSON.stringify(data);
      writes = 0;
      broadcasts = 0;
    };
    const restore = async channel => channel === "desktop"
      ? handlers.get("finance:import")()
      : context.executeAssistantToolCalls([{ name: "finance.backup.import", arguments: { confirmed: true, filePath: path.join(directory, "selected.json") } }]);
    const invalidBackups = [
      null,
      { ...backup, customTags: [] },
      { ...backup, entries: [null] },
      { ...backup, entries: [{ ...entry, amount: "oops" }] },
      { ...backup, entries: [{ ...entry, amount: 0 }] },
      { ...backup, entries: [{ ...entry, amount: -2 }] },
      { ...backup, entries: [{ ...entry, amount: 1e309 }] },
      { ...backup, entries: [{ ...entry, date: "2030-02-31" }] },
      { ...backup, entries: [{ ...entry, createdAt: 42 }] },
      { ...backup, entries: [entry, entry] },
      { ...backup, tagSettings: null },
      { ...backup, tagSettings: { expense: { hidden: [null] } } },
      { ...backup, totalProjects: [null] },
      { ...backup, totalProjects: null },
      { ...backup, totalProjects: [{ records: [null] }] },
      { ...backup, totalProjects: [{ records: [{ amount: "bad" }] }] },
      { ...backup, totalProjects: [{ linkedEntryIds: [{}] }] }
    ];

    for (const channel of ["desktop", "assistant"]) {
      for (const invalidBackup of invalidBackups) {
        reset(invalidBackup);
        const before = fs.readFileSync(store.path, "utf8");
        if (channel === "desktop") assert.equal((await restore(channel)).status, "error");
        else await assert.rejects(() => restore(channel), /记账备份/);
        assert.equal(writes, 0, `${channel}: malformed backup must not write`);
        assert.equal(broadcasts, 0);
        assert.equal(fs.readFileSync(store.path, "utf8"), before);
      }

      reset(backup);
      await restore(channel);
      assert.equal(writes, 1, `${channel}: restore must write one complete snapshot`);
      assert.equal(broadcasts, 1);
      assert.deepEqual(store.get("retainedSetting"), initial.retainedSetting);
      assert.deepEqual(store.get("tagSettings").expense.hidden, backup.tagSettings.expense.hidden);
      assert.deepEqual(store.get("tagSettings").expense.order.slice(0, 2), ["教材", "学习"]);
      const exported = plain(context.getFinanceData());
      reset(exported);
      await restore(channel);
      assert.deepEqual(plain(context.getFinanceData()), exported, `${channel}: full backup round trip`);

      reset({ version: 1, entries: [entry], customTags: { income: [], expense: [] } });
      await restore(channel);
      assert.equal(writes, 1);
      assert.deepEqual(store.get("totalProjects"), []);
      assert.deepEqual(store.get("tagSettings").expense.hidden, []);
      assert.equal(store.get("entries")[0].id, entry.id);

      reset(backup);
      const before = fs.readFileSync(store.path, "utf8");
      failWrite = true;
      if (channel === "desktop") assert.equal((await restore(channel)).status, "error");
      else await assert.rejects(() => restore(channel), /模拟写入失败/);
      assert.equal(writes, 1);
      assert.equal(broadcasts, 0);
      assert.equal(fs.readFileSync(store.path, "utf8"), before, `${channel}: failed write preserves file`);
      assert.deepEqual(plain(store.store), initial);
    }

    reset(backup);
    confirmation = 0;
    assert.equal((await restore("desktop")).status, "canceled");
    assert.equal(writes, 0);
    assert.equal(broadcasts, 0);

    // Other finance callers also get all-or-nothing normalization before set().
    reset(backup);
    assert.throws(() => context.saveFinanceData({ entries: [entry], totalProjects: [null] }));
    assert.equal(writes, 0);
    assert.deepEqual(plain(store.store), initial);
    console.log("记账备份验证通过：双入口嵌套校验、单次保存、完整标签与项目往返、旧格式、取消和写入失败。");
  } finally {
    const relative = path.relative(temporaryRoot, path.resolve(directory));
    assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Unexpected temporary cleanup path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
