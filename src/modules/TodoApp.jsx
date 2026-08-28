import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckSquare } from "lucide-react";
import TodoView from "./todo/TodoView.jsx";

export default function TodoApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);

  useEffect(() => {
    window.todoApi.getAll().then(d => setData(d));
    const off = window.todoApi.onChanged(d => setData(d));
    return () => off();
  }, []);

  if (!data) return null;

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
        <TodoView data={data} setData={setData} createRequest={new URLSearchParams(location.search).get("create") || ""} />
      </section>
    </main>
  );
}
