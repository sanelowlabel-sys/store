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

/**
 * Validates Shopify HMAC-SHA256 signature against the raw request body.
 * Constant-time comparison prevents timing attacks.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader?: string | null,
  secret?: string | null
): boolean {
  if (!hmacHeader || !secret) return false;

  try {
    const generatedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const generatedBuf = Buffer.from(generatedHmac, 'utf8');
    const headerBuf = Buffer.from(hmacHeader.trim(), 'utf8');

    if (generatedBuf.length !== headerBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(generatedBuf, headerBuf);
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

  // Stream raw request body into buffer for HMAC verification
  let rawBody: Buffer;
  const MAX_WEBHOOK_SIZE = 1024 * 1024; // 1 MB safety limit

  if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
    rawBody = (req as any).rawBody;
  } else if ((req as any).body) {
    const b = (req as any).body;
    rawBody = Buffer.isBuffer(b) ? b : Buffer.from(typeof b === 'string' ? b : JSON.stringify(b));
  } else if (typeof (req as any)[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    for await (const chunk of req) {
      totalLength += chunk.length;
      if (totalLength > MAX_WEBHOOK_SIZE) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    rawBody = Buffer.concat(chunks);
  } else {
    // Event-based stream fallback
    rawBody = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      let totalLength = 0;
      req.on('data', (c: any) => {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        totalLength += buf.length;
        if (totalLength <= MAX_WEBHOOK_SIZE) {
          chunks.push(buf);
        }
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // Headers sent by Shopify
  const topic = (req.headers['x-shopify-topic'] as string) || '';
  const hmacHeader = (req.headers['x-shopify-hmac-sha256'] as string) || '';
  const shopDomain = (req.headers['x-shopify-shop-domain'] as string) || '';
  const webhookId = (req.headers['x-shopify-webhook-id'] as string) || '';

  // Validate Store Domain
  if (shopDomain && shopDomain.toLowerCase() !== REQUIRED_STORE_DOMAIN) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'UNAUTHORIZED_SHOP_DOMAIN' }));
    return;
  }

  // Validate HMAC signature
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // If webhook secret is not configured, reject gracefully
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'WEBHOOK_SECRET_NOT_CONFIGURED',
        message: 'SHOPIFY_WEBHOOK_SECRET must be configured in Vercel to receive webhooks.',
      })
    );
    return;
  }

  const isValid = verifyShopifyWebhookHmac(rawBody, hmacHeader, webhookSecret);
  if (!isValid) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'HMAC_VERIFICATION_FAILED' }));
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
