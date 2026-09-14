FROM postgres:17.6-alpine3.21@sha256:849377bbbdb1143b82d1b87646eb8ab48241fe32b85ab6667e02e0af139aaa74

RUN apk add --no-cache aws-cli openssl

COPY backup.sh /usr/local/bin/backup
RUN chmod 0555 /usr/local/bin/backup

USER 999
ENTRYPOINT ["/usr/local/bin/backup"]
