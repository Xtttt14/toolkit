import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckSquare, LoaderCircle, RotateCcw } from "lucide-react";
import TodoView from "./todo/TodoView.jsx";

function subscribeTodoData(api, onData, onError) {
  let active = true;
  let revision = 0;
  let unsubscribe;
  const receive = data => {
    if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.tags)) {
      throw new Error("待办数据格式无效");
    }
    onData(data);
  };
  try {
    // Subscribe first so a delayed initial read cannot replace a newer pushed snapshot.
    unsubscribe = api.onChanged(data => {
      if (!active) return;
      revision += 1;
      try { receive(data); }
      catch (error) { onError(error); }
    });
    const readRevision = revision;
    Promise.resolve(api.getAll()).then(data => {
      if (active && revision === readRevision) receive(data);
    }).catch(error => {
      if (active && revision === readRevision) onError(error);
    });
  } catch (error) {
    if (active) onError(error);
  }
  return () => {
    active = false;
    if (typeof unsubscribe === "function") unsubscribe();
  };
}

export default function TodoApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setLoadStatus("loading");
    return subscribeTodoData(window.todoApi, next => {
      setData(next);
      setLoadStatus("ready");
    }, error => {
      console.error("读取待办清单失败", error);
      setLoadStatus("error");
    });
  }, [loadAttempt]);

  return (
    <main className="app-shell todo-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark internal-module-mark" aria-hidden="true">
            <CheckSquare size={27} strokeWidth={1.8} />
          </span>
          <div>
            <strong>待办清单</strong>
            <span>任务管理</span>
          </div>
        </div>
        <nav className="nav">
          {/* 左侧导航留白，后续添加 */}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="title-row">
            <button className="icon-button" onClick={() => navigate("/")} aria-label="返回主页">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p>任务管理</p>
              <h1>待办清单</h1>
            </div>
          </div>
        </header>
        {loadStatus === "loading" && <div className="todo-empty" role="status"><LoaderCircle size={28} /><span>正在读取待办清单…</span></div>}
        {loadStatus === "error" && (
          <div className="todo-empty" role="alert">
            <AlertCircle size={28} />
            <span>读取待办清单失败，请重试</span>
            <button className="todo-btn" onClick={() => setLoadAttempt(attempt => attempt + 1)}><RotateCcw size={15} />重新加载</button>
          </div>
        )}
        {loadStatus === "ready" && <TodoView data={data} setData={setData} createRequest={new URLSearchParams(location.search).get("create") || ""} />}
      </section>
    </main>
  );
}
