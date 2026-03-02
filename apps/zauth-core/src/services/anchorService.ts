import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { randomId, sha256 } from "../utils/crypto.js";

function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return sha256("EMPTY");
  }
  let nodes = [...leaves];
  while (nodes.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1] ?? nodes[i];
      next.push(sha256(`${left}:${right}`));
    }
    nodes = next;
  }
  return nodes[0];
}

function pseudoChainTxHash(root: string): string {
  return `0x${sha256(`tx:${root}:${Date.now()}`).slice(0, 64)}`;
}

function pseudoIpfsCid(root: string): string {
  return `bafy${sha256(`ipfs:${root}`).slice(0, 44)}`;
}

export async function runAnchorBatch(): Promise<{
  batchId: string;
  merkleRoot: string;
  chainTxHash: string;
  ipfsCid: string;
} | null> {
  const latestBatch = await pool.query<{ anchored_at: string }>(
    `SELECT anchored_at::text
     FROM anchor_batches
     ORDER BY anchored_at DESC
     LIMIT 1`
  );
  const anchoredAfter = latestBatch.rows[0]?.anchored_at;

  const commitments = await pool.query<{ commitment_root: string }>(
    anchoredAfter
      ? `SELECT commitment_root
         FROM identity_commitments
         WHERE created_at > $1::timestamptz
         ORDER BY created_at ASC`
      : `SELECT commitment_root
         FROM identity_commitments
         ORDER BY created_at ASC`,
    anchoredAfter ? [anchoredAfter] : []
  );

  const latestAudit = await pool.query<{ hash: string }>(
    `SELECT hash
     FROM audit_events
     ORDER BY created_at DESC
     LIMIT 1`
  );

  const leaves = commitments.rows.map((row) => row.commitment_root);
  if (latestAudit.rows[0]?.hash) {
    leaves.push(latestAudit.rows[0].hash);
  }

  if (leaves.length === 0) {
    return null;
  }

  const merkleRoot = buildMerkleRoot(leaves);
  const chainTxHash = pseudoChainTxHash(merkleRoot);
  const ipfsCid = pseudoIpfsCid(merkleRoot);
  const batchId = randomId(18);

  await pool.query(
    `INSERT INTO anchor_batches (batch_id, merkle_root, chain_tx_hash, ipfs_cid)
     VALUES ($1, $2, $3, $4)`,
    [batchId, merkleRoot, chainTxHash, ipfsCid]
  );

  return {
    batchId,
    merkleRoot,
    chainTxHash,
    ipfsCid
  };
}

export function startAnchorScheduler(): void {
  if (!config.anchorEnabled) {
    return;
  }

  const intervalMs = Math.max(1, config.anchorIntervalHours) * 60 * 60 * 1000;
  setInterval(() => {
    runAnchorBatch()
      .then((batch) => {
        if (batch) {
          console.log(
            `anchor batch stored id=${batch.batchId} root=${batch.merkleRoot} tx=${batch.chainTxHash} cid=${batch.ipfsCid}`
          );
        }
      })
      .catch((error) => {
        console.error("anchor batch failed", error);
      });
  }, intervalMs);
}
