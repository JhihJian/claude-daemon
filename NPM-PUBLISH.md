# 📦 发布到 npm 指南

## ✅ 已完成

- ✅ 创建 package.json
- ✅ 创建 CLI 脚本 (bin/cli.js)
- ✅ 配置 .npmignore
- ✅ 本地测试通过
- ✅ 推送到 GitHub

## 📊 包信息

- **包名**: `@jhihjian/claude-daemon`
- **版本**: 1.1.0
- **大小**: 21.2 kB (未压缩 80.5 kB)
- **文件数**: 15 个

---

## 🚀 发布步骤

### 1. 登录 npm

如果还没有 npm 账号，先注册：https://www.npmjs.com/signup

```bash
npm login
# 输入用户名、密码、邮箱
```

### 2. 验证登录

```bash
npm whoami
# 应该显示你的用户名
```

### 3. 发布包

```bash
npm publish --access public
```

**注意**：因为包名带 scope (`@jhihjian/`)，需要 `--access public` 参数。

### 4. 验证发布

访问：https://www.npmjs.com/package/@jhihjian/claude-daemon

---

## 📝 发布后的使用

### 方式 1: npx（推荐）

```bash
npx @jhihjian/claude-daemon install
```

### 方式 2: 全局安装

```bash
npm install -g @jhihjian/claude-daemon
claude-daemon install
```

### 方式 3: 项目依赖

```bash
npm install @jhihjian/claude-daemon
npx claude-daemon install
```

---

## 🔄 更新版本

以后更新时：

```bash
# 1. 修改代码

# 2. 更新版本号
npm version patch  # 1.1.0 -> 1.1.1
# 或
npm version minor  # 1.1.0 -> 1.2.0
# 或
npm version major  # 1.1.0 -> 2.0.0

# 3. 推送到 git
git push && git push --tags

# 4. 发布到 npm
npm publish
```

---

## ⚠️ 注意事项

### 1. 包名规则

- scoped 包名格式: `@username/package-name`
- 必须使用 `--access public` 发布公开包
- 私有包需要付费订阅

### 2. 版本管理

遵循语义化版本 (SemVer):
- **MAJOR**: 不兼容的 API 修改
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修正

### 3. .npmignore

确保不发布敏感信息：
- 测试文件
- 开发文档
- Git 相关文件

---

## 🐛 常见问题

### 发布失败: 403 Forbidden

**原因**: 包名已被占用或权限不足

**解决**:
```bash
# 检查包名是否可用
npm view @jhihjian/claude-daemon

# 如果已存在，需要更换包名
```

### 发布失败: 需要 2FA

**原因**: 账号启用了两步验证

**解决**: 使用 `--otp` 参数
```bash
npm publish --otp=123456
```

### 包版本已存在

**原因**: 不能发布相同版本

**解决**:
```bash
npm version patch
npm publish
```

---

## 📈 发布后续

### 1. 添加徽章到 README

```markdown
[![npm version](https://badge.fury.io/js/%40jhihjian%2Fclaude-daemon.svg)](https://www.npmjs.com/package/@jhihjian/claude-daemon)
[![npm downloads](https://img.shields.io/npm/dm/@jhihjian/claude-daemon.svg)](https://www.npmjs.com/package/@jhihjian/claude-daemon)
```

### 2. 更新 README

添加 npm 安装方式到 README.md 开头。

### 3. 创建 GitHub Release

为 v1.1.0 创建正式 Release。

---

## 🎉 完成后

用户就可以通过以下任意方式安装：

1. **curl 一键安装**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/JhihJian/claude-daemon/main/quick-install.sh | bash
   ```

2. **npm 安装**:
   ```bash
   npx @jhihjian/claude-daemon install
   ```

3. **git 克隆**:
   ```bash
   git clone https://github.com/JhihJian/claude-daemon.git
   cd claude-daemon
   ./install.sh
   ```
