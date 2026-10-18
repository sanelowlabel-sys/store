import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { parse as parseUrl } from 'url';
import * as jose from 'jose';

// ============================================================================
// Pinned Store & Identity Provider Constants
// ============================================================================
export const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';
export const SHOPIFY_SHOP_ID = '79461089448';
export const DEFAULT_SITE_URL = 'https://shop.sanelowmusiclabel.co.za';
export const HOSTED_ACCOUNT_FALLBACK_URL = `https://shopify.com/${SHOPIFY_SHOP_ID}/account`;

// Discovery Document Endpoint
export const OPENID_DISCOVERY_URL = `https://${REQUIRED_STORE_DOMAIN}/.well-known/openid-configuration`;

export const AUTH_COOKIE_NAME = 'sanelow_cust_sess';
export const OAUTH_STATE_COOKIE_NAME = 'sanelow_oauth_state';

// In-memory cache for verified OIDC Discovery with 1-hour TTL
export interface OpenIdDiscoveryConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
  scopes_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  code_challenge_methods_supported?: string[];
}

let cachedDiscovery: OpenIdDiscoveryConfig | null = null;
let cachedDiscoveryTimestamp = 0;
const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cached Remote JWKS instance from jose
let cachedJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
let cachedJWKSUri: string | null = null;

// ============================================================================
// Types
// ============================================================================
export interface StoredSession {
  id: string; // Opaque cryptographically random session identifier (64 hex characters)
  accessToken: string;
  refreshToken?: string;
  idToken?: string; // Full ID token preserved server-side
  expiresAt: number; // Access token expiry timestamp (ms)
  sessionExpiresAt: number; // Overall session expiry timestamp (ms)
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  createdAt: number;
  updatedAt: number;
  version?: number; // Monotonically increasing version counter for optimistic concurrency
}

export interface OAuthStateData {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

export class SessionStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStorageError';
  }
}

// ============================================================================
// 1. Session Secret Validation & Encryption Key
// ============================================================================
let cachedDerivedKey: Buffer | null = null;
let lastValidatedSecretStr: string | null = null;

/**
 * Validates process.env.SESSION_SECRET format and entropy.
 * Requires exactly 64 hexadecimal characters (representing 32 cryptographically random bytes).
 * Fails closed without hard-coded fallbacks or client-secret fallback.
 */
export function getValidatedSessionSecretKey(): Buffer {
  const secret = process.env.SESSION_SECRET;

  if (!secret || typeof secret !== 'string') {
    throw new Error('SECURITY_CONFIG_ERROR: SESSION_SECRET environment variable is missing.');
  }

  const trimmed = secret.trim();

  // Enforce strictly 64 hexadecimal characters (32 cryptographically random bytes / 256 bits)
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      'SECURITY_CONFIG_ERROR: SESSION_SECRET must be exactly 64 hexadecimal characters (32 cryptographically random bytes). Generate via: openssl rand -hex 32'
    );
  }

  if (cachedDerivedKey && lastValidatedSecretStr === trimmed) {
    return cachedDerivedKey;
  }

  cachedDerivedKey = Buffer.from(trimmed, 'hex');
  lastValidatedSecretStr = trimmed;
  return cachedDerivedKey;
}

/**
 * Encrypt arbitrary payload at rest using AES-256-GCM.
 */
export function encryptAtRest(data: Record<string, any>): string {
  const key = getValidatedSessionSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(data);
  let ciphertext = cipher.update(jsonStr, 'utf8', 'base64url');
  ciphertext += cipher.final('base64url');
  const authTag = cipher.getAuthTag().toString('base64url');
  return `${iv.toString('base64url')}.${authTag}.${ciphertext}`;
}

/**
 * Decrypt payload at rest using AES-256-GCM.
 */
export function decryptAtRest<T = any>(encryptedString: string): T | null {
  try {
    const parts = encryptedString.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, contentB64] = parts;
    const key = getValidatedSessionSecretKey();
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(contentB64, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// 2. Durable Server-Side Session Storage for Vercel
// ============================================================================
export interface CommitRefreshResult {
  success: boolean;
  error?: 'LOCK_LOST' | 'SESSION_NOT_FOUND' | 'VERSION_MISMATCH' | 'STORAGE_ERROR';
}

export interface SessionStoreAdapter {
  get(sessionId: string): Promise<StoredSession | null>;
  set(sessionId: string, session: StoredSession, ttlSeconds: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  acquireLock(lockKey: string, lockToken: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(lockKey: string, lockToken: string): Promise<void>;
  commitRefreshedSession(
    sessionId: string,
    lockKey: string,
    lockToken: string,
    expectedVersion: number,
    updatedSession: StoredSession,
    ttlSeconds: number
  ): Promise<CommitRefreshResult>;
}

export function isDeployedEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Upstash Redis / Vercel KV REST client for durable serverless sessions.
 * Uses standard documented POST command format without putting payloads in URLs.
 */
export class UpstashRedisSessionStore implements SessionStoreAdapter {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
  }

  private async executeCommand<T = any>(command: any[]): Promise<T> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new SessionStorageError(`Redis command failed with HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new SessionStorageError(`Redis command error: ${json.error}`);
      }

      return json.result as T;
    } catch (err: any) {
      if (err instanceof SessionStorageError) throw err;
      throw new SessionStorageError(`Redis connection error: ${err?.message || 'timeout'}`);
    }
  }

  async get(sessionId: string): Promise<StoredSession | null> {
    const key = `sanelow:cust_sess:${sessionId}`;
    const result = await this.executeCommand<string | null>(['GET', key]);
    if (!result) return null;

    let cipherText = result;
    let version = 1;
    const colonPos = result.indexOf(':');
    if (colonPos !== -1 && colonPos < 12) {
      const parsedVer = parseInt(result.substring(0, colonPos), 10);
      if (!isNaN(parsedVer)) {
        version = parsedVer;
        cipherText = result.substring(colonPos + 1);
      }
    }

    const decrypted = decryptAtRest<StoredSession>(cipherText);
    if (!decrypted) return null;
    decrypted.version = version;
    return decrypted;
  }

  async set(sessionId: string, session: StoredSession, ttlSeconds: number): Promise<void> {
    const key = `sanelow:cust_sess:${sessionId}`;
    const version = session.version || 1;
    session.version = version;
    const encrypted = encryptAtRest(session);
    const envelope = `${version}:${encrypted}`;
    const result = await this.executeCommand<string>(['SET', key, envelope, 'EX', ttlSeconds]);
    if (result !== 'OK') {
      throw new SessionStorageError('Redis SET command failed to confirm write');
    }
  }

  async delete(sessionId: string): Promise<void> {
    const key = `sanelow:cust_sess:${sessionId}`;
    await this.executeCommand<number>(['DEL', key]);
  }

  async acquireLock(lockKey: string, lockToken: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.executeCommand<string | null>(['SET', lockKey, lockToken, 'NX', 'EX', ttlSeconds]);
    return result === 'OK';
  }

  async releaseLock(lockKey: string, lockToken: string): Promise<void> {
    // Ownership-safe lock release using atomic Lua script
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    try {
      await this.executeCommand(['EVAL', script, 1, lockKey, lockToken]);
    } catch {
      // Best-effort lock release
    }
  }

  async commitRefreshedSession(
    sessionId: string,
    lockKey: string,
    lockToken: string,
    expectedVersion: number,
    updatedSession: StoredSession,
    ttlSeconds: number
  ): Promise<CommitRefreshResult> {
    const sessionKey = `sanelow:cust_sess:${sessionId}`;
    const newVersion = expectedVersion + 1;
    updatedSession.version = newVersion;
    const payloadWithEnvelope = `${newVersion}:${encryptAtRest(updatedSession)}`;

    // Single Redis Lua operation checking lock ownership, session existence, and version
    const script = `local currentLock = redis.call("get", KEYS[1])
if not currentLock or currentLock ~= ARGV[1] then
  return "ERR_LOCK_LOST"
end

local currentVal = redis.call("get", KEYS[2])
if not currentVal then
  redis.call("del", KEYS[1])
  return "ERR_SESSION_NOT_FOUND"
end

local currentVer = "1"
local colonPos = string.find(currentVal, ":")
if colonPos then
  currentVer = string.sub(currentVal, 1, colonPos - 1)
end

if currentVer ~= ARGV[2] then
  redis.call("del", KEYS[1])
  return "ERR_VERSION_MISMATCH"
end

redis.call("set", KEYS[2], ARGV[3], "ex", ARGV[4])
redis.call("del", KEYS[1])
return "OK"`;

    try {
      const result = await this.executeCommand<string>([
        'EVAL',
        script,
        2,
        lockKey,
        sessionKey,
        lockToken,
        String(expectedVersion),
        payloadWithEnvelope,
        String(ttlSeconds),
      ]);

      if (result === 'OK') {
        return { success: true };
      }
      if (result === 'ERR_LOCK_LOST') {
        return { success: false, error: 'LOCK_LOST' };
      }
      if (result === 'ERR_SESSION_NOT_FOUND') {
        return { success: false, error: 'SESSION_NOT_FOUND' };
      }
      if (result === 'ERR_VERSION_MISMATCH') {
        return { success: false, error: 'VERSION_MISMATCH' };
      }
      return { success: false, error: 'STORAGE_ERROR' };
    } catch (err: any) {
      if (err instanceof SessionStorageError) throw err;
      throw new SessionStorageError(`Redis commit error: ${err?.message || 'unknown'}`);
    }
  }
}

/**
 * Local Encrypted In-Memory Session Store with distributed lock simulation.
 * Permitted ONLY in explicit local-development / test mode.
 */
export class InMemorySessionStore implements SessionStoreAdapter {
  private records = new Map<string, { encryptedData: string; version: number; expiresAt: number }>();
  private locks = new Map<string, { token: string; expiresAt: number }>();

  async get(sessionId: string): Promise<StoredSession | null> {
    const record = this.records.get(sessionId);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.records.delete(sessionId);
      return null;
    }
    const decrypted = decryptAtRest<StoredSession>(record.encryptedData);
    if (!decrypted) return null;
    decrypted.version = record.version || 1;
    return decrypted;
  }

  async set(sessionId: string, session: StoredSession, ttlSeconds: number): Promise<void> {
    const version = session.version || 1;
    session.version = version;
    const encryptedData = encryptAtRest(session);
    this.records.set(sessionId, {
      encryptedData,
      version,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.records.delete(sessionId);
  }

  async acquireLock(lockKey: string, lockToken: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(lockKey);
    if (existing && now < existing.expiresAt) {
      return false;
    }
    this.locks.set(lockKey, { token: lockToken, expiresAt: now + ttlSeconds * 1000 });
    return true;
  }

  async releaseLock(lockKey: string, lockToken: string): Promise<void> {
    const existing = this.locks.get(lockKey);
    if (existing && existing.token === lockToken) {
      this.locks.delete(lockKey);
    }
  }

  async commitRefreshedSession(
    sessionId: string,
    lockKey: string,
    lockToken: string,
    expectedVersion: number,
    updatedSession: StoredSession,
    ttlSeconds: number
  ): Promise<CommitRefreshResult> {
    // 1. Verify lock ownership
    const lock = this.locks.get(lockKey);
    if (!lock || lock.token !== lockToken || Date.now() > lock.expiresAt) {
      return { success: false, error: 'LOCK_LOST' };
    }

    // 2. Verify session existence
    const existing = this.records.get(sessionId);
    if (!existing || Date.now() > existing.expiresAt) {
      this.locks.delete(lockKey);
      return { success: false, error: 'SESSION_NOT_FOUND' };
    }

    // 3. Verify session version
    const currentVer = existing.version || 1;
    if (currentVer !== expectedVersion) {
      this.locks.delete(lockKey);
      return { success: false, error: 'VERSION_MISMATCH' };
    }

    // 4. Atomic write & release lock
    const newVersion = expectedVersion + 1;
    updatedSession.version = newVersion;
    const encryptedData = encryptAtRest(updatedSession);
    this.records.set(sessionId, {
      encryptedData,
      version: newVersion,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    this.locks.delete(lockKey);

    return { success: true };
  }

  clear() {
    this.records.clear();
    this.locks.clear();
  }
}

let activeSessionStore: SessionStoreAdapter | null = null;
const defaultInMemoryStore = new InMemorySessionStore();

export function getSessionStore(): SessionStoreAdapter {
  if (activeSessionStore) return activeSessionStore;

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    activeSessionStore = new UpstashRedisSessionStore(kvUrl, kvToken);
    return activeSessionStore;
  }

  // Fail closed if Redis credentials are missing on any deployed environment (Vercel Production or Preview)
  if (isDeployedEnvironment() && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'SECURITY_CONFIG_ERROR: Durable Redis session storage is required on deployed environments. Missing KV_REST_API_URL or KV_REST_API_TOKEN.'
    );
  }

  // Allow in-memory store ONLY in local development or test mode
  activeSessionStore = defaultInMemoryStore;
  return activeSessionStore;
}

export function setSessionStoreForTest(store: SessionStoreAdapter | null) {
  activeSessionStore = store;
}

export function clearInMemorySessionStoreForTest() {
  defaultInMemoryStore.clear();
}

// ============================================================================
// 3. OIDC Discovery Verification & JWKS Key Rotation
// ============================================================================
export async function getOpenIdConfiguration(): Promise<OpenIdDiscoveryConfig> {
  const now = Date.now();
  if (cachedDiscovery && now - cachedDiscoveryTimestamp < DISCOVERY_CACHE_TTL_MS) {
    return cachedDiscovery;
  }

  const expectedIssuer = `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}`;

  try {
    const res = await fetch(OPENID_DISCOVERY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Shopify discovery endpoint returned HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.issuer !== expectedIssuer) {
      throw new Error(`Discovery issuer mismatch: got "${data.issuer}", expected "${expectedIssuer}"`);
    }

    const allowedOrigins = new Set(['https://shopify.com', `https://${REQUIRED_STORE_DOMAIN}`]);
    const endpointsToCheck = [
      data.authorization_endpoint,
      data.token_endpoint,
      data.end_session_endpoint,
      data.jwks_uri,
    ];

    for (const ep of endpointsToCheck) {
      if (!ep || typeof ep !== 'string') {
        throw new Error(`Discovery is missing required endpoint URL`);
      }
      const epOrigin = new URL(ep).origin;
      if (!allowedOrigins.has(epOrigin)) {
        throw new Error(`Discovery endpoint origin "${epOrigin}" is not authorized`);
      }
    }

    cachedDiscovery = {
      issuer: data.issuer,
      authorization_endpoint: data.authorization_endpoint,
      token_endpoint: data.token_endpoint,
      end_session_endpoint: data.end_session_endpoint,
      jwks_uri: data.jwks_uri,
      scopes_supported: data.scopes_supported || ['openid', 'email', 'customer-account-api:full'],
      id_token_signing_alg_values_supported: data.id_token_signing_alg_values_supported || ['RS256'],
      code_challenge_methods_supported: data.code_challenge_methods_supported || ['S256'],
    };
    cachedDiscoveryTimestamp = now;
    return cachedDiscovery;
  } catch (err: any) {
    cachedDiscovery = null;
    throw new Error(`Failed to verify OpenID Connect discovery from Shopify: ${err?.message || 'Network error'}`);
  }
}

export function getJoseJwks(jwksUri: string): ReturnType<typeof jose.createRemoteJWKSet> {
  if (cachedJWKS && (cachedJWKSUri === jwksUri || cachedJWKSUri === 'OVERRIDE')) {
    return cachedJWKS;
  }
  cachedJWKS = jose.createRemoteJWKSet(new URL(jwksUri), {
    timeoutDuration: 8000,
  });
  cachedJWKSUri = jwksUri;
  return cachedJWKS;
}

export function setCachedJwksForTest(jwks: ReturnType<typeof jose.createRemoteJWKSet> | null, uri = 'OVERRIDE') {
  cachedJWKS = jwks;
  cachedJWKSUri = jwks ? uri : null;
}

// ============================================================================
// 4. Site URL, Redirects, Cookies & PKCE
// ============================================================================
export function getTrustedSiteUrl(): string {
  const configured = process.env.SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL;
  try {
    const parsed = new URL(configured);
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function isCustomAccountsEnabled(): boolean {
  const flag = process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || process.env.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS;
  if (flag === 'true' || flag === '1') {
    const clientId = process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID;
    return Boolean(clientId && clientId.trim());
  }
  return false;
}

export function getCustomerAccountClientId(): string {
  return (process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || '').trim();
}

export function getCustomerAccountClientSecret(): string {
  return (process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET || '').trim();
}

export function sanitizeReturnUrl(returnUrl?: string | null, trustedBaseUrl: string = DEFAULT_SITE_URL): string {
  if (!returnUrl) return '/account';

  if (/[\x00-\x1F\x7F\\]/.test(returnUrl) || /%5c/i.test(returnUrl)) {
    return '/account';
  }

  const trimmed = returnUrl.trim();
  if (trimmed.startsWith('//')) {
    return '/account';
  }

  try {
    const trustedOrigin = new URL(trustedBaseUrl).origin;
    const parsed = new URL(trimmed, trustedBaseUrl);
    if (parsed.origin !== trustedOrigin) {
      return '/account';
    }
    return parsed.pathname + parsed.search;
  } catch {
    return '/account';
  }
}

export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generatePkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  try {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.slice(0, idx).trim();
        const rawVal = pair.slice(idx + 1).trim();
        try {
          list[key] = decodeURIComponent(rawVal);
        } catch {
          list[key] = rawVal;
        }
      }
    }
  } catch {
    // Malformed cookie header: return safely parsed items
  }

  return list;
}

export function buildSetCookieHeader(
  name: string,
  value: string,
  options: {
    maxAgeSeconds?: number;
    httpOnly?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    path?: string;
    secure?: boolean;
  } = {}
): string {
  const path = options.path || '/';
  const sameSite = options.sameSite || 'Lax';
  const httpOnly = options.httpOnly !== false ? '; HttpOnly' : '';
  const secure = options.secure ? '; Secure' : '';
  const maxAge = options.maxAgeSeconds !== undefined ? `; Max-Age=${options.maxAgeSeconds}` : '';
  return `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}${httpOnly}${secure}${maxAge}`;
}

export function isSecureContext(baseUrl: string): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    baseUrl.startsWith('https://')
  );
}

/**
 * Strict same-origin / CSRF policy validation.
 * Performs exact parsed origin comparisons and rejects mismatched Origin immediately.
 */
export function validateCsrf(req: IncomingMessage, trustedBaseUrl: string): boolean {
  let trustedOrigin: string;
  try {
    trustedOrigin = new URL(trustedBaseUrl).origin;
  } catch {
    return false;
  }

  const originHeader = req.headers.origin as string | undefined;
  const refererHeader = req.headers.referer as string | undefined;

  // 1. If Origin header is present, it MUST match trustedOrigin exactly
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader).origin;
      return parsedOrigin === trustedOrigin;
    } catch {
      return false;
    }
  }

  // 2. If Origin is absent, check Referer with exact origin comparison
  if (refererHeader) {
    try {
      const parsedRefererOrigin = new URL(refererHeader).origin;
      return parsedRefererOrigin === trustedOrigin;
    } catch {
      return false;
    }
  }

  // 3. Fall back to Sec-Fetch-Site: 'same-origin' if both Origin & Referer are absent
  const secFetchSite = (req.headers['sec-fetch-site'] as string) || '';
  if (secFetchSite === 'same-origin') {
    return true;
  }

  return false;
}

// ============================================================================
// 5. JWT & ID Token Validation via `jose`
// ============================================================================
export async function validateIdToken(
  idToken: string,
  expectedNonce: string,
  clientId: string,
  discovery: OpenIdDiscoveryConfig
): Promise<{ valid: boolean; claims?: jose.JWTPayload; error?: string }> {
  try {
    const jwks = getJoseJwks(discovery.jwks_uri);

    const { payload } = await jose.jwtVerify(idToken, jwks, {
      issuer: discovery.issuer,
      audience: clientId,
      algorithms: ['RS256'],
      clockTolerance: 60,
    });

    const nowSec = Math.floor(Date.now() / 1000);

    // Explicitly validate exp claim
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return { valid: false, error: 'ID token is missing a valid numeric "exp" claim.' };
    }
    if (payload.exp <= nowSec - 60) {
      return { valid: false, error: 'ID token has expired.' };
    }

    // Explicitly validate iat claim
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat <= 0) {
      return { valid: false, error: 'ID token is missing a valid numeric "iat" claim.' };
    }
    if (payload.iat > nowSec + 60) {
      return { valid: false, error: 'ID token "iat" is future-dated.' };
    }

    // Explicitly validate sub claim
    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      return { valid: false, error: 'ID token is missing a valid non-empty "sub" claim.' };
    }

    // Explicitly validate iss claim
    if (payload.iss !== discovery.issuer) {
      return { valid: false, error: 'ID token issuer mismatch.' };
    }

    // Explicitly validate aud claim
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(clientId)) {
      return { valid: false, error: 'ID token audience mismatch.' };
    }

    // Explicitly validate nonce claim
    if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
      return { valid: false, error: 'ID token nonce mismatch.' };
    }

    // Explicitly validate azp if present
    if (payload.azp !== undefined && payload.azp !== clientId) {
      return { valid: false, error: 'ID token authorized party ("azp") mismatch.' };
    }

    return { valid: true, claims: payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'ID token verification failed.' };
  }
}

// ============================================================================
// 6. Session Retrieval, Refresh & Distributed Coordination
// ============================================================================
export async function getSession(
  req: IncomingMessage,
  res?: ServerResponse
): Promise<StoredSession | null> {
  const cookies = parseCookies(req);
  const sessionId = cookies[AUTH_COOKIE_NAME];
  if (!sessionId || !/^[0-9a-fA-F]{64}$/.test(sessionId)) {
    return null;
  }

  const store = getSessionStore();
  let session: StoredSession | null = null;

  try {
    session = await store.get(sessionId);
  } catch (err) {
    console.error('[Session Storage Error]: Failed to read session from store');
    return null;
  }

  if (!session || !session.accessToken) {
    return null;
  }

  const now = Date.now();

  if (session.sessionExpiresAt && now > session.sessionExpiresAt) {
    await store.delete(sessionId).catch(() => {});
    return null;
  }

  // Refresh token if expiring within 5 minutes and refreshToken is available
  if (session.expiresAt && now > session.expiresAt - 300000 && session.refreshToken) {
    const lockKey = `sanelow:lock:refresh:${sessionId}`;
    const lockToken = crypto.randomBytes(16).toString('hex');
    let acquired = false;

    try {
      acquired = await store.acquireLock(lockKey, lockToken, 15);
    } catch {
      acquired = false;
    }

    if (!acquired) {
      // Another serverless instance is actively refreshing. Bounded wait up to 2.5s.
      let waitMs = 0;
      const maxWaitMs = 2500;
      const pollIntervalMs = 150;

      while (waitMs < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        waitMs += pollIntervalMs;
        try {
          const latest = await store.get(sessionId);
          if (!latest) return null; // Logged out concurrently
          if (latest.expiresAt > session.expiresAt) {
            return latest; // Refreshed by other instance
          }
        } catch {
          // Continue waiting
        }
      }

      if (now < session.expiresAt) {
        return session;
      }
      return null;
    }

    // Lock acquired: we are the designated refresher instance
    try {
      const freshCheck = await store.get(sessionId);
      if (!freshCheck) {
        return null; // Logged out concurrently
      }
      if (freshCheck.expiresAt > session.expiresAt) {
        return freshCheck;
      }

      const discovery = await getOpenIdConfiguration();
      const clientId = getCustomerAccountClientId();
      const clientSecret = getCustomerAccountClientSecret();
      if (!clientId) return null;

      const bodyParams = new URLSearchParams();
      bodyParams.set('grant_type', 'refresh_token');
      bodyParams.set('client_id', clientId);
      bodyParams.set('refresh_token', freshCheck.refreshToken || session.refreshToken);

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };

      if (clientSecret) {
        headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      }

      const refreshRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers,
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!refreshRes.ok) {
        console.warn('[Session Refresh]: Refresh token was rejected by Shopify (HTTP', refreshRes.status, ')');
        await store.delete(sessionId).catch(() => {});
        return null;
      }

      const tokenJson = await refreshRes.json();
      const newAccessToken = tokenJson.access_token;
      const newRefreshToken = tokenJson.refresh_token || freshCheck.refreshToken;
      const expiresIn = tokenJson.expires_in;

      if (
        typeof newAccessToken !== 'string' ||
        !newAccessToken.trim() ||
        typeof expiresIn !== 'number' ||
        !Number.isFinite(expiresIn) ||
        expiresIn <= 0
      ) {
        console.error('[Session Refresh]: Invalid refresh token payload from Shopify');
        return null;
      }

      // Atomic commit: Verifies lock ownership, session existence, and version in one Lua operation
      const expectedVersion = freshCheck.version || 1;
      const updatedCandidate: StoredSession = {
        ...freshCheck,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        updatedAt: Date.now(),
      };

      const remainingSeconds = Math.max(60, Math.floor((freshCheck.sessionExpiresAt - Date.now()) / 1000));
      const commitRes = await store.commitRefreshedSession(
        sessionId,
        lockKey,
        lockToken,
        expectedVersion,
        updatedCandidate,
        remainingSeconds
      );

      if (!commitRes.success) {
        console.warn(`[Session Refresh Commit Rejected]: Reason=${commitRes.error}`);
        return null;
      }

      return updatedCandidate;
    } catch (err: any) {
      console.error('[Session Refresh Error]: Error during token refresh');
      return null;
    } finally {
      await store.releaseLock(lockKey, lockToken).catch(() => {});
    }
  }

  if (session.expiresAt && now > session.expiresAt) {
    await store.delete(sessionId).catch(() => {});
    return null;
  }

  return session;
}

// ============================================================================
// 7. Main HTTP Handler for /api/auth
// ============================================================================
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const parsedUrl = parseUrl(req.url || '', true);
  const action = (parsedUrl.query.action as string) || (parsedUrl.pathname?.split('/').pop()) || 'session';
  const trustedBaseUrl = getTrustedSiteUrl();
  const isSecure = isSecureContext(trustedBaseUrl);

  try {
    if (action === 'status') {
      const enabled = isCustomAccountsEnabled();
      const clientId = getCustomerAccountClientId();
      const clientSecret = getCustomerAccountClientSecret();
      const hasClientConfig = Boolean(clientId);

      let session: StoredSession | null = null;
      if (enabled) {
        try {
          session = await getSession(req, res);
        } catch {
          session = null;
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          enabled,
          configured: hasClientConfig,
          clientType: clientSecret ? 'confidential' : 'public_pkce',
          authenticated: Boolean(session),
          customer: session
            ? {
                name: session.customerName || null,
                email: session.customerEmail || null,
                id: session.customerId || null,
              }
            : null,
          shopId: SHOPIFY_SHOP_ID,
          storeDomain: REQUIRED_STORE_DOMAIN,
          hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
        })
      );
      return;
    }

    // ------------------------------------------------------------------------
    // Logout Action Handling (Enforce Method & CSRF regardless of feature flag)
    // ------------------------------------------------------------------------
    if (action === 'logout') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Allow', 'POST');
        res.end(JSON.stringify({ error: 'Method not allowed. Logout requires a POST request.' }));
        return;
      }

      if (!validateCsrf(req, trustedBaseUrl)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Unauthorized logout request.' }));
        return;
      }

      const enabled = isCustomAccountsEnabled();
      const clearSessionCookie = buildSetCookieHeader(AUTH_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      if (!enabled) {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', clearSessionCookie);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            logoutUrl: HOSTED_ACCOUNT_FALLBACK_URL,
          })
        );
        return;
      }

      const cookies = parseCookies(req);
      const sessionId = cookies[AUTH_COOKIE_NAME];
      let idTokenHint: string | undefined;
      let storageDeletionFailed = false;

      if (sessionId && /^[0-9a-fA-F]{64}$/.test(sessionId)) {
        try {
          const store = getSessionStore();
          const existingSession = await store.get(sessionId);
          idTokenHint = existingSession?.idToken;
          await store.delete(sessionId);
        } catch (err) {
          console.error('[Session Storage Error]: Failed to delete session on logout');
          storageDeletionFailed = true;
        }
      }

      const discovery = await getOpenIdConfiguration();
      const postLogoutUrl = `${trustedBaseUrl}/account`;
      const shopifyLogoutUrl = new URL(discovery.end_session_endpoint);
      if (idTokenHint) {
        shopifyLogoutUrl.searchParams.set('id_token_hint', idTokenHint);
      }
      shopifyLogoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUrl);

      if (storageDeletionFailed) {
        res.statusCode = 500;
        res.setHeader('Set-Cookie', clearSessionCookie);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_DELETION_FAILED',
            message: 'Browser session cleared, but server-side session revocation encountered an error.',
            logoutUrl: shopifyLogoutUrl.toString(),
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Set-Cookie', clearSessionCookie);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          logoutUrl: shopifyLogoutUrl.toString(),
          postLogoutRedirectUri: postLogoutUrl,
        })
      );
      return;
    }

    // ------------------------------------------------------------------------
    // Server-Side Feature Flag Enforcement for other actions
    // ------------------------------------------------------------------------
    const enabled = isCustomAccountsEnabled();

    if (!enabled) {
      if (action === 'login' || action === 'callback') {
        res.statusCode = 302;
        res.setHeader('Location', HOSTED_ACCOUNT_FALLBACK_URL);
        res.end();
        return;
      }
      if (action === 'session') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            authenticated: false,
            configured: false,
            enabled: false,
            hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
          })
        );
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'FEATURE_DISABLED', message: 'Custom customer accounts are disabled.' }));
      return;
    }

    getValidatedSessionSecretKey();

    const discovery = await getOpenIdConfiguration();

    if (action === 'login') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
        return;
      }

      const clientId = getCustomerAccountClientId();
      if (!clientId) {
        res.statusCode = 302;
        res.setHeader('Location', HOSTED_ACCOUNT_FALLBACK_URL);
        res.end();
        return;
      }

      const rawReturnTo = parsedUrl.query.returnTo as string;
      const returnTo = sanitizeReturnUrl(rawReturnTo, trustedBaseUrl);

      const state = crypto.randomBytes(24).toString('hex');
      const nonce = crypto.randomBytes(24).toString('hex');
      const codeVerifier = generatePkceVerifier();
      const codeChallenge = generatePkceChallenge(codeVerifier);

      const oauthState: OAuthStateData = {
        state,
        nonce,
        codeVerifier,
        returnTo,
        createdAt: Date.now(),
      };

      const encryptedStateCookie = encryptAtRest(oauthState);
      const redirectUri =
        process.env.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI || `${trustedBaseUrl}/api/auth?action=callback`;

      const scopes = 'openid email customer-account-api:full';

      const authUrl = new URL(discovery.authorization_endpoint);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const stateCookieHeader = buildSetCookieHeader(OAUTH_STATE_COOKIE_NAME, encryptedStateCookie, {
        maxAgeSeconds: 900,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      res.statusCode = 302;
      res.setHeader('Set-Cookie', stateCookieHeader);
      res.setHeader('Location', authUrl.toString());
      res.end();
      return;
    }

    if (action === 'callback') {
      const code = parsedUrl.query.code as string;
      const state = parsedUrl.query.state as string;
      const oauthError = parsedUrl.query.error as string;

      const cookies = parseCookies(req);
      const stateCookieValue = cookies[OAUTH_STATE_COOKIE_NAME];
      const savedStateData = stateCookieValue ? decryptAtRest<OAuthStateData>(stateCookieValue) : null;

      const clearStateCookie = buildSetCookieHeader(OAUTH_STATE_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      if (oauthError) {
        console.error('[Shopify Customer OAuth Error]: Authorization rejected by identity provider');
        res.statusCode = 302;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Location', `/account?auth_error=access_denied`);
        res.end();
        return;
      }

      if (!state || !savedStateData || state !== savedStateData.state) {
        res.statusCode = 400;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Authentication Error - Sanelow</title></head><body><h2>Authentication Error</h2><p>Invalid or expired authentication transaction. Please return to your account and try again.</p><p><a href="/account">Return to Account</a></p></body></html>`
        );
        return;
      }

      // Explicitly validate saved state createdAt timestamp bounds
      const MAX_STATE_AGE_MS = 15 * 60 * 1000;
      if (
        typeof savedStateData.createdAt !== 'number' ||
        !Number.isFinite(savedStateData.createdAt) ||
        savedStateData.createdAt > Date.now() + 60000 ||
        Date.now() - savedStateData.createdAt > MAX_STATE_AGE_MS
      ) {
        res.statusCode = 400;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Authentication Error - Sanelow</title></head><body><h2>Authentication Expired</h2><p>The login session expired or is invalid. Please return to your account and sign in again.</p><p><a href="/account">Return to Account</a></p></body></html>`
        );
        return;
      }

      if (!code) {
        res.statusCode = 400;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Authentication Error - Sanelow</title></head><body><h2>Authentication Failed</h2><p>Missing authorization code. Please return to your account and try again.</p><p><a href="/account">Return to Account</a></p></body></html>`
        );
        return;
      }

      const clientId = getCustomerAccountClientId();
      const clientSecret = getCustomerAccountClientSecret();
      const redirectUri =
        process.env.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI || `${trustedBaseUrl}/api/auth?action=callback`;

      const bodyParams = new URLSearchParams();
      bodyParams.set('grant_type', 'authorization_code');
      bodyParams.set('client_id', clientId);
      bodyParams.set('redirect_uri', redirectUri);
      bodyParams.set('code', code);
      bodyParams.set('code_verifier', savedStateData.codeVerifier);

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };

      if (clientSecret) {
        headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      }

      const tokenResponse = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers,
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenResponse.ok) {
        console.error('[Shopify Token Exchange Failed]: HTTP', tokenResponse.status);
        res.statusCode = 302;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Location', `/account?auth_error=token_exchange_failed`);
        res.end();
        return;
      }

      const tokenJson = await tokenResponse.json();
      const accessToken = tokenJson.access_token;
      const idToken = tokenJson.id_token;
      const refreshToken = tokenJson.refresh_token;
      const tokenType = tokenJson.token_type;
      const expiresIn = tokenJson.expires_in;

      // Explicitly validate token response types and lifetimes
      if (
        typeof accessToken !== 'string' ||
        !accessToken.trim() ||
        typeof idToken !== 'string' ||
        !idToken.trim() ||
        typeof tokenType !== 'string' ||
        typeof expiresIn !== 'number' ||
        !Number.isFinite(expiresIn) ||
        expiresIn <= 0
      ) {
        console.error('[Shopify Token Exchange]: Invalid token response types from Shopify');
        res.statusCode = 302;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Location', `/account?auth_error=invalid_token_payload`);
        res.end();
        return;
      }

      const tokenValidation = await validateIdToken(idToken, savedStateData.nonce, clientId, discovery);
      if (!tokenValidation.valid || !tokenValidation.claims) {
        console.error('[ID Token Validation Failed]: Claims validation rejected');
        res.statusCode = 400;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Authentication Error - Sanelow</title></head><body><h2>Identity Verification Failed</h2><p>We could not verify your identity with Shopify. Please return to your account and try again.</p><p><a href="/account">Return to Account</a></p></body></html>`
        );
        return;
      }

      const claims = tokenValidation.claims;
      const customerEmail = typeof claims.email === 'string' ? claims.email : undefined;
      const customerId = typeof claims.sub === 'string' ? claims.sub : undefined;
      const customerName =
        typeof claims.given_name === 'string'
          ? `${claims.given_name} ${typeof claims.family_name === 'string' ? claims.family_name : ''}`.trim()
          : typeof claims.name === 'string'
          ? claims.name
          : undefined;

      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessionTtlSeconds = 30 * 24 * 3600;
      const sessionExpiresAt = Date.now() + sessionTtlSeconds * 1000;

      const sessionRecord: StoredSession = {
        id: sessionId,
        accessToken,
        refreshToken,
        idToken,
        expiresAt: Date.now() + expiresIn * 1000,
        sessionExpiresAt,
        customerId,
        customerEmail,
        customerName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      // Persist session into durable storage; do NOT report login success if storage fails!
      const store = getSessionStore();
      try {
        await store.set(sessionId, sessionRecord, sessionTtlSeconds);
      } catch (err) {
        console.error('[Session Storage Error]: Failed to persist session');
        res.statusCode = 500;
        res.setHeader('Set-Cookie', clearStateCookie);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'STORAGE_ERROR',
            message: 'Unable to establish secure customer session.',
          })
        );
        return;
      }

      const sessionCookieHeader = buildSetCookieHeader(AUTH_COOKIE_NAME, sessionId, {
        maxAgeSeconds: sessionTtlSeconds,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      const returnTo = sanitizeReturnUrl(savedStateData.returnTo, trustedBaseUrl);

      res.statusCode = 302;
      res.setHeader('Set-Cookie', [sessionCookieHeader, clearStateCookie]);
      res.setHeader('Location', returnTo);
      res.end();
      return;
    }

    if (action === 'session') {
      const session = await getSession(req, res);
      const configured = Boolean(getCustomerAccountClientId());

      if (!session) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            authenticated: false,
            configured,
            enabled,
            hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          authenticated: true,
          configured,
          enabled,
          customer: {
            id: session.customerId || null,
            email: session.customerEmail || null,
            name: session.customerName || null,
          },
          expiresAt: session.expiresAt,
          hostedFallbackUrl: HOSTED_ACCOUNT_FALLBACK_URL,
        })
      );
      return;
    }

    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Unknown auth action: "${action}"` }));
  } catch (err: any) {
    if (err?.message?.includes('SECURITY_CONFIG_ERROR')) {
      console.error('[Security Configuration Error]:', err.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'SERVER_CONFIGURATION_ERROR',
            message: 'Internal server configuration error processing authentication.',
          })
        );
      }
      return;
    }

    console.error('[Auth Handler Error]: Internal authentication error');
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Internal server error processing authentication.' }));
    }
  }
}
