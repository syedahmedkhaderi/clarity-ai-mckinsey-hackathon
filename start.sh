#!/usr/bin/env bash
# Starts LOOP.
#
#   ./start.sh           backend and frontend, opens on http://localhost:5173
#   ./start.sh api       backend only, http://localhost:8000
#   ./start.sh web       frontend only
#
# Ctrl-C stops both.
set -euo pipefail

cd "$(dirname "$0")"
MODE="${1:-all}"
API_PORT="${LOOP_API_PORT:-8000}"
WEB_PORT="${LOOP_WEB_PORT:-5173}"

[ -d .venv ] || { echo "No .venv found. Run ./setup.sh first."; exit 1; }
[ -f data/generated/submissions.json ] || {
  echo "No generated data found. Run ./setup.sh first."; exit 1;
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "[start] port $port is in use, stopping pid(s) $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  echo ""
  echo "[start] stopped"
}
trap cleanup INT TERM EXIT

start_api() {
  free_port "$API_PORT"
  echo "[start] backend  http://127.0.0.1:$API_PORT  (docs at /docs)"
  .venv/bin/python -m uvicorn backend.api:app --host 127.0.0.1 --port "$API_PORT" \
    --log-level warning &
  PIDS+=($!)
  for _ in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
      MODE_TEXT="$(curl -fsS "http://127.0.0.1:$API_PORT/api/health" \
        | .venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["mode"])')"
      echo "[start] backend ready, running in $MODE_TEXT"
      return 0
    fi
    sleep 0.25
  done
  echo "[start] backend did not come up in time"; exit 1
}

start_web() {
  free_port "$WEB_PORT"
  echo "[start] frontend http://localhost:$WEB_PORT"
  ( cd frontend && npm run dev -- --port "$WEB_PORT" --strictPort ) &
  PIDS+=($!)
}

case "$MODE" in
  api) start_api ;;
  web) start_web ;;
  all)
    start_api
    start_web
    echo ""
    echo "[start] Open http://localhost:$WEB_PORT"
    echo "[start] Ctrl-C to stop both."
    ;;
  *) echo "usage: ./start.sh [all|api|web]"; exit 1 ;;
esac

wait
