# Claude 会话历史 - Git 同步脚本 (PowerShell)
# 版本: 1.0

$SessionsDir = "$env:USERPROFILE\.claude\SESSIONS"
$LogFile = "$env:USERPROFILE\.claude\sync.log"

# 记录日志
function Write-Log {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogFile -Value $LogMessage
}

# 检查是否是 git 仓库
if (-not (Test-Path "$SessionsDir\.git")) {
    Write-Log "错误: $SessionsDir 不是 Git 仓库"
    Write-Log "请先运行: cd $SessionsDir; git init"
    exit 1
}

Set-Location $SessionsDir

# 获取主机名
$Hostname = $env:COMPUTERNAME

Write-Log "开始同步会话数据 (主机: $Hostname)..."

# 1. 提交本地更改
$Status = git status --porcelain
if ($Status) {
    Write-Log "发现本地更改，正在提交..."
    git add .
    $CommitMsg = "Auto-sync from $Hostname - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit -m $CommitMsg 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "✓ 提交成功"
    } else {
        Write-Log "提交失败（可能没有新更改）"
    }
} else {
    Write-Log "没有本地更改"
}

# 2. 拉取远程更新
Write-Log "拉取远程更新..."
git pull --rebase origin main 2>&1 | Out-File -Append -FilePath $LogFile

if ($LASTEXITCODE -eq 0) {
    Write-Log "✓ 拉取成功"
} else {
    Write-Log "⚠ 拉取失败"

    # 检查冲突
    $Conflicts = git diff --name-only --diff-filter=U
    if ($Conflicts) {
        Write-Log "检测到冲突，尝试自动解决..."

        foreach ($File in $Conflicts) {
            if ($File -like "*.jsonl") {
                Write-Log "  合并 JSONL 文件: $File"

                # 获取两个版本
                $Ours = git show HEAD:$File 2>$null
                $Theirs = git show MERGE_HEAD:$File 2>$null

                # 合并（去重）
                $Merged = ($Ours + $Theirs) | Sort-Object | Get-Unique

                # 写回文件
                Set-Content -Path $File -Value $Merged

                # 标记为已解决
                git add $File
            }
        }

        # 完成合并
        git commit -m "Auto-resolved conflicts from $Hostname"
        Write-Log "✓ 冲突已解决"
    }
}

# 3. 推送到远程
Write-Log "推送到远程..."
git push origin main 2>&1 | Out-File -Append -FilePath $LogFile

if ($LASTEXITCODE -eq 0) {
    Write-Log "✓ 推送成功"
} else {
    Write-Log "⚠ 推送失败"
    exit 1
}

Write-Log "✓ 同步完成"
Write-Host ""
