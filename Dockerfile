FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src/ ./src/

RUN npm ci
RUN npx tsc
RUN npm prune --omit=dev


FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

CMD ["node", "dist/bot.js"]
