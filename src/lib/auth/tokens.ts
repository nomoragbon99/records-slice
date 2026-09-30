import { createHash, randomBytes } from "crypto";
import { authConfig } from "@/config/auth";

// Session tokens are 32 random bytes: 256 bits of entropy, infeasible to guess or brute-force
// even given only their SHA-256 hash. crypto.randomBytes, never Math.random, per AGENTS.md rule 5.
export function generateSessionToken(): string {
  return randomBytes(authConfig.tokens.byteLength).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
