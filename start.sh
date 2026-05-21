#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== MapMax Startup ==="

# Backend
echo "[1/3] Installing backend dependencies..."
cd "$ROOT/backend"
pip install -r requirements.txt -q

echo "[2/3] Starting backend (port 8000)..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Frontend
echo "[3/3] Installing & starting frontend (port 5173)..."
cd "$ROOT/frontend"
npm install --silent
npm run dev &
FRONTEND_PID=$!

echo ""
echo "MapMax is running!"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
