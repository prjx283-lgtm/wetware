# The poster, and nothing else.
#
# Small on purpose: production dependencies only, no compiler, no test
# harness, no reference C build. Node runs the TypeScript directly, exactly as
# it does on a laptop, so what runs in the container is the published source.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package-lock.json ./packages/core/
RUN npm ci --omit=dev && cd packages/core && npm ci --omit=dev

COPY packages/core ./packages/core
COPY services/poster ./services/poster
COPY contracts/out ./contracts/out

ENV PORT=8080
EXPOSE 8080
USER node

CMD ["node", "--experimental-strip-types", "services/poster/poster.ts"]
