#!/usr/bin/env bash
# One-time setup. Safe to re-run.
#
#   ./setup.sh
#
# Creates the Python virtualenv, installs both dependency sets, generates the
# fixture data, builds the frontend fixtures and runs the test suite.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

say() { printf '\n[setup] %s\n' "$1"; }
die() { printf '\n[setup] ERROR: %s\n' "$1" >&2; exit 1; }

# --- python -----------------------------------------------------------------
PY=""
for candidate in python3.11 python3.12 python3.13 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    version="$("$candidate" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
    major="${version%%.*}"; minor="${version##*.}"
    if [ "$major" -eq 3 ] && [ "$minor" -ge 11 ] && [ "$minor" -le 13 ]; then
      PY="$candidate"; break
    fi
  fi
done
[ -n "$PY" ] || die "need Python 3.11, 3.12 or 3.13 on PATH. Found: $(python3 --version 2>&1)"
say "using $($PY --version) from $(command -v "$PY")"

if [ ! -d .venv ]; then
  say "creating .venv"
  "$PY" -m venv .venv
fi
say "installing Python dependencies"
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt
.venv/bin/python -c "import fastapi, langgraph, langchain_core, pydantic" \
  || die "Python dependencies did not import cleanly"

# --- env --------------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  say "wrote .env from .env.example"
fi

# --- data -------------------------------------------------------------------
say "generating marking schemes and learner submissions"
.venv/bin/python data/build_marking_schemes.py
.venv/bin/python data/generator.py

# --- node -------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js is required. Install Node 18 or newer."
say "using node $(node --version)"
say "installing frontend dependencies"
( cd frontend && npm install --silent )

# --- seed and fixtures ------------------------------------------------------
say "seeding the learner history database and rebuilding frontend fixtures"
.venv/bin/python scripts/build_fixture.py

# --- verify -----------------------------------------------------------------
say "running the test suite"
if ! .venv/bin/python -m pytest -q; then
  die "tests failed. The system is not ready to demo."
fi

say "typechecking the frontend"
( cd frontend && npm run typecheck --silent )

if grep -q '^OPENAI_API_KEY=.\+' .env 2>/dev/null; then
  MODE="model mode"
else
  MODE="offline mode (deterministic rules). Add OPENAI_API_KEY to .env for model mode."
fi

cat <<BANNER

[setup] Done. LOOP will run in: $MODE

  Start everything:   ./start.sh
  Backend only:       ./start.sh api
  Measure accuracy:   .venv/bin/python eval/evaluate.py

BANNER
