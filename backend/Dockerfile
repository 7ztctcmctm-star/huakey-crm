FROM node:22-alpine

# 安全基线：刷新 OS 包（OpenSSL 等 alpine CVE 修复）并升级镜像内捆绑 npm
# （官方 node 镜像捆绑的 npm 工具链依赖存在 CRITICAL CVE，如 tar/pacote/brace-expansion）
RUN apk upgrade --no-cache && \
    npm install -g npm@latest && \
    rm -rf /root/.npm

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 5000
CMD ["node", "app.js"]
