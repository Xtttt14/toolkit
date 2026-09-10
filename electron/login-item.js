const LOGIN_ITEM_NAME = 'local.personal.toolbox';
const LEGACY_NAMES = new Set(['electron.app.Electron', 'electron.app.个人工具箱']);

function syncLoginItem({ app, isDev, execPath, portablePath, enabled }) {
  const path = portablePath || execPath;
  // Electron writes Windows arguments verbatim; quote the project directory.
  const args = isDev ? [`"${app.getAppPath()}"`, '--hidden'] : ['--hidden'];
  const oldItems = app.getLoginItemSettings({ path }).launchItems || [];
  app.setLoginItemSettings({ name: LOGIN_ITEM_NAME, openAtLogin: Boolean(enabled), path, args });
  for (const item of oldItems) {
    // Only migrate this executable's known user-level aliases, never other apps.
    if (item.scope === 'user' && LEGACY_NAMES.has(item.name)
        && String(item.path).replace(/^"|"$/g, '').toLowerCase() === path.toLowerCase()) {
      app.setLoginItemSettings({ name: item.name, openAtLogin: false, path, args: item.args });
    }
  }
}
module.exports = { syncLoginItem, LOGIN_ITEM_NAME };
