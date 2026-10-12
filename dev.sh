#!/usr/bin/env bash
#
# Starts everything for local development:
#   MySQL + Redis (Docker) → API (:4000) → web admin (:5173) → mobile app (Expo, :8081)
#
# The mobile app is pointed at this computer's Wi-Fi address, so you can open it
# on your phone with Expo Go (phone and computer must be on the same Wi-Fi).
#
# Usage:   ./dev.sh            start everything
#          ./dev.sh --tunnel   if your phone can't reach the computer (different network, office Wi-Fi…)
#
# Stop everything with Ctrl+C. Logs: .dev-logs/api.log and .dev-logs/web.log

set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
step() { printf "\n\033[1;34m▸ %s\033[0m\n" "$1"; }
fail() { printf "\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }

# ─── Checks ──────────────────────────────────────────────────
command -v docker >/dev/null || fail "Docker is not installed (https://docs.docker.com/desktop/)"
docker info >/dev/null 2>&1 || fail "Docker is not running — open Docker Desktop and try again"
command -v node >/dev/null || fail "Node.js is not installed (version 22.12 or newer)"

for port in 4000 5173 8081; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $port is already in use. Stop whatever is running there (or a previous ./dev.sh) and try again."
  fi
done

# This computer's address on the local network (what the phone connects to)
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)
[ -n "$LAN_IP" ] || LAN_IP="localhost"

# ─── Database & Redis ────────────────────────────────────────
step "Starting MySQL and Redis (Docker)"
docker compose up -d >/dev/null
printf "  waiting for MySQL"
until docker compose exec -T mysql mysqladmin ping -uroot -proot --silent >/dev/null 2>&1; do printf "."; sleep 2; done
echo " ready"

# ─── Install & prepare (only what's missing) ─────────────────
for app in backend frontend mobile; do
  if [ ! -d "$app/node_modules" ]; then
    step "Installing $app dependencies (first run only)"
    (cd "$app" && npm install)
  fi
done
[ -f backend/.env ] || cp backend/.env.example backend/.env

step "Updating the database"
(cd backend && npx prisma migrate deploy >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1 && npm run db:seed --silent) | sed 's/^/  /'
echo "  database is up to date"

# The phone needs the computer's network address, not "localhost"
API_URL="http://$LAN_IP:4000"
printf "# Written by dev.sh — the API address your phone uses\nEXPO_PUBLIC_API_URL=%s\n" "$API_URL" > mobile/.env

# ─── Start the servers ───────────────────────────────────────
PIDS=()
cleanup() {
  echo
  bold "Stopping…"
  for pid in "${PIDS[@]}"; do pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

step "Starting the API on $API_URL"
# PUBLIC_API_URL makes photo and file links work from the phone too
(cd backend && PUBLIC_API_URL="$API_URL" CORS_ORIGINS="http://localhost:5173,http://$LAN_IP:5173,http://localhost:8081" npm run dev >"$LOGS/api.log" 2>&1) &
PIDS+=($!)
until curl -s -o /dev/null "http://localhost:4000/api/health"; do
  sleep 1
  kill -0 "${PIDS[0]}" 2>/dev/null || { tail -20 "$LOGS/api.log"; fail "The API stopped — see the log above"; }
done

step "Starting the web admin"
(cd frontend && npx vite --host 0.0.0.0 --port 5173 >"$LOGS/web.log" 2>&1) &
PIDS+=($!)
until curl -s -o /dev/null "http://localhost:5173"; do sleep 1; done

cat <<EOF

$(bold "Everything is running")

  Web admin       http://localhost:5173        (on your phone's browser: http://$LAN_IP:5173)
  School website  http://localhost:4000/sites/DEMO
  API docs        http://localhost:4000/api/docs

  Logins          admin@demo.school / Password@123      (school admin)
                  sunita@demo.school / Password@123     (class teacher)
                  Parent app: phone 9811000145 → the OTP is shown on screen

$(bold "Mobile app on your phone")
  1. Install "Expo Go" from the Play Store / App Store
  2. Phone and computer on the same Wi-Fi
  3. Scan the QR code below (Android: in Expo Go · iPhone: with the Camera app)

  Press Ctrl+C to stop everything.
EOF

# Expo runs in the foreground so its QR code and shortcuts (r = reload, w = web) work
cd mobile
if [ "${1:-}" = "--tunnel" ]; then
  npx expo start --tunnel --port 8081
else
  npx expo start --lan --port 8081
fi
cleanup
