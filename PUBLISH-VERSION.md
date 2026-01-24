# 发布新版本到 npm

## 当前状态

- ✅ npm 已有版本: **v1.1.0**（不支持 Windows）
- ✅ 本地最新版本: **v1.1.1**（支持 Windows）
- ❌ 需要发布: v1.1.1 到 npm

---

## 🚀 发布步骤

### 1. 确认本地版本

```bash
# 查看 package.json 版本
cat package.json | grep version
# 应该显示: "version": "1.1.1"
```

### 2. 确认所有更改已提交

```bash
git status
# 应该显示: working tree clean
```

### 3. 发布到 npm

```bash
npm publish
```

**注意**: 不需要 `--access public`，因为之前已经发布过了。

### 4. 验证发布

```bash
npm view @jhihjian/claude-daemon versions
# 应该显示: [ '1.1.0', '1.1.1' ]

npm view @jhihjian/claude-daemon version
# 应该显示: 1.1.1
```

---

## 📊 版本说明

### v1.1.0（当前 npm 版本）
- ❌ 仅支持 Linux/macOS
- ❌ Windows 会失败（调用 bash）

### v1.1.1（待发布）
- ✅ 支持 Windows（自动使用 PowerShell）
- ✅ 支持 Linux/macOS
- ✅ 自动平台检测

---

## 💡 为什么没有版本号？

可能的原因：

1. **你看的是 npm 网页**
   - npm 网页有时缓存，需要刷新
   - 访问: https://www.npmjs.com/package/@jhihjian/claude-daemon

2. **你看的是 GitHub**
   - GitHub 上的代码不会自动显示 npm 版本
   - 需要手动添加徽章（badge）

3. **版本冲突**
   - npm 上是 1.1.0
   - 本地是 1.1.1
   - 需要发布 1.1.1

---

## 🎯 添加版本徽章到 README

在 README.md 开头添加：

\`\`\`markdown
# Claude Code 会话历史系统

[![npm version](https://badge.fury.io/js/%40jhihjian%2Fclaude-daemon.svg)](https://www.npmjs.com/package/@jhihjian/claude-daemon)
[![npm downloads](https://img.shields.io/npm/dm/@jhihjian/claude-daemon.svg)](https://www.npmjs.com/package/@jhihjian/claude-daemon)

...
\`\`\`

这样 GitHub 上就会显示版本号徽章了！

---

## 🔄 完整发布流程（以后使用）

```bash
# 1. 修改代码
# ...

# 2. 提交到 git
git add -A
git commit -m "feat: 新功能"
git push

# 3. 更新版本号
npm version patch  # 1.1.1 -> 1.1.2 (修复bug)
# 或
npm version minor  # 1.1.1 -> 1.2.0 (新功能)
# 或
npm version major  # 1.1.1 -> 2.0.0 (重大更新)

# 4. 推送 tag
git push --tags

# 5. 发布到 npm
npm publish

# 6. 验证
npm view @jhihjian/claude-daemon
```

---

## ⚠️ 注意

- **不能**重复发布相同版本号
- 如果已经发布了 1.1.0，只能发布 1.1.1 或更高版本
- npm 发布后无法删除（只能废弃）
