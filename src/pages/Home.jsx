import React from "react";
import { useNavigate } from "react-router-dom";
import { CupSoda, CheckSquare, Timer, Calculator } from "lucide-react";

const modules = [
  { path: "/drinking", icon: CupSoda, title: "饮水提醒", desc: "定时提醒饮水，记录每日杯数" },
  { path: "/todo", icon: CheckSquare, title: "待办清单", desc: "管理任务，优先级排序，截止提醒" },
  { path: "/pomodoro", icon: Timer, title: "番茄钟", desc: "沉浸专注，回顾每一段投入" },
  { path: "/finance", icon: Calculator, title: "记账助手", desc: "收支管理，日历与统计报表" }
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="home-page">
      <div className="home-header">
        <h1>个人工具箱</h1>
        <p>本地多功能工具集合 · 饮水提醒 · 待办清单 · 番茄钟 · 记账助手</p>
      </div>
      <div className="module-grid">
        {modules.map(mod => (
          <button
            key={mod.path}
            className={`module-card ${mod.disabled ? "disabled" : ""}`}
            onClick={() => !mod.disabled && navigate(mod.path)}
            disabled={mod.disabled}
          >
            <span className="module-icon"><mod.icon size={38} strokeWidth={1.5} /></span>
            <div className="module-text">
              <strong>{mod.title}</strong>
              <span>{mod.desc}</span>
            </div>
            {mod.disabled && <em className="module-hint">{mod.hint}</em>}
          </button>
        ))}
      </div>
    </main>
  );
}
