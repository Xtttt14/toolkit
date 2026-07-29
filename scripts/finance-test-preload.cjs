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

const waterState = {
  date: key(today),
  settings: {
    targetCups: 8,
    cupProfiles: [{ id: "cup-300", name: "日常水杯", ml: 300 }],
    selectedCupId: "cup-300",
    hasChosenCup: true,
    targetCupsByCupId: { "cup-300": 8 },
    workStart: "09:30",
    workEnd: "18:30",
    staleMinutes: 60,
    repeatUntilLogged: true,
    snoozeMinutes: 15,
    showClosePrompt: true,
    closeAction: "hide",
    progressMode: "ml"
  },
  selectedCup: { id: "cup-300", name: "日常水杯", ml: 300 },
  today: { entries: [], cups: 0, totalMl: 0, targetMl: 2400, lastEntry: null },
  history: { days: {} }
};
contextBridge.exposeInMainWorld("waterApi", {
  getState: async () => structuredClone(waterState),
  addDrink: async () => structuredClone(waterState),
  undoDrink: async () => structuredClone(waterState),
  saveSettings: async () => structuredClone(waterState),
  requestClose: async () => {},
  getRuntimeStatus: async () => ({}),
  resolveCloseChoice: async () => {},
  onStateChanged: () => () => {},
  onClosePrompt: () => () => {}
});

const todoData = {
  tags: ["工作", "个人"],
  tasks: [
    {
      id: "task-1", title: "整理本周计划", description: "确认优先事项", priority: "P1",
      tags: ["工作"], dueDate: new Date(today.getTime() + 86400000).toISOString(),
      reminderMinutes: 30, completed: false, completedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      subtasks: [
        { id: "sub-1", title: "梳理需求与边界", completed: true },
        { id: "sub-2", title: "完成页面实现", completed: false },
        { id: "sub-3", title: "执行回归检查", completed: false }
      ]
    },
    {
      id: "task-2", title: "归档项目资料", description: "整理交付文件与会议记录", priority: "P2",
      tags: ["工作"], dueDate: null, reminderMinutes: 30, completed: false, completedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      subtasks: []
    }
  ]
};
contextBridge.exposeInMainWorld("todoApi", {
  getAll: async () => structuredClone(todoData),
  add: async () => structuredClone(todoData),
  update: async () => structuredClone(todoData),
  delete: async () => structuredClone(todoData),
  toggleComplete: async () => structuredClone(todoData),
  toggleSubtask: async (taskId, subtaskId) => {
    const task = todoData.tasks.find(item => item.id === taskId);
    const subtask = task?.subtasks.find(item => item.id === subtaskId);
    if (subtask) subtask.completed = !subtask.completed;
    return structuredClone(todoData);
  },
  reorderTasks: async (orderedIds) => {
    const taskById = new Map(todoData.tasks.map(task => [task.id, task]));
    const ordered = orderedIds.map(id => taskById.get(id)).filter(Boolean);
    if (ordered.length === todoData.tasks.length) todoData.tasks = ordered;
    return structuredClone(todoData);
  },
  reorderSubtasks: async (taskId, orderedIds) => {
    const task = todoData.tasks.find(item => item.id === taskId);
    if (task) {
      const subtaskById = new Map(task.subtasks.map(subtask => [subtask.id, subtask]));
      const ordered = orderedIds.map(id => subtaskById.get(id)).filter(Boolean);
      if (ordered.length === task.subtasks.length) task.subtasks = ordered;
    }
    return structuredClone(todoData);
  },
  addTag: async () => structuredClone(todoData),
  deleteTag: async () => structuredClone(todoData),
  onChanged: () => () => {}
});
