#!/usr/bin/env node
/**
 * Moves TipVault ownership (the right to release escrowed tips) from the
 * current owner key to a new address -- e.g. the Privy server wallet. See
 * README "Escrow claim signer".
 *
 *   node scripts/transfer-tipvault-ownership.mjs <NEW_OWNER_ADDRESS>
 *
 * Reads from .env.local (or the environment):
 *   TIPVAULT_CONTRACT_ADDRESS   the TipVault contract
 *   TIPVAULT_OWNER_PRIVATE_KEY  the CURRENT owner's key (signs this one transaction)
 *   MONAD_RPC_URL or NEXT_PUBLIC_MONAD_RPC_URL
 *
 * Ownership moves in one step and can't be undone by the old key, so before
 * sending this checks that the key really is the current owner, that the new
 * address is valid and different, that the RPC is Monad mainnet, and asks you
 * to type the end of the new address. Afterwards it reads the owner back.
 */
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseAbi, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MONAD_CHAIN_ID = 143;
const ZERO = "0x0000000000000000000000000000000000000000";
const abi = parseAbi([
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
]);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const newOwnerArg = process.argv[2];
const vaultEnv = process.env.TIPVAULT_CONTRACT_ADDRESS;
const keyEnv = process.env.TIPVAULT_OWNER_PRIVATE_KEY;
const rpc = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL;

if (!newOwnerArg) fail("Usage: node scripts/transfer-tipvault-ownership.mjs <NEW_OWNER_ADDRESS>");
if (!isAddress(newOwnerArg)) fail(`"${newOwnerArg}" is not a valid address.`);
if (!vaultEnv || !isAddress(vaultEnv)) fail("TIPVAULT_CONTRACT_ADDRESS is missing or invalid (in .env.local).");
if (!keyEnv || !/^0x[0-9a-fA-F]{64}$/.test(keyEnv)) {
  fail("TIPVAULT_OWNER_PRIVATE_KEY is missing or isn't a 0x-prefixed 64-hex-character key (in .env.local).");
}
if (!rpc) fail("MONAD_RPC_URL or NEXT_PUBLIC_MONAD_RPC_URL is missing (in .env.local).");

const newOwner = getAddress(newOwnerArg);
const vault = getAddress(vaultEnv);
const account = privateKeyToAccount(keyEnv);
const chain = {
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const pub = createPublicClient({ chain, transport: http(rpc) });

const chainId = await pub.getChainId();
if (chainId !== MONAD_CHAIN_ID) fail(`The RPC is on chain ${chainId}, not Monad mainnet (${MONAD_CHAIN_ID}).`);
if (newOwner === ZERO) fail("The new owner can't be the zero address.");

const code = await pub.getCode({ address: vault });
if (!code || code === "0x") fail(`There's no contract at ${vault}. Check TIPVAULT_CONTRACT_ADDRESS.`);

const currentOwner = getAddress(await pub.readContract({ address: vault, abi, functionName: "owner" }));
if (currentOwner === newOwner) fail(`${newOwner} is already the owner. Nothing to do.`);
if (currentOwner !== account.address) {
  fail(`This key (${account.address}) isn't the current owner -- the owner is ${currentOwner}.`);
}

const gasBalance = await pub.getBalance({ address: account.address });
if (gasBalance === 0n) fail(`The current owner ${account.address} has no MON to pay gas for this transaction.`);

const newOwnerCode = await pub.getCode({ address: newOwner });
console.log(`
TipVault:        ${vault}
Current owner:   ${currentOwner}  (${formatEther(gasBalance)} MON for gas)
New owner:       ${newOwner}${newOwnerCode && newOwnerCode !== "0x" ? "  (a contract)" : ""}

After this, only the new owner can release escrowed tips (and change owner again).
The current key can't undo it.`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`\nTo confirm, type the LAST 6 characters of the new owner address: `)).trim();
rl.close();
if (typed.toLowerCase() !== newOwner.slice(-6).toLowerCase()) fail("That doesn't match. Nothing was sent.");

const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const hash = await wallet.writeContract({ address: vault, abi, functionName: "transferOwnership", args: [newOwner] });
console.log(`\nSent: ${hash}\nWaiting for it to be included...`);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail(`The transaction failed (${hash}). Ownership did not change.`);

const after = getAddress(await pub.readContract({ address: vault, abi, functionName: "owner" }));
if (after !== newOwner) fail(`Transaction succeeded but the owner reads as ${after}. Check before continuing.`);
console.log(`\n✓ Done. TipVault owner is now ${after}.
Next: test one claim (a small tip to a handle that hasn't joined, then link that channel),
then remove TIPVAULT_OWNER_PRIVATE_KEY from your hosting env.\n`);
