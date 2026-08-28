import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Calculator, CalendarDays, FolderKanban, ReceiptText } from "lucide-react";
import FinanceView from "./finance/FinanceView.jsx";

const pages = [
  { id: "today", label: "今日记账", icon: ReceiptText },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "total-projects", label: "总计项目", icon: FolderKanban },
  { id: "reports", label: "报表", icon: BarChart3 }
];

export default function FinanceApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [page, setPage] = useState("today");

  useEffect(() => {
    window.financeApi.getAll().then(setData);
    const off = window.financeApi.onChanged(setData);
    return () => off();
  }, []);

  if (!data) return null;

  return (
    <main className="app-shell finance-shell">
      <aside className="sidebar finance-sidebar">
        <div className="brand">
          <span className="brand-mark internal-module-mark" aria-hidden="true">
            <Calculator size={27} strokeWidth={1.8} />
          </span>
          <div>
            <strong>记账助手</strong>
            <span>本地收支账本</span>
          </div>
        </div>
        <nav className="nav finance-nav" aria-label="记账页面">
          {pages.map(item => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="finance-local-note">
          <span className="status-dot" />
          数据仅保存在本机
        </div>
      </aside>

      <section className="workspace finance-workspace">
        <header className="topbar finance-topbar">
          <div className="title-row">
            <button className="icon-button" onClick={() => navigate("/")} aria-label="返回主页">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p>{pages.find(item => item.id === page)?.label}</p>
              <h1>记账助手</h1>
            </div>
          </div>
        </header>
        <FinanceView page={page} data={data} focusAmount={new URLSearchParams(location.search).get("quick") === "amount"} />
      </section>
    </main>
  );
}
