FROM node:24.12.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_TELEMETRY_DISABLED=1
RUN node -e "const u=new URL(process.env.NEXT_PUBLIC_API_BASE_URL);if(u.protocol!=='https:'||u.origin!==process.env.NEXT_PUBLIC_API_BASE_URL)throw Error('NEXT_PUBLIC_API_BASE_URL must be an HTTPS origin')"
RUN pnpm build && pnpm prune --prod

FROM node:24.12.0-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 10081
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "10081"]
