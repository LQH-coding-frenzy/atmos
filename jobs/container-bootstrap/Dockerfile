FROM scratch

ARG SOURCE_URL
ARG REVISION

LABEL org.opencontainers.image.title="Atmos jobs bootstrap"
LABEL org.opencontainers.image.description="Registry validation artifact; not deployable"
LABEL org.opencontainers.image.source="${SOURCE_URL}"
LABEL org.opencontainers.image.revision="${REVISION}"
LABEL org.opencontainers.image.licenses="MIT"

COPY --chown=65532:65532 release-marker.txt /atmos/release-marker.txt

USER 65532:65532
