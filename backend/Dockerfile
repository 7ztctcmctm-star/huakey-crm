FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY . .
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 5000
CMD ["node", "app.js"]
