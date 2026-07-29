const { contextBridge } = require("electron");

const today = new Date();
const key = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const at = offset => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return key(date);
};
let data = {
  version: 1,
  customTags: { income: ["项目奖金"], expense: ["订阅服务"] },
  entries: [
    { id: "1", type: "expense", amount: 28.5, tag: "三餐", note: "午餐", date: at(0), createdAt: "2026-07-29T10:00:00.000Z" },
    { id: "2", type: "expense", amount: 16, tag: "交通", note: "地铁", date: at(0), createdAt: "2026-07-29T09:00:00.000Z" },
    { id: "3", type: "income", amount: 8200, tag: "工资", note: "本月工资", date: at(0), createdAt: "2026-07-29T08:00:00.000Z" },
    { id: "4", type: "expense", amount: 59, tag: "学习", note: "课程", date: at(-1), createdAt: "2026-07-28T08:00:00.000Z" },
    { id: "5", type: "expense", amount: 120, tag: "日用品", note: "超市", date: at(-3), createdAt: "2026-07-26T08:00:00.000Z" },
    { id: "6", type: "expense", amount: 260, tag: "娱乐", note: "周末", date: at(-8), createdAt: "2026-07-21T08:00:00.000Z" }
  ]
};
const listeners = new Set();
const emit = () => listeners.forEach(callback => callback(structuredClone(data)));

contextBridge.exposeInMainWorld("financeApi", {
  getAll: async () => structuredClone(data),
  add: async entry => {
    data.entries.push({ ...entry, id: String(Date.now()), createdAt: new Date().toISOString() });
    emit();
    return structuredClone(data);
  },
  update: async (id, patch) => {
    data.entries = data.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    emit();
    return structuredClone(data);
  },
  delete: async id => {
    data.entries = data.entries.filter(entry => entry.id !== id);
    emit();
    return structuredClone(data);
  },
  addTag: async (type, name) => {
    data.customTags[type].push(name);
    emit();
  },
  renameTag: async (type, oldName, newName) => {
    data.customTags[type] = data.customTags[type].map(name => name === oldName ? newName : name);
    emit();
  },
  deleteTag: async (type, name) => {
    data.customTags[type] = data.customTags[type].filter(item => item !== name);
    emit();
  },
  exportJson: async () => ({ status: "exported" }),
  importJson: async () => ({ status: "canceled" }),
  onChanged: callback => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
});
