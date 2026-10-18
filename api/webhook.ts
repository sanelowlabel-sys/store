import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { parse as parseUrl } from 'url';

export const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';

// Supported Shopify catalogue synchronization webhook topics
export const SUPPORTED_CATALOGUE_TOPICS = new Set([
  'products/create',
  'products/update',
  'products/delete',
  'collections/create',
  'collections/update',
  'collections/delete',
  'inventory_levels/update',
]);

// In-memory fallback version for local development / test mode
let inMemoryCatalogueVersion = 1;
let inMemoryLastUpdated = Date.now();
const seenWebhookIdsInMemory = new Set<string>();

export function isDeployedEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === 'production'
  );
}

export function getInMemoryCatalogueVersion(): { version: number; lastUpdated: number } {
  return { version: inMemoryCatalogueVersion, lastUpdated: inMemoryLastUpdated };
}

export function resetInMemoryCatalogueVersionForTest(): void {
  inMemoryCatalogueVersion = 1;
  inMemoryLastUpdated = Date.now();
  seenWebhookIdsInMemory.clear();
}

// Disable Vercel automatic body parsing so the raw request body stream is preserved for exact HMAC validation
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Helper to normalize shop domain strings for safe comparison (case normalization only).
 */
export function normalizeShopDomain(domain?: string | null): string {
  if (!domain) return '';
  return domain.trim().toLowerCase();
}

/**
 * Strict shop domain validation for incoming Shopify webhooks.
 * Requires x-shopify-shop-domain to be present and match REQUIRED_STORE_DOMAIN (sx71id-uy.myshopify.com)
 * exactly, allowing case normalization only.
 * Rejects missing, malformed, URL-shaped, path-containing, port-containing, or different domains.
 */
export function isValidShopDomain(domainHeader?: string | null): boolean {
  if (!domainHeader) return false;
  const trimmed = domainHeader.trim();
  if (!trimmed) return false;

  // Reject URL-shaped, scheme-prefixed, path-containing, or port-containing strings
  if (
    trimmed.includes('/') ||
    trimmed.includes(':') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.includes('@') ||
    /\s/.test(trimmed)
  ) {
    return false;
  }

  // Exact match allowing case normalization only
  return trimmed.toLowerCase() === REQUIRED_STORE_DOMAIN.toLowerCase();
}

/**
 * Case-insensitive header retrieval helper.
 */
export function getHeaderValue(
  headers: IncomingMessage['headers'] | Record<string, any> | undefined,
  headerName: string
): string {
  if (!headers) return '';
  const target = headerName.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(val)) return (val[0] || '').trim();
      return typeof val === 'string' ? val.trim() : String(val || '').trim();
    }
  }
  return '';
}

/**
 * Extracts raw request body bytes without triggering premature body parsing.
 * In Vercel Node Serverless environment, accessing `req.body` directly activates a getter
 * that consumes the stream and parses JSON. Stream reading must be performed first.
 * Never uses JSON.stringify(req.body) as object serialization alters whitespace,
 * key order, and unicode escapes, destroying HMAC validity.
 */
export async function extractRawRequestBody(
  req: IncomingMessage,
  maxSizeBytes: number = 1024 * 1024
): Promise<{ rawBody: Buffer | null; reason?: string }> {
  const reqAny = req as any;

  // 1. Direct raw body buffer already attached by runtime/middleware
  if (reqAny.rawBody) {
    if (Buffer.isBuffer(reqAny.rawBody)) {
      return { rawBody: reqAny.rawBody };
    }
    if (typeof reqAny.rawBody === 'string') {
      return { rawBody: Buffer.from(reqAny.rawBody, 'utf8') };
    }
  }

  // 2. Read incoming request stream directly if not ended.
  // Note: We check req.readableEnded BEFORE touching req.body to avoid triggering Vercel's lazy parser.
  if (!req.readableEnded && typeof req.on === 'function') {
    try {
      const chunks: Buffer[] = [];
      let totalLength = 0;
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: any) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalLength += buf.length;
          if (totalLength > maxSizeBytes) {
            reject(new Error('PAYLOAD_TOO_LARGE'));
            return;
          }
          chunks.push(buf);
        });
        req.on('end', () => resolve());
        req.on('error', (err) => reject(err));
      });

      if (chunks.length > 0) {
        return { rawBody: Buffer.concat(chunks) };
      }
    } catch (err: any) {
      if (err?.message === 'PAYLOAD_TOO_LARGE') {
        return { rawBody: null, reason: 'PAYLOAD_TOO_LARGE' };
      }
    }
  }

  // 3. Fallback only if stream was already ended: check if body is Buffer or raw string
  if (reqAny.body) {
    if (Buffer.isBuffer(reqAny.body)) {
      return { rawBody: reqAny.body };
    }
    if (typeof reqAny.body === 'string') {
      return { rawBody: Buffer.from(reqAny.body, 'utf8') };
    }
  }

  return { rawBody: null };
}

/**
 * Validates Shopify HMAC-SHA256 signature against the raw request body.
 * Constant-time comparison prevents timing attacks.
 * Decodes the header as Base64 into a 32-byte binary digest and enforces strict length check
 * before timingSafeEqual to avoid RangeError and timing side channels.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader?: string | null,
  secret?: string | null
): boolean {
  if (!hmacHeader || !secret || !rawBody || rawBody.length === 0) return false;

  try {
    const trimmedHeader = hmacHeader.trim();
    const cleanSecret = secret.replace(/^["']|["']$/g, '').trim();
    if (!trimmedHeader || !cleanSecret) return false;

    // Generated 32-byte binary SHA-256 HMAC digest
    const generatedDigest = crypto
      .createHmac('sha256', cleanSecret)
      .update(rawBody)
      .digest(); // 32 bytes Buffer

    // Decode provided Base64 signature
    const headerDigest = Buffer.from(trimmedHeader, 'base64');

    // SHA-256 binary digests MUST be exactly 32 bytes (256 bits).
    // An equal-length check is strictly required before timingSafeEqual to prevent RangeErrors.
    if (headerDigest.length !== 32 || generatedDigest.length !== 32) {
      return false;
    }

    return crypto.timingSafeEqual(generatedDigest, headerDigest);
  } catch {
    return false;
  }
}

export class WebhookStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookStorageError';
  }
}

let simulatedStorageFailure = false;

export function setSimulatedStorageFailureForTest(fail: boolean): void {
  simulatedStorageFailure = fail;
}

/**
 * Execute Redis REST API command using configured Upstash KV credentials.
 * Throws WebhookStorageError on HTTP failure or Redis execution errors.
 */
async function executeRedisCommand<T = any>(command: any[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new WebhookStorageError('KV REST API credentials are missing');
  }

  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      throw new WebhookStorageError(`Redis command failed with HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new WebhookStorageError(`Redis command error: ${json.error}`);
    }

    return json.result as T;
  } catch (err: any) {
    if (err instanceof WebhookStorageError) throw err;
    throw new WebhookStorageError(`Redis connection error: ${err?.message || 'timeout'}`);
  }
}

export interface AtomicWebhookResult {
  success: boolean;
  duplicate: boolean;
  version: number;
  lastUpdated: number;
}

/**
 * Truly atomic webhook deduplication and catalogue cache invalidation.
 * In Redis: Uses a single atomic Lua script to inspect the webhook ID, record it,
 * and bump the catalogue version in one transaction. If execution fails, neither state
 * is modified and an error is thrown so Shopify retries the webhook delivery.
 * In Memory: Performs atomic check-and-increment; supports simulated failure for tests.
 */
export async function processAtomicCatalogueWebhook(
  webhookId: string | null,
  isCatalogueTopic: boolean
): Promise<AtomicWebhookResult> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const now = Date.now();

  if (kvUrl && kvToken) {
    const sessionKey = webhookId ? `sanelow:webhook_id:${webhookId}` : 'sanelow:webhook_noop';
    const versionKey = 'sanelow:catalogue_version';
    const updatedKey = 'sanelow:catalogue_last_updated';

    const script = `local isCatalogueTopic = ARGV[3] == "1"
local webhookId = ARGV[2]
local now = ARGV[1]
local ttl = ARGV[4]

if webhookId ~= "" then
  local seen = redis.call("get", KEYS[3])
  if seen then
    local curVer = redis.call("get", KEYS[1]) or "1"
    local curUpd = redis.call("get", KEYS[2]) or now
    return {0, tonumber(curVer), tonumber(curUpd)}
  end
end

local newVer = 1
local newUpd = tonumber(now)

if isCatalogueTopic then
  newVer = redis.call("incr", KEYS[1])
  redis.call("set", KEYS[2], now)
else
  local v = redis.call("get", KEYS[1])
  if v then newVer = tonumber(v) else newVer = 1 end
  local u = redis.call("get", KEYS[2])
  if u then newUpd = tonumber(u) end
end

if webhookId ~= "" then
  redis.call("set", KEYS[3], "1", "ex", ttl)
end

return {1, newVer, newUpd}`;

    const result = await executeRedisCommand<[number, number, number]>([
      'EVAL',
      script,
      3,
      versionKey,
      updatedKey,
      sessionKey,
      String(now),
      webhookId || '',
      isCatalogueTopic ? '1' : '0',
      '86400',
    ]);

    if (!Array.isArray(result) || result.length < 3) {
      throw new WebhookStorageError('Invalid Redis Lua return structure');
    }

    const isNovel = result[0] === 1;
    return {
      success: true,
      duplicate: !isNovel,
      version: Number(result[1]) || 1,
      lastUpdated: Number(result[2]) || now,
    };
  }

  // Enforce durable storage on deployed environments:
  // Missing Redis credentials or storage failure must return 503 for webhook POSTs.
  // In-memory fallback is strictly restricted to local development or test mode.
  if (isDeployedEnvironment() && process.env.NODE_ENV !== 'test') {
    throw new WebhookStorageError(
      'Durable Redis credentials (KV_REST_API_URL / KV_REST_API_TOKEN) are required on deployed environments to process webhooks.'
    );
  }

  // In-memory fallback (local development / testing ONLY)
  if (simulatedStorageFailure) {
    throw new WebhookStorageError('Simulated storage failure during atomic webhook transaction');
  }

  if (webhookId && seenWebhookIdsInMemory.has(webhookId)) {
    return {
      success: true,
      duplicate: true,
      version: inMemoryCatalogueVersion,
      lastUpdated: inMemoryLastUpdated,
    };
  }

  if (isCatalogueTopic) {
    inMemoryCatalogueVersion++;
    inMemoryLastUpdated = now;
  }

  if (webhookId) {
    seenWebhookIdsInMemory.add(webhookId);
  }

  return {
    success: true,
    duplicate: false,
    version: inMemoryCatalogueVersion,
    lastUpdated: inMemoryLastUpdated,
  };
}

/**
 * Read current catalogue version from Redis or memory.
 */
export async function getCatalogueVersion(): Promise<{ version: number; lastUpdated: number }> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const versionStr = await executeRedisCommand<string | null>(['GET', 'sanelow:catalogue_version']);
      const updatedStr = await executeRedisCommand<string | null>(['GET', 'sanelow:catalogue_last_updated']);
      if (versionStr) {
        return {
          version: parseInt(versionStr, 10) || 1,
          lastUpdated: updatedStr ? parseInt(updatedStr, 10) || inMemoryLastUpdated : inMemoryLastUpdated,
        };
      }
    } catch {
      // Fall through to memory
    }
  }

  return { version: inMemoryCatalogueVersion, lastUpdated: inMemoryLastUpdated };
}

// Backward compatible helper wrappers
export async function registerWebhookId(webhookId: string): Promise<boolean> {
  const res = await processAtomicCatalogueWebhook(webhookId, false);
  return !res.duplicate;
}

export async function incrementCatalogueVersion(): Promise<{ version: number; lastUpdated: number }> {
  const res = await processAtomicCatalogueWebhook(null, true);
  return { version: res.version, lastUpdated: res.lastUpdated };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const parsedUrl = parseUrl(req.url || '/', true);

  // 1. GET /api/webhook?action=version -> lightweight catalogue version poll endpoint
  if (req.method === 'GET') {
    const versionData = await getCatalogueVersion();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        version: versionData.version,
        lastUpdated: versionData.lastUpdated,
        storeDomain: REQUIRED_STORE_DOMAIN,
      })
    );
    return;
  }

  // 2. POST /api/webhooks/shopify -> Webhook ingestion
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Extract headers sent by Shopify (case-insensitive)
  const topic = getHeaderValue(req.headers, 'x-shopify-topic');
  const hmacHeader = getHeaderValue(req.headers, 'x-shopify-hmac-sha256');
  const shopDomainHeader = getHeaderValue(req.headers, 'x-shopify-shop-domain');
  const webhookId = getHeaderValue(req.headers, 'x-shopify-webhook-id');

  // 1. Diagnostic Check: Webhook Signing Secret Configuration
  const rawSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const webhookSecret = rawSecret ? rawSecret.replace(/^["']|["']$/g, '').trim() : '';
  if (!webhookSecret) {
    console.warn('[Webhook Auth Diagnostic]: reason=MISSING_WEBHOOK_SECRET secretConfigured=false');
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        reason: 'MISSING_WEBHOOK_SECRET',
        message: 'SHOPIFY_WEBHOOK_SECRET is not configured on the server.',
      })
    );
    return;
  }

  // 2. Extract exact original raw bytes (never JSON.stringify(req.body))
  // Diagnostic Check: Raw Body Availability
  const { rawBody, reason: bodyExtractionReason } = await extractRawRequestBody(req, 1024 * 1024);
  if (bodyExtractionReason === 'PAYLOAD_TOO_LARGE') {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Payload too large' }));
    return;
  }

  if (!rawBody || rawBody.length === 0) {
    console.warn(
      `[Webhook Auth Diagnostic]: reason=RAW_BODY_UNAVAILABLE rawBodyAvailable=false streamEnded=${Boolean(req.readableEnded)} hasParsedBody=${Boolean((req as any).body)}`
    );
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        reason: 'RAW_BODY_UNAVAILABLE',
        message: 'Original raw request body was unavailable for HMAC verification.',
      })
    );
    return;
  }

  // 3. Diagnostic Check: Missing Signature Header
  if (!hmacHeader) {
    console.warn('[Webhook Auth Diagnostic]: reason=MISSING_SIGNATURE hasHmacHeader=false');
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        reason: 'MISSING_SIGNATURE',
        message: 'Missing x-shopify-hmac-sha256 header.',
      })
    );
    return;
  }

  // 4. Diagnostic Check: Shop Domain Validation
  // x-shopify-shop-domain must be present and match sx71id-uy.myshopify.com exactly (case-insensitive).
  // Rejects missing, malformed, URL-shaped, custom storefront, or environment-fallback domains.
  const isDomainValid = isValidShopDomain(shopDomainHeader);
  if (!isDomainValid) {
    console.warn(
      `[Webhook Auth Diagnostic]: reason=SHOP_DOMAIN_MISMATCH domainMatched=false domainPresent=${Boolean(
        shopDomainHeader && shopDomainHeader.trim()
      )}`
    );
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        reason: 'SHOP_DOMAIN_MISMATCH',
        message: 'x-shopify-shop-domain header is required and must match sx71id-uy.myshopify.com exactly.',
      })
    );
    return;
  }

  // 5. Diagnostic Check: Signature Verification
  const isValid = verifyShopifyWebhookHmac(rawBody, hmacHeader, webhookSecret);
  if (!isValid) {
    console.warn(
      '[Webhook Auth Diagnostic]: reason=INVALID_SIGNATURE secretConfigured=true rawBodyAvailable=true hmacHeaderPresent=true'
    );
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'UNAUTHORIZED',
        reason: 'INVALID_SIGNATURE',
        message: 'HMAC signature verification failed against raw request body.',
      })
    );
    return;
  }

  // Atomically process deduplication & catalogue invalidation
  const isCatalogueTopic = SUPPORTED_CATALOGUE_TOPICS.has(topic.toLowerCase());

  try {
    const outcome = await processAtomicCatalogueWebhook(webhookId || null, isCatalogueTopic);

    if (outcome.duplicate) {
      // Acknowledge duplicate delivery without re-invalidating
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ received: true, duplicate: true, webhookId }));
      return;
    }

    // Novel event processed
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        received: true,
        topic,
        webhookId,
        catalogueVersion: outcome.version,
        invalidatedAt: outcome.lastUpdated,
      })
    );
  } catch (err: any) {
    // Fail closed with retryable error (HTTP 503) so Shopify retries delivery
    console.error('[Shopify Webhook Error]: Storage failure during atomic webhook transaction', err?.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '10');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'STORAGE_UNAVAILABLE',
        message: 'Storage failure during atomic webhook processing. Shopify should retry delivery.',
        retryable: true,
      })
    );
  }
}
