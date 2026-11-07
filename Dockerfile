# devit builder: one Next app; JSON storage under /app/data (a volume). The runner is Playwright's image so
# reference sites can be read in a real Chromium (src/lib/reference.ts); without it that step falls back to fetch.
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3130 HOSTNAME=0.0.0.0
COPY --from=build --chown=pwuser:pwuser /app /app
USER pwuser
EXPOSE 3130
CMD ["node_modules/.bin/next", "start", "-p", "3130", "-H", "0.0.0.0"]
