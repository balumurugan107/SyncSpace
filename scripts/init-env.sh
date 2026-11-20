#!/usr/bin/env bash
# Creates .env from .env.example with freshly generated secrets.
# Re-running is safe: an existing .env keeps every value it has, and only settings
# added in later phases (e.g. REDIS_*) are appended, with new secrets where needed.
set -euo pipefail
cd "$(dirname "$0")/.."

random() { head -c "$1" /dev/urandom | base64 | tr -d '/+=\n' | head -c "$2"; }
current() { [[ -f .env ]] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

db_password="$(current POSTGRES_PASSWORD)"; db_password="${db_password:-$(random 32 32)}"
redis_password="$(current REDIS_PASSWORD)"; redis_password="${redis_password:-$(random 32 32)}"

candidate="$(sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_password}|" \
  -e "s|^DATABASE_URL=postgres://syncspace:change-me@|DATABASE_URL=postgres://syncspace:${db_password}@|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis_password}|" \
  -e "s|^REDIS_URL=redis://:change-me@|REDIS_URL=redis://:${redis_password}@|" \
  -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(random 96 64)|" \
  .env.example)"

if [[ ! -f .env ]]; then
  printf '%s\n' "$candidate" > .env
  chmod 600 .env
  echo "Created .env with random secrets."
  exit 0
fi

added=0
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z_]+)= ]] || continue
  key="${BASH_REMATCH[1]}"
  if ! grep -qE "^${key}=" .env; then
    printf '%s\n' "$line" >> .env
    echo "Added ${key} to .env"
    added=$((added + 1))
  fi
done <<< "$candidate"
[[ $added -eq 0 ]] && echo ".env is up to date."
exit 0
