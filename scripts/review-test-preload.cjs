const { contextBridge, ipcRenderer } = require('electron');
const call = (method, ...args) => ipcRenderer.invoke('review-test',method,...args);
const off = () => () => {};
contextBridge.exposeInMainWorld('appApi',{getSettings:async()=>({showActionConfirmations:false}),onSettingsChanged:off,onNavigate:off});
contextBridge.exposeInMainWorld('waterApi',{getState:()=>call('water'),onStateChanged:off});
contextBridge.exposeInMainWorld('financeApi',{getAll:()=>call('finance'),onChanged:off});
contextBridge.exposeInMainWorld('pomodoroApi',{getAll:()=>call('pomodoro'),onChanged:off});
contextBridge.exposeInMainWorld('todoApi',{getAll:()=>call('todos'),onChanged:off,toggleComplete:id=>call('complete',id)});
contextBridge.exposeInMainWorld('academicApi',{getSchedule:()=>call('schedule'),getExams:()=>call('exams'),onScheduleChanged:off,onExamsChanged:off,importExams:()=>call('import'),confirmExamImport:(token,decisions)=>call('confirm',token,decisions),cancelExamImport:token=>call('cancel',token),updateExam:(id,patch)=>call('update',id,patch),deleteExam:id=>call('delete',id),saveExamSettings:settings=>call('settings',settings)});
