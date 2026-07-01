#!/usr/bin/env bash
# Запрещает прямые редиректы на /login и / вне auth-utils.js
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLOWED_FILE="static/js/auth-utils.js"
FAILED=0

while IFS= read -r file; do
  rel="${file#"$ROOT"/}"
  if [[ "$rel" == "$ALLOWED_FILE" ]]; then
    continue
  fi

  if rg -n 'window\.location\.(href|assign|replace)\s*=\s*["'\''](/login|/)["'\'']' "$file" >/dev/null 2>&1; then
    echo "FAIL: прямой редирект на / или /login в $rel"
    rg -n 'window\.location\.(href|assign|replace)\s*=\s*["'\''](/login|/)["'\'']' "$file" || true
    FAILED=1
  fi

  if rg -n 'catch\s*\{[^}]*redirectToLogin' "$file" >/dev/null 2>&1; then
    echo "FAIL: redirectToLogin в catch-all блоке в $rel"
    rg -n 'catch\s*\{[^}]*redirectToLogin' "$file" || true
    FAILED=1
  fi
done < <(find "$ROOT/static/js" -name '*.js' -type f)

if [[ "$FAILED" -ne 0 ]]; then
  echo ""
  echo "Используйте window.authClient из static/js/auth-utils.js"
  exit 1
fi

echo "OK: проверка редиректов пройдена"
