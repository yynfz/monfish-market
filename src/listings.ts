import type { Address, Listing } from '../shared/escrow';

export const DEMO_SELLER: Address = '0x80fcb18a741771D79f063501867F721be4d11547';

export const LISTINGS = [
  {
    id: 1n,
    zoneId: 1,
    seller: DEMO_SELLER,
    priceUsdc: 5_000_000n,
    productHash: '0xed8bb25b2ddf4f5aeb11915ab115717e6038b34a316f389d1c3862d21159671e',
    deliveryWindowSecs: 86_400,
  },
  {
    id: 2n,
    zoneId: 1,
    seller: DEMO_SELLER,
    priceUsdc: 3_000_000n,
    productHash: '0x4c6979190de330bc50f9cf75cd76e502d6ccdf184d1fc3072da5b51a36688642',
    deliveryWindowSecs: 60,
  },
  {
    id: 3n,
    zoneId: 0,
    seller: DEMO_SELLER,
    priceUsdc: 2_000_000n,
    productHash: '0x27128c2665ca52e0994bd4dc0b2e9b5a05817f72beaaa918ead9cbeea31714cf',
    deliveryWindowSecs: 86_400,
  },
] satisfies readonly Listing[];

export const LISTING_METADATA = {
  1: {
    name: 'Pixel Reef Starter Pack',
    description: 'Chunky reef tiles, coral props, and bright seabed pieces for playful ocean worlds.',
    dialogue: 'Fresh reef tiles, packed and ready for your next world.',
    sellerName: 'Mara the Maker',
  },
  2: {
    name: 'Ghost Ship Map Pack',
    description: 'A compact set of haunted routes, wreck markers, and fogbound harbor maps.',
    dialogue: 'Chart the haunted channels before the fog rolls back in.',
    sellerName: 'Old Finn',
  },
  3: {
    name: "Captain's Hat Template",
    description: 'A clean, editable hat template sized for blocky fish avatars and crew portraits.',
    dialogue: 'Cut a sharp captain’s hat for any fish who means business.',
    sellerName: 'Tailor Tilda',
  },
} as const;

export type CanonicalListing = (typeof LISTINGS)[number];

export function getListingMetadata(id: Listing['id']) {
  return LISTING_METADATA[Number(id) as keyof typeof LISTING_METADATA] ?? null;
}
