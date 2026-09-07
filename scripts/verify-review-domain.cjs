const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tools = require('../electron/exam-import');
const main = fs.readFileSync(require('node:path').join(__dirname, '../electron/main.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const extract = name => { const i=main.indexOf(`function ${name}(`); assert(i>=0); return main.slice(i, main.indexOf('\n}',i)+2); };
(async () => {
  const time = await import('../electron/domain-time.mjs');
  assert.equal(time.academicWeek('2026-08-26', '2026-08-31'), 2);
  assert.equal(time.academicWeek('2026-08-24', '2026-08-31'), 2);
  assert.equal(time.academicWeek('2026-08-26', '2026-08-23'), 0);
  assert.equal(time.academicWeek('2026-03-04', '2026-03-09'), 2);
  for (const anchor of ['2026-09-20','2026-09-30','2026-10-12','2028-02-29']) {
    const cells = time.calendarMonthDays(anchor).map(time.localDateKey);
    const first = time.calendarMonthStart(anchor);
    const last = new Date(first.getFullYear(), first.getMonth()+1, 0);
    for (let d=1; d<=last.getDate(); d++) assert(cells.includes(time.localDateKey(new Date(first.getFullYear(), first.getMonth(), d))));
  }
  const exam = {id:'old',name:'操作系统',date:'2099-09-10',time:'09:00—11:00',duration:'',location:'A'};
  assert.equal(time.examStatus(exam,new Date('2099-09-10T08:59:00')),'upcoming');
  assert.equal(time.examStatus(exam,new Date('2099-09-10T10:00:00')),'ongoing');
  assert.equal(time.examStatus(exam,new Date('2099-09-10T11:00:00')),'ended');
  assert.equal(time.examStatus({...exam,time:''},new Date('2099-09-10T10:00:00')),'upcoming');
  assert.equal(time.getExamTiming({...exam,time:'9:00',duration:'2小时'}).endAt.getHours(),11);
  assert.equal(time.getExamTiming({...exam,time:'23:00—01:00'}).endAt.getDate(),11);
  const midnight = new Date(2026,8,6,0,5).toISOString();
  const before = new Date(2026,8,5,23,55).toISOString();
  assert.equal(time.localDateKey(midnight),'2026-09-06');
  assert.equal(time.localDateKey(before),'2026-09-05');
  const incoming = {...exam,id:'new',date:'2099-09-12'};
  const plan = tools.planExamImport([exam],[incoming]);
  assert.equal(plan.rows[0].kind,'conflict');
  assert.throws(()=>tools.applyExamImport([exam],plan),/确认/);
  const decisions = {[plan.rows[0].key]:{action:'replace',targetId:'old'}};
  const result = tools.applyExamImport([exam],plan,decisions);
  assert.equal(result.exams.length,1); assert.equal(result.exams[0].id,'old');
  assert.equal(result.exams[0].date,'2099-09-12');
  assert.equal(tools.applyExamImport([exam],plan,{[plan.rows[0].key]:{action:'keep'}}).exams.length,2);
  assert.equal(tools.applyExamImport([exam],tools.planExamImport([exam],[exam])).unchanged,1);
  assert.equal(tools.planExamImport([], [exam,{...exam,id:'second',time:'14:00'}]).count,2);
  let now = 0; const pending=tools.createPendingExamImports({ttlMs:100,now:()=>now});
  const preview=pending.prepare([exam],[incoming],1);
  assert.throws(()=>pending.resolve(preview.token,[exam],decisions,2),/过期/);
  assert.throws(()=>pending.resolve(preview.token,[],decisions,1),/变化/);
  now=101; assert.throws(()=>pending.resolve(preview.token,[exam],decisions,1),/过期/);
  let todos={tasks:[],tags:[]}; let storedExams=[exam]; let notified=['exam-old','exam-other'];
  const ctx=vm.createContext({Date,domainTime:time,examImportTools:tools,getTodoData:()=>plain(todos),saveTodoData:value=>{todos=plain(value);},getExamsData:()=>({exams:plain(storedExams)}),examsStore:{set:(k,v)=>{storedExams=plain(v);}},appStore:{get:()=>notified,set:(k,v)=>{notified=plain(v);}},broadcastAcademic:()=>{},broadcastState:()=>{}});
  vm.runInContext(['normalizeStringList','normalizeTodoTask','getExamTiming','syncExamTodos','commitExamImport','deleteAcademicExam'].map(extract).join('\n'),ctx);
  ctx.syncExamTodos([exam]); assert.equal(todos.tasks.length,1);
  const todoId=todos.tasks[0].id;
  ctx.commitExamImport(result);
  assert.equal(todos.tasks.length,1);assert.equal(todos.tasks[0].id,todoId);assert.equal(todos.tasks[0].dueDate,'2099-09-12T09:00:00');assert(!notified.includes('exam-old'));
  todos.tasks[0].completed=true;
  ctx.commitExamImport({...result,exams:[{...result.exams[0],date:'2099-09-14'}]});
  assert.equal(todos.tasks.length,2);assert.equal(todos.tasks[0].sourceId,null);assert.equal(todos.tasks[1].completed,false);
  ctx.deleteAcademicExam('old');assert.equal(storedExams.length,0);assert.equal(todos.tasks.length,1);assert.equal(todos.tasks[0].completed,true);
  // Preserve child tasks when the assistant completes or reopens their parent.
  ctx.formatTodoList=()=>'';
  vm.runInContext(extract('applyTodoCompletion')+'\n'+extract('executeAssistantToolCalls'),ctx);
  todos={tasks:[plain(ctx.normalizeTodoTask({id:'parent',title:'作业',subtasks:[{id:'child',title:'检查',completed:false}]}))],tags:[]};
  for (const completed of [true,false]) {
    ctx.executeAssistantToolCalls([{name:'todo.complete',arguments:{taskId:'parent',completed}}]);
    assert.equal(todos.tasks[0].subtasks.length,1);
    assert.equal(todos.tasks[0].subtasks[0].id,'child');
    assert.equal(todos.tasks[0].subtasks[0].completed,completed);
    assert.equal(todos.tasks[0].completed,completed);
  }
  // Main-process reminder uses the same teaching week, including parity.
  const notifications=[];
  ctx.getScheduleData=()=>({startDate:'2026-08-26',settings:{enabled:true,reminderMinutes:0},courses:[{id:'odd',name:'单周',weekday:1,startWeek:1,endWeek:16,pattern:'单周',startTime:'10:00'},{id:'even',name:'双周',weekday:1,startWeek:1,endWeek:16,pattern:'双周',startTime:'10:00'}]});
  ctx.getExamsData=()=>({exams:[],settings:{enabled:false}});
  ctx.todayKey=()=> '2026-08-31'; ctx.Notification=class {constructor(value){notifications.push(value);}show(){}};
  ctx.Date=class extends Date {constructor(...args){super(...(args.length?args:['2026-08-31T10:00:00']));}};
  vm.runInContext(extract('maybeAcademicNotify'),ctx);ctx.maybeAcademicNotify();
  assert.equal(notifications.length,1);assert(notifications[0].body.includes('双周'));
  console.log('日期与考试回归通过：午夜、教学周、考试状态、完整月历、导入冲突/过期、改期待办与删除、后台单双周提醒。');
})().catch(error=>{console.error(error);process.exitCode=1;});
