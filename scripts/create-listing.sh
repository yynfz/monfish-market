#!/usr/bin/env bash
# Spare seller action: create an extra Listing live.
# Usage: scripts/create-listing.sh <zoneId> <file> <priceUsdcUnits> <windowSecs>
# e.g.   scripts/create-listing.sh 1 assets/ghost-ship-map-pack.zip 3000000 60
set -euo pipefail
cd "$(dirname "$0")/.."

ZONE="${1:?usage: create-listing.sh <zoneId> <file> <priceUsdcUnits> <windowSecs>}"
FILE="${2:?missing file}"
PRICE="${3:?missing price in 6-decimal units}"
WINDOW="${4:?missing delivery window seconds}"

set -a; source contracts/.env; set +a
ESCROW=$(python3 -c "import json;print(json.load(open('shared/deployments.json'))['escrow'])")

HASH=$(cast keccak "0x$(xxd -p "$FILE" | tr -d '\n')")
echo "Creating listing: zone=$ZONE price=$PRICE window=${WINDOW}s hash=$HASH"

cast send "$ESCROW" "createListing(uint8,bytes32,uint256,uint64)" "$ZONE" "$HASH" "$PRICE" "$WINDOW" \
  --private-key "$SELLER_PRIVATE_KEY" --rpc-url "$RPC_URL"
