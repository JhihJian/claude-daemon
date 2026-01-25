# Claude 会话历史 - Git 仓库初始化脚本 (PowerShell)
# 版本: 1.0

Write-Host "======================================" -ForegroundColor Green
Write-Host "初始化会话数据 Git 仓库" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

$SessionsDir = "$env:USERPROFILE\.claude\SESSIONS"

# 检查目录是否存在
if (-not (Test-Path $SessionsDir)) {
    Write-Host "错误: $SessionsDir 不存在" -ForegroundColor Red
    Write-Host "请先运行安装脚本: .\install.ps1" -ForegroundColor Yellow
    exit 1
}

Set-Location $SessionsDir

# 1. 初始化 Git
if (-not (Test-Path ".git")) {
    Write-Host "[1/5] 初始化 Git 仓库..." -ForegroundColor Green
    git init
    Write-Host "✓ Git 仓库已初始化" -ForegroundColor Green
} else {
    Write-Host "⚠ Git 仓库已存在" -ForegroundColor Yellow
}
Write-Host ""

# 2. 创建 .gitignore
Write-Host "[2/5] 创建 .gitignore..." -ForegroundColor Green
$GitIgnore = @"
# 日志文件
*.log

# 临时文件
*.tmp
*.swp
*~

# Windows
Thumbs.db
desktop.ini
"@
Set-Content -Path ".gitignore" -Value $GitIgnore
Write-Host "✓ .gitignore 已创建" -ForegroundColor Green
Write-Host ""

# 3. 创建 README
Write-Host "[3/5] 创建 README..." -ForegroundColor Green
$Readme = @"
# Claude Code 会话历史数据

这个仓库存储了 Claude Code 的会话历史记录。

## 目录结构

``````
.
├── raw/              # 原始会话数据（JSONL格式）
├── analysis/         # 分析结果
└── index/            # 全局索引
``````

## 最后同步

- 主机: $env:COMPUTERNAME
- 时间: $(Get-Date)
"@
Set-Content -Path "README.md" -Value $Readme
Write-Host "✓ README 已创建" -ForegroundColor Green
Write-Host ""

# 4. 首次提交
Write-Host "[4/5] 创建首次提交..." -ForegroundColor Green
git add .
git commit -m "Initial commit: Session history from $env:COMPUTERNAME" 2>&1 | Out-Null
Write-Host ""

# 5. 设置远程仓库
Write-Host "[5/5] 配置远程仓库..." -ForegroundColor Green
Write-Host ""
Write-Host "请选择远程仓库类型:" -ForegroundColor Yellow
Write-Host "  1) GitHub"
Write-Host "  2) GitLab"
Write-Host "  3) 自定义 Git 服务器"
Write-Host "  4) 跳过（稍后手动配置）"
Write-Host ""
$Choice = Read-Host "请选择 [1-4]"

$RemoteUrl = ""
switch ($Choice) {
    "1" {
        Write-Host ""
        Write-Host "请在 GitHub 上创建私有仓库: claude-sessions" -ForegroundColor Yellow
        Write-Host "访问: https://github.com/new" -ForegroundColor Yellow
        Write-Host ""
        $GithubUser = Read-Host "输入您的 GitHub 用户名"
        $RemoteUrl = "git@github.com:$GithubUser/claude-sessions.git"
    }
    "2" {
        Write-Host ""
        $GitlabUser = Read-Host "输入您的 GitLab 用户名"
        $RemoteUrl = "git@gitlab.com:$GitlabUser/claude-sessions.git"
    }
    "3" {
        Write-Host ""
        $RemoteUrl = Read-Host "输入远程仓库 URL"
    }
    "4" {
        Write-Host "跳过远程配置" -ForegroundColor Yellow
    }
    default {
        Write-Host "无效选择" -ForegroundColor Red
        exit 1
    }
}

if ($RemoteUrl) {
    # 检查是否已有 origin
    $ExistingRemote = git remote | Where-Object { $_ -eq "origin" }
    if ($ExistingRemote) {
        Write-Host "移除旧的 origin..." -ForegroundColor Yellow
        git remote remove origin
    }

    git remote add origin $RemoteUrl
    git branch -M main

    Write-Host ""
    Write-Host "✓ 远程仓库已配置: $RemoteUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "现在尝试推送到远程..." -ForegroundColor Yellow

    git push -u origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ 推送成功！" -ForegroundColor Green
    } else {
        Write-Host "✗ 推送失败" -ForegroundColor Red
        Write-Host "请检查:" -ForegroundColor Yellow
        Write-Host "  1. 远程仓库是否已创建"
        Write-Host "  2. SSH 密钥是否已配置"
        Write-Host "  3. 是否有推送权限"
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✓ Git 仓库初始化完成！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
