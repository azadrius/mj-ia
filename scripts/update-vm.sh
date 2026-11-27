#!/usr/bin/env bash
# Met à jour MJ IA sur la VM : dernière version de main, puis reconstruction.
# Une sauvegarde de la base est faite avant, dans ~/mj-ia-sauvegardes (les 10 dernières sont gardées).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.vm.yml --profile app)
if ! docker info >/dev/null 2>&1; then COMPOSE=(sudo "${COMPOSE[@]}"); fi

backup_dir="$HOME/mj-ia-sauvegardes"
mkdir -p "$backup_dir"
if "${COMPOSE[@]}" ps --status running db | grep -q db; then
  file="$backup_dir/mjia-$(date +%Y%m%d-%H%M%S).sql.gz"
  "${COMPOSE[@]}" exec -T db pg_dump -U mjia mjia | gzip > "$file"
  echo "Sauvegarde : $file"
  ls -1t "$backup_dir"/mjia-*.sql.gz | tail -n +11 | xargs -r rm --
fi

git pull --ff-only
"${COMPOSE[@]}" up -d --build
"${COMPOSE[@]}" ps
