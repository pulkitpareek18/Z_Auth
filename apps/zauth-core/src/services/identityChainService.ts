import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Contract setup
// ---------------------------------------------------------------------------

let provider: ethers.JsonRpcProvider | null = null;
let contract: ethers.Contract | null = null;

function isConfigured(): boolean {
  return !!(config.identityChainRpcUrl && config.identityChainContract && config.identityChainPrivateKey);
}

function getContract(): ethers.Contract {
  if (contract) return contract;

  const abiPath = resolve(__dirname, "../../contracts/ZAuthIdentity.abi.json");
  const abi = JSON.parse(readFileSync(abiPath, "utf8"));

  provider = new ethers.JsonRpcProvider(config.identityChainRpcUrl);
  const wallet = new ethers.Wallet(config.identityChainPrivateKey!, provider);
  contract = new ethers.Contract(config.identityChainContract!, abi, wallet);
  return contract;
}

// ---------------------------------------------------------------------------
// Proof formatting helpers
// ---------------------------------------------------------------------------

type SnarkjsProof = {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
};

function formatProofForSolidity(proof: SnarkjsProof): {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
} {
  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    // snarkjs pi_b is [[b00,b01],[b10,b11]] but Solidity expects swapped coords
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])]
  };
}

function uidToHash(uid: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(uid));
}

// ---------------------------------------------------------------------------
// On-chain enrollment
// ---------------------------------------------------------------------------

export async function enrollOnChain(input: {
  uid: string;
  commitmentRoot: string;
  zkCommitment: string;
  zkProof: unknown;
  publicSignals: unknown;
}): Promise<string | null> {
  if (!config.identityChainEnabled || !isConfigured()) {
    return null;
  }

  try {
    const c = getContract();
    const uidHash = uidToHash(input.uid);

    // commitmentRoot is a SHA-256 hex string → bytes32
    const commitmentRootBytes32 = "0x" + input.commitmentRoot;

    const proof = input.zkProof as SnarkjsProof;
    const signals = input.publicSignals as string[];
    const formatted = formatProofForSolidity(proof);

    const tx = await c.enrollIdentity(
      uidHash,
      commitmentRootBytes32,
      BigInt(input.zkCommitment),
      formatted.a,
      formatted.b,
      formatted.c,
      [BigInt(signals[0]), BigInt(signals[1]), BigInt(signals[2])]
    );

    const receipt = await tx.wait();
    logger.info("Identity enrolled on-chain", {
      uid: input.uid,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
    return receipt.hash;
  } catch (error) {
    logger.error("On-chain enrollment failed (non-blocking)", {
      uid: input.uid,
      error: (error as Error).message
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-chain proof verification
// ---------------------------------------------------------------------------

export async function verifyOnChain(input: {
  uid: string;
  zkProof: unknown;
  publicSignals: unknown;
}): Promise<string | null> {
  if (!config.identityChainEnabled || !isConfigured()) {
    return null;
  }

  try {
    const c = getContract();
    const uidHash = uidToHash(input.uid);

    const proof = input.zkProof as SnarkjsProof;
    const signals = input.publicSignals as string[];
    const formatted = formatProofForSolidity(proof);

    const tx = await c.verifyAndLog(
      uidHash,
      formatted.a,
      formatted.b,
      formatted.c,
      [BigInt(signals[0]), BigInt(signals[1]), BigInt(signals[2])]
    );

    const receipt = await tx.wait();
    logger.info("Proof verified on-chain", {
      uid: input.uid,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
    return receipt.hash;
  } catch (error) {
    logger.error("On-chain verification failed (non-blocking)", {
      uid: input.uid,
      error: (error as Error).message
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read on-chain identity (view call, free)
// ---------------------------------------------------------------------------

export async function getOnChainIdentity(uid: string): Promise<{
  commitmentRoot: string;
  zkCommitment: string;
  version: number;
  timestamp: number;
} | null> {
  if (!isConfigured()) {
    return null;
  }

  try {
    const c = getContract();
    const uidHash = uidToHash(uid);
    const [commitmentRoot, zkCommitment, version, timestamp] = await c.getIdentity(uidHash);

    if (version === 0n) {
      return null;
    }

    return {
      commitmentRoot: commitmentRoot as string,
      zkCommitment: zkCommitment.toString(),
      version: Number(version),
      timestamp: Number(timestamp)
    };
  } catch (error) {
    logger.error("On-chain identity read failed", {
      uid,
      error: (error as Error).message
    });
    return null;
  }
}
