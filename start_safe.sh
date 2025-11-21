#!/bin/bash
FILE="/home/jelastic/ROOT/uploads/.gitkeep"

echo "Checking Shared Storage readiness..."
while [ ! -f "$FILE" ]; do
  echo "Storage not ready yet. Waiting 5 seconds..."
  sleep 5
done

echo "Storage FOUND! Starting Next.js..."
next start -p ${PORT:-3001}