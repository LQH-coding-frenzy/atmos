FROM postgres:17.7-alpine3.22@sha256:6b591f995765a189e69276dd55e0b362342d65d10d0359bb1fab67bc3391f20f

ARG SOURCE_URL
ARG REVISION

LABEL org.opencontainers.image.source="${SOURCE_URL}"
LABEL org.opencontainers.image.revision="${REVISION}"

RUN apk add --no-cache aws-cli openssl \
    && rm -f /usr/local/bin/gosu

COPY backup.sh /usr/local/bin/backup
RUN chmod 0555 /usr/local/bin/backup

USER 999
ENTRYPOINT ["/usr/local/bin/backup"]
