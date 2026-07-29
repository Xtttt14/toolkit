# 个人工具箱

个人工具箱是一款面向Windows的本地桌面应用，将饮水提醒、待办清单和记账助手集中在同一个程序中。数据默认只保存在本机，无需注册账号或连接云服务。

## 功能

### 饮水提醒

- 按杯数或毫升查看今日进度
- 管理常用杯子和容量
- 设置工作时间、提醒间隔和重复提醒
- 补记饮水记录并查看日历、周统计和月统计
- 支持Windows系统通知和托盘快捷操作

### 待办清单

- 使用P0—P3优先级管理任务
- 支持截止时间、提前提醒、描述和自定义标签
- 每个任务最多包含8个纵向子任务，并显示步骤编号、完成进度和清晰的完成状态
- 主任务和子任务均支持拖拽调整顺序，排序结果会保存在本地
- 支持搜索、筛选、排序、批量删除和完成状态管理
- 到期前通过Windows系统通知提醒

### 记账助手

- 记录收入、支出、日期、标签和备注
- 内置常用收支标签，支持自定义标签的新增、改名和删除
- 今日记账、月历和统计报表三个页面
- 支持周、月、年收支趋势及支出分类占比
- 支持JSON备份与恢复

## 技术栈

- Electron 33
- React 18
- React Router 6
- Vite 6
- electron-store 8
- lucide-react

## 开发

环境要求：

- Windows 10或Windows 11
- Node.js 18或更高版本
- npm

安装依赖：

```powershell
npm install
```

启动开发环境：

```powershell
npm run start
```

仅构建前端：

```powershell
npm run build
```

生成Windows便携版：

```powershell
npm run dist:portable
```

构建结果位于`release-<版本号>/`目录。

## 数据存储

应用使用electron-store保存本地数据。默认目录为：

```text
%APPDATA%\personal-toolbox\
```

主要数据文件：

- `water-data.json`：饮水设置和历史记录
- `todo-data.json`：任务和标签
- `finance-data.json`：账目和自定义标签

更新程序不会主动删除这些文件。记账数据可在应用内导出为JSON文件，建议定期备份。

## 项目结构

```text
toolkit/
├─ electron/
│  ├─ main.js                 Electron主进程、托盘、通知和本地存储
│  ├─ preload.js              渲染进程IPC接口
│  └─ assets/                 应用图标
├─ scripts/
│  ├─ build-portable.cjs      便携版构建脚本
│  └─ verify-finance-ui.cjs   界面与窗口尺寸回归检查
├─ src/
│  ├─ modules/
│  │  ├─ drinking/            饮水提醒
│  │  ├─ todo/                待办清单
│  │  └─ finance/             记账助手
│  ├─ pages/Home.jsx          工具箱主页
│  ├─ App.jsx                 页面路由
│  └─ styles.css              全局与模块样式
└─ package.json
```

## 窗口与退出行为

- 默认窗口大小为1280×820，最小窗口大小为960×640。
- 关闭窗口时可选择隐藏到托盘或彻底退出。
- 选择退出后，程序会停止提醒任务、销毁窗口和托盘并结束Electron进程。
- 若托盘图标被系统折叠，可使用`Ctrl+Shift+T`恢复窗口。

## 常见问题

### Windows提示应用来源未知

当前便携版未配置代码签名，Windows可能显示SmartScreen提示。请确认程序来自本仓库构建产物后再运行。

### 关闭窗口后仍有通知

这通常表示选择了“隐藏到托盘”。右键托盘图标并选择“退出”，或在饮水提醒设置中修改默认关闭行为。

### 如何迁移记账数据

在记账助手的今日记账页面选择“导出JSON”，在另一台设备上选择“恢复JSON”即可。恢复操作会覆盖当前账目，建议先导出现有数据。
