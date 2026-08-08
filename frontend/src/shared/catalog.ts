// MonFish-Market — frontend listing catalog.
// Keyed by listing ID (number). Contains only frontend-owned data:
// names, descriptions, artifact download paths, and pre-computed keccak256
// hashes of the canonical artifact files (verified against on-chain seed data).
//
// On-chain data (price, productHash, deliveryWindowSecs, seller, zoneId) comes
// from EscrowService.getListings() — never duplicated here.
//
// Returns null for unknown IDs — the create-listing.sh script may add extra
// listings during the demo, so the UI must not crash on an unseen ID.

export interface ListingMeta {
  name: string;
  description: string;
  /** URL path to the downloadable artifact served by the app. */
  artifactPath: string;
  /**
   * keccak256 of the artifact file bytes — matches the productHash stored
   * on-chain in the seed listing and must equal the Trade deliveryHash before
   * the download is unlocked.
   * Pre-computed and verified against the on-chain seed deployment.
   */
  artifactKeccak: `0x${string}`;
}

/** Canonical seed listings. Values match on-chain deployment (chain 10143). */
const CATALOG: Record<number, ListingMeta> = {
  1: {
    name: 'Pixel Reef Starter Pack',
    description:
      'A zip of fish sprites, coral tiles, and bubble animations — the same assets that power this very game. Perfect for building your own reef market.',
    artifactPath: '/artifacts/pixel-reef-starter-pack.zip',
    artifactKeccak: '0xed8bb25b2ddf4f5aeb11915ab115717e6038b34a316f389d1c3862d21159671e',
  },
  2: {
    name: 'Ghost Ship Map Pack',
    description:
      'Haunted deep-water map tiles and ambient audio loops. 60-second delivery window — a live demonstration of the escrow refund path.',
    artifactPath: '/artifacts/ghost-ship-map-pack.zip',
    artifactKeccak: '0x4c6979190de330bc50f9cf75cd76e502d6ccdf184d1fc3072da5b51a36688642',
  },
  3: {
    name: "Captain's Hat Template",
    description:
      'SVG template for the iconic captain hat accessory. Customise the colours and mint it as a fish avatar cosmetic.',
    artifactPath: '/artifacts/captains-hat-template.zip',
    artifactKeccak: '0x27128c2665ca52e0994bd4dc0b2e9b5a05817f72beaaa918ead9cbeea31714cf',
  },
};

/** Returns the frontend metadata for a listing, or null if the ID is unknown. */
export function getListingMeta(id: bigint | number): ListingMeta | null {
  return CATALOG[Number(id)] ?? null;
}
