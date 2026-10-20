FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Nginx 运行阶段 ----
FROM nginx:alpine
# [步骤 B3 · 时区统一] nginx 侧无 Node 的 full-icu，必须装 tzdata 才能让 TZ 生效（日志时间）
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
