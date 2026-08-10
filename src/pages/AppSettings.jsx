import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Calculator, Check, CircleCheck, Download, Info, LayoutPanelTop, ListTodo, LogOut,
  RefreshCw, Settings, ShieldCheck, Timer
} from "lucide-react";

const fallbackSettings = {
  showClosePrompt: true,
  closeAction: "hide",
  widgetEnabled: true,
  widgetMode: "pomodoro",
  version: ""
};

function SettingSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`app-setting-switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span />
      <em>{checked ? "开启" : "关闭"}</em>
    </button>
  );
}

export default function AppSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);

  useEffect(() => {
    let active = true;
    window.appApi?.getSettings().then(data => active && setSettings({ ...fallbackSettings, ...data }));
    const off = window.appApi?.onSettingsChanged(data => setSettings(current => ({ ...current, ...data })));
    return () => {
      active = false;
      off?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.appApi?.getUpdateStatus().then(status => active && setUpdateStatus(status));
    const off = window.appApi?.onUpdateStatus(status => setUpdateStatus(status));
    return () => {
      active = false;
      off?.();
    };
  }, []);

  const update = async patch => {
    setSettings(current => ({ ...current, ...patch }));
    const next = await window.appApi?.saveSettings(patch);
    if (next) setSettings(current => ({ ...current, ...next }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const handleUpdateAction = async () => {
    if (!updateStatus || updateStatus.status === "unsupported" || updateStatus.status === "checking" || updateStatus.status === "downloading") return;
    if (updateStatus.status === "available") {
      setUpdateStatus(current => ({ ...current, status: "downloading", percent: 0, message: "正在准备下载…" }));
      await window.appApi?.downloadUpdate();
      return;
    }
    if (updateStatus.status === "ready") {
      await window.appApi?.installUpdate();
      return;
    }
    setUpdateStatus(current => ({ ...current, status: "checking", message: "正在检查更新…" }));
    await window.appApi?.checkForUpdates();
  };

  if (!settings) return null;

  return (
    <main className="app-settings-page">
      <header className="app-settings-hero">
        <button className="settings-back" onClick={() => navigate("/")} aria-label="返回主页">
          <ArrowLeft size={20} />
        </button>
        <div className="settings-hero-mark"><Settings size={27} /></div>
        <div>
          <span>PERSONAL TOOLBOX</span>
          <h1>工具箱设置</h1>
          <p>管理应用行为与桌面组件。修改会立即生效，并保存在本机。</p>
        </div>
        <div className={`settings-saved ${saved ? "visible" : ""}`}><Check size={15} />已保存</div>
      </header>

      <section className="app-settings-grid">
        <article className="app-settings-card">
          <header>
            <span className="settings-card-icon coral"><LogOut size={20} /></span>
            <div><span>WINDOW BEHAVIOR</span><h2>关闭与退出</h2></div>
          </header>
          <div className="app-setting-row">
            <div><strong>关闭时询问</strong><p>点击主窗口关闭按钮时，询问隐藏到托盘还是退出程序。</p></div>
            <SettingSwitch checked={settings.showClosePrompt} onChange={value => update({ showClosePrompt: value })} label="关闭时询问" />
          </div>
          <div className="app-setting-row vertical">
            <div><strong>不询问时的默认动作</strong><p>关闭询问后，主窗口将直接执行所选动作。</p></div>
            <div className="app-setting-choice">
              <button className={settings.closeAction === "hide" ? "active" : ""} onClick={() => update({ closeAction: "hide" })}>
                <LayoutPanelTop size={17} /><span>隐藏到托盘</span>
              </button>
              <button className={settings.closeAction === "quit" ? "active" : ""} onClick={() => update({ closeAction: "quit" })}>
                <LogOut size={17} /><span>退出程序</span>
              </button>
            </div>
          </div>
          <div className="settings-callout"><ShieldCheck size={17} /><span>隐藏主窗口不会停止提醒、专注计时或桌面组件。</span></div>
        </article>

        <article className="app-settings-card">
          <header>
            <span className="settings-card-icon blue"><LayoutPanelTop size={20} /></span>
            <div><span>DESKTOP WIDGET</span><h2>桌面组件</h2></div>
          </header>
          <div className="app-setting-row">
            <div><strong>显示桌面组件</strong><p>组件独立于主窗口，隐藏到托盘后仍会留在桌面，并由其他窗口自然遮挡。</p></div>
            <SettingSwitch checked={settings.widgetEnabled} onChange={value => update({ widgetEnabled: value })} label="显示桌面组件" />
          </div>
          <div className="app-setting-row vertical">
            <div><strong>默认显示内容</strong><p>也可以直接在组件顶部随时切换。</p></div>
            <div className="app-setting-choice widget-mode-choice">
              <button className={settings.widgetMode === "pomodoro" ? "active" : ""} onClick={() => update({ widgetMode: "pomodoro" })}>
                <Timer size={17} /><span>番茄钟</span>
              </button>
              <button className={settings.widgetMode === "todo" ? "active" : ""} onClick={() => update({ widgetMode: "todo" })}>
                <ListTodo size={17} /><span>Todo列表</span>
              </button>
              <button className={settings.widgetMode === "finance" ? "active" : ""} onClick={() => update({ widgetMode: "finance" })}>
                <Calculator size={17} /><span>记账</span>
              </button>
            </div>
          </div>
          <div className="settings-callout blue"><Info size={17} /><span>组件支持拖动和缩放；点击组件关闭按钮后，可在这里重新开启。</span></div>
        </article>

        <article className="app-settings-card app-update-card">
          <header>
            <span className="settings-card-icon green"><Download size={20} /></span>
            <div><span>SOFTWARE UPDATE</span><h2>软件更新</h2></div>
          </header>
          <div className="app-update-content">
            <div>
              <strong>{updateStatus?.status === "ready" ? "更新已准备就绪" : "自动更新"}</strong>
              <p>{updateStatus?.message || "启动后会自动检查 GitHub Releases 中的新版本。"}</p>
              {updateStatus?.status === "downloading" && <div className="update-progress"><span style={{ width: `${updateStatus.percent || 0}%` }} /></div>}
            </div>
            <button
              className="app-update-button"
              type="button"
              onClick={handleUpdateAction}
              disabled={!updateStatus || ["unsupported", "checking", "downloading"].includes(updateStatus.status)}
            >
              {updateStatus?.status === "ready" ? <CircleCheck size={16} /> : updateStatus?.status === "available" ? <Download size={16} /> : <RefreshCw size={16} className={updateStatus?.status === "checking" ? "spin" : ""} />}
              {updateStatus?.status === "ready" ? "重启并更新" : updateStatus?.status === "available" ? "下载更新" : updateStatus?.status === "downloading" ? `下载中 ${updateStatus.percent || 0}%` : updateStatus?.status === "unsupported" ? "安装版可用" : "检查更新"}
            </button>
          </div>
          <div className="settings-callout green"><ShieldCheck size={17} /><span>更新仅适用于安装版；业务数据仍保存在本机，不会被覆盖。</span></div>
        </article>
      </section>

      <footer className="app-settings-footer">
        <span><Info size={15} />所有设置与业务数据均保存在本机</span>
        {settings.version && <b>个人工具箱 v{settings.version}</b>}
      </footer>
    </main>
  );
}
