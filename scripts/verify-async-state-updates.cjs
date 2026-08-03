const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(__dirname, "..", "src");
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const directAsyncStateUpdate = /\bsetState\s*\(\s*window\.[A-Za-z_$][\w$]*Api\.[A-Za-z_$][\w$]*\s*\(/g;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  return [...source.matchAll(directAsyncStateUpdate)].map((match) => {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    return `${path.relative(sourceRoot, filePath)}:${line}`;
  });
});

if (violations.length) {
  console.error("检测到将异步 API 返回值直接写入 React 状态：");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("异步 API 状态写入检查通过。");
