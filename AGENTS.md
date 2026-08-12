# 提交与发布约定

- 每次完成并验证用户要求的代码或文档改动后，自动创建 Git 提交并推送到 `origin`。
- 提交信息使用 Conventional Commits 风格，并简要说明实际改动项。
- 用户明确要求发布，或改动构成完整版本时，更新 `package.json` 版本号、创建 `v<version>` 标签并推送标签，以触发 GitHub Release 工作流。
- 创建 Windows 安装包时，保持 NSIS 安装向导默认目录为 `E:\toolkit\personal-toolbox`；用户可以在安装向导中选择其他目录。
