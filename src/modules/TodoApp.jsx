import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ListTodo } from "lucide-react";
import TodoView from "./todo/TodoView.jsx";

export default function TodoApp() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    window.todoApi.getAll().then(d => setData(d));
    const off = window.todoApi.onChanged(d => setData(d));
    return () => off();
  }, []);

  if (!data) return null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark todo-brand-mark" aria-hidden="true">
            <ListTodo size={26} strokeWidth={2.1} />
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
        <TodoView data={data} setData={setData} />
      </section>
    </main>
  );
}
