FROM node:22-alpine

# 安全基线：刷新 OS 包（OpenSSL 等 alpine CVE 修复）并升级镜像内捆绑 npm
# （官方 node 镜像捆绑的 npm 工具链依赖存在 CRITICAL CVE，如 tar/pacote/brace-expansion）
RUN apk upgrade --no-cache && \
    npm install -g npm@latest && \
    rm -rf /root/.npm

WORKDIR /app
COPY package.json package-lock.json* ./
# --allow-remote=root: npm 12 默认禁止 remote tarball；root 仅放行 package.json 显式声明的 URL 依赖
# （xlsx 走 SheetJS 官方 CDN，registry 版本停更且有已知漏洞）
RUN npm ci --omit=dev --allow-remote=root
COPY . .
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 5000
CMD ["node", "app.js"]
