import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import DrinkingApp from "./modules/DrinkingApp.jsx";
import TodoApp from "./modules/TodoApp.jsx";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/drinking/*" element={<DrinkingApp />} />
        <Route path="/todo/*" element={<TodoApp />} />
      </Routes>
    </HashRouter>
  );
}
