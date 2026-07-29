import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, ChevronDown, ChevronUp,
  Check, X, Calendar, Flag, AlertCircle, ListChecks, CheckCheck, GripVertical
} from "lucide-react";

const PRIORITIES = ["P0", "P1", "P2", "P3"];
const PRIORITY_COLORS = { P0: "#e03131", P1: "#f08c00", P2: "#2f9e44", P3: "#868e96" };
const PRIORITY_LABELS = { P0: "紧急", P1: "高", P2: "中", P3: "低" };

function moveItem(ids, sourceId, targetId, placement = "before") {
  if (sourceId === targetId) return ids;
  const remaining = ids.filter(id => id !== sourceId);
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex === -1) return ids;
  remaining.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceId);
  return remaining;
}

function formatDateInput(date) {
  if (!date) return "";
  return date.substring(0, 10);
}

function formatDateDisplay(date) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < -1) return `${Math.abs(days)}天前`;
  if (days === -1) return "昨天";
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days <= 7) return `${days}天后`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(d);
}

function isOverdue(date) {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

export default function TodoView({ data, setData }) {
  const tasks = data?.tasks || [];
  const tags = data?.tags || [];

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("manual");
  const [sortDir, setSortDir] = useState("asc");
  const [filterTag, setFilterTag] = useState(null);
  const [filterPriority, setFilterPriority] = useState(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [taskDrag, setTaskDrag] = useState(null);
  const [subtaskDrag, setSubtaskDrag] = useState(null);

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field); setSortDir("asc");
    }
  }
  function sortIcon(field) {
    if (sortBy !== field) return <span className="sort-neutral">⇅</span>;
    return sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  }

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (filterTag) list = list.filter(t => t.tags.includes(filterTag));
    if (filterPriority) list = list.filter(t => t.priority === filterPriority);
    if (sortBy === "manual") return list;
    // split completed and active
    const active = list.filter(t => !t.completed);
    const done = list.filter(t => t.completed);

    const sortFn = (a, b) => {
      let va, vb;
      switch (sortBy) {
        case "priority":
          va = PRIORITIES.indexOf(a.priority); vb = PRIORITIES.indexOf(b.priority);
          break;
        case "title":
          va = a.title.toLowerCase(); vb = b.title.toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "dueDate":
          va = a.dueDate || "9999"; vb = b.dueDate || "9999";
          break;
        default:
          va = 0; vb = 0;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    };
    active.sort(sortFn);
    done.sort(sortFn);
    return showCompleted ? [...active, ...done] : active;
  }, [tasks, search, filterTag, filterPriority, sortBy, sortDir, showCompleted]);

  const pendingCount = tasks.filter(t => !t.completed).length;

  async function runAction(action, failureMessage) {
    try {
      setError("");
      const result = await action();
      if (result && setData) setData(result);
      return result;
    } catch (actionError) {
      console.error(failureMessage, actionError);
      setError(`${failureMessage}，请重试。`);
      return null;
    }
  }

  async function createTask(task) {
    const result = await runAction(
      () => window.todoApi.add(task),
      "创建任务失败"
    );
    if (result) setIsCreating(false);
  }
  function toggleExpand(id) {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelect(id) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectAll() {
    if (filtered.length > 0 && filtered.every(task => selectedIds.has(task.id))) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map(t => t.id)));
  }
  function enterSelectionMode() {
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    setSelectionMode(true);
  }
  function exitSelectionMode() {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  async function deleteSelected() {
    const visibleSelectedIds = filtered.filter(task => selectedIds.has(task.id)).map(task => task.id);
    if (visibleSelectedIds.length === 0) return;
    const result = await runAction(
      () => window.todoApi.delete(visibleSelectedIds),
      "删除任务失败"
    );
    if (result) exitSelectionMode();
  }

  async function toggleTask(id) {
    return runAction(() => window.todoApi.toggleComplete(id), "更新任务失败");
  }

  async function updateTask(id, patch) {
    return runAction(() => window.todoApi.update(id, patch), "保存任务失败");
  }

  async function reorderTasks(sourceId, targetId, placement) {
    const orderedIds = moveItem(filtered.map(task => task.id), sourceId, targetId, placement);
    if (orderedIds.every((id, index) => id === filtered[index]?.id)) return;
    setSortBy("manual");
    setSortDir("asc");
    await runAction(() => window.todoApi.reorderTasks(orderedIds), "调整任务顺序失败");
  }

  async function reorderSubtasks(task, sourceId, targetId, placement) {
    const orderedIds = moveItem(task.subtasks.map(subtask => subtask.id), sourceId, targetId, placement);
    if (orderedIds.every((id, index) => id === task.subtasks[index]?.id)) return;
    await runAction(
      () => window.todoApi.reorderSubtasks(task.id, orderedIds),
      "调整子任务顺序失败"
    );
  }

  // Edit modal
  const editingTask = editingId ? tasks.find(t => t.id === editingId) : null;
  const allFilteredSelected = filtered.length > 0 && filtered.every(task => selectedIds.has(task.id));

  useEffect(() => {
    if (!selectionMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      exitSelectionMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode]);

  useEffect(() => {
    if (!selectionMode) return;
    const visibleIds = new Set(filtered.map(task => task.id));
    setSelectedIds(previous => {
      const next = new Set([...previous].filter(id => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filtered, selectionMode]);

  return (
    <div className="todo-layout">
      {/* Top toolbar */}
      <div className="todo-toolbar">
        <div className="todo-search-wrap">
          <Search size={16} />
          <input
            className="todo-search"
            placeholder="搜索任务..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="todo-filters">
          <select className="todo-select" value={filterPriority || ""} onChange={e => setFilterPriority(e.target.value || null)}>
            <option value="">全部优先级</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p} - {PRIORITY_LABELS[p]}</option>)}
          </select>
          <select className="todo-select" value={filterTag || ""} onChange={e => setFilterTag(e.target.value || null)}>
            <option value="">全部标签</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="todo-check-label">
            <input type="checkbox" checked={showCompleted} onChange={() => setShowCompleted(!showCompleted)} />
            <span>显示已完成</span>
          </label>
        </div>
        <div className={`todo-actions ${selectionMode ? "selection-active" : ""}`}>
          {selectionMode ? (
            <>
              <span className="todo-selection-summary" aria-live="polite">
                <CheckCheck size={15} /> 已选{selectedIds.size}项
              </span>
              <button className="todo-btn" onClick={selectAll} disabled={filtered.length === 0}>
                {allFilteredSelected ? "取消全选" : "全选"}
              </button>
              <button className="todo-btn danger" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                <Trash2 size={15} /> 删除{selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </button>
              <button className="todo-btn" onClick={exitSelectionMode}>
                <X size={15} /> 退出多选
              </button>
            </>
          ) : (
            <>
              <button className="todo-btn" onClick={enterSelectionMode} disabled={filtered.length === 0}>
                <ListChecks size={16} /> 多选
              </button>
              <button className="todo-btn primary" onClick={() => { setError(""); setIsCreating(true); }}>
                <Plus size={16} /> 新建任务
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="todo-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭错误提示"><X size={14} /></button>
        </div>
      )}

      {/* Sort header */}
      <div className="todo-header-row">
        <span className="todo-header-drag" title="拖拽调整任务顺序"><GripVertical size={14} /></span>
        <span className="todo-header-spacer" aria-hidden="true" />
        <button className="todo-sort-btn todo-header-title" onClick={() => toggleSort("title")}>
          任务名称 {sortIcon("title")}
        </button>
        <button className="todo-sort-btn todo-header-priority" onClick={() => toggleSort("priority")}>
          优先级 {sortIcon("priority")}
        </button>
        <button className="todo-sort-btn todo-header-date" onClick={() => toggleSort("dueDate")}>
          截止日期 {sortIcon("dueDate")}
        </button>
        <span className="todo-header-label todo-header-tags">标签</span>
        <span className="todo-header-label" style={{ width: 44 }} />
      </div>

      {/* Task list */}
      <div className="todo-list">
        {filtered.length === 0 ? (
          <div className="todo-empty">
            <Check size={36} />
            <span>暂无任务，点击"新建任务"开始</span>
          </div>
        ) : (
          filtered.map(task => (
            <div
              key={task.id}
              data-task-id={task.id}
              className={`todo-task-block ${taskDrag?.sourceId === task.id ? "dragging" : ""} ${taskDrag?.targetId === task.id ? `drag-over-${taskDrag.placement}` : ""}`}
            >
              <div
                className={`todo-row ${task.completed ? "completed" : ""} ${isOverdue(task.dueDate) && !task.completed ? "overdue" : ""} ${selectionMode ? "selecting" : ""} ${selectedIds.has(task.id) ? "selected" : ""}`}
                onClick={selectionMode ? () => toggleSelect(task.id) : undefined}
                onDragOver={(event) => {
                  if (!taskDrag?.sourceId || taskDrag.sourceId === task.id) return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setTaskDrag(previous => ({
                    ...previous,
                    targetId: task.id,
                    placement: event.clientY < rect.top + rect.height / 2 ? "before" : "after"
                  }));
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  if (!taskDrag?.sourceId || taskDrag.sourceId === task.id) return;
                  const currentDrag = taskDrag;
                  setTaskDrag(null);
                  await reorderTasks(currentDrag.sourceId, task.id, currentDrag.placement);
                }}
              >
                <span
                  className="todo-drag-handle"
                  draggable={!selectionMode}
                  role="button"
                  tabIndex={selectionMode ? -1 : 0}
                  title="拖拽调整任务顺序"
                  aria-label={`拖拽调整${task.title}的顺序`}
                  onClick={event => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task.id);
                    setTaskDrag({ sourceId: task.id, targetId: null, placement: "before" });
                  }}
                  onDragEnd={() => setTaskDrag(null)}
                >
                  <GripVertical size={17} />
                </span>
                {selectionMode ? (
                  <span
                    className="todo-selection-spacer"
                    aria-label={selectedIds.has(task.id) ? `已选择${task.title}` : `未选择${task.title}`}
                  />
                ) : (
                  <button
                    className={`todo-check-circle ${task.completed ? "done" : ""}`}
                    onClick={(event) => { event.stopPropagation(); toggleTask(task.id); }}
                    style={!task.completed ? { borderColor: PRIORITY_COLORS[task.priority] } : {}}
                    aria-label={task.completed ? `将${task.title}标记为未完成` : `将${task.title}标记为已完成`}
                  >
                    {task.completed && <Check size={13} />}
                  </button>
                )}
                <div className="todo-main" onClick={(event) => {
                  if (selectionMode) return;
                  event.stopPropagation();
                  if (!task.completed) setEditingId(task.id);
                }}>
                  <span className="todo-title">{task.title}</span>
                  {task.description && (
                    <span className="todo-desc-preview">{task.description.substring(0, 80)}{task.description.length > 80 ? "…" : ""}</span>
                  )}
                </div>
                <span className="todo-priority" style={{ color: PRIORITY_COLORS[task.priority] }}>
                  <Flag size={13} /> {task.priority}
                </span>
                <span className={`todo-date ${isOverdue(task.dueDate) && !task.completed ? "overdue" : ""}`}>
                  {task.dueDate ? (
                    <><Calendar size={13} /> {formatDateDisplay(task.dueDate)}</>
                  ) : (
                    <span className="todo-no-date">—</span>
                  )}
                </span>
                <div className="todo-tags-inline">
                  {task.tags.slice(0, 3).map(t => <span key={t} className="todo-tag-chip">{t}</span>)}
                  {task.tags.length > 3 && <span className="todo-tag-more">+{task.tags.length - 3}</span>}
                </div>
                <div className="todo-row-actions">
                  {!selectionMode && (
                    <>
                      {task.subtasks.length > 0 && (
                        <span className="todo-subtask-count" title={`${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length} 子任务`}>
                          {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                        </span>
                      )}
                      <button
                        className="todo-icon-btn"
                        onClick={(event) => { event.stopPropagation(); toggleExpand(task.id); }}
                        title="展开详情"
                      >
                        {expandedIds.has(task.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded: subtasks */}
              {expandedIds.has(task.id) && (
                <div className="todo-expand">
                  {task.description && (
                    <div className="todo-expand-desc">
                      <strong>备注：</strong>
                      <p>{task.description}</p>
                    </div>
                  )}
                  <div className="todo-expand-subtasks">
                    <div className="todo-subtask-head">
                      <div className="todo-subtask-heading">
                        <span className="todo-subtask-mark"><ListChecks size={18} /></span>
                        <div>
                          <strong>执行步骤</strong>
                          <span>
                            {task.subtasks.length === 0
                              ? "还没有拆分步骤"
                              : task.subtasks.every(sub => sub.completed)
                                ? "所有步骤均已完成"
                                : `还剩${task.subtasks.filter(sub => !sub.completed).length}项待完成`}
                          </span>
                        </div>
                      </div>
                      {task.subtasks.length > 0 && (
                        <div className="todo-subtask-progress-copy">
                          <b>{task.subtasks.filter(sub => sub.completed).length}</b>
                          <span>/{task.subtasks.length}</span>
                        </div>
                      )}
                    </div>
                    {task.subtasks.length > 0 && (
                      <div className="todo-subtask-progress" aria-hidden="true">
                        <span style={{ width: `${(task.subtasks.filter(sub => sub.completed).length / task.subtasks.length) * 100}%` }} />
                      </div>
                    )}
                    {task.subtasks.length === 0 ? (
                      <div className="todo-subtask-empty">
                        <ListChecks size={22} />
                        <span>编辑任务后可添加最多8个执行步骤</span>
                      </div>
                    ) : (
                      <div className="todo-subtask-grid">
                        {task.subtasks.map((sub, index) => (
                          <div
                            key={sub.id}
                            data-subtask-id={sub.id}
                            className={`todo-subtask-row ${sub.completed ? "completed" : ""} ${subtaskDrag?.sourceId === sub.id ? "dragging" : ""} ${subtaskDrag?.targetId === sub.id ? `drag-over-${subtaskDrag.placement}` : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => window.todoApi.toggleSubtask(task.id, sub.id)}
                            onKeyDown={event => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              window.todoApi.toggleSubtask(task.id, sub.id);
                            }}
                            onDragOver={(event) => {
                              if (subtaskDrag?.taskId !== task.id || subtaskDrag.sourceId === sub.id) return;
                              event.preventDefault();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setSubtaskDrag(previous => ({
                                ...previous,
                                targetId: sub.id,
                                placement: event.clientY < rect.top + rect.height / 2 ? "before" : "after"
                              }));
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (subtaskDrag?.taskId !== task.id || subtaskDrag.sourceId === sub.id) return;
                              const currentDrag = subtaskDrag;
                              setSubtaskDrag(null);
                              await reorderSubtasks(task, currentDrag.sourceId, sub.id, currentDrag.placement);
                            }}
                            aria-pressed={sub.completed}
                          >
                            <span
                              className="todo-subtask-drag"
                              draggable
                              title="拖拽调整步骤顺序"
                              aria-label={`拖拽调整${sub.title}的顺序`}
                              onClick={event => event.stopPropagation()}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", sub.id);
                                setSubtaskDrag({ taskId: task.id, sourceId: sub.id, targetId: null, placement: "before" });
                              }}
                              onDragEnd={() => setSubtaskDrag(null)}
                            >
                              <GripVertical size={16} />
                            </span>
                            <span className="todo-subtask-index">
                              {sub.completed ? <Check size={15} /> : String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="todo-subtask-copy">
                              <strong>{sub.title}</strong>
                              <em>{sub.completed ? "已完成" : "待完成"}</em>
                            </span>
                            <span className="todo-subtask-check" aria-hidden="true">
                              {sub.completed && <Check size={13} />}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <EditModal
          task={editingTask}
          tags={tags}
          onClose={() => setEditingId(null)}
          onSave={updateTask}
          onDelete={async (id) => {
            const result = await runAction(() => window.todoApi.delete([id]), "删除任务失败");
            if (result) setEditingId(null);
          }}
          onToggle={toggleTask}
        />
      )}

      {isCreating && (
        <EditModal
          task={{
            id: null,
            title: "",
            description: "",
            priority: "P3",
            dueDate: null,
            reminderMinutes: 30,
            tags: [],
            subtasks: [],
            completed: false
          }}
          tags={tags}
          mode="create"
          onClose={() => setIsCreating(false)}
          onSave={(_, task) => createTask(task)}
        />
      )}

      {/* Tag management */}
      <div className="todo-tag-bar">
        <span className="todo-tag-bar-label">标签管理：</span>
        {tags.map(t => (
          <span key={t} className={`todo-tag-chip lg ${filterTag === t ? "active" : ""}`} onClick={() => setFilterTag(filterTag === t ? null : t)}>
            {t}
            <button className="todo-tag-del" onClick={async (e) => { e.stopPropagation(); if (confirm(`删除标签"${t}"？`)) await window.todoApi.deleteTag(t); }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <div className="todo-tag-input-wrap">
          <input
            className="todo-tag-input"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={async e => {
              if (e.key === "Enter" && tagInput.trim()) {
                const newTag = tagInput.trim();
                if (!tags.includes(newTag)) {
                  await window.todoApi.addTag(newTag);
                }
                setTagInput("");
              }
            }}
            placeholder="新建标签…"
          />
        </div>
      </div>
      <div className="todo-stats">
        <span>共 {tasks.length} 项任务 · {pendingCount} 项未完成 · {tasks.filter(t => t.completed).length} 项已完成</span>
      </div>
    </div>
  );
}

/* ═══════ Edit Modal ═══════ */
function EditModal({ task, tags, mode = "edit", onClose, onSave, onDelete, onToggle }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(formatDateInput(task.dueDate));
  const [reminderMinutes, setReminderMinutes] = useState(task.reminderMinutes ?? 30);
  const [selectedTags, setSelectedTags] = useState([...task.tags]);
  const [subtasks, setSubtasks] = useState(task.subtasks.map(s => ({ ...s })));
  const [newSubtask, setNewSubtask] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = title !== task.title || description !== task.description || priority !== task.priority ||
    formatDateInput(task.dueDate) !== dueDate || reminderMinutes !== task.reminderMinutes ||
    JSON.stringify(selectedTags) !== JSON.stringify(task.tags) ||
    JSON.stringify(subtasks) !== JSON.stringify(task.subtasks);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSave() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setValidationError("请输入任务名称");
      return;
    }
    const patch = {
      title: cleanTitle,
      description: description.trim(),
      priority,
      dueDate: dueDate ? `${dueDate}T23:59:00` : null,
      reminderMinutes: Number(reminderMinutes),
      tags: selectedTags,
      subtasks: subtasks.map(s => ({ id: s.id, title: s.title, completed: s.completed }))
    };
    setIsSaving(true);
    const result = await onSave(task.id, patch);
    setIsSaving(false);
    if (result) onClose();
  }

  function addSubtask() {
    if (!newSubtask.trim() || subtasks.length >= 8) return;
    setSubtasks([...subtasks, { id: `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`, title: newSubtask.trim(), completed: false }]);
    setNewSubtask("");
  }

  function removeSubtask(sid) {
    setSubtasks(subtasks.filter(s => s.id !== sid));
  }

  function toggleTag(tag) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="todo-modal-title"
      >
        <div className="modal-head">
          <h2 id="todo-modal-title">{mode === "create" ? "新建任务" : "编辑任务"}</h2>
          <button className="icon-button small" onClick={onClose} aria-label="关闭任务编辑页" title="关闭（Esc）"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <label className="modal-field">
            <span>名称</span>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setValidationError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="例如：提交周报"
              autoFocus
            />
            {validationError && <small className="modal-field-error">{validationError}</small>}
          </label>

          <label className="modal-field">
            <span>备注</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="添加备注…" />
          </label>

          <div className="modal-row">
            <label className="modal-field half">
              <span>优先级</span>
              <div className="priority-pills">
                {PRIORITIES.map(p => (
                  <button key={p} className={`priority-pill ${priority === p ? "active" : ""}`}
                    style={priority === p ? { background: PRIORITY_COLORS[p], color: "#fff" } : {}}
                    onClick={() => setPriority(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </label>

            <label className="modal-field half">
              <span>截止日期</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>

          <label className="modal-field">
            <span>提前提醒</span>
            <select value={reminderMinutes} onChange={e => setReminderMinutes(Number(e.target.value))}>
              <option value={0}>不提醒</option>
              <option value={5}>5 分钟前</option>
              <option value={15}>15 分钟前</option>
              <option value={30}>30 分钟前</option>
              <option value={60}>1 小时前</option>
              <option value={120}>2 小时前</option>
              <option value={1440}>1 天前</option>
            </select>
          </label>

          <div className="modal-field">
            <span>标签</span>
            <div className="modal-tag-list">
              {tags.map(t => (
                <button key={t} className={`modal-tag ${selectedTags.includes(t) ? "active" : ""}`}
                  onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
              {tags.length === 0 && <span className="todo-empty-hint">暂无标签（保存标签后会在底部栏显示）</span>}
            </div>
          </div>

          <div className="modal-field">
            <span>子任务 ({subtasks.length}/8)</span>
            <div className="subtask-list">
              {subtasks.map(sub => (
                <div key={sub.id} className="subtask-edit-row">
                  <span className="subtask-edit-title">{sub.title}</span>
                  <button className="todo-icon-btn danger" onClick={() => removeSubtask(sub.id)}><X size={14} /></button>
                </div>
              ))}
            </div>
            {subtasks.length < 8 && (
              <div className="subtask-add-row">
                <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                  placeholder={`添加子任务 (${subtasks.length}/8)`} />
                <button className="todo-btn primary small" onClick={addSubtask}><Plus size={14} /></button>
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <div className="modal-foot-left">
            {mode === "edit" && (
              <>
                <button className="todo-btn" onClick={async () => { const result = await onToggle(task.id); if (result) onClose(); }}>
                  {task.completed ? "标记未完成" : "标记完成"}
                </button>
                <button className="todo-btn danger" onClick={() => onDelete(task.id)}><Trash2 size={14} /> 删除</button>
              </>
            )}
          </div>
          <div className="modal-foot-right">
            <button className="todo-btn" onClick={onClose}>取消</button>
            <button className="todo-btn primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中…" : mode === "create" ? "创建任务" : hasChanges ? "保存" : "关闭"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
