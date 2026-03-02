FROM node:20-alpine AS builder
WORKDIR /workspace
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/zauth-notes/package.json ./apps/zauth-notes/package.json
RUN npm install --workspace apps/zauth-notes
COPY apps/zauth-notes ./apps/zauth-notes
RUN npm run build --workspace apps/zauth-notes

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/zauth-notes/package.json ./package.json
RUN npm install --omit=dev
COPY --from=builder /workspace/apps/zauth-notes/dist ./dist
EXPOSE 3002
CMD ["node", "dist/index.js"]
