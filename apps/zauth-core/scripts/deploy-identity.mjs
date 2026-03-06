#!/usr/bin/env node
// Deploy ZAuthIdentity contract to Base Sepolia (or any EVM chain).
// Usage: IDENTITY_CHAIN_PRIVATE_KEY=0x... IDENTITY_CHAIN_RPC_URL=https://sepolia.base.org node scripts/deploy-identity.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.IDENTITY_CHAIN_RPC_URL || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.IDENTITY_CHAIN_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Error: IDENTITY_CHAIN_PRIVATE_KEY env var is required");
  console.error("Usage: IDENTITY_CHAIN_PRIVATE_KEY=0x... node scripts/deploy-identity.mjs");
  process.exit(1);
}

// 1. Compile the contracts (ZAuthIdentity imports Groth16Verifier)
console.log("Compiling ZAuthIdentity.sol + Groth16Verifier.sol...");
const verifierSource = readFileSync(resolve(__dirname, "../contracts/Groth16Verifier.sol"), "utf8");
const identitySource = readFileSync(resolve(__dirname, "../contracts/ZAuthIdentity.sol"), "utf8");

const input = JSON.stringify({
  language: "Solidity",
  sources: {
    "Groth16Verifier.sol": { content: verifierSource },
    "ZAuthIdentity.sol": { content: identitySource }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
});

const output = JSON.parse(solc.compile(input));
const errors = output.errors?.filter((e) => e.severity === "error") ?? [];
if (errors.length > 0) {
  console.error("Compilation errors:");
  errors.forEach((e) => console.error(e.formattedMessage));
  process.exit(1);
}

const warnings = output.errors?.filter((e) => e.severity === "warning") ?? [];
if (warnings.length > 0) {
  console.log(`${warnings.length} warning(s) during compilation (non-fatal)`);
}

const contract = output.contracts["ZAuthIdentity.sol"]["ZAuthIdentity"];
const abi = contract.abi;
const bytecode = "0x" + contract.evm.bytecode.object;
console.log("Compilation successful.");

// Save the ABI for runtime use
const abiPath = resolve(__dirname, "../contracts/ZAuthIdentity.abi.json");
writeFileSync(abiPath, JSON.stringify(abi, null, 2));
console.log(`ABI saved to ${abiPath}`);

// 2. Connect to chain
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const network = await provider.getNetwork();
console.log(`Chain: ${network.name} (id: ${network.chainId})`);
console.log(`Deployer: ${wallet.address}`);

const balance = await provider.getBalance(wallet.address);
console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error("\nWallet has no ETH. Get Base Sepolia testnet ETH from:");
  console.error("  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  process.exit(1);
}

// 3. Deploy
console.log("\nDeploying ZAuthIdentity...");
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const deployed = await factory.deploy();
const tx = deployed.deploymentTransaction();
console.log(`Transaction: ${tx.hash}`);

console.log("Waiting for confirmation...");
await deployed.waitForDeployment();

const address = await deployed.getAddress();
console.log(`\nZAuthIdentity deployed at: ${address}`);
console.log(`\nSet this in your .env:`);
console.log(`  IDENTITY_CHAIN_ENABLED=true`);
console.log(`  IDENTITY_CHAIN_RPC_URL=${RPC_URL}`);
console.log(`  IDENTITY_CHAIN_CONTRACT=${address}`);
console.log(`  IDENTITY_CHAIN_PRIVATE_KEY=${PRIVATE_KEY.substring(0, 6)}...`);
console.log(`\nVerify on explorer:`);
console.log(`  https://sepolia.basescan.org/address/${address}`);
