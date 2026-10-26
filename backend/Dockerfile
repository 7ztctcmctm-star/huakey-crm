# [P2-12] digest 固定于 2026-10-26；升级流程见 docs/image-digests.md
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

# 安全基线：刷新 alpine OS 包（OpenSSL 等 CVE 修复）
RUN apk upgrade --no-cache

# [步骤 B3 · 时区统一] 容器本地时区固定 Asia/Shanghai（对齐 docker-compose.synology.yml）
# Node 22 自带 full-icu，utils/dateCode.js 的 Intl 格式化与 new Date() 本地取值均以此为准；
# tzdata 同时保证 shell/cron(/etc/localtime) 侧时间一致。
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 运行时仅需 node：移除 npm 工具链，消除其捆绑依赖的 CVE 暴露面
# （npm 12.0.2 的 tar/ip-address/brace-expansion 仍带 CRITICAL CVE，官方尚未修复；
#   应用启动为 node app.js，不依赖 npm/npx）
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY . .
# [P2-10 2026-10-26] 预建日志目录：具名卷挂载到 /app/logs 时继承 nodejs 属主，
# 否则 winston 以非 root 创建目录会因父目录只读而失败。
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    mkdir -p /app/logs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 5000
CMD ["node", "app.js"]
