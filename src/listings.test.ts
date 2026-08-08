// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { keccak256 } from 'viem';
import { LISTINGS } from './listings';

const EXPECTED_ARTIFACTS = [
  {
    id: 1n,
    file: 'pixel-reef-starter-pack.zip',
    hash: '0xed8bb25b2ddf4f5aeb11915ab115717e6038b34a316f389d1c3862d21159671e',
  },
  {
    id: 2n,
    file: 'ghost-ship-map-pack.zip',
    hash: '0x4c6979190de330bc50f9cf75cd76e502d6ccdf184d1fc3072da5b51a36688642',
  },
  {
    id: 3n,
    file: 'captains-hat-template.zip',
    hash: '0x27128c2665ca52e0994bd4dc0b2e9b5a05817f72beaaa918ead9cbeea31714cf',
  },
] as const;

describe('canonical demo artifacts', () => {
  it.each(EXPECTED_ARTIFACTS)('keeps Listing #$id aligned with $file bytes', ({ id, file, hash }) => {
    const bytes = readFileSync(resolve(process.cwd(), 'assets', file));
    const listing = LISTINGS.find((candidate) => candidate.id === id);

    expect(listing?.productHash).toBe(hash);
    expect(keccak256(bytes)).toBe(hash);
  });
});
