import fs from "node:fs";
import path from "node:path";

const inputPath = process.env.ZK_VERIFY_KEY_PATH || "zk/verification_key.json";
const candidates = path.isAbsolute(inputPath)
  ? [inputPath]
  : [path.join(process.cwd(), inputPath), path.join(process.cwd(), "apps/zauth-core", inputPath)];

const resolved = candidates.find((candidate) => fs.existsSync(candidate));
if (!resolved) {
  throw new Error(`unable to locate verification key from ${inputPath}`);
}

const raw = fs.readFileSync(resolved, "utf8");
const key = JSON.parse(raw);

if (!key || typeof key !== "object") {
  throw new Error("verification key JSON must be an object");
}

if (typeof key.protocol !== "string") {
  throw new Error("verification key is missing protocol");
}

console.log(`zk-check: loaded verification key protocol=${key.protocol} path=${resolved}`);
