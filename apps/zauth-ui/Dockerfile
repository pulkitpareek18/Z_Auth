FROM node:20-alpine AS builder
WORKDIR /workspace
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/zauth-ui/package.json ./apps/zauth-ui/package.json
RUN npm install --workspace apps/zauth-ui
COPY apps/zauth-ui ./apps/zauth-ui
RUN npm run build --workspace apps/zauth-ui

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/zauth-ui/package.json ./package.json
RUN npm install --omit=dev
COPY --from=builder /workspace/apps/zauth-ui/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
