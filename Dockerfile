FROM oven/bun:latest as builder
WORKDIR /usr/src/app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM node:20-slim as production
WORKDIR /app

COPY --from=builder /usr/src/app/dist/ ./

EXPOSE 4321

CMD [ "node", "server/entry.mjs" ]
