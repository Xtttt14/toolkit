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

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["electron-builder", "--win", "portable"], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit"
});

process.exit(result.status ?? 1);
