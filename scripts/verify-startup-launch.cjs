const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { syncLoginItem, LOGIN_ITEM_NAME } = require('../electron/login-item');
const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
for (const isDev of [true, false]) for (const enabled of [true, false]) {
  const writes=[];
  const exe='E:\\Tool Box\\electron.exe';
  const app={getAppPath:()=> 'E:\\Tool Box\\project',getLoginItemSettings:()=>({launchItems:[
    {name:'electron.app.Electron',path:exe,scope:'user',args:['--hidden']},
    {name:'electron.app.个人工具箱',path:exe,scope:'user',args:[]},
    {name:'electron.app.Electron',path:'C:\\other\\electron.exe',scope:'user'},
    {name:'electron.app.Electron',path:exe,scope:'machine'},
    {name:'unrelated',path:exe,scope:'user'}
  ]}),setLoginItemSettings:settings=>writes.push(settings)};
  syncLoginItem({app,isDev,execPath:exe,enabled});
  assert.deepEqual(writes[0],{name:LOGIN_ITEM_NAME,openAtLogin:enabled,path:exe,args:isDev?['"E:\\Tool Box\\project"','--hidden']:['--hidden']});
  assert.equal(writes.length,3);assert(writes.slice(1).every(item=>item.openAtLogin===false));
  writes.length=0;
  syncLoginItem({app,isDev:false,execPath:exe,portablePath:'E:\\个人工具箱.exe',enabled});
  assert.equal(writes[0].path,'E:\\个人工具箱.exe');assert.equal(writes.length,1);
}
assert(main.includes('if (!isDev) syncLoginItemSettings(getAppSettings().launchAtLogin)'));
assert(main.indexOf('app.setAppUserModelId("local.personal.toolbox")')<main.indexOf('if (!isDev) syncLoginItemSettings'));
assert(main.includes('if (isDev && !isStartupLaunch)'));
assert(main.includes('if (!isStartupLaunch) mainWindow.show()'));
console.log('自启回归通过：固定名称、带空格开发路径、安装版/便携版、旧项定向迁移、开发会话不覆盖安装版、静默启动。');
