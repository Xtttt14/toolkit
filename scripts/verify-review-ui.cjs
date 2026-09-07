const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let handle;
const ipcMain = { handle: (_, fn) => { handle = fn; } };
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const examTools=require('../electron/exam-import');
let failTodos=true;
let exams=[{id:'ended',name:'已结束考试',date:'2026-09-06',time:'08:00—09:00'},{id:'old',name:'操作系统',date:'2026-09-20',time:'09:00—11:00',location:'A',duration:'120分钟'}];
const settings={enabled:false,reminderMinutes:30};
const pending=examTools.createPendingExamImports();
let confirmed=0;
ipcMain.handle('review-test',(_,method,...args)=>{
  if(method==='water')return {today:{cups:2,totalMl:600,targetMl:2400}};
  if(method==='finance')return {entries:[]};
  if(method==='pomodoro')return {sessions:[{id:'focus',endedAt:'2026-09-05T23:30:00.000Z',durationSeconds:1500,status:'completed'}],active:null};
  if(method==='todos'){if(failTodos)throw new Error('模拟待办读取失败');return {tasks:[{id:'t1',title:'复习操作系统',description:'',priority:'P0',tags:[],subtasks:[],dueDate:'2026-09-06T20:00:00',completed:false}],tags:[]};}
  if(method==='schedule')return {courses:[],startDate:'2026-08-26',settings};
  if(method==='exams')return {exams,settings};
  if(method==='import')return pending.prepare(exams,[{id:'new',name:'操作系统',date:'2026-10-12',time:'09:00—11:00',location:'B',duration:'120分钟'}],1);
  if(method==='confirm'){const result=pending.resolve(args[0],exams,args[1],1);exams=result.exams;pending.discard(args[0],1);confirmed++;return {status:'imported',...result,data:{exams,settings},focusDate:'2026-10-12'};}
  if(method==='cancel'){pending.discard(args[0],1);return;}
  if(method==='update'){exams=exams.map(exam=>exam.id===args[0]?{...exam,...args[1]}:exam);return {status:'imported',data:{exams,settings},focusDate:args[1].date,updated:1};}
  if(method==='delete'){exams=exams.filter(exam=>exam.id!==args[0]);return {data:{exams,settings}};}
});
(async()=>{
  const errors=[];
  const browser=await chromium.launch({headless:true});
  try {
  const page=await browser.newPage({viewport:{width:960,height:640},timezoneId:'Asia/Shanghai'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('reviewCall',(...args)=>handle(null,...args));
  const fixture=fs.readFileSync(path.join(__dirname,'review-test-preload.cjs'),'utf8').replace("const { contextBridge, ipcRenderer } = require('electron');", "const contextBridge={exposeInMainWorld:(name,api)=>{window[name]=api;}};const ipcRenderer={invoke:(_, ...args)=>window.reviewCall(...args)};");
  await page.addInitScript({content:fixture});
  await page.addInitScript({content:`{const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-06T10:00:00+08:00']));}static now(){return new RealDate('2026-09-06T10:00:00+08:00').getTime();}};}`});
  const js=source=>page.evaluate(source);
  const wait=async source=>{for(let i=0;i<60;i++){if(await js(source))return;await new Promise(r=>setTimeout(r,50));}throw new Error(`UI timeout: ${source}`);};
  const click=async text=>{await js(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Button missing: '+${JSON.stringify(text)});button.click();})()`);};
  await page.goto(process.env.REVIEW_UI_URL || 'http://127.0.0.1:8137');
  await page.waitForLoadState('networkidle');
  await wait(`document.querySelector('.todo-card')?.textContent.includes('读取失败')`);
  assert.equal(await js(`document.querySelector('.todo-card').textContent.includes('已全部完成')`),false);
  assert(await js(`document.querySelector('.focus-card').textContent.includes('25分钟')`));
  assert(await js(`document.querySelector('.exam-card').textContent.includes('操作系统')`));
  assert.equal(await js(`document.querySelector('.exam-card').textContent.includes('已结束考试')`),false);
  const box=await js(`(()=>{const b=document.querySelector('.exam-card').getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  assert(box.bottom<=640,JSON.stringify(box));assert.equal(box.overflow,false);
  const out=path.join(__dirname,'../tmp-review-ui');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'home-960.png'),fullPage:true});
  failTodos=false;await click('重新加载');await wait(`document.querySelector('.todo-card')?.textContent.includes('复习操作系统')`);
  await js(`location.hash='/todo'`);await wait(`!!document.querySelector('input.todo-search')`);
  await page.locator('input.todo-search').fill('无匹配关键词');
  await wait(`document.body.textContent.includes('没有符合当前搜索')`);
  await click('清除筛选');await wait(`document.body.textContent.includes('复习操作系统')`);
  await js(`location.hash='/exams'`);await wait(`document.body.textContent.includes('导入考试表')`);
  await click('导入考试表');await wait(`document.body.textContent.includes('疑似改期')`);
  assert.equal(confirmed,0);
  assert(await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='确认导入').disabled`));
  await js(`(()=>{const e=document.querySelector('.exam-import-review select');e.value='old';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('确认导入');await wait(`document.querySelector('.calendar-head strong')?.textContent.includes('10月')`);
  assert.equal(confirmed,1);assert.equal(exams.filter(exam=>exam.name==='操作系统').length,1);
  for(let d=1;d<=31;d++)assert(await js(`!!document.querySelector('[aria-label="2026-10-${String(d).padStart(2,'0')}"]')`));
  await page.screenshot({path:path.join(out,'exams-after-import.png'),fullPage:true});
  await click('修改');await wait(`!!document.querySelector('.exam-editor')`);
  await page.locator('.exam-editor input[type=date]').fill('2026-10-15');
  await click('保存修改');await wait(`!document.querySelector('.exam-editor')`);assert.equal(exams.find(e=>e.id==='old').date,'2026-10-15');
  await click('删除');await wait(`document.querySelector('.exam-detail')?.textContent.includes('当天没有考试')`);
  assert.equal(exams.some(e=>e.id==='old'),false);assert.deepEqual(errors,[]);
  console.log('UI回归通过：首页失败重试、凌晨专注、已结束考试、960px首屏、待办搜索清空、考试预览/确认/完整月历/修改/删除。');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
