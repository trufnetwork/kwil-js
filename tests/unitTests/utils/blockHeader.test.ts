import { blockHeaderStampMs, mapBlockHeader } from '../../../src/utils/blockHeader';
import { BlockHeaderResponse } from '../../../src/core/jsonrpc';

/**
 * `chain.block_header` is serialized differently depending on the kwil-db
 * version a node runs: newer nodes emit snake_case fields with the block time
 * as an integer `stamp_ms` (unix ms), while older TN mainnet nodes emit
 * Go-default capitalized fields with the time as an RFC3339 `Timestamp` string.
 * These fixtures are the exact two shapes observed live on the mainnet gateway,
 * and the tests pin that mapBlockHeader reconciles both into the same result.
 */

// Older TN mainnet (tn-v2.1): Go-default capitalized keys, Timestamp is RFC3339.
const CAPITALIZED: BlockHeaderResponse = {
  Version: 0,
  Height: 1937904,
  NumTxns: 139,
  PrevHash: '8d7f0f287480290cf5f033d97285f3067fda35918510f4d49a6cb1a5e1b930b3',
  PrevAppHash: 'fcfaadab2b713567d5327c2e9bd02f452e3ecb2aed5d0dd2b90932348e36420d',
  Timestamp: '2026-07-16T02:17:40.455Z',
  MerkleRoot: 'db46ebe9ead55c533c8bd2cac62b3da13e6f511c360f01dcc1e6d2d5c510db22',
  ValidatorSetHash: 'af5570f5a1810b7af78caf4bc70a660f0df51e42baf91d4de5b2328de0e83dfc',
  NetworkParamsHash: 'f119f8aeb3d28115f03c81a71055dce79175f745d081c6ad5519a6101dc34d6a',
  NewLeader: null,
};

// Newer kwil-db: snake_case keys, stamp_ms is unix milliseconds.
const SNAKE_CASE: BlockHeaderResponse = {
  version: 0,
  height: 1937904,
  num_txns: 139,
  prev_hash: '8d7f0f287480290cf5f033d97285f3067fda35918510f4d49a6cb1a5e1b930b3',
  prev_app_hash: 'fcfaadab2b713567d5327c2e9bd02f452e3ecb2aed5d0dd2b90932348e36420d',
  stamp_ms: 1784168260455,
  merkle_root: 'db46ebe9ead55c533c8bd2cac62b3da13e6f511c360f01dcc1e6d2d5c510db22',
  vals_hash: 'af5570f5a1810b7af78caf4bc70a660f0df51e42baf91d4de5b2328de0e83dfc',
  params_hash: 'f119f8aeb3d28115f03c81a71055dce79175f745d081c6ad5519a6101dc34d6a',
  new_leader: null,
};

// Both shapes describe the same block, so 2026-07-16T02:17:40.455Z === 1784168260455 ms.
const EXPECTED_STAMP_MS = 1784168260455;

describe('blockHeaderStampMs', () => {
  it('uses the integer stamp_ms directly when present', () => {
    expect(blockHeaderStampMs(SNAKE_CASE)).toBe(EXPECTED_STAMP_MS);
  });

  it('parses the RFC3339 Timestamp string into unix milliseconds', () => {
    expect(blockHeaderStampMs(CAPITALIZED)).toBe(EXPECTED_STAMP_MS);
  });

  it('prefers stamp_ms over Timestamp when both are present', () => {
    expect(blockHeaderStampMs({ stamp_ms: 42, Timestamp: '2026-07-16T02:17:40.455Z' })).toBe(42);
  });

  it('returns the 0 sentinel when no timestamp is present or parseable', () => {
    expect(blockHeaderStampMs({})).toBe(0);
    expect(blockHeaderStampMs({ Timestamp: 'not-a-date' })).toBe(0);
  });
});

describe('mapBlockHeader', () => {
  it('normalizes the capitalized (older TN) shape', () => {
    expect(mapBlockHeader(CAPITALIZED)).toEqual({
      version: 0,
      height: 1937904,
      numTxns: 139,
      prevHash: '8d7f0f287480290cf5f033d97285f3067fda35918510f4d49a6cb1a5e1b930b3',
      prevAppHash: 'fcfaadab2b713567d5327c2e9bd02f452e3ecb2aed5d0dd2b90932348e36420d',
      stampMs: EXPECTED_STAMP_MS,
      merkleRoot: 'db46ebe9ead55c533c8bd2cac62b3da13e6f511c360f01dcc1e6d2d5c510db22',
      validatorSetHash: 'af5570f5a1810b7af78caf4bc70a660f0df51e42baf91d4de5b2328de0e83dfc',
      networkParamsHash: 'f119f8aeb3d28115f03c81a71055dce79175f745d081c6ad5519a6101dc34d6a',
      newLeader: null,
    });
  });

  it('normalizes the snake_case (newer kwil-db) shape to the same result', () => {
    expect(mapBlockHeader(SNAKE_CASE)).toEqual(mapBlockHeader(CAPITALIZED));
  });
});
