import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CupSoda } from "lucide-react";
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
    <main className="app-shell drinking-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark internal-module-mark" aria-hidden="true">
            <CupSoda size={27} strokeWidth={1.8} />
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
