import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertTriangle, Check, ShieldAlert, X } from "lucide-react";

const ConfirmationContext = createContext(async () => true);
const confirmationPreferenceKey = "personal-toolbox.show-action-confirmations";

export function ConfirmationProvider({ children }) {
  const [enabled, setEnabled] = useState(true);
  const [pending, setPending] = useState(null);
  const [skipNextTime, setSkipNextTime] = useState(false);

  useEffect(() => {
    let active = true;
    const syncEnabled = settings => {
      const nextEnabled = settings?.showActionConfirmations !== false;
      if (nextEnabled) window.localStorage.removeItem(confirmationPreferenceKey);
      else window.localStorage.setItem(confirmationPreferenceKey, "false");
      setEnabled(nextEnabled);
    };
    window.appApi?.getSettings?.().then(settings => {
      if (!active) return;
      const locallyDisabled = window.localStorage.getItem(confirmationPreferenceKey) === "false";
      setEnabled(settings?.showActionConfirmations !== false && !locallyDisabled);
    });
    const off = window.appApi?.onSettingsChanged?.(settings => {
      syncEnabled(settings);
    });
    return () => { active = false; off?.(); };
  }, []);

  const confirm = useCallback((options = {}) => new Promise(resolve => {
    if (!enabled) {
      resolve(true);
      return;
    }
    setSkipNextTime(false);
    setPending({
      title: options.title || "确认此操作？",
      message: options.message || "此操作可能影响已有数据。",
      confirmLabel: options.confirmLabel || "确认",
      resolve
    });
  }), [enabled]);

  const close = value => {
    pending?.resolve(value);
    setPending(null);
  };

  const approve = async () => {
    if (skipNextTime) {
      window.localStorage.setItem(confirmationPreferenceKey, "false");
      setEnabled(false);
      close(true);
      try {
        await window.appApi?.saveSettings?.({ showActionConfirmations: false });
      } catch (error) {
        console.error("保存操作确认设置失败", error);
      }
      return;
    }
    close(true);
  };

  useEffect(() => {
    if (!pending) return undefined;
    const onKeyDown = event => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter") approve();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, skipNextTime]);

  return <ConfirmationContext.Provider value={confirm}>
    {children}
    {pending && <div className="confirmation-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && close(false)}>
      <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
        <div className="confirmation-mark"><ShieldAlert size={24} /></div>
        <div className="confirmation-content">
          <div className="confirmation-heading"><div><span>请确认操作</span><h2 id="confirmation-title">{pending.title}</h2></div><button type="button" onClick={() => close(false)} aria-label="取消"><X size={18} /></button></div>
          <p id="confirmation-message">{pending.message}</p>
          <label className="confirmation-skip"><input type="checkbox" checked={skipNextTime} onChange={event => setSkipNextTime(event.target.checked)} /><span>不再提示，可在设置中重新开启</span></label>
          <footer><button type="button" onClick={() => close(false)}>取消</button><button type="button" className="confirmation-approve" onClick={approve}><AlertTriangle size={16} />{pending.confirmLabel}</button></footer>
        </div>
      </section>
    </div>}
  </ConfirmationContext.Provider>;
}

export function useConfirmation() {
  return useContext(ConfirmationContext);
}
