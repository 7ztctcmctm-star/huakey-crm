#!/bin/bash
# ============================================================
# HuakeyCRM 恢复演练 · 宿主机 cron 安装脚本（D3）
#
# 作用：把恢复演练装入 NAS 宿主机 /etc/cron.d，每月 1 日 03:00 执行一次，
#       将最新 MySQL 备份还原到临时库验证可恢复性。
#
# 重要说明（本 NAS 的实际机制）：
#   /etc/cron.d 对部署账号（syadmin）不可写、sudo 仅白名单 docker，
#   因此生产 NAS 上由 huakey-backup 容器内调度器
#   （container-backup.sh maybe_run_drill）承担月执行，效果等价。
#   本脚本面向 root 可写 /etc/cron.d 的环境（或其他 Linux 主机部署），
#   两种机制可任选其一，不要同时启用（演练锁会避免叠加，但没必要）。
#
# 用法（需要 root）：
#   bash deploy/cron/install-restore-drill.sh install   # 安装/覆盖
#   bash deploy/cron/install-restore-drill.sh status    # 查看
#   bash deploy/cron/install-restore-drill.sh uninstall # 卸载
#
# 执行结果：
#   - 日志: ${STACK_DIR}/database/backups/restore-test.log（脚本内 tee）
#   - 状态: ${STACK_DIR}/database/backups/restore-drill.status（RESULT=PASS/FAIL）
#   - cron stdout/stderr: ${STACK_DIR}/database/backups/restore-drill-cron.log
# ============================================================
set -euo pipefail

STACK_DIR="${STACK_DIR:-/volume1/docker/crm-stack}"
CRON_FILE="/etc/cron.d/crm-restore-drill"
DRILL_SCRIPT="${STACK_DIR}/deploy/backup/restore-test.sh"
CRON_LOG="${STACK_DIR}/database/backups/restore-drill-cron.log"

ACTION="${1:-install}"

case "$ACTION" in
  install)
    if [ "$(id -u)" -ne 0 ]; then
      echo "FATAL: 需要 root 执行（写入 ${CRON_FILE}）" >&2
      exit 1
    fi
    if [ ! -f "$DRILL_SCRIPT" ]; then
      echo "FATAL: 演练脚本不存在: $DRILL_SCRIPT" >&2
      exit 1
    fi
    chmod +x "$DRILL_SCRIPT"
    mkdir -p "${STACK_DIR}/database/backups"

    cat > "$CRON_FILE" <<EOF
# HuakeyCRM 恢复演练（D3）：每月 1 日 03:00 还原最新 MySQL 备份到临时库验证
# 由 deploy/cron/install-restore-drill.sh 生成；重新 install 会覆盖本文件
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/sbin:/bin
0 3 1 * * root ${DRILL_SCRIPT} >> ${CRON_LOG} 2>&1
EOF
    chmod 644 "$CRON_FILE"

    # DSM cron 直接读取 /etc/cron.d，无需重启服务；仍做存在性确认
    echo "已安装: $CRON_FILE"
    echo "--- 内容 ---"
    cat "$CRON_FILE"
    echo "------------"
    echo "手动试跑: bash $DRILL_SCRIPT"
    echo "查看结果: cat ${STACK_DIR}/database/backups/restore-drill.status"
    ;;
  status)
    if [ -f "$CRON_FILE" ]; then
      echo "已安装: $CRON_FILE"
      cat "$CRON_FILE"
    else
      echo "未安装（$CRON_FILE 不存在）"
    fi
    STATUS_FILE="${STACK_DIR}/database/backups/restore-drill.status"
    if [ -f "$STATUS_FILE" ]; then
      echo "--- 最近一次演练状态 ---"
      cat "$STATUS_FILE"
    else
      echo "尚无演练状态文件: $STATUS_FILE"
    fi
    ;;
  uninstall)
    if [ "$(id -u)" -ne 0 ]; then
      echo "FATAL: 需要 root 执行（删除 ${CRON_FILE}）" >&2
      exit 1
    fi
    rm -f "$CRON_FILE"
    echo "已卸载: $CRON_FILE"
    ;;
  *)
    echo "用法: $0 [install|status|uninstall]" >&2
    exit 1
    ;;
esac
