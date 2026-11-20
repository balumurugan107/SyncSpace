#!/usr/bin/env bash
# Runs as root through SSM. Runtime secrets never leave this host.
set -euo pipefail
umask 077

api_image=${1:?API image digest required}
web_image=${2:?Web image digest required}
public_origin=${3:?Public origin required}
root=${SYNCSPACE_DEPLOY_ROOT:-/opt/syncspace}
release_dir=$(cd "$(dirname "$0")" && pwd)
registry=190706546302.dkr.ecr.ap-south-1.amazonaws.com

for image in "$api_image" "$web_image"; do
  if [[ ! "$image" =~ ^190706546302\.dkr\.ecr\.ap-south-1\.amazonaws\.com/syncspace@sha256:[a-f0-9]{64}$ ]]; then
    echo 'Expected a digest from the SyncSpace ECR repository.' >&2
    exit 1
  fi
done
if [[ ! "$public_origin" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
  echo 'Expected an HTTP(S) origin without a path.' >&2
  exit 1
fi
[[ -f "$release_dir/compose.ec2.yml" ]] || { echo 'Release compose file missing.' >&2; exit 1; }
for command in aws docker python3 flock curl; do command -v "$command" >/dev/null; done
docker compose version >/dev/null
mkdir -p "$root"
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

if [[ ! -f "$root/.env" ]]; then
  python3 - "$root/.env" <<'PY'
import os, secrets, sys
values = {
    'POSTGRES_USER': 'syncspace', 'POSTGRES_DB': 'syncspace',
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'REDIS_PASSWORD': secrets.token_hex(32),
    'JWT_ACCESS_SECRET': secrets.token_hex(64),
}
with open(os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as file:
    file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
PY
fi

pending=$(mktemp "$root/.images.pending.XXXXXX")
docker_config=$(mktemp -d)
cleanup() {
  rm -f -- "$pending" "$docker_config/config.json"
  rmdir -- "$docker_config" 2>/dev/null || true
}
trap cleanup EXIT
export DOCKER_CONFIG="$docker_config"
cookie_secure=false
[[ "$public_origin" != https://* ]] || cookie_secure=true
printf 'API_IMAGE=%s\nWEB_IMAGE=%s\nPUBLIC_ORIGIN=%s\nCOOKIE_SECURE=%s\n' \
  "$api_image" "$web_image" "$public_origin" "$cookie_secure" > "$pending"
compose=(docker compose --project-name syncspace-ec2 --env-file "$root/.env" --env-file "$pending" -f "$release_dir/compose.ec2.yml")
"${compose[@]}" config --quiet
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin "$registry"
"${compose[@]}" pull api web migrate
"${compose[@]}" up -d --wait --wait-timeout 120 postgres redis
# A failed migration exits before replacing the running API/web containers.
"${compose[@]}" run --rm --no-deps migrate

if ! "${compose[@]}" up -d --no-deps --wait --wait-timeout 150 api web || \
   ! curl --fail --silent --show-error http://127.0.0.1/api/health/ready >/dev/null; then
  echo 'New release failed health checks.' >&2
  if [[ -s "$root/.current-release" && -s "$root/.images.env" ]]; then
    previous_release=$(cat "$root/.current-release")
    echo 'Restoring the previous API/web images; SQL migrations are not reversed.' >&2
    docker compose --project-name syncspace-ec2 --env-file "$root/.env" --env-file "$root/.images.env" \
      -f "$previous_release/compose.ec2.yml" up -d --no-deps --wait --wait-timeout 150 api web
  fi
  exit 1
fi

if [[ -f "$root/.images.env" ]]; then cp "$root/.images.env" "$root/.previous-images.env"; fi
if [[ -f "$root/.current-release" ]]; then cp "$root/.current-release" "$root/.previous-release"; fi
mv "$pending" "$root/.images.env"
printf '%s\n' "$release_dir" > "$root/.current-release"
echo "SyncSpace deployed and healthy at $public_origin"
