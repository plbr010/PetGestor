#!/usr/bin/env bash
set -euo pipefail

# Aplica só os arquivos .sql passados como argumento (migrations novas do push).
# Não reexecuta o histórico inteiro — o remoto já foi aplicado via SQL Editor.

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL não configurada. No GitHub: Settings → Secrets → Actions → New secret."
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Nenhuma migration nova neste push."
  exit 0
fi

for file in "$@"; do
  if [[ ! -f "$file" ]]; then
    echo "Arquivo inexistente: $file"
    exit 1
  fi
  echo "Aplicando $file"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Migrations aplicadas."
