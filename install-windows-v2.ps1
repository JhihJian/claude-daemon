# Claude Code 会话历史系统 - Windows 安装脚本
# 完全重写，确保可靠性

param(
    [switch]$SkipBun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Blue
Write-Host "Claude Code 会话历史系统 - 安装程序" -ForegroundColor Blue
Write-Host "======================================" -ForegroundColor Blue
Write-Host ""

# 获取脚本目录（绝对路径）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "安装源: $ScriptDir" -ForegroundColor Gray
Write-Host ""

# 1. 检查 Bun
Write-Host "[1/6] 检查 Bun 运行时..." -ForegroundColor Green

$BunExe = Get-Command bun -ErrorAction SilentlyContinue

if (-not $BunExe -and -not $SkipBun) {
    Write-Host "⚠ Bun 未安装，正在安装..." -ForegroundColor Yellow

    try {
        irm bun.sh/install.ps1 | iex

        # 刷新 PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $BunExe = Get-Command bun -ErrorAction SilentlyContinue

        if (-not $BunExe) {
            Write-Host "✗ Bun 安装失败，请手动安装: https://bun.sh/" -ForegroundColor Red
            exit 1
        }

        Write-Host "✓ Bun 安装完成: $($BunExe.Source)" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Bun 安装出错: $_" -ForegroundColor Red
        Write-Host "请手动安装: https://bun.sh/" -ForegroundColor Yellow
        exit 1
    }
} elseif ($BunExe) {
    Write-Host "✓ Bun 已安装: $($BunExe.Source)" -ForegroundColor Green
}

$BunPath = if ($BunExe) { $BunExe.Source } else { "bun" }
Write-Host ""

# 2. 创建目录结构
Write-Host "[2/6] 创建目录结构..." -ForegroundColor Green

$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$SessionsDir = Join-Path $ClaudeDir "SESSIONS"

$Directories = @(
    (Join-Path $SessionsDir "raw"),
    (Join-Path $SessionsDir "analysis\summaries"),
    (Join-Path $SessionsDir "analysis\by-type"),
    (Join-Path $SessionsDir "analysis\by-directory"),
    (Join-Path $SessionsDir "index"),
    (Join-Path $ClaudeDir "hooks")
)

foreach ($Dir in $Directories) {
    if (-not (Test-Path $Dir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    }
}

Write-Host "✓ 目录创建完成: $ClaudeDir" -ForegroundColor Green
Write-Host ""

# 3. 复制 hooks
Write-Host "[3/6] 安装 hooks..." -ForegroundColor Green

$HooksSourceDir = Join-Path $ScriptDir "hooks"
$HooksTargetDir = Join-Path $ClaudeDir "hooks"

if (-not (Test-Path $HooksSourceDir)) {
    Write-Host "✗ 找不到 hooks 目录: $HooksSourceDir" -ForegroundColor Red
    exit 1
}

$HookFiles = Get-ChildItem -Path $HooksSourceDir -Filter "*.ts"

if ($HookFiles.Count -eq 0) {
    Write-Host "✗ hooks 目录中没有找到 .ts 文件" -ForegroundColor Red
    exit 1
}

foreach ($Hook in $HookFiles) {
    Copy-Item -Path $Hook.FullName -Destination $HooksTargetDir -Force
    Write-Host "  ✓ $($Hook.Name)" -ForegroundColor Green
}

Write-Host ""

# 4. 配置 settings.json
Write-Host "[4/6] 配置 Claude Code..." -ForegroundColor Green

$SettingsFile = Join-Path $ClaudeDir "settings.json"

if (Test-Path $SettingsFile) {
    Write-Host "⚠ settings.json 已存在，备份到 settings.json.backup" -ForegroundColor Yellow
    Copy-Item -Path $SettingsFile -Destination "$SettingsFile.backup" -Force
}

# 使用绝对路径
$HookRecorder = Join-Path $HooksTargetDir "SessionRecorder.hook.ts"
$HookCapture = Join-Path $HooksTargetDir "SessionToolCapture-v2.hook.ts"
$HookAnalyzer = Join-Path $HooksTargetDir "SessionAnalyzer.hook.ts"

# 转换为 JSON 格式的路径（替换反斜杠）
$HookRecorderJson = $HookRecorder.Replace('\', '\\')
$HookCaptureJson = $HookCapture.Replace('\', '\\')
$HookAnalyzerJson = $HookAnalyzer.Replace('\', '\\')

# 直接构建 JSON 字符串（避免 PowerShell 对象转换问题）
# Windows 需要显式调用 bun 来执行 .ts 文件
$SettingsJson = @"
{
  "model": "opus",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $HookRecorderJson"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $HookCaptureJson"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $HookAnalyzerJson"
          }
        ]
      }
    ]
  }
}
"@

Set-Content -Path $SettingsFile -Value $SettingsJson -Encoding UTF8
Write-Host "✓ settings.json 配置完成" -ForegroundColor Green
Write-Host ""

# 5. 安装查询工具
Write-Host "[5/6] 安装查询工具..." -ForegroundColor Green

$BinDir = Join-Path $env:USERPROFILE "bin"

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 工具目录的绝对路径
$ToolsDir = Join-Path $ScriptDir "tools"
$ToolQueryPath = Join-Path $ToolsDir "SessionQuery.ts"
$ToolStatsPath = Join-Path $ToolsDir "SessionStats.ts"

# 转换为 JSON 格式的路径
$ToolQueryPathJson = $ToolQueryPath.Replace('\', '\\')
$ToolStatsPathJson = $ToolStatsPath.Replace('\', '\\')
$BunPathJson = $BunPath.Replace('\', '\\')

# 创建 claude-sessions.ps1（使用硬编码的绝对路径）
$ClaudeSessionsScript = @"
# Claude 会话历史查询工具
param([string]`$Command, [string]`$Arg1, [string]`$Arg2)

`$BunExe = "$BunPathJson"
`$QueryTool = "$ToolQueryPathJson"
`$StatsTool = "$ToolStatsPathJson"

switch (`$Command) {
    "recent" {
        & `$BunExe `$QueryTool recent `$Arg1
    }
    "type" {
        & `$BunExe `$QueryTool type `$Arg1
    }
    "dir" {
        & `$BunExe `$QueryTool dir `$Arg1
    }
    "stats" {
        & `$BunExe `$StatsTool `$Arg1
    }
    default {
        Write-Host "用法:" -ForegroundColor Yellow
        Write-Host "  claude-sessions recent [N]       - 查看最近 N 个会话"
        Write-Host "  claude-sessions type <类型>      - 查看指定类型的会话"
        Write-Host "  claude-sessions dir <目录>       - 查看指定目录的会话"
        Write-Host "  claude-sessions stats global     - 查看全局统计"
        Write-Host ""
        Write-Host "示例:" -ForegroundColor Yellow
        Write-Host "  claude-sessions recent 5"
        Write-Host "  claude-sessions type coding"
        Write-Host "  claude-sessions stats global"
    }
}
"@

$SessionsScriptPath = Join-Path $BinDir "claude-sessions.ps1"
Set-Content -Path $SessionsScriptPath -Value $ClaudeSessionsScript -Encoding UTF8

Write-Host "✓ 查询工具已安装: $SessionsScriptPath" -ForegroundColor Green
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
Write-Host "  # 重启 PowerShell 后直接使用:" -ForegroundColor Gray
Write-Host "  claude-sessions recent 5" -ForegroundColor Green
Write-Host "  claude-sessions type coding" -ForegroundColor Green
Write-Host "  claude-sessions stats global" -ForegroundColor Green
Write-Host ""
Write-Host "重要提示:" -ForegroundColor Yellow
Write-Host "  1. 请重启 PowerShell 或命令提示符" -ForegroundColor White
Write-Host "  2. 首次使用 Claude Code 时会自动开始记录" -ForegroundColor White
Write-Host ""
Write-Host "数据存储位置:" -ForegroundColor Yellow
Write-Host "  $SessionsDir" -ForegroundColor White
Write-Host ""
Write-Host "查看文档:" -ForegroundColor Yellow
Write-Host "  https://github.com/JhihJian/claude-daemon" -ForegroundColor Cyan
Write-Host ""
