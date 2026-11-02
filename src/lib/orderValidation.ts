import crypto from "node:crypto";

/**
 * Validates Mauritanian 8-digit phone numbers.
 * Valid Mauritanian numbers must be exactly 8 digits and start with 2, 3, or 4.
 */
export function isValidMauritanianPhone(phone: string): boolean {
  if (typeof phone !== "string") return false;
  const clean = phone.replace(/\D/g, "");
  return clean.length === 8 && /^[234]/.test(clean);
}

/**
 * Normalizes service pricing based on pricing mode.
 */
export function normalizeServicePrice(
  service: { priceMru?: number; suggestedPrice?: number; minAmount?: number; pricingMode?: string },
  amount?: number
): number {
  if (service.pricingMode === "quote") {
    return 0;
  }
  if (service.pricingMode === "fixed") {
    return Number(service.priceMru ?? service.suggestedPrice ?? 0);
  }
  return Number(amount || service.priceMru || 0);
}

/**
 * Validates and sanitizes a URL for submission to IndexNow.
 * Strictly disallows private, transactional, or administrative routes (e.g. /track-order, /admin, /checkout).
 */
export function validateIndexNowUrl(raw: string, targetHost: string): string {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${targetHost}${raw.startsWith("/") ? "" : "/"}${raw}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== targetHost.toLowerCase() || parsed.username || parsed.password) {
    throw new Error('Only canonical HTTPS URLs are allowed.');
  }
  if (/^\/(admin|orders|profile|checkout|notifications|login|register|history|transactions|track-order)(\/|$)/i.test(parsed.pathname)) {
    throw new Error('Private or transactional routes cannot be submitted.');
  }
  parsed.hash = '';
  return parsed.toString();
}

/**
 * Resolves the trusted canonical base URL based on environment or request host.
 */
export function resolveCanonicalUrl(envCanonical?: string, forwardedHost?: string): string {
  if (envCanonical && envCanonical.trim()) {
    return envCanonical.trim().replace(/\/+$/, '');
  }
  if (forwardedHost === 'mauritop-v2-4ozx.vercel.app') {
    return `https://${forwardedHost}`;
  }
  return 'https://mauritop.com';
}

/**
 * Computes a deterministic SHA-256 hash of an order payload for idempotency checking.
 */
export function computeOrderPayloadHash(payload: Record<string, any>): string {
  // Sort keys deterministically
  const sortedKeys = Object.keys(payload).sort();
  const normalized: Record<string, any> = {};
  for (const k of sortedKeys) {
    if (k !== 'idempotencyKey') {
      normalized[k] = payload[k];
    }
  }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
