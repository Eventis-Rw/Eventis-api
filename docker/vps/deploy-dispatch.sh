#!/usr/bin/env bash
set -euo pipefail
# Install this as the dedicated key's forced command; never eval the SSH command.
if [[ "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  release_sha="${BASH_REMATCH[1]}"
else
  echo "Only a SHA-addressed deployment is permitted" >&2; exit 1
fi
root=/home/ubuntu/eventis
exec 9>"$root/deploy.lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }
release="$root/releases/$release_sha"
mkdir -p "$release"
umask 077
cat > "$release/source.tar.gz"
# Reject absolute paths, traversal and links before extracting a CI artifact.
python3 - "$release/source.tar.gz" "$release" <<'PYTHON'
import sys,tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1]) as archive:
 for item in archive.getmembers():
  path=PurePosixPath(item.name)
  if path.is_absolute() or '..' in path.parts or item.issym() or item.islnk():
   raise RuntimeError('Unsafe release archive')
 archive.extractall(sys.argv[2],filter='data')
PYTHON
cd "$root"
previous=$(sudo docker inspect -f '{{.Config.Image}}' eventis-api-1)
image="eventis-api:$release_sha"
sudo docker build -f "$release/app/Dockerfile.vps" -t "$image" "$release/app"
sudo docker run --rm "$image" bun test src
# Preserve a database backup before applying forward-only migrations.
mkdir -p "$root/backups"
sudo docker compose --env-file compose.env exec -T db pg_dump -U eventis -Fc eventis > "$root/backups/$release_sha.dump"
export API_IMAGE="$image"
sudo --preserve-env=API_IMAGE docker compose --env-file compose.env run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
if ! sudo --preserve-env=API_IMAGE docker compose --env-file compose.env up -d --no-deps api worker; then
 export API_IMAGE="$previous"
 sudo --preserve-env=API_IMAGE docker compose --env-file compose.env up -d --no-deps api worker
 echo 'Activation failed; previous application image restored' >&2
 exit 1
fi
persist_image() {
 python3 - "$root/compose.env" "$1" <<'PYTHON'
from pathlib import Path
import sys,os
p=Path(sys.argv[1]);lines=[line for line in p.read_text().splitlines() if not line.startswith('API_IMAGE=')]
lines.append('API_IMAGE='+sys.argv[2]);tmp=p.with_suffix('.env.new');tmp.write_text('\n'.join(lines)+'\n');os.chmod(tmp,0o600);tmp.replace(p)
PYTHON
}
for attempt in $(seq 1 30); do
 if curl -fsS http://127.0.0.1/readyz >/dev/null; then
  sleep 3
  if [ "$(sudo docker inspect -f '{{.State.Running}}' eventis-worker-1)" = true ]; then
   persist_image "$image"; printf '%s\n' "$release_sha" > "$root/current-release"; echo "Deployment healthy: $release_sha"; exit 0
  fi
 fi
 sleep 2
done
# Roll back application images, never automatically roll back database schema.
export API_IMAGE="$previous"
sudo --preserve-env=API_IMAGE docker compose --env-file compose.env up -d --no-deps api worker
echo 'Deployment failed; previous application image restored' >&2
exit 1
