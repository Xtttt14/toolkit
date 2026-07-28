import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DrinkingView from "./drinking/DrinkingView.jsx";

export default function DrinkingApp() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);

  useEffect(() => {
    window.waterApi.getState().then(s => setState(s));
    const off = window.waterApi.onStateChanged(s => setState(s));
    return () => off();
  }, []);

  if (!state) return null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <svg width="34" height="34" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#1597ff"/>
              <path d="M16 6c3.7 4.4 6.4 8.1 6.4 12a6.4 6.4 0 0 1-12.8 0C9.6 14.1 12.3 10.4 16 6z" fill="white"/>
            </svg>
          </span>
          <div>
            <strong>饮水提醒</strong>
            <span>本地工作助手</span>
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
              <p>{state.date || "今天"}</p>
              <h1>饮水提醒</h1>
            </div>
          </div>
        </header>
        <DrinkingView state={state} setState={setState} />
      </section>
    </main>
  );
}
