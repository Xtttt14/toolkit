import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, CircleCheck, Download, Info, Keyboard, LayoutPanelTop, LogOut, Power, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { shortcutFromKeyboardEvent, shortcutKeys } from "../utils/shortcut.mjs";

const fallbackSettings = {
  showClosePrompt: true,
  closeAction: "hide",
  mainWindowShortcut: "Control+Shift+X",
  launchAtLogin: false,
  showActionConfirmations: true,
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

function ShortcutRecorder({ value, onChange, error }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState([]);
  const visibleKeys = recording ? preview : shortcutKeys(value);

  const handleKeyDown = event => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      setRecording(false);
      setPreview([]);
      return;
    }
    const next = shortcutFromKeyboardEvent(event);
    setPreview(next.preview);
    if (!next.accelerator) return;
    setRecording(false);
    setPreview([]);
    onChange(next.accelerator);
  };

  return <div className="shortcut-recorder-wrap">
    <button
      type="button"
      className={`shortcut-recorder ${recording ? "recording" : ""}`}
      onClick={() => { setRecording(true); setPreview([]); }}
      onKeyDown={handleKeyDown}
      aria-label={recording ? "正在录入主窗口快捷键" : `当前快捷键${shortcutKeys(value).join("加")}`}
    >
      <span className="shortcut-recorder-state">{recording ? "请按下组合键" : "当前快捷键"}</span>
      <span className="shortcut-key-row">
        {visibleKeys.length ? visibleKeys.map((key, index) => <React.Fragment key={`${key}-${index}`}><kbd>{key}</kbd>{index < visibleKeys.length - 1 && <i>+</i>}</React.Fragment>) : <em>等待输入…</em>}
      </span>
      <small>{recording ? "按Esc取消；请搭配Ctrl、Alt或Win键" : "点击此处重新录入"}</small>
    </button>
    <button type="button" className="shortcut-reset" onClick={() => onChange(fallbackSettings.mainWindowShortcut)} disabled={value === fallbackSettings.mainWindowShortcut}><RefreshCw size={14} />恢复默认</button>
    {error && <p className="app-setting-error" role="alert">{error}</p>}
  </div>;
}

export default function AppSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
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
    setSaveError("");
    try {
      const next = await window.appApi?.saveSettings(patch);
      if (next) setSettings(current => ({ ...current, ...next }));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch (error) {
      setSaveError(error?.message || "保存设置失败，请稍后重试。");
    }
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
          <p>管理应用行为。修改会立即生效，并保存在本机。</p>
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
          <div className="settings-callout"><ShieldCheck size={17} /><span>隐藏主窗口不会停止提醒或专注计时。</span></div>
        </article>

        <article className="app-settings-card">
          <header>
            <span className="settings-card-icon coral"><ShieldCheck size={20} /></span>
            <div><span>SAFETY</span><h2>操作确认</h2></div>
          </header>
          <div className="app-setting-row">
            <div><strong>删除、放弃前询问</strong><p>关闭后，删除待办、子任务、标签、项目和放弃专注将直接执行。</p></div>
            <SettingSwitch checked={settings.showActionConfirmations} onChange={value => update({ showActionConfirmations: value })} label="操作前确认" />
          </div>
          <div className="settings-callout"><ShieldCheck size={17} /><span>也可在确认弹窗勾选“不再提示”，随后可在这里重新开启。</span></div>
        </article>

        <article className="app-settings-card">
          <header>
            <span className="settings-card-icon blue"><Keyboard size={20} /></span>
            <div><span>KEYBOARD SHORTCUT</span><h2>主窗口快捷键</h2></div>
          </header>
          <div className="app-setting-row vertical">
            <div><strong>显示或隐藏主窗口</strong><p>即使工具箱在后台，也可以用此快捷键快速恢复或隐藏窗口。</p></div>
            <ShortcutRecorder value={settings.mainWindowShortcut} onChange={value => update({ mainWindowShortcut: value })} error={saveError} />
          </div>
          <div className="settings-callout blue"><Keyboard size={17} /><span>支持字母、数字、方向键、功能键等组合；若已被其他程序占用，将保留原快捷键。</span></div>
        </article>

        <article className="app-settings-card">
          <header>
            <span className="settings-card-icon green"><Power size={20} /></span>
            <div><span>STARTUP</span><h2>开机启动</h2></div>
          </header>
          <div className="app-setting-row">
            <div><strong>Windows 登录后自动启动</strong><p>登录 Windows 后自动在后台启动工具箱，提醒会按设置继续运行。</p></div>
            <SettingSwitch checked={settings.launchAtLogin} onChange={value => update({ launchAtLogin: value })} label="开机自动启动" />
          </div>
          <div className="settings-callout green"><ShieldCheck size={17} /><span>可随时关闭；该设置仅对当前 Windows 用户生效。</span></div>
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
