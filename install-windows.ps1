# Claude Code 会话历史系统 - Windows 安装脚本
# 简化版，解决编码问题

param(
    [switch]$SkipBun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Blue
Write-Host "Claude Code 会话历史系统 - 安装程序" -ForegroundColor Blue
Write-Host "======================================" -ForegroundColor Blue
Write-Host ""

# 获取脚本目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. 检查 Bun
Write-Host "[1/6] 检查 Bun 运行时..." -ForegroundColor Green

$BunExe = Get-Command bun -ErrorAction SilentlyContinue

if (-not $BunExe -and -not $SkipBun) {
    Write-Host "⚠ Bun 未安装，正在安装..." -ForegroundColor Yellow
    irm bun.sh/install.ps1 | iex

    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $BunExe = Get-Command bun -ErrorAction SilentlyContinue

    if (-not $BunExe) {
        Write-Host "✗ Bun 安装失败" -ForegroundColor Red
        exit 1
    }

    Write-Host "✓ Bun 安装完成" -ForegroundColor Green
} elseif ($BunExe) {
    Write-Host "✓ Bun 已安装: $($BunExe.Source)" -ForegroundColor Green
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

# 3. 复制 hooks
Write-Host "[3/6] 配置 hooks..." -ForegroundColor Green

$HookFiles = Get-ChildItem -Path "$ScriptDir\hooks" -Filter "*.ts"

foreach ($Hook in $HookFiles) {
    Copy-Item -Path $Hook.FullName -Destination "$ClaudeDir\hooks\" -Force
    Write-Host "  ✓ $($Hook.Name)" -ForegroundColor Green
}

Write-Host ""

# 4. 配置 settings.json
Write-Host "[4/6] 配置 Claude Code..." -ForegroundColor Green

$SettingsFile = "$ClaudeDir\settings.json"

if (Test-Path $SettingsFile) {
    Write-Host "⚠ settings.json 已存在，备份到 settings.json.backup" -ForegroundColor Yellow
    Copy-Item -Path $SettingsFile -Destination "$SettingsFile.backup" -Force
}

# 创建 settings.json
$Settings = @{
    model = "opus"
    hooks = @{
        SessionStart = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "bun $ClaudeDir\hooks\SessionRecorder.hook.ts"
                    }
                )
            }
        )
        PostToolUse = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "bun $ClaudeDir\hooks\SessionToolCapture-v2.hook.ts"
                    }
                )
            }
        )
        Stop = @(
            @{
                hooks = @(
                    @{
                        type = "command"
                        command = "bun $ClaudeDir\hooks\SessionAnalyzer.hook.ts"
                    }
                )
            }
        )
    }
}

$Settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile -Encoding UTF8
Write-Host "✓ settings.json 配置完成" -ForegroundColor Green
Write-Host ""

# 5. 安装查询工具
Write-Host "[5/6] 安装查询工具..." -ForegroundColor Green

$BinDir = "$env:USERPROFILE\bin"

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 创建 claude-sessions.ps1
$ClaudeSessionsScript = @"
# Claude 会话历史查询工具
param([string]`$Cmd, [string]`$Arg1, [string]`$Arg2)

`$BunPath = "bun"
`$ToolsDir = "$ScriptDir\tools"

switch (`$Cmd) {
    "recent" { & `$BunPath "`$ToolsDir\SessionQuery.ts" recent `$Arg1 }
    "type" { & `$BunPath "`$ToolsDir\SessionQuery.ts" type `$Arg1 }
    "dir" { & `$BunPath "`$ToolsDir\SessionQuery.ts" dir `$Arg1 }
    "stats" { & `$BunPath "`$ToolsDir\SessionStats.ts" `$Arg1 }
    default {
        Write-Host "用法:"
        Write-Host "  claude-sessions recent [N]"
        Write-Host "  claude-sessions type <类型>"
        Write-Host "  claude-sessions dir <目录>"
        Write-Host "  claude-sessions stats global"
    }
}
"@

Set-Content -Path "$BinDir\claude-sessions.ps1" -Value $ClaudeSessionsScript -Encoding UTF8

Write-Host "✓ 查询工具安装完成" -ForegroundColor Green
Write-Host ""

# 6. 添加到 PATH
Write-Host "[6/6] 配置环境变量..." -ForegroundColor Green

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
    $env:Path = "$env:Path;$BinDir"
    Write-Host "✓ 已添加 $BinDir 到 PATH" -ForegroundColor Green
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
Write-Host "  powershell -File $BinDir\claude-sessions.ps1 recent 5" -ForegroundColor Green
Write-Host "  # 或重启终端后直接使用:"
Write-Host "  claude-sessions.ps1 recent 5" -ForegroundColor Green
Write-Host ""
Write-Host "重要提示:" -ForegroundColor Yellow
Write-Host "  1. 重启 PowerShell 以加载新的 PATH"
Write-Host "  2. 或运行: `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User')"
Write-Host ""
Write-Host "数据存储位置:" -ForegroundColor Yellow
Write-Host "  $SessionsDir"
Write-Host ""
