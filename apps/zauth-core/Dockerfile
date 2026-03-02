FROM node:20-alpine AS builder
WORKDIR /workspace
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/zauth-core/package.json ./apps/zauth-core/package.json
RUN npm install --workspace apps/zauth-core
COPY apps/zauth-core ./apps/zauth-core
RUN npm run build --workspace apps/zauth-core

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/zauth-core/package.json ./package.json
RUN npm install --omit=dev
COPY --from=builder /workspace/apps/zauth-core/dist ./dist
COPY apps/zauth-core/zk ./zk
EXPOSE 3000
CMD ["node", "dist/index.js"]
