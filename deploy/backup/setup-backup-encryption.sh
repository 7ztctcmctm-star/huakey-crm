#!/bin/bash
# ============================================================
# HuakeyCRM 备份加密口令文件生成（D3）
#
# 背景：config 备份含 .env.secrets（明文密钥/JWT Secret/DB 密码），
#       按 D3 铁律不允许明文落盘——有口令文件时 config 备份自动
#       gpg（无则 openssl）对称加密；口令文件仅存 NAS 宿主机。
#
# 口令文件默认路径：/volume1/docker/crm-stack/.backup-enc-pass
#   - 权限 600，仅 root/容器可读
#   - 不在 git 仓库、不进任何备份产物
#   - deploy.sh 部署时若缺失会自动生成本文件（等价逻辑）
#
# 已存在则不覆盖：覆盖会使历史加密备份全部不可读。
# 确需轮换时：先解密重备旧产物，再删除本文件重新生成。
#
# 用法：
#   bash deploy/backup/setup-backup-encryption.sh [口令文件路径]
# ============================================================
set -euo pipefail

STACK_DIR="${STACK_DIR:-/volume1/docker/crm-stack}"
PASS_FILE="${1:-${BACKUP_ENC_PASS_FILE:-${STACK_DIR}/.backup-enc-pass}}"

if [ -f "$PASS_FILE" ]; then
  echo "口令文件已存在，跳过生成（覆盖将导致历史加密备份不可读）: $PASS_FILE"
  echo "权限: $(stat -c '%a' "$PASS_FILE")"
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "FATAL: 未找到 openssl，无法生成口令" >&2
  exit 1
fi

PASS_DIR=$(dirname "$PASS_FILE")
if [ ! -d "$PASS_DIR" ]; then
  echo "FATAL: 目录不存在: $PASS_DIR" >&2
  exit 1
fi

# umask 077 保证创建瞬间即仅所有者可读
( umask 077 && openssl rand -hex 32 > "$PASS_FILE" )
chmod 600 "$PASS_FILE"

echo "已生成备份加密口令: $PASS_FILE (权限 $(stat -c '%a' "$PASS_FILE"))"
echo ""
echo "后续动作："
echo "  1. 将该口令离线妥善保管（密码管理器）——丢失后加密备份无法恢复"
echo "  2. 重启备份容器使新口令生效: docker compose -f docker-compose.synology.yml up -d backup"
echo "  3. 手动验证一次: docker exec huakey-backup sh /container-backup.sh --once"
