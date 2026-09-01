#!/usr/bin/env bash
# deploy/scripts/backup-db.sh
# Add to root's crontab, e.g. daily at 3am:
#   0 3 * * * /opt/candle-rider/deploy/scripts/backup-db.sh
set -euo pipefail

DB_PATH="/opt/candle-rider/server/data/candlerider.db"
BACKUP_DIR="/opt/candle-rider/server/data/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# .backup is SQLite's own safe hot-backup command (via sqlite3 CLI) — safe
# to run while the server is live, unlike a raw file copy.
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/candlerider-$TIMESTAMP.db'"

# Keep the last 14 daily backups, prune anything older.
find "$BACKUP_DIR" -name 'candlerider-*.db' -mtime +14 -delete

echo "Backup written: $BACKUP_DIR/candlerider-$TIMESTAMP.db"
