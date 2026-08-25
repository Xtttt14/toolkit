import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, CupSoda, Droplets, Settings } from "lucide-react";
import DrinkingView from "./drinking/DrinkingView.jsx";

const pages = [
  { id: "cups", label: "容积", icon: CupSoda },
  { id: "progress", label: "进度", icon: Droplets },
  { id: "history", label: "历史", icon: CalendarDays },
  { id: "settings", label: "设置", icon: Settings }
];

export default function DrinkingApp() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [view, setView] = useState("cups");

  useEffect(() => {
    window.waterApi.getState().then(s => setState(s));
    const off = window.waterApi.onStateChanged(s => setState(s));
    return () => off();
  }, []);

  if (!state) return null;

  return (
    <main className="app-shell drinking-shell">
      <aside className="sidebar drinking-sidebar">
        <div className="brand">
          <span className="brand-mark internal-module-mark" aria-hidden="true">
            <CupSoda size={27} strokeWidth={1.8} />
          </span>
          <div>
            <strong>饮水提醒</strong>
            <span>本地工作助手</span>
          </div>
        </div>
        <nav className="nav drinking-nav" aria-label="饮水页面">
          {pages.map(item => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="drinking-local-note"><span className="status-dot" />数据仅保存在本机</div>
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
        <DrinkingView state={state} setState={setState} view={view} setView={setView} />
      </section>
    </main>
  );
}
