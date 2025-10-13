FROM oven/bun:latest as builder
WORKDIR /usr/src/app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim as production
WORKDIR /app

COPY --from=builder /usr/src/app/package.json /usr/src/app/bun.lock* ./
RUN bun install --production

COPY --from=builder /usr/src/app/dist/ ./

EXPOSE 4321
CMD [ "bun", "server/entry.mjs" ]
