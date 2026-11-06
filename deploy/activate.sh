#!/usr/bin/env bash
set -euo pipefail
release_dir=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$release_dir/../.." && pwd)
exec 9>"$root/.deploy.lock"
flock 9
previous=$(readlink -f "$root/current" || true)
activate() {
    docker compose -p vscode-live --env-file "$root/.env" --env-file "$1/release.env" -f "$1/compose.yaml" up -d --pull never --wait --wait-timeout 90
}
if ! activate "$release_dir"; then
    if [[ -f "$previous/release.env" ]]; then activate "$previous"; fi
    exit 1
fi
ln -sfn "$release_dir" "$root/.current-new"
mv -Tf "$root/.current-new" "$root/current"
