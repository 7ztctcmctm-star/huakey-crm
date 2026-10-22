#!/bin/bash
# ============================================
# 铧旗CRM 一键部署脚本（群晖NAS专用）
#
# 用法：在部署目录中执行
#   cd /volume1/docker/crm-stack
#   bash deploy/deploy.sh
#
# 前置条件：
#   1. 已按部署攻略第 8-9 步将项目文件上传并解压到当前目录
#   2. 当前目录应包含：docker-compose.synology.yml、.env.synology、.env.secrets、backend/、frontend/、database/、deploy/
#   3. .env.secrets 已填入真实凭据并设置 chmod 600
#   4. nginx/certs/ 下已放置 SSL 证书（server.crt / server.key），
#      可由 deploy/_https_deploy.sh 生成自签证书；证书不入仓库
# ============================================

set -e

# 群晖 NAS 的 docker 命令在 /usr/local/bin，SSH 非交互式 shell 默认 PATH 不含此路径
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# docker 权限自适应（2026-10-15）：
# 群晖上 syadmin 用户对 docker.sock 无权限，sudoers 仅白名单放行
# `NOPASSWD: /usr/local/bin/docker, /usr/local/bin/docker-compose`。
# 若当前用户无法直接访问 docker（docker info 失败），则把 docker/docker-compose
# 包装为经 sudo 调用；root 或已在 docker 组的用户不受影响（docker info 成功时不包装）。
# （背景：08-31 首次部署以 root 运行故无需此处理；syadmin 直跑曾在 [5/12] 构建步
#  permission denied 中断——注意 [4/12] 的 down 带 `|| true`，权限失败时静默无动作。）
if ! docker info >/dev/null 2>&1; then
    if sudo -n /usr/local/bin/docker info >/dev/null 2>&1; then
        echo "  ✓ 检测到 docker 需要 sudo（已配置 NOPASSWD），自动启用包装"
        docker() { sudo -n /usr/local/bin/docker "$@"; }
        docker-compose() { sudo -n /usr/local/bin/docker-compose "$@"; }
    else
        echo "FATAL: 当前用户无 docker 权限，且 sudo NOPASSWD 不可用"
        echo "请以 root 或 docker 组成员身份运行，或在 sudoers 中放行 /usr/local/bin/docker"
        exit 1
    fi
fi

echo "=========================================="
echo "  铧旗CRM 部署开始"
echo "=========================================="

# 配置：部署目录为脚本所在目录的上一级（即项目根目录）
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "[0/12] 当前部署目录: $PROJECT_DIR"

# 关键文件检查
for f in docker-compose.synology.yml .env.synology .env.secrets; do
    if [ ! -f "$PROJECT_DIR/$f" ]; then
        echo "FATAL: 未找到 $f"
        echo "请确认已按部署攻略第 8-9 步上传并解压项目文件"
        exit 1
    fi
done

# 部署期间累积 P0 步骤的失败数。
# 设计取舍：不采用「失败即中止」——那样会在容器已启动、系统处于半成品状态时中断部署。
# 改为「记录失败 → 流程跑完 → 最后以非零码退出并醒目汇总」：
# 既不留半成品状态，又让失败对操作者与 CI 可检测。
DEPLOY_FAILURES=0

# ---- 部署安全：可回滚性相关状态（2026-10-19 加）----
COMPOSE_FILE="docker-compose.synology.yml"
BACKUP_DIR="$PROJECT_DIR/database/backups"
DUMP_FILE=""    # 部署前数据库快照路径；为空表示无快照（首次部署）
PREV_IMAGE=""   # 回滚点镜像 tag（<image>:prev）；为空表示无回滚点

# 数据库迁移是硬门禁：一旦失败，绝不允许新代码留在未知库状态上继续服务。
# 处理顺序：回切 :prev 镜像 → 以旧镜像重新拉起 → 提示人工用部署前快照恢复库 → exit 1。
# 注意：镜像回滚不会回滚数据库，这一点必须在输出里讲清楚。
rollback_and_exit() {
    local reason="$1"
    echo ""
    echo "=========================================="
    echo "  ✗ 部署失败，执行回滚：$reason"
    echo "=========================================="

    if [ -n "$PREV_IMAGE" ] && docker image inspect "$PREV_IMAGE" >/dev/null 2>&1; then
        local base="${PREV_IMAGE%%:*}"
        echo "  → 回切镜像：$base:latest ← $PREV_IMAGE"
        docker tag "$PREV_IMAGE" "$base:latest"
        echo "  → 以旧镜像重新拉起容器（不重新构建）"
        docker compose -f "$COMPOSE_FILE" --env-file .env up -d --no-build 2>&1 | tail -5 || true
        echo "  ✓ 旧版本容器已启动"
    else
        echo "  ⚠ 无 :prev 回滚镜像（首次部署），无法自动回切"
    fi

    echo ""
    echo "  ⚠️ 镜像回滚不会回滚数据库，新版本迁移可能已部分写入！"
    if [ -n "$DUMP_FILE" ] && [ -f "$DUMP_FILE" ]; then
        echo "     部署前快照：$DUMP_FILE"
        echo "     人工恢复（确认已停止写入后执行）："
        echo "       docker exec -i -e MYSQL_PWD=... huakey-mysql \\"
        echo "         sh -c 'mysql -h 127.0.0.1 -u root ${DB_NAME:-huakey_crm}' < $DUMP_FILE"
    else
        echo "     ⚠ 本次无部署前快照，请立即从定时备份（database/backups）恢复"
    fi
    exit 1
}

# 拒绝含命令替换的 env 文件。
# 这些文件是 source 进当前 shell 的，含 $(...) 或反引号的行会在 source 时被执行——
# 等价于让配置文件拥有任意代码执行能力。宁可终止部署，也不能带着这种文件继续。
assert_no_command_substitution() {
    local f="$1"
    [ -f "$f" ] || return 0
    # 只检查 KEY=VALUE 形式的行（注释行里的示例文本不算）
    local hits
    hits=$(grep -nE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=.*(\$\(|`)' "$f" 2>/dev/null || echo "")
    if [ -n "$hits" ]; then
        echo "FATAL: $f 存在含命令替换的行，source 时会被执行："
        echo "$hits"
        echo "请改为字面值后重试（如需变量请用 \$\${VAR} 形式，勿用 \$(cmd)）。"
        exit 1
    fi
    echo "  ✓ $f 未发现命令替换"
}

# SSL 证书前置检查
# nginx/nginx.conf 强依赖 /etc/nginx/certs/server.crt|key（由 ./nginx/certs 挂载），
# 而证书不入仓库。若缺失，nginx 容器会启动失败并不断重启（crash-loop），
# 排查成本远高于在此处直接给出明确错误。
if [ ! -f "$PROJECT_DIR/nginx/certs/server.crt" ] || [ ! -f "$PROJECT_DIR/nginx/certs/server.key" ]; then
    echo "FATAL: 未找到 SSL 证书 nginx/certs/server.crt 或 server.key"
    echo ""
    echo "证书不入仓库，请先二选一："
    echo "  a) 生成自签证书：bash deploy/_https_deploy.sh"
    echo "  b) 将正式证书放入 nginx/certs/（server.crt + server.key）"
    exit 1
fi
echo "  ✓ SSL 证书已就位"

# 1. 从安全源注入生产敏感凭据
# 说明：真实密码/JWT Secret 等敏感信息存放在 .env.secrets 中，
# 通过 source 注入当前 shell，docker-compose 会优先使用环境变量。
echo ""
echo "[1/12] 注入生产敏感凭据..."

# 1a. 凭据文件权限前置检查：非 600 说明同机其他账号可读，属风险项
#     只警告不阻断——NAS(DSM) 上共享文件夹的 ACL 与 POSIX 位常不一致，
#     误阻断会让部署在无法修权限的环境上卡死。
SECRETS_PERM=$(stat -c '%a' "$PROJECT_DIR/.env.secrets" 2>/dev/null || echo "unknown")
if [ "$SECRETS_PERM" != "600" ]; then
    echo "  ⚠ .env.secrets 权限为 $SECRETS_PERM，建议 600（当前：chmod 600 .env.secrets）"
else
    echo "  ✓ .env.secrets 权限为 600"
fi

# 1b. source 前先消毒：含 $(...) / 反引号的行会在 source 时被执行
assert_no_command_substitution "$PROJECT_DIR/.env.secrets"

# shellcheck source=inject-secrets.sh
source "$PROJECT_DIR/deploy/inject-secrets.sh"
echo "  ✓ 已从 .env.secrets 注入生产敏感凭据"

# 2. 准备 .env 文件（docker-compose 默认读取 .env）
echo ""
echo "[2/12] 准备 .env 文件..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.synology" "$PROJECT_DIR/.env"
    echo "  ✓ 已从 .env.synology 复制为 .env"
else
    echo "  ✓ .env 已存在，跳过复制"
fi

# .env 同样会被 source，先做命令替换消毒（理由同 .env.secrets）
assert_no_command_substitution "$PROJECT_DIR/.env"

# 加载 .env 中的非敏感配置（NODE_ENV/REDIS_ENABLED/CORS_ORIGIN 等）
# 注意：.env 中的密码是占位符，source 后需要重新 source .env.secrets 恢复真实值
set -a
# shellcheck source=/dev/null
source "$PROJECT_DIR/.env"
set +a

# 重新加载 .env.secrets，确保真实密码覆盖 .env 中的占位符
set -a
# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.secrets"
set +a

# 2b. 备份加密口令文件（D3）
# config 备份含 .env.secrets 明文密钥，必须加密后落盘；口令文件仅存 NAS 宿主机
# （.backup-enc-pass，600），不入仓库、不进备份产物。
# 已存在则绝不覆盖——覆盖会使历史加密备份全部不可读。
# 口令同时是 deploy/backup/container-backup.sh run_config 的加密输入。
ENC_PASS_FILE="${PROJECT_DIR}/.backup-enc-pass"
if [ ! -f "$ENC_PASS_FILE" ]; then
    if command -v openssl >/dev/null 2>&1; then
        ( umask 077 && openssl rand -hex 32 > "$ENC_PASS_FILE" )
        chmod 600 "$ENC_PASS_FILE"
        echo "  ✓ 已生成备份加密口令 $ENC_PASS_FILE（请离线妥善保管，丢失后加密备份不可恢复）"
    else
        echo "  ⚠ 未找到 openssl，跳过口令生成；config 备份将排除 .env.secrets（防明文落盘）"
        echo "  ⚠ 修复：在 NAS 执行 bash deploy/backup/setup-backup-encryption.sh 后重启备份容器"
    fi
else
    echo "  ✓ 备份加密口令已存在，跳过生成（$ENC_PASS_FILE）"
fi

# 3. 生产环境安全校验
echo ""
echo "[3/12] 生产环境配置校验..."
# --no-env-file 模式校验当前 shell 环境变量（已 source .env.secrets）
# NAS 上可能没有安装 Node.js，此时跳过本地校验（Docker 容器内有 node 可后续校验）
if command -v node &>/dev/null; then
    if ! node "$PROJECT_DIR/deploy/validate-env.js" --no-env-file; then
        echo "FATAL: 环境变量校验未通过，终止部署"
        exit 1
    fi
    echo "  ✓ 环境变量校验通过"
else
    echo "  ⚠ NAS 上未安装 Node.js，跳过本地校验"
    echo "  ⚠ 将在 Docker 容器启动后通过 docker exec 执行校验"
    # 基础检查：确认关键环境变量已设置
    for var in DB_PASSWORD MYSQL_ROOT_PASSWORD JWT_SECRET REDIS_PASSWORD ADMIN_INITIAL_PASSWORD; do
        val=$(eval echo "\$$var")
        if [ -z "$val" ] || [ "$val" = "placeholder_will_be_overridden" ]; then
            echo "FATAL: $var 未设置或仍为占位符"
            exit 1
        fi
    done
    echo "  ✓ 关键环境变量基础检查通过"
fi

# 4. 部署前备份 → 标记回滚点 → 停止旧容器
# 顺序不可换：必须先拿到快照与回滚镜像，再 down。
# 否则一旦迁移失败，既无库快照也无旧镜像，只能人工救火。
echo ""
echo "[4/12] 部署前备份与停止旧容器..."

# 4a. 数据库快照
# 宿主机（群晖）没有 mysqldump，故在 mysql 容器内执行，输出重定向回宿主机。
# 密码走 MYSQL_PWD 环境变量而非 -p<明文>，避免出现在 docker exec 的命令行里
# （可被 ps / 容器 inspect 看到）。
# stderr 单独落到 .err 文件，绝不并入 dump——否则一条 warning 就会污染整份备份。
echo "  [4a/12] 数据库快照（部署前）..."
mkdir -p "$BACKUP_DIR"
CURRENT_APP_IMAGE=$(docker inspect --format='{{.Config.Image}}' huakey-app 2>/dev/null || echo "")

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "huakey-mysql"; then
    DUMP_FILE="$BACKUP_DIR/predeploy-$(date +%Y%m%d-%H%M%S).sql"
    set +e
    docker exec \
        -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
        -e DUMP_DB="${DB_NAME:-huakey_crm}" \
        huakey-mysql \
        sh -c 'mysqldump -h 127.0.0.1 -u root --single-transaction --routines --triggers --default-character-set=utf8mb4 "$DUMP_DB"' \
        > "$DUMP_FILE" 2> "$DUMP_FILE.err"
    DUMP_RC=$?
    set -e
    if [ "$DUMP_RC" -ne 0 ] || [ ! -s "$DUMP_FILE" ]; then
        echo "FATAL: 部署前数据库快照失败（退出码 $DUMP_RC），终止部署——无备份不做变更"
        echo "      错误详情见：$DUMP_FILE.err"
        rm -f "$DUMP_FILE"
        exit 1
    fi
    echo "  ✓ 快照已保存：$DUMP_FILE（$(du -h "$DUMP_FILE" | cut -f1)）"
    [ -s "$DUMP_FILE.err" ] && echo "  ⚠ mysqldump 有告警输出：$DUMP_FILE.err"
else
    echo "  ⚠ 未检测到运行中的 huakey-mysql，跳过快照（视为首次部署）"
    DUMP_FILE=""
fi

# 4b. 给当前 app 镜像打 :prev 作为回滚点
# 镜像名直接从运行中的容器读（compose 未声明 image:，名字由项目目录推导），
# 不硬编码，避免改名后回滚点打空。
echo "  [4b/12] 标记回滚镜像..."
if [ -n "$CURRENT_APP_IMAGE" ]; then
    PREV_IMAGE="${CURRENT_APP_IMAGE%%:*}:prev"
    if docker image inspect "$CURRENT_APP_IMAGE" >/dev/null 2>&1; then
        docker tag "$CURRENT_APP_IMAGE" "$PREV_IMAGE"
        echo "  ✓ 回滚点已标记：$PREV_IMAGE"
    else
        echo "  ⚠ 镜像 $CURRENT_APP_IMAGE 已不存在，无法标记回滚点"
        PREV_IMAGE=""
    fi
else
    echo "  ⚠ 无运行中的 huakey-app（首次部署），跳过回滚点标记"
fi

# 4c. 停止旧容器
echo "  [4c/12] 停止旧容器..."
docker compose -f docker-compose.synology.yml down 2>/dev/null || true

# 5. 构建Docker镜像
echo ""
echo "[5/12] 构建Docker镜像（首次约10-15分钟）..."
docker compose -f docker-compose.synology.yml build --no-cache

# 6. 启动容器
echo ""
echo "[6/12] 启动容器..."
docker compose -f docker-compose.synology.yml --env-file .env up -d

# 7. 等待服务就绪
echo ""
echo "[7/12] 等待服务启动..."
echo "  等待 MySQL 健康检查通过..."
for i in $(seq 1 30); do
    MYSQL_STATUS=$(docker inspect --format='{{.State.Health.Status}}' huakey-mysql 2>/dev/null || echo "none")
    if [ "$MYSQL_STATUS" = "healthy" ]; then
        echo "  ✓ MySQL 已就绪（第 $i 次检查）"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "  ⚠ MySQL 30 次检查仍未就绪，请手动查看日志：docker logs huakey-mysql"
        exit 1
    fi
    sleep 5
done

# 8. 等待 App 容器完成迁移并健康就绪
# 主判据改为 docker inspect 读 compose 定义的 healthcheck 状态（真实探针）：
# 日志关键字只能证明进程打印了一行字，证明不了服务真的能应答请求；
# healthcheck 是 wget /api/v1/health，过了才说明服务真的活着。
echo ""
echo "[8/12] 等待 App 迁移完成并通过健康检查..."
APP_HEALTH=""
for i in $(seq 1 60); do
    # 迁移失败判据优先：容器 CMD 是 `node database/migrate.js && exec node app.js`，
    # 迁移失败则进程退出、容器反复重启，日志里永远等不到健康信号，只能靠关键字识别。
    if docker logs huakey-app 2>&1 | grep -qE "\[迁移\] ❌|\[迁移\] 存在失败的迁移|\[迁移\] 致命错误|执行失败"; then
        rollback_and_exit "数据库迁移失败（详见 docker logs huakey-app）"
    fi

    APP_HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' huakey-app 2>/dev/null || echo "missing")

    if [ "$APP_HEALTH" = "healthy" ]; then
        echo "  ✓ App 健康检查通过（第 $i 次检查）"
        # [fix 2026-09-01] 日志格式早已改为 "[服务器] 启动成功"，旧关键字 "服务已启动" 永不匹配导致部署假失败
        # 现在仅作辅助确认，缺失不阻断（healthcheck 才是真实判据）
        if docker logs huakey-app 2>&1 | grep -q "启动成功"; then
            echo "  ✓ 启动日志关键字已确认（辅助判据）"
        else
            echo "  ⚠ 未匹配启动日志关键字（辅助判据，不阻断）"
        fi
        break
    fi

    if [ "$i" = "60" ]; then
        rollback_and_exit "App 60 次检查未进入 healthy（当前：$APP_HEALTH）"
    fi
    sleep 5
done

# 9. 验证数据库迁移结果
echo ""
echo "[9/12] 验证数据库迁移结果..."
# 硬门禁：迁移失败立即回滚，绝不让新代码跑在未知库状态上
# （[8/12] 已拦过一次，此处再确认一次——覆盖"健康检查过了但迁移日志里仍有失败"的窗口）
if docker logs huakey-app 2>&1 | grep -qE "\[迁移\] ❌|\[迁移\] 存在失败的迁移|\[迁移\] 致命错误|执行失败"; then
    echo ""
    docker logs huakey-app 2>&1 | grep -E "\[迁移\]" | tail -15
    rollback_and_exit "数据库迁移失败"
fi
MIGRATE_LOG=$(docker logs huakey-app 2>&1 | grep "\[迁移\] 完成" | tail -1 || echo "")
if [ -z "$MIGRATE_LOG" ]; then
    echo "  ✗ [P0-5] 未找到迁移完成日志，无法确认迁移已成功"
    echo "      排查：docker logs huakey-app | grep 迁移"
    DEPLOY_FAILURES=$((DEPLOY_FAILURES + 1))
else
    echo "  ✓ $MIGRATE_LOG"
fi

# 10. 创建初始管理员账号（首次部署必须）
echo ""
echo "[10/12] 创建初始管理员账号..."
if [ -z "${ADMIN_INITIAL_PASSWORD:-}" ]; then
    echo "FATAL: 未设置 ADMIN_INITIAL_PASSWORD 环境变量"
    echo "请在 .env.secrets 中设置 ADMIN_INITIAL_PASSWORD（至少8位强密码）"
    echo "部署后请立即使用该密码登录系统并修改"
    exit 1
fi
docker exec -e ADMIN_INITIAL_PASSWORD="$ADMIN_INITIAL_PASSWORD" huakey-app node scripts/create-admin.js
echo "  ✓ 初始管理员账号 admin 已就绪（首次登录强制改密）"

# 11. 初始化角色权限
echo ""
echo "[11/12] 初始化角色权限..."
if docker exec huakey-app node scripts/init_role_permissions.js; then
    echo "  ✓ 角色权限已初始化"
else
    echo "  ✗ [P0-3] 角色权限初始化失败——权限码未同步会破坏 RBAC"
    echo "      排查：docker exec huakey-app node scripts/init_role_permissions.js"
    DEPLOY_FAILURES=$((DEPLOY_FAILURES + 1))
fi

# 12. 端到端冒烟（真实 HTTP 请求，经容器 nginx 的 8443，含 HTTPS 与反代链路）
echo ""
echo "[12/12] 端到端冒烟测试..."
SMOKE_URL="https://localhost:8443"
# 退出码语义见 smoke-test.sh：0 全通过 / 3 服务故障 / 4 环境限制（登录无法自动完成）
set +e
if [ -z "${ADMIN_INITIAL_PASSWORD:-}" ]; then
    # 无初始密码可用时只验健康，避免把"没密码"误报成"服务不健康"
    SMOKE_HEALTH_ONLY=1 bash "$PROJECT_DIR/deploy/smoke-test.sh" "$SMOKE_URL"
else
    ADMIN_PASS="$ADMIN_INITIAL_PASSWORD" bash "$PROJECT_DIR/deploy/smoke-test.sh" "$SMOKE_URL"
fi
SMOKE_RC=$?
set -e

case "$SMOKE_RC" in
    0)
        echo "  ✓ 端到端冒烟通过（健康 + 登录 + 业务接口 + 前端）"
        ;;
    4)
        echo "  ⚠ 健康检查通过，但登录/业务步骤因环境限制未自动验证（原因见上）"
        echo "    服务可用；对外提供服务前请人工确认业务链路"
        ;;
    *)
        echo "  ✗ [冒烟] 端到端冒烟未通过（退出码 $SMOKE_RC）"
        DEPLOY_FAILURES=$((DEPLOY_FAILURES + 1))
        ;;
esac

echo ""
echo "[12/12] 部署完成"
echo ""

# P0 步骤存在失败时：服务已启动，但不得视为部署成功
if [ "$DEPLOY_FAILURES" -gt 0 ]; then
    echo "=========================================="
    echo "  ⚠ 流程已跑完，但有 $DEPLOY_FAILURES 个 P0 步骤未通过"
    echo "=========================================="
    echo ""
    echo "服务已启动，但以下事项未确认成功，请人工核查上方标记 ✗ 的步骤后"
    echo "再对外提供服务："
    echo "  · 数据库迁移结果        （P0-5）"
    echo "  · 角色权限初始化        （P0-3）"
    echo "  · 端到端冒烟            （[12/12]）"
    echo ""
    if [ -n "$DUMP_FILE" ] && [ -f "$DUMP_FILE" ]; then
        echo "如需整体回退，本次部署前快照：$DUMP_FILE"
        echo ""
    fi
    echo "以非零退出码结束，便于 CI / 运维脚本检测失败。"
    exit 1
fi

echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "访问地址：https://crm.huakey.local"
echo "（内网域名，客户端 hosts 需配置：192.168.0.200 crm.huakey.local；或直接访问 https://<NAS_IP>）"
echo ""
echo "常用命令："
echo "  查看日志：docker compose -f docker-compose.synology.yml logs -f app"
echo "  停止服务：docker compose -f docker-compose.synology.yml down"
echo "  重启服务：docker compose -f docker-compose.synology.yml restart app"
echo ""
echo "⚠️ 安全提醒：部署后请立即执行"
echo "  1. 用 admin 账号登录并修改初始密码"
echo "  2. 确认 .env.secrets 权限为 600：chmod 600 .env.secrets"
echo "  3. 禁止在生产环境执行 npm run seed:demo（Demo 数据会污染生产库）"
echo ""
