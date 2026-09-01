#!/usr/bin/env bash
# deploy/scripts/deploy.sh
# Run on the Hetzner box as the candlerider user (or root) from
# /opt/candle-rider. No Docker involved — plain git pull, npm, systemd.
set -euo pipefail

APP_DIR="/opt/candle-rider"
cd "$APP_DIR"

echo "==> Pulling latest..."
git pull --ff-only

echo "==> Installing dependencies (workspaces: shared, server, client)..."
npm ci

echo "==> Building client..."
npm run build:client

echo "==> Restarting candle-rider-api.service..."
sudo systemctl restart candle-rider-api

echo "==> Done. Status:"
sudo systemctl status candle-rider-api --no-pager -l | head -n 10
