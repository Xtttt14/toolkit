import React, { useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import AppSettings from "./pages/AppSettings.jsx";
import DesktopWidget from "./pages/DesktopWidget.jsx";
import DrinkingApp from "./modules/DrinkingApp.jsx";
import TodoApp from "./modules/TodoApp.jsx";
import FinanceApp from "./modules/FinanceApp.jsx";
import PomodoroApp from "./modules/PomodoroApp.jsx";

function NavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => window.appApi?.onNavigate(route => navigate(route)) || undefined, [navigate]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <NavigationBridge />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<AppSettings />} />
        <Route path="/widget" element={<DesktopWidget />} />
        <Route path="/drinking/*" element={<DrinkingApp />} />
        <Route path="/todo/*" element={<TodoApp />} />
        <Route path="/pomodoro/*" element={<PomodoroApp />} />
        <Route path="/finance/*" element={<FinanceApp />} />
      </Routes>
    </HashRouter>
  );
}
