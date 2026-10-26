# One image for the API and the worker. Fly runs both from it as process groups (fly.toml).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@apprentice/api... --filter=@apprentice/worker... \
  && pnpm prune --prod --config.ignore-scripts=true

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
