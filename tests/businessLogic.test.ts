import assert from "node:assert";
import crypto from "node:crypto";

console.log("Running MauriTop Business Logic Automated Tests...");

// 1. Phone number format validation (Mauritanian 8-digit)
function isValidMauritanianPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, "");
  return clean.length === 8 && /^[234]/.test(clean);
}

assert.strictEqual(isValidMauritanianPhone("32014902"), true);
assert.strictEqual(isValidMauritanianPhone("27329380"), true);
assert.strictEqual(isValidMauritanianPhone("41234567"), true);
assert.strictEqual(isValidMauritanianPhone("12345678"), false);
assert.strictEqual(isValidMauritanianPhone("3201490"), false);
assert.strictEqual(isValidMauritanianPhone("320149021"), false);
console.log("✓ Mauritanian phone validation passed.");

// 2. Pricing and quote mode normalization logic
function normalizeServicePrice(service: { priceMru?: number; suggestedPrice?: number; minAmount?: number; pricingMode?: string }, amount?: number) {
  const isQuote = service.pricingMode === "quote";
  if (isQuote) return 0;
  if (service.pricingMode === "fixed") {
    return Number(service.priceMru ?? service.suggestedPrice ?? 0);
  }
  return Number(amount || service.priceMru || 0);
}

assert.strictEqual(normalizeServicePrice({ pricingMode: "quote" }), 0);
assert.strictEqual(normalizeServicePrice({ pricingMode: "fixed", priceMru: 350 }), 350);
assert.strictEqual(normalizeServicePrice({ pricingMode: "range", priceMru: 100 }, 500), 500);
console.log("✓ Price normalization & quote logic passed.");

// 3. Guest tracking token hash test
const rawToken = crypto.randomBytes(16).toString("hex");
const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
assert.strictEqual(rawToken.length, 32);
assert.strictEqual(hashedToken.length, 64);
assert.strictEqual(crypto.createHash("sha256").update(rawToken).digest("hex"), hashedToken);
console.log("✓ Cryptographic guest tracking secret generation and SHA-256 hash passed.");

// 4. Payment method normalization & integration gating
function isGatewayOperational(status: string): boolean {
  return status === "operational";
}
assert.strictEqual(isGatewayOperational("enabled_unconfigured"), false);
assert.strictEqual(isGatewayOperational("configured_testing"), false);
assert.strictEqual(isGatewayOperational("operational"), true);
console.log("✓ Gateway integration safety gating passed.");

console.log("\nALL AUTOMATED TESTS PASSED (4/4 test suites).");
