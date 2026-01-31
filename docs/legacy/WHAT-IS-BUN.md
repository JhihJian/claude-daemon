# 什么是 Bun？

## 📖 简介

**Bun** 是一个**现代化的 JavaScript/TypeScript 全能工具包**（All-in-one toolkit），由 Jarred Sumner 在 2021 年创建。它旨在成为 Node.js 和 Deno 的更快替代品。

### 核心特点

- 🚀 **极快的性能** - 比 Node.js 快 3-4 倍
- 📦 **内置包管理器** - 替代 npm/yarn/pnpm
- 🔧 **内置打包工具** - 替代 Webpack/Vite
- 🧪 **内置测试工具** - 替代 Jest/Mocha
- 📝 **原生 TypeScript 支持** - 无需编译
- 🔋 **电池全包** - 大量内置 API

---

## 🆚 Bun vs Node.js vs Deno

| 特性 | Bun | Node.js | Deno |
|------|-----|---------|------|
| **JavaScript 引擎** | JavaScriptCore (Safari) | V8 (Chrome) | V8 (Chrome) |
| **性能** | 🚀🚀🚀 最快 | 🚀 快 | 🚀🚀 很快 |
| **启动速度** | ~3ms | ~50ms | ~30ms |
| **TypeScript** | ✅ 原生支持 | ❌ 需要编译 | ✅ 原生支持 |
| **包管理器** | ✅ 内置 bun | npm/yarn/pnpm | ❌ 无（URL 导入） |
| **打包工具** | ✅ 内置 | Webpack/Vite | ❌ 无 |
| **测试工具** | ✅ 内置 | Jest/Mocha | ✅ 内置 |
| **模块系统** | ESM + CommonJS | CommonJS + ESM | ESM only |
| **兼容性** | 🟢 高度兼容 Node.js | 🟢 标准 | 🟡 部分兼容 |
| **生态系统** | 🟢 使用 npm 生态 | 🟢 最大生态 | 🟡 较小生态 |

---

## ⚡ 为什么选择 Bun？

### 1. **惊人的性能**

```bash
# 启动速度对比
Bun:     ~3ms   ████
Node.js: ~50ms  ████████████████████████████████████████████████████
Deno:    ~30ms  ██████████████████████████████████
```

#### HTTP 服务器性能对比

```javascript
// Bun 的 HTTP 服务器
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hello World!");
  },
});

// 性能：~130,000 请求/秒 🚀
```

```javascript
// Node.js HTTP 服务器
const http = require('http');
http.createServer((req, res) => {
  res.end("Hello World!");
}).listen(3000);

// 性能：~40,000 请求/秒
```

**Bun 比 Node.js 快 3 倍以上！**

### 2. **原生 TypeScript 支持**

```typescript
// Node.js - 需要配置
// 1. 安装 ts-node 或 tsx
// 2. 配置 tsconfig.json
// 3. 运行 ts-node app.ts

// Bun - 直接运行
bun app.ts  // 就这么简单！✨
```

### 3. **内置包管理器 - 超快的依赖安装**

```bash
# 安装依赖速度对比
npm install     # ~30 秒
yarn install    # ~15 秒
pnpm install    # ~10 秒
bun install     # ~1 秒  🚀🚀🚀
```

### 4. **丰富的内置 API**

Bun 内置了许多常用功能，无需安装第三方包：

```typescript
// SQLite 数据库（内置！）
import { Database } from "bun:sqlite";
const db = new Database("mydb.sqlite");

// 文件系统（内置！）
const file = Bun.file("./data.txt");
const text = await file.text();

// 环境变量（内置！）
const apiKey = Bun.env.API_KEY;

// 密码哈希（内置！）
const hash = await Bun.password.hash("password123");

// WebSocket（内置！）
const server = Bun.serve({
  websocket: {
    message(ws, message) {
      ws.send(`Echo: ${message}`);
    }
  }
});
```

### 5. **内置测试框架**

```typescript
// test.ts
import { expect, test, describe } from "bun:test";

describe("Math", () => {
  test("addition", () => {
    expect(1 + 1).toBe(2);
  });
});

// 运行测试
// bun test
```

### 6. **内置打包工具**

```bash
# 打包应用（无需 Webpack/Vite）
bun build ./index.ts --outdir ./dist
```

---

## 🔧 Bun 的架构

### 底层技术栈

```
┌─────────────────────────────────────┐
│         Bun Runtime                 │
├─────────────────────────────────────┤
│  JavaScript 引擎: JavaScriptCore   │  <- Safari 的引擎
│  (Apple 开发，优化极致)              │
├─────────────────────────────────────┤
│  核心语言: Zig                      │  <- 低级系统语言
│  (内存安全，性能接近 C)              │
├─────────────────────────────────────┤
│  异步 I/O: io_uring (Linux)        │  <- 现代高性能 I/O
│            kqueue (macOS)           │
└─────────────────────────────────────┘
```

### 为什么快？

1. **JavaScriptCore 引擎**
   - Apple 为 Safari 优化
   - 启动速度极快
   - 内存占用小

2. **Zig 语言编写**
   - 零成本抽象
   - 无垃圾回收（底层）
   - 接近 C 的性能

3. **现代 I/O 技术**
   - Linux: io_uring (最新内核 I/O)
   - macOS: kqueue
   - 避免不必要的系统调用

---

## 💡 Bun 的主要功能

### 1. 运行时（Runtime）

```bash
# 运行 JavaScript
bun run app.js

# 运行 TypeScript（无需编译）
bun run app.ts

# 运行 JSX/TSX
bun run app.tsx
```

### 2. 包管理器

```bash
# 安装依赖
bun install

# 添加包
bun add express

# 删除包
bun remove express

# 全局安装
bun add -g typescript
```

### 3. 打包工具

```bash
# 打包单文件
bun build ./index.ts --outfile bundle.js

# 打包到目录
bun build ./index.ts --outdir ./dist

# 压缩
bun build ./index.ts --minify
```

### 4. 脚本运行器

```json
// package.json
{
  "scripts": {
    "dev": "bun run server.ts",
    "build": "bun build index.ts"
  }
}
```

```bash
# 运行脚本
bun run dev
bun dev  # 简写
```

### 5. 测试工具

```bash
# 运行所有测试
bun test

# 监听模式
bun test --watch

# 覆盖率
bun test --coverage
```

---

## 🎯 实际应用场景

### 1. Web 服务器

```typescript
// 高性能 HTTP 服务器
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("Hello World!");
    }

    if (url.pathname === "/api/users") {
      return Response.json({ users: [] });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("Server running at http://localhost:3000");
```

### 2. CLI 工具

```typescript
#!/usr/bin/env bun
// cli.ts

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "hello":
    console.log("Hello from Bun!");
    break;
  default:
    console.log("Unknown command");
}
```

```bash
# 直接运行
bun cli.ts hello
```

### 3. 数据库操作

```typescript
import { Database } from "bun:sqlite";

const db = new Database("app.db");

// 创建表
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT
  )
`);

// 插入数据
db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);

// 查询
const users = db.query("SELECT * FROM users").all();
console.log(users);
```

### 4. 文件操作

```typescript
// 读取文件
const file = Bun.file("data.json");
const data = await file.json();

// 写入文件
await Bun.write("output.txt", "Hello Bun!");

// 流式读取大文件
const stream = Bun.file("large.txt").stream();
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}
```

---

## 🤔 Bun 适合用在哪里？

### ✅ 推荐使用场景

1. **新项目** - 从零开始的项目
2. **CLI 工具** - 命令行工具和脚本
3. **微服务** - 高性能 API 服务
4. **开发工具** - 构建工具、测试工具
5. **本地脚本** - 自动化脚本、数据处理
6. **守护进程** - 后台服务（就像我们的项目！）

### ⚠️ 暂不推荐

1. **大型生产系统** - 生态还在成熟中
2. **需要特定 Node.js API** - 部分 API 还未完全实现
3. **企业级应用** - 可能需要等待更多实践验证

---

## 🔍 为什么我们的项目使用 Bun？

### 1. **启动速度快**

```
Node.js Hook: ~50ms  启动时间
Bun Hook:     ~3ms   启动时间

每次 Hook 触发都节省 47ms！
```

### 2. **原生 TypeScript**

```typescript
// 无需编译配置，直接运行
#!/usr/bin/env bun
import { config } from '../lib/config.ts';  // .ts 扩展名
```

### 3. **内置 SQLite**

```typescript
// 未来可以直接使用，无需安装依赖
import { Database } from "bun:sqlite";
```

### 4. **进程管理友好**

```typescript
// 守护进程需要快速启动/停止
Bun.spawn(['command'], { ... });  // 内置进程管理
```

### 5. **零依赖哲学**

Bun 的许多内置功能减少了外部依赖，提高了可靠性。

---

## 📚 学习资源

- 官网：https://bun.sh
- 文档：https://bun.sh/docs
- GitHub：https://github.com/oven-sh/bun
- Discord：https://bun.sh/discord

---

## 🎓 快速上手示例

### Hello World

```typescript
// hello.ts
console.log("Hello from Bun!");

// 运行
bun hello.ts
```

### HTTP 服务器

```typescript
// server.ts
Bun.serve({
  port: 3000,
  fetch() {
    return new Response("Hello!");
  },
});
```

### 文件读写

```typescript
// 写入
await Bun.write("test.txt", "Hello!");

// 读取
const content = await Bun.file("test.txt").text();
console.log(content);
```

---

## 🚀 总结

**Bun 是什么？**
- 一个超快的 JavaScript/TypeScript 运行时
- 一个完整的工具链（运行时+包管理+打包+测试）
- Node.js 的现代化替代品

**核心优势：**
1. ⚡ 性能快 3-4 倍
2. 🔋 功能全包（电池全包）
3. 📝 原生 TypeScript
4. 🎯 简单易用

**适合场景：**
- CLI 工具
- 微服务
- 开发工具
- 守护进程
- 自动化脚本

我们的 Claude Code 守护进程选择 Bun，正是看中了它的**启动速度**、**TypeScript 支持**和**内置功能**，完美契合守护线程的需求！🎉
