FROM node:22-alpine

# 安全基线：刷新 alpine OS 包（OpenSSL 等 CVE 修复）
RUN apk upgrade --no-cache

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 运行时仅需 node：移除 npm 工具链，消除其捆绑依赖的 CVE 暴露面
# （npm 12.0.2 的 tar/ip-address/brace-expansion 仍带 CRITICAL CVE，官方尚未修复；
#   应用启动为 node app.js，不依赖 npm/npx）
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY . .
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 5000
CMD ["node", "app.js"]
