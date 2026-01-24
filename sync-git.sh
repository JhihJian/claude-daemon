#!/bin/bash
# Claude 会话历史 - Git 同步脚本
# 自动推送和拉取会话数据

set -e

SESSIONS_DIR=~/.claude/SESSIONS
LOG_FILE=~/.claude/sync.log

# 记录日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查是否是 git 仓库
if [ ! -d "$SESSIONS_DIR/.git" ]; then
    log "错误: $SESSIONS_DIR 不是 Git 仓库"
    log "请先运行: cd $SESSIONS_DIR && git init"
    exit 1
fi

cd "$SESSIONS_DIR"

# 获取主机名
HOSTNAME=$(hostname)

log "开始同步会话数据 (主机: $HOSTNAME)..."

# 1. 提交本地更改
if [ -n "$(git status --porcelain)" ]; then
    log "发现本地更改，正在提交..."
    git add .
    git commit -m "Auto-sync from $HOSTNAME - $(date '+%Y-%m-%d %H:%M:%S')" || {
        log "提交失败（可能没有新更改）"
    }
else
    log "没有本地更改"
fi

# 2. 拉取远程更新
log "拉取远程更新..."
if git pull --rebase origin main 2>&1 | tee -a "$LOG_FILE"; then
    log "✓ 拉取成功"
else
    log "⚠ 拉取失败，尝试解决冲突..."

    # 自动解决冲突（对于 JSONL 文件，两边都保留）
    if git diff --name-only --diff-filter=U | grep -q '\.jsonl$'; then
        log "检测到 JSONL 文件冲突，自动合并..."

        git diff --name-only --diff-filter=U | grep '\.jsonl$' | while read file; do
            # 合并两个版本的 JSONL 文件
            {
                git show HEAD:$file 2>/dev/null || true
                git show MERGE_HEAD:$file 2>/dev/null || true
            } | sort | uniq > "$file.merged"

            mv "$file.merged" "$file"
            git add "$file"
            log "  合并文件: $file"
        done

        git commit -m "Auto-resolved JSONL conflicts from $HOSTNAME"
        log "✓ 冲突已解决"
    fi
fi

# 3. 推送到远程
log "推送到远程..."
if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
    log "✓ 推送成功"
else
    log "⚠ 推送失败"
    exit 1
fi

log "✓ 同步完成"
echo ""
