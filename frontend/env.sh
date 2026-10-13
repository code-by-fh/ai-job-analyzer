#!/bin/sh
# Container entrypoint. Production bundles contain the literal APP_API_URL (from .env.production).
# On every start the pristine bundle (TEMPLATE_DIR, root-owned, read-only) is copied over ASSET_DIR and the
# placeholder is replaced there, so a restart with a different URL always takes effect. Then the server starts.
set -eu

PLACEHOLDER="APP_API_URL"
: "${APP_API_URL:?APP_API_URL must be set to the public API base URL, e.g. http://localhost:8002}"
ASSET_DIR="${ASSET_DIR:-./.next/static}"
TEMPLATE_DIR="${TEMPLATE_DIR:-./static-template}"

case "$APP_API_URL" in
  *'
'*) echo "env.sh: APP_API_URL must not contain a newline" >&2; exit 1 ;;
  http://*|https://*) ;;
  *) echo "env.sh: APP_API_URL must start with http:// or https://" >&2; exit 1 ;;
esac

# Allow-list: the URL is written into a JavaScript string literal, so quotes, spaces, angle
# brackets and backslashes must never reach the bundle. "[" and "]" are allowed for IPv6 hosts
# (http://[::1]:8002); "@" is not, so no credentials end up in the public bundle.
# "]" must come first in the bracket expression and "-" last to be taken literally.
URL_CHARACTERS='][A-Za-z0-9:/._~%?#=&+-'
if printf '%s' "$APP_API_URL" | grep -q "[^$URL_CHARACTERS]"; then
  echo "env.sh: APP_API_URL may only contain letters, digits and :/._~%?#=&+-[]" >&2
  exit 1
fi

for dir in "$ASSET_DIR" "$TEMPLATE_DIR"; do
  if [ ! -d "$dir" ]; then
    echo "env.sh: directory '$dir' not found" >&2
    exit 1
  fi
done

# Escape the sed replacement metacharacters (backslash, ampersand and the delimiter) so any URL is literal.
ESCAPED_URL="$(printf '%s' "$APP_API_URL" | sed 's/[\\&|]/\\&/g')"

echo "env.sh: rendering $PLACEHOLDER as $APP_API_URL into $ASSET_DIR"
cp -R "$TEMPLATE_DIR"/. "$ASSET_DIR"/
find "$ASSET_DIR" -type f -name '*.js' -exec sed -i "s|${PLACEHOLDER}|${ESCAPED_URL}|g" {} +

exec "$@"
