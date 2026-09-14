FROM node:24.21.0-alpine3.23@sha256:159fe64649038c30f8cc1ec4be3af3a6e93e3648678c31294e2c5058dbeb99f3

ARG SOURCE_URL
ARG REVISION

LABEL org.opencontainers.image.title="Atmos job runtime probe"
LABEL org.opencontainers.image.description="Finite hardened runtime contract for Atmos jobs"
LABEL org.opencontainers.image.source="${SOURCE_URL}"
LABEL org.opencontainers.image.revision="${REVISION}"
LABEL org.opencontainers.image.licenses="MIT"

# The finite runtime does not need package management; keep only the patched Node runtime.
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-proto=throw

WORKDIR /app

COPY --chown=node:node job.mjs /app/job.mjs

USER node:node

STOPSIGNAL SIGTERM

ENTRYPOINT ["node", "/app/job.mjs"]
