const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const packageJson = require(path.join(__dirname, "..", "package.json"));
const executable = path.join(
  __dirname,
  "..",
  `release-${packageJson.version}`,
  `个人工具箱-${packageJson.version}-x64.exe`
);

if (fs.existsSync(executable)) {
  try {
    const handle = fs.openSync(executable, "r+");
    fs.closeSync(handle);
  } catch (error) {
    console.error(`\n无法更新便携版EXE：${executable}\n文件正在被占用。请先退出个人工具箱，并等待安全软件扫描完成后再重新打包。`);
    process.exit(1);
  }
}

const root = path.join(__dirname, "..");
const command = process.platform === "win32"
  ? path.join(root, "node_modules", ".bin", "electron-builder.cmd")
  : path.join(root, "node_modules", ".bin", "electron-builder");
const result = spawnSync(command, [
  "--win",
  "portable",
  `--config.directories.output=release-${packageJson.version}`
], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.error) console.error(`无法启动打包器：${result.error.message}`);
if (result.status === 0) {
  const outputDir = path.dirname(executable);
  for (const generatedPath of [
    path.join(outputDir, "win-unpacked"),
    path.join(outputDir, "builder-debug.yml"),
    path.join(outputDir, "builder-effective-config.yaml")
  ]) {
    try {
      fs.rmSync(generatedPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`未能清理构建中间文件：${generatedPath}\n${error.message}`);
    }
  }
}

process.exit(result.status ?? 1);
