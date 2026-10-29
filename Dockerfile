# One image for the API and the worker. Fly runs both from it as process groups (fly.toml).
FROM node:22-slim AS build
# pnpm refuses to replace node_modules without a terminal unless CI is set.
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@apprentice/api... --filter=@apprentice/worker... \
  && rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-slim
# ffmpeg extracts reference frames from source videos.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
