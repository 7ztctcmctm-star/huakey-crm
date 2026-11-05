# [P2-12] digest 固定于 2026-10-26；升级流程见 docs/image-digests.md
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Nginx 运行阶段 ----
# [P2-12] digest 固定于 2026-10-26；升级流程见 docs/image-digests.md
FROM nginx:alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417
# [步骤 B3 · 时区统一] nginx 侧无 Node 的 full-icu，必须装 tzdata 才能让 TZ 生效（日志时间）
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
