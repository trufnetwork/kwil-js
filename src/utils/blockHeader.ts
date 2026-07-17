import { BlockHeader } from '../core/network';
import { BlockHeaderResponse } from '../core/jsonrpc';

/**
 * Reconciles the block time from a raw `chain.block_header` result into unix
 * milliseconds. Newer kwil-db nodes return `stamp_ms` (an integer already in
 * milliseconds); older TN nodes return `Timestamp` as an RFC3339 string. When
 * neither is present or parseable, returns 0 as the "unknown" sentinel — the
 * same convention the rest of the SDK uses for a missing timestamp.
 */
export function blockHeaderStampMs(raw: BlockHeaderResponse): number {
  if (typeof raw.stamp_ms === 'number') {
    return raw.stamp_ms;
  }
  if (typeof raw.Timestamp === 'string') {
    const ms = Date.parse(raw.Timestamp);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return 0;
}

/**
 * Normalizes a raw `chain.block_header` result into a stable {@link BlockHeader}.
 * The wire shape differs by node version (snake_case + `stamp_ms` on newer
 * nodes, Go-default capitalized + `Timestamp` on older ones), so every field is
 * read from whichever spelling is present.
 */
export function mapBlockHeader(raw: BlockHeaderResponse): BlockHeader {
  return {
    version: raw.version ?? raw.Version ?? 0,
    height: raw.height ?? raw.Height ?? 0,
    numTxns: raw.num_txns ?? raw.NumTxns ?? 0,
    prevHash: raw.prev_hash ?? raw.PrevHash ?? '',
    prevAppHash: raw.prev_app_hash ?? raw.PrevAppHash ?? '',
    stampMs: blockHeaderStampMs(raw),
    merkleRoot: raw.merkle_root ?? raw.MerkleRoot ?? '',
    validatorSetHash: raw.vals_hash ?? raw.ValidatorSetHash ?? '',
    networkParamsHash: raw.params_hash ?? raw.NetworkParamsHash ?? '',
    newLeader: raw.new_leader ?? raw.NewLeader ?? null,
  };
}
