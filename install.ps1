# Claude Code 会话历史系统 - Windows PowerShell 安装脚本
# 版本: 1.0

param(
    [switch]$Force
)

Write-Host "======================================" -ForegroundColor Green
Write-Host "Claude Code 会话历史系统 - 安装程序" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# 检测系统
Write-Host "检测到系统: Windows" -ForegroundColor Yellow
Write-Host "PowerShell 版本: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
Write-Host ""

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "安装源目录: $ScriptDir" -ForegroundColor Yellow
Write-Host ""

# 1. 检查 Bun
Write-Host "[1/6] 检查 Bun 运行时..." -ForegroundColor Green
$BunPath = Get-Command bun -ErrorAction SilentlyContinue

if ($BunPath) {
    Write-Host "✓ Bun 已安装: $($BunPath.Source)" -ForegroundColor Green
    $BunExe = $BunPath.Source
} else {
    Write-Host "⚠ Bun 未安装，正在安装..." -ForegroundColor Yellow

    # 安装 Bun for Windows
    irm bun.sh/install.ps1 | iex

    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    $BunExe = "$env:USERPROFILE\.bun\bin\bun.exe"
    Write-Host "✓ Bun 安装完成: $BunExe" -ForegroundColor Green
}
Write-Host ""

# 2. 创建目录结构
Write-Host "[2/6] 创建目录结构..." -ForegroundColor Green
$ClaudeDir = "$env:USERPROFILE\.claude"
$SessionsDir = "$ClaudeDir\SESSIONS"

$Directories = @(
    "$SessionsDir\raw",
    "$SessionsDir\analysis\summaries",
    "$SessionsDir\analysis\by-type",
    "$SessionsDir\analysis\by-directory",
    "$SessionsDir\index",
    "$ClaudeDir\hooks"
)

foreach ($Dir in $Directories) {
    if (-not (Test-Path $Dir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    }
}
Write-Host "✓ 目录创建完成" -ForegroundColor Green
Write-Host ""

# 3. 配置 hooks
Write-Host "[3/6] 配置 hooks..." -ForegroundColor Green
$HookFiles = Get-ChildItem -Path "$ScriptDir\hooks\*.ts"

foreach ($Hook in $HookFiles) {
    # 读取文件内容
    $Content = Get-Content $Hook.FullName -Raw

    # 替换 shebang 为 Windows Bun 路径
    $Content = $Content -replace '^#!.*', "#!$BunExe"

    # 保存到目标位置
    $TargetPath = "$ClaudeDir\hooks\$($Hook.Name)"
    Set-Content -Path $TargetPath -Value $Content -NoNewline

    Write-Host "  ✓ $($Hook.Name)" -ForegroundColor Green
}
Write-Host ""

# 4. 配置 Claude Code settings
Write-Host "[4/6] 配置 Claude Code..." -ForegroundColor Green
$SettingsFile = "$ClaudeDir\settings.json"

if (Test-Path $SettingsFile) {
    Write-Host "⚠ settings.json 已存在，备份到 settings.json.backup" -ForegroundColor Yellow
    Copy-Item $SettingsFile "$SettingsFile.backup" -Force
}

# 创建 settings.json（使用 Windows 路径格式）
$HooksPath = $ClaudeDir.Replace('\', '\\') + "\\hooks"
$Settings = @{
    model = "opus"
    hooks = @{
        SessionStart = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "$HooksPath\\SessionRecorder.hook.ts"
                    }
                )
            }
        )
        PostToolUse = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "$HooksPath\\SessionToolCapture-v2.hook.ts"
                    }
                )
            }
        )
        Stop = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "$HooksPath\\SessionAnalyzer.hook.ts"
                    }
                )
            }
        )
    }
}

$Settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile
Write-Host "✓ settings.json 配置完成" -ForegroundColor Green
Write-Host ""

# 5. 安装查询工具
Write-Host "[5/6] 安装查询工具..." -ForegroundColor Green
$BinDir = "$env:USERPROFILE\bin"

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 创建查询工具的包装脚本
$WrapperScript = @"
# Claude 会话历史查询工具
param([string]`$Command, [string]`$Arg1, [string]`$Arg2)

`$BunPath = "$BunExe"
`$ToolsDir = "$ScriptDir\tools"

switch (`$Command) {
    "recent" {
        & `$BunPath "`$ToolsDir\SessionQuery.ts" recent `$Arg1
    }
    "type" {
        & `$BunPath "`$ToolsDir\SessionQuery.ts" type `$Arg1
    }
    "dir" {
        & `$BunPath "`$ToolsDir\SessionQuery.ts" dir `$Arg1
    }
    "stats" {
        & `$BunPath "`$ToolsDir\SessionStats.ts" `$Arg1
    }
    "show" {
        Write-Host "show 命令在 Windows 上需要使用 WSL 或 Git Bash" -ForegroundColor Yellow
        Write-Host "请使用: bun `$ToolsDir\SessionQuery.ts recent 1" -ForegroundColor Yellow
    }
    default {
        Write-Host "用法:"
        Write-Host "  claude-sessions recent [N]       - 查看最近 N 个会话"
        Write-Host "  claude-sessions type <类型>      - 查看指定类型的会话"
        Write-Host "  claude-sessions dir <目录>       - 查看指定目录的会话"
        Write-Host "  claude-sessions stats global     - 查看全局统计"
    }
}
"@

Set-Content -Path "$BinDir\claude-sessions.ps1" -Value $WrapperScript
Write-Host "✓ 查询工具安装完成" -ForegroundColor Green
Write-Host ""

# 6. 配置环境变量
Write-Host "[6/6] 配置环境变量..." -ForegroundColor Green

# 添加到用户 PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
    Write-Host "✓ 已添加到 PATH" -ForegroundColor Green
} else {
    Write-Host "✓ PATH 已配置" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✓ 安装完成！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "使用方法:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  PowerShell -File $BinDir\claude-sessions.ps1 recent 5" -ForegroundColor Green
Write-Host "  或者直接使用 Bun:" -ForegroundColor Green
Write-Host "  bun $ScriptDir\tools\SessionQuery.ts recent 5" -ForegroundColor Green
Write-Host ""
Write-Host "重要提示:" -ForegroundColor Yellow
Write-Host "  1. 重启 PowerShell 以加载新的 PATH" -ForegroundColor Yellow
Write-Host "  2. 查看 Windows 指南: cat $ScriptDir\WINDOWS.md" -ForegroundColor Yellow
Write-Host ""
