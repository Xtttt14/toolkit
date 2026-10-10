const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let data = { tasks: [], tags: [] };
      window.appApi = { onNavigate: () => () => {} };
      window.todoApi = {
        getAll: async () => data,
        onChanged: () => () => {},
        add: async task => {
          data = { ...data, tasks: [...data.tasks, { ...task, id: 'task-1', completed: false }] };
          window.savedTodo = data.tasks[0];
          return data;
        },
        update: async (id, patch) => {
          data = { ...data, tasks: data.tasks.map(task => task.id === id ? { ...task, ...patch } : task) };
          window.savedTodo = data.tasks[0];
          return data;
        }
      };
    });
    await page.goto(`${process.env.TODO_UI_URL || 'http://127.0.0.1:8011'}/#/todo`);
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByPlaceholder('例如：提交周报').fill('日历草稿保留检查');
    await page.getByPlaceholder('添加子任务 (0/8)').fill('执行步骤');
    await page.getByRole('button', { name: '子任务截止日期', exact: true }).click();
    const calendar = page.locator('.date-picker-panel');
    await calendar.locator('.date-picker-days button:not(.muted)').filter({ hasText: /^15$/ }).click();
    assert.equal(await calendar.count(), 0, 'Selecting a day must confirm and dismiss the calendar');
    assert.equal(await page.locator('.modal-card').count(), 1);
    const selectedDate = await page.getByRole('button', { name: '子任务截止日期', exact: true }).textContent();
    await page.getByRole('button', { name: '子任务截止日期', exact: true }).click();
    await page.mouse.click(5, 5);
    assert.equal(await calendar.count(), 0, 'Clicking outside dismisses only the calendar');
    assert.equal(await page.getByPlaceholder('例如：提交周报').inputValue(), '日历草稿保留检查');
    assert.equal(await page.getByPlaceholder('添加子任务 (0/8)').inputValue(), '执行步骤');
    assert.equal(await page.getByRole('button', { name: '子任务截止日期', exact: true }).textContent(), selectedDate);
    await page.getByRole('button', { name: '子任务截止日期', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await calendar.count(), 0);
    assert.equal(await page.locator('.modal-card').count(), 1, 'Escape in calendar must not discard the task');
    await page.getByRole('textbox', { name: '子任务截止时刻', exact: true }).fill('18:30');
    await page.locator('.subtask-add-row > button').click();
    await page.getByRole('button', { name: '创建任务', exact: true }).click();
    const saved = await page.evaluate(() => window.savedTodo);
    assert.equal(saved.subtasks.length, 1);
    assert.match(saved.subtasks[0].dueDate, /-15T18:30:00$/);
    await page.getByRole('button', { name: '编辑日历草稿保留检查', exact: true }).click();
    await page.getByRole('button', { name: '子任务截止日期', exact: true }).first().click();
    await calendar.getByRole('button', { name: '清除日期', exact: true }).click();
    assert.equal(await page.locator('.modal-card').count(), 1);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.evaluate(() => window.savedTodo.subtasks[0].dueDate), null);
    assert.deepEqual(errors, []);
    console.log('待办日历UI回归通过：点选即确认、外部点击保留草稿、Esc只关闭日历、时刻保存与清除日期。');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
