const modifierCodes = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);
const specialKeys = {
  Space: "Space", Tab: "Tab", Enter: "Enter", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down",
  ArrowLeft: "Left", ArrowRight: "Right", Escape: "Escape", Equal: "Plus", Minus: "-",
  NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult", NumpadDivide: "numdiv", NumpadDecimal: "numdec"
};

export function shortcutFromKeyboardEvent(event) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  if (modifierCodes.has(event.code)) return { accelerator: "", preview: modifiers };

  let key = "";
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  else if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) key = event.code;
  else if (/^Numpad[0-9]$/.test(event.code)) key = `num${event.code.slice(6)}`;
  else key = specialKeys[event.code] || "";

  const hasPrimaryModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (!key || (!hasPrimaryModifier && !/^F(?:[1-9]|1\d|2[0-4])$/.test(key))) {
    return { accelerator: "", preview: [...modifiers, key].filter(Boolean) };
  }
  return { accelerator: [...modifiers, key].join("+"), preview: [...modifiers, key] };
}

const displayNames = { Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win", Space: "空格", Up: "↑", Down: "↓", Left: "←", Right: "→", Plus: "+", Enter: "Enter", Escape: "Esc" };
export const shortcutKeys = shortcut => String(shortcut || "").split("+").filter(Boolean).map(key => displayNames[key] || key.toUpperCase());
