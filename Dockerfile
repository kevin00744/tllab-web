# TL Lab Hub 網頁（Next.js standalone）
# 在容器內使用 Node.js 22 LTS，因此主機（例如 Ubuntu 18.04，glibc 2.27）不需安裝 Node.js。
# next.config.ts 已設定 output: 'standalone'。

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* 會在 build 時寫入前端程式，因此以 build args 傳入
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Taipei
# LibreOffice：把進度報告 PPT/PPTX 轉成 PDF 供預覽（中文需要 Noto CJK 字型）
RUN apk add --no-cache tzdata libreoffice font-noto font-noto-cjk \
 && addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
ENV SOFFICE_PATH=/usr/bin/soffice \
    HOME=/tmp
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
