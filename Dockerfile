FROM oven/bun:1.4.4-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run check

FROM base AS runtime
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && mkdir -p /app/data/private \
    && chown -R bun:bun /app/data
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    DATABASE_PATH=/app/data/proofflow.sqlite STORAGE_PATH=/app/data/private
USER bun
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD bun -e 'const response = await fetch("http://127.0.0.1:3000/api/health"); process.exit(response.ok ? 0 : 1)'
CMD ["bun", "src/server/index.ts"]
