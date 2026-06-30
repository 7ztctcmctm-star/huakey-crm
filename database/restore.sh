#!/bin/bash
set -e

MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-huakey123}"
DATABASE="${DATABASE:-huakey_crm}"
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[restore] Restoring ${DATABASE} from ${BACKUP_FILE}..."
gunzip < "$BACKUP_FILE" | mysql -h mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "$DATABASE"
echo "[restore] Restore complete from: $BACKUP_FILE"
