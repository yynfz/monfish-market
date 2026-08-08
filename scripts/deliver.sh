#!/usr/bin/env bash
# Seller demo action: mark a Trade as Delivered with the keccak hash of the
# actual deliverable file. Usage: scripts/deliver.sh <tradeId> <file>
# Note: hashing passes the file as hex argv — fine for the KB-sized demo zips,
# breaks past ~1MB (ARG_MAX).
set -euo pipefail
cd "$(dirname "$0")/.."

TRADE_ID="${1:?usage: deliver.sh <tradeId> <file>}"
FILE="${2:?usage: deliver.sh <tradeId> <file>}"

set -a; source contracts/.env; set +a
ESCROW=$(python3 -c "import json;print(json.load(open('shared/deployments.json'))['escrow'])")

HASH=$(cast keccak "0x$(xxd -p "$FILE" | tr -d '\n')")
echo "Delivering trade $TRADE_ID with hash $HASH ($FILE)"

cast send "$ESCROW" "markDelivered(uint256,bytes32)" "$TRADE_ID" "$HASH" \
  --private-key "$SELLER_PRIVATE_KEY" --rpc-url "$RPC_URL"
