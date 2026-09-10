#!/bin/sh
set -eu

# Named volumes hide ownership prepared in the image. Repair the two writable
# runtime directories on every container start, then drop privileges before
# launching Node. This is required for atomic OAuth token rotation.
mkdir -p /app/uploads /app/secrets/juguang
chown appuser:appuser /app/uploads /app/secrets/juguang
chmod 700 /app/secrets/juguang
if [ -f /app/secrets/juguang/oauth-token.local.json ]; then
  chown appuser:appuser /app/secrets/juguang/oauth-token.local.json
  chmod 600 /app/secrets/juguang/oauth-token.local.json
fi

exec su-exec appuser "$@"
