FROM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5

ARG SOURCE_URL
ARG REVISION

LABEL org.opencontainers.image.title="Atmos job runtime probe"
LABEL org.opencontainers.image.description="Finite hardened runtime contract for Atmos jobs"
LABEL org.opencontainers.image.source="${SOURCE_URL}"
LABEL org.opencontainers.image.revision="${REVISION}"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-proto=throw

WORKDIR /app

COPY --chown=node:node job.mjs /app/job.mjs

USER node:node

STOPSIGNAL SIGTERM

ENTRYPOINT ["node", "/app/job.mjs"]
