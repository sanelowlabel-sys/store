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
export const TESTER_COOKIE_NAME = 'sanelow_tester_sess';
export const TESTER_SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 hours
export const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const TESTER_KILL_SWITCH_KEY = 'sanelow:tester_kill_switch';
export const TESTER_PENDING_CLEANUPS_KEY = 'sanelow:tester_pending_cleanups';
export const TESTER_RATE_LIMIT_PREFIX = 'sanelow:ratelimit:tester:';
export const TESTER_MAX_ATTEMPTS = 5;
export const TESTER_RATE_LIMIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

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
  getRaw?(key: string): Promise<string | null>;
  setRaw?(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delRaw?(key: string): Promise<void>;
  incrRaw?(key: string, ttlSeconds?: number): Promise<number>;
  saddRaw?(key: string, member: string, ttlSeconds?: number): Promise<number>;
  sremRaw?(key: string, member: string): Promise<number>;
  smembersRaw?(key: string): Promise<string[]>;
  linkTesterCustomerSession?(
    testerSessionId: string,
    customerSessionId: string
  ): Promise<{ success: boolean; reason?: string }>;
  markTesterSessionRevoked?(
    testerSessionId: string,
    ttlSeconds?: number
  ): Promise<{ success: boolean; reason?: string }>;
  registerOrphanedCustomerSession?(
    testerSessionId: string,
    customerSessionId: string,
    ttlSeconds?: number
  ): Promise<{ success: boolean; reason?: string }>;
  finalizeTesterCleanup?(
    testerSessionId: string
  ): Promise<{ success: boolean; reason?: string }>;
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

  async getRaw(key: string): Promise<string | null> {
    return this.executeCommand<string | null>(['GET', key]);
  }

  async setRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.executeCommand(['SET', key, value, 'EX', ttlSeconds]);
    } else {
      await this.executeCommand(['SET', key, value]);
    }
  }

  async delRaw(key: string): Promise<void> {
    await this.executeCommand(['DEL', key]);
  }

  async incrRaw(key: string, ttlSeconds: number = 900): Promise<number> {
    const script = `local count = redis.call("incr", KEYS[1])
if count == 1 then
  redis.call("expire", KEYS[1], ARGV[1])
end
return count`;
    return this.executeCommand<number>(['EVAL', script, 1, key, String(ttlSeconds)]);
  }

  async saddRaw(key: string, member: string, ttlSeconds?: number): Promise<number> {
    const res = await this.executeCommand<number>(['SADD', key, member]);
    if (ttlSeconds) {
      await this.executeCommand(['EXPIRE', key, ttlSeconds]);
    }
    return res;
  }

  async sremRaw(key: string, member: string): Promise<number> {
    return this.executeCommand<number>(['SREM', key, member]);
  }

  async smembersRaw(key: string): Promise<string[]> {
    const res = await this.executeCommand<string[] | null>(['SMEMBERS', key]);
    return Array.isArray(res) ? res : [];
  }

  async linkTesterCustomerSession(
    testerSessionId: string,
    customerSessionId: string
  ): Promise<{ success: boolean; reason?: string }> {
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const setKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    const killKey = TESTER_KILL_SWITCH_KEY;
    const nowMs = Date.now();
    const maxLifetimeMs = (TESTER_SESSION_TTL_SECONDS + 60) * 1000;
    const custTtlSeconds = CUSTOMER_SESSION_TTL_SECONDS;

    const script = `local killVal = redis.call("get", KEYS[3])
if killVal == "1" then
  return "ERR_TESTER_KILL_SWITCH_ACTIVE"
end
local testerData = redis.call("get", KEYS[1])
if not testerData then
  return "ERR_TESTER_SESSION_NOT_FOUND"
end
local ttl = redis.call("ttl", KEYS[1])
if ttl <= 0 then
  return "ERR_TESTER_SESSION_EXPIRED"
end
local ok, parsed = pcall(cjson.decode, testerData)
if not ok or type(parsed) ~= "table" then
  return "ERR_TESTER_SESSION_MALFORMED"
end
if parsed.revoked == true or parsed.revoked == "true" then
  return "ERR_TESTER_SESSION_REVOKED"
end
local nowMs = tonumber(ARGV[2])
local createdAt = tonumber(parsed.createdAt)
local expiresAt = tonumber(parsed.expiresAt)
if not createdAt or not expiresAt then
  return "ERR_TESTER_SESSION_MALFORMED"
end
if createdAt > nowMs + 60000 then
  return "ERR_TESTER_SESSION_FUTURE_CREATED"
end
if nowMs > expiresAt then
  return "ERR_TESTER_SESSION_EXPIRED"
end
if expiresAt <= createdAt then
  return "ERR_TESTER_SESSION_MALFORMED"
end
local maxLifetime = tonumber(ARGV[3])
if (expiresAt - createdAt) > maxLifetime then
  return "ERR_TESTER_SESSION_EXCESSIVE_TTL"
end
redis.call("sadd", KEYS[2], ARGV[1])
redis.call("expire", KEYS[2], tonumber(ARGV[4]))
return "OK"`;

    try {
      const res = await this.executeCommand<string>([
        'EVAL',
        script,
        3,
        testerKey,
        setKey,
        killKey,
        customerSessionId,
        String(nowMs),
        String(maxLifetimeMs),
        String(custTtlSeconds),
      ]);
      if (res === 'OK') {
        return { success: true };
      }
      return { success: false, reason: res };
    } catch {
      return { success: false, reason: 'ERR_REDIS_FAILURE' };
    }
  }

  async markTesterSessionRevoked(
    testerSessionId: string,
    ttlSeconds: number = CUSTOMER_SESSION_TTL_SECONDS
  ): Promise<{ success: boolean; reason?: string }> {
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const pendingKey = TESTER_PENDING_CLEANUPS_KEY;
    const nowMs = Date.now();
    const script = `local val = redis.call("get", KEYS[1])
local parsed = {}
if val then
  local ok, p = pcall(cjson.decode, val)
  if ok and type(p) == "table" then
    parsed = p
  end
else
  parsed = { createdAt = tonumber(ARGV[1]), expiresAt = tonumber(ARGV[1]) }
end
parsed["revoked"] = true
parsed["revokedAt"] = tonumber(ARGV[1])
local encoded = cjson.encode(parsed)
redis.call("set", KEYS[1], encoded, "ex", tonumber(ARGV[2]))
redis.call("sadd", KEYS[2], ARGV[3])
return "OK"`;

    try {
      const res = await this.executeCommand<string>([
        'EVAL',
        script,
        2,
        testerKey,
        pendingKey,
        String(nowMs),
        String(ttlSeconds),
        testerSessionId,
      ]);
      if (res === 'OK') {
        return { success: true };
      }
      return { success: false, reason: res };
    } catch {
      return { success: false, reason: 'ERR_REDIS_FAILURE' };
    }
  }

  async registerOrphanedCustomerSession(
    testerSessionId: string,
    customerSessionId: string,
    ttlSeconds: number = CUSTOMER_SESSION_TTL_SECONDS
  ): Promise<{ success: boolean; reason?: string }> {
    const custIdsKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    const pendingKey = TESTER_PENDING_CLEANUPS_KEY;
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const nowMs = Date.now();

    const script = `redis.call("sadd", KEYS[1], ARGV[1])
redis.call("expire", KEYS[1], tonumber(ARGV[2]))
redis.call("sadd", KEYS[2], ARGV[3])
local testerVal = redis.call("get", KEYS[3])
local parsed = {}
if testerVal then
  local ok, p = pcall(cjson.decode, testerVal)
  if ok and type(p) == "table" then parsed = p end
else
  parsed = { createdAt = tonumber(ARGV[4]), expiresAt = tonumber(ARGV[4]) }
end
parsed["revoked"] = true
parsed["revokedAt"] = tonumber(ARGV[4])
local encoded = cjson.encode(parsed)
redis.call("set", KEYS[3], encoded, "ex", tonumber(ARGV[2]))
return "OK"`;

    try {
      const res = await this.executeCommand<string>([
        'EVAL',
        script,
        3,
        custIdsKey,
        pendingKey,
        testerKey,
        customerSessionId,
        String(ttlSeconds),
        testerSessionId,
        String(nowMs),
      ]);
      if (res === 'OK') {
        return { success: true };
      }
      return { success: false, reason: res };
    } catch {
      return { success: false, reason: 'ERR_REDIS_FAILURE' };
    }
  }

  async finalizeTesterCleanup(testerSessionId: string): Promise<{ success: boolean; reason?: string }> {
    const custIdsKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    const pendingKey = TESTER_PENDING_CLEANUPS_KEY;
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;

    const script = `local card = redis.call("scard", KEYS[1])
if card > 0 then
  redis.call("sadd", KEYS[2], ARGV[1])
  return "ERR_INDEX_NOT_EMPTY"
end
redis.call("del", KEYS[1])
redis.call("del", KEYS[3])
redis.call("srem", KEYS[2], ARGV[1])
return "OK"`;

    try {
      const res = await this.executeCommand<string>([
        'EVAL',
        script,
        3,
        custIdsKey,
        pendingKey,
        testerKey,
        testerSessionId,
      ]);
      if (res === 'OK') {
        return { success: true };
      }
      return { success: false, reason: res };
    } catch {
      return { success: false, reason: 'ERR_REDIS_FAILURE' };
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
  private rawRecords = new Map<string, { value: string; expiresAt: number }>();

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

  async getRaw(key: string): Promise<string | null> {
    const r = this.rawRecords.get(key);
    if (!r) return null;
    if (Date.now() > r.expiresAt) {
      this.rawRecords.delete(key);
      return null;
    }
    return r.value;
  }

  async setRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.rawRecords.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity,
    });
  }

  async delRaw(key: string): Promise<void> {
    this.rawRecords.delete(key);
  }

  async incrRaw(key: string, ttlSeconds: number = 900): Promise<number> {
    const existing = await this.getRaw(key);
    const count = (existing ? parseInt(existing, 10) || 0 : 0) + 1;
    await this.setRaw(key, String(count), ttlSeconds);
    return count;
  }

  private setRecords = new Map<string, { members: Set<string>; expiresAt: number }>();

  async saddRaw(key: string, member: string, ttlSeconds?: number): Promise<number> {
    let entry = this.setRecords.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      entry = { members: new Set(), expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity };
      this.setRecords.set(key, entry);
    } else if (ttlSeconds) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    const before = entry.members.size;
    entry.members.add(member);
    return entry.members.size - before;
  }

  async sremRaw(key: string, member: string): Promise<number> {
    const entry = this.setRecords.get(key);
    if (!entry || Date.now() > entry.expiresAt) return 0;
    return entry.members.delete(member) ? 1 : 0;
  }

  async smembersRaw(key: string): Promise<string[]> {
    const entry = this.setRecords.get(key);
    if (!entry || Date.now() > entry.expiresAt) return [];
    return Array.from(entry.members);
  }

  async linkTesterCustomerSession(
    testerSessionId: string,
    customerSessionId: string
  ): Promise<{ success: boolean; reason?: string }> {
    // 1. Check kill switch
    if (await isTesterKillSwitchActive()) {
      return { success: false, reason: 'ERR_TESTER_KILL_SWITCH_ACTIVE' };
    }

    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const rawTester = await this.getRaw(testerKey);
    if (!rawTester) {
      return { success: false, reason: 'ERR_TESTER_SESSION_NOT_FOUND' };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(rawTester);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { success: false, reason: 'ERR_TESTER_SESSION_MALFORMED' };
      }
    } catch {
      return { success: false, reason: 'ERR_TESTER_SESSION_MALFORMED' };
    }

    // 2. Check revocation
    if (parsed.revoked === true || parsed.revoked === 'true') {
      return { success: false, reason: 'ERR_TESTER_SESSION_REVOKED' };
    }

    const now = Date.now();
    const createdAt = parsed.createdAt;
    const expiresAt = parsed.expiresAt;

    // 3. Strict timestamp validation
    if (
      typeof createdAt !== 'number' ||
      !Number.isFinite(createdAt) ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt)
    ) {
      return { success: false, reason: 'ERR_TESTER_SESSION_MALFORMED' };
    }

    if (createdAt > now + 60000) {
      return { success: false, reason: 'ERR_TESTER_SESSION_FUTURE_CREATED' };
    }

    if (now > expiresAt) {
      return { success: false, reason: 'ERR_TESTER_SESSION_EXPIRED' };
    }

    if (expiresAt <= createdAt) {
      return { success: false, reason: 'ERR_TESTER_SESSION_MALFORMED' };
    }

    const maxAllowedTtlMs = (TESTER_SESSION_TTL_SECONDS + 60) * 1000;
    if (expiresAt - createdAt > maxAllowedTtlMs) {
      return { success: false, reason: 'ERR_TESTER_SESSION_EXCESSIVE_TTL' };
    }

    const setKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    await this.saddRaw(setKey, customerSessionId, CUSTOMER_SESSION_TTL_SECONDS);
    return { success: true };
  }

  async markTesterSessionRevoked(
    testerSessionId: string,
    ttlSeconds: number = CUSTOMER_SESSION_TTL_SECONDS
  ): Promise<{ success: boolean; reason?: string }> {
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const rawTester = await this.getRaw(testerKey);
    let parsed: any = {};
    if (rawTester) {
      try {
        parsed = JSON.parse(rawTester);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          parsed = {};
        }
      } catch {
        parsed = {};
      }
    } else {
      parsed = { createdAt: Date.now(), expiresAt: Date.now() };
    }
    parsed.revoked = true;
    parsed.revokedAt = Date.now();
    await this.setRaw(testerKey, JSON.stringify(parsed), ttlSeconds);
    await this.saddRaw(TESTER_PENDING_CLEANUPS_KEY, testerSessionId);
    return { success: true };
  }

  async registerOrphanedCustomerSession(
    testerSessionId: string,
    customerSessionId: string,
    ttlSeconds: number = CUSTOMER_SESSION_TTL_SECONDS
  ): Promise<{ success: boolean; reason?: string }> {
    const custIdsKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    const now = Date.now();
    await this.saddRaw(custIdsKey, customerSessionId, ttlSeconds);
    await this.saddRaw(TESTER_PENDING_CLEANUPS_KEY, testerSessionId);

    const rawTester = await this.getRaw(testerKey);
    let parsed: any = {};
    if (rawTester) {
      try {
        parsed = JSON.parse(rawTester);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
      } catch {
        parsed = {};
      }
    } else {
      parsed = { createdAt: now, expiresAt: now };
    }
    parsed.revoked = true;
    parsed.revokedAt = now;
    await this.setRaw(testerKey, JSON.stringify(parsed), ttlSeconds);
    return { success: true };
  }

  async finalizeTesterCleanup(testerSessionId: string): Promise<{ success: boolean; reason?: string }> {
    const custIdsKey = `sanelow:tester_cust_ids:${testerSessionId}`;
    const members = await this.smembersRaw(custIdsKey);
    if (members.length > 0) {
      await this.saddRaw(TESTER_PENDING_CLEANUPS_KEY, testerSessionId);
      return { success: false, reason: 'ERR_INDEX_NOT_EMPTY' };
    }
    const testerKey = `sanelow:tester_sess:${testerSessionId}`;
    await this.delRaw(custIdsKey);
    await this.delRaw(testerKey);
    await this.sremRaw(TESTER_PENDING_CLEANUPS_KEY, testerSessionId);
    return { success: true };
  }

  clear() {
    this.records.clear();
    this.locks.clear();
    this.rawRecords.clear();
    this.setRecords.clear();
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

// ============================================================================
// Tester Gate & Controlled Production Testing
// ============================================================================
export function isTestingEnabled(): boolean {
  return process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED === 'true';
}

export function getValidatedTesterSecret(): string {
  const secret = process.env.CUSTOMER_ACCOUNT_TESTER_SECRET;
  if (!secret || typeof secret !== 'string') {
    throw new Error('SECURITY_CONFIG_ERROR: CUSTOMER_ACCOUNT_TESTER_SECRET environment variable is missing.');
  }
  const trimmed = secret.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      'SECURITY_CONFIG_ERROR: CUSTOMER_ACCOUNT_TESTER_SECRET must be exactly 64 hexadecimal characters (32 cryptographically random bytes). Generate via: openssl rand -hex 32'
    );
  }
  return trimmed;
}

export function verifyTesterSecret(candidateSecret?: string | null): boolean {
  if (!candidateSecret || typeof candidateSecret !== 'string') return false;
  const trimmed = candidateSecret.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return false;

  try {
    const expected = getValidatedTesterSecret();
    const candidateBuf = Buffer.from(trimmed, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (candidateBuf.length !== 32 || expectedBuf.length !== 32) return false;
    return crypto.timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function isTesterKillSwitchActive(): Promise<boolean> {
  let store: SessionStoreAdapter;
  try {
    store = getSessionStore();
  } catch {
    console.error('[Tester Kill Switch Error]: Session store initialization failed, failing closed: reason=STORAGE_CONFIG_ERROR');
    return true;
  }
  if (!store.getRaw) {
    // Missing required Redis capability -> fail closed immediately
    console.error('[Tester Kill Switch Error]: Session store is missing getRaw capability, failing closed');
    return true;
  }
  try {
    const val = await store.getRaw(TESTER_KILL_SWITCH_KEY);
    return val === '1';
  } catch {
    // Fail closed: Redis failure must deny tester access immediately
    console.error('[Tester Kill Switch Error]: Redis check failed, failing closed: reason=STORAGE_CHECK_FAILED');
    return true;
  }
}

export async function hasTesterAccess(req: IncomingMessage): Promise<boolean> {
  // 1. Explicit feature enablement required: fail closed if not strictly enabled
  if (!isTestingEnabled()) {
    return false;
  }

  // 2. Check Redis kill switch on every protected request; Redis failure fails closed
  const killSwitchActive = await isTesterKillSwitchActive();
  if (killSwitchActive) {
    return false;
  }

  // 3. Extract tester session cookie (must match 64 hex characters)
  const cookies = parseCookies(req);
  const testerSessionId = cookies[TESTER_COOKIE_NAME];
  if (!testerSessionId || !/^[0-9a-fA-F]{64}$/.test(testerSessionId)) {
    return false;
  }

  // 4. Verify tester session exists and satisfies strict validity constraints in Redis
  try {
    const store = getSessionStore();
    if (!store.getRaw) return false;
    const sessionData = await store.getRaw(`sanelow:tester_sess:${testerSessionId}`);
    if (!sessionData || typeof sessionData !== 'string') return false;

    let parsed: any;
    try {
      parsed = JSON.parse(sessionData);
    } catch {
      return false;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }

    // Reject revoked tester sessions immediately
    if (parsed.revoked === true || parsed.revoked === 'true') {
      return false;
    }

    const now = Date.now();
    const createdAt = parsed.createdAt;
    const expiresAt = parsed.expiresAt;

    // Must have finite numeric createdAt and expiresAt
    if (
      typeof createdAt !== 'number' ||
      !Number.isFinite(createdAt) ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt)
    ) {
      return false;
    }

    // Reject future-created sessions (allow up to 60s clock skew)
    if (createdAt > now + 60000) {
      return false;
    }

    // Reject expired sessions
    if (now > expiresAt) {
      return false;
    }

    // Reject sessions where expiresAt is before or equal to createdAt
    if (expiresAt <= createdAt) {
      return false;
    }

    // Reject excessively long-lived sessions (> max TTL + 60s grace)
    const maxAllowedTtlMs = (TESTER_SESSION_TTL_SECONDS + 60) * 1000;
    if (expiresAt - createdAt > maxAllowedTtlMs) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function runAdministrativeTesterCleanup(): Promise<{
  success: boolean;
  processedTesters: number;
  cleanedCustomerSessions: number;
  completedTesters: number;
  remainingPendingTesters: number;
}> {
  const store = getSessionStore();
  if (!store.smembersRaw || !store.sremRaw || !store.delRaw) {
    throw new Error('STORAGE_CAPABILITY_MISSING');
  }

  const pendingTesterIds = await store.smembersRaw(TESTER_PENDING_CLEANUPS_KEY);
  let processedTesters = 0;
  let cleanedCustomerSessions = 0;
  let completedTesters = 0;
  let remainingPendingTesters = 0;

  for (const tId of pendingTesterIds) {
    if (!tId || !/^[0-9a-fA-F]{64}$/.test(tId)) {
      await store.sremRaw(TESTER_PENDING_CLEANUPS_KEY, tId).catch(() => {});
      continue;
    }

    processedTesters++;
    const custIdsKey = `sanelow:tester_cust_ids:${tId}`;
    const testerKey = `sanelow:tester_sess:${tId}`;

    let linkedIds: string[] = [];
    let indexReadError = false;
    try {
      linkedIds = await store.smembersRaw(custIdsKey);
    } catch {
      indexReadError = true;
    }

    if (indexReadError) {
      remainingPendingTesters++;
      continue;
    }

    let partialBatchFailed = false;
    for (const cid of linkedIds) {
      try {
        await store.delete(cid);
        await store.sremRaw(custIdsKey, cid).catch(() => {});
        cleanedCustomerSessions++;
      } catch {
        partialBatchFailed = true;
      }
    }

    if (!partialBatchFailed && store.finalizeTesterCleanup) {
      const finRes = await store.finalizeTesterCleanup(tId);
      if (finRes.success) {
        completedTesters++;
      } else {
        remainingPendingTesters++;
      }
    } else {
      remainingPendingTesters++;
    }
  }

  return {
    success: remainingPendingTesters === 0,
    processedTesters,
    cleanedCustomerSessions,
    completedTesters,
    remainingPendingTesters,
  };
}

export function validateExactOrigin(req: IncomingMessage, trustedBaseUrl: string): boolean {
  try {
    const trustedOrigin = new URL(trustedBaseUrl).origin.toLowerCase();

    // Check Origin header if present
    const originHeader = req.headers['origin'];
    if (originHeader) {
      const originStr = (Array.isArray(originHeader) ? originHeader[0] : originHeader).trim().toLowerCase();
      return originStr === trustedOrigin;
    }

    // Fallback to Referer header if Origin not provided
    const refererHeader = req.headers['referer'];
    if (refererHeader) {
      const refererOrigin = new URL(
        Array.isArray(refererHeader) ? refererHeader[0] : refererHeader
      ).origin.toLowerCase();
      return refererOrigin === trustedOrigin;
    }

    return false;
  } catch {
    return false;
  }
}

function isValidIpFormat(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip);
}

export function getClientIp(req: IncomingMessage): string | null {
  // 1. In deployed Vercel environments, trust only edge-injected proxy headers
  const vercelForwarded = req.headers['x-vercel-forwarded-for'];
  if (vercelForwarded) {
    const ip = (Array.isArray(vercelForwarded) ? vercelForwarded[0] : vercelForwarded).split(',')[0].trim();
    if (ip && isValidIpFormat(ip)) return ip;
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = (Array.isArray(realIp) ? realIp[0] : realIp).trim();
    if (ip && isValidIpFormat(ip)) return ip;
  }

  // In production / deployed mode, DO NOT fall back to caller-supplied headers
  if (isDeployedEnvironment() && process.env.NODE_ENV !== 'test') {
    return null; // Trusted IP could not be established
  }

  // In test / local development mode, allow standard test headers or socket remoteAddress
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    if (first && isValidIpFormat(first)) return first;
  }

  const socketIp = req.socket?.remoteAddress;
  if (socketIp && isValidIpFormat(socketIp)) {
    return socketIp;
  }

  return '127.0.0.1';
}

export async function checkTesterRateLimit(clientIp: string | null): Promise<{ allowed: boolean; retryAfter?: number }> {
  let store: SessionStoreAdapter;
  try {
    store = getSessionStore();
  } catch {
    console.error('[Tester Rate Limit]: Session store initialization failed, failing closed: reason=STORAGE_CONFIG_ERROR');
    return { allowed: false, retryAfter: 60 };
  }
  if (!store.incrRaw) {
    console.error('[Tester Rate Limit]: Session store missing incrRaw capability, failing closed');
    return { allowed: false, retryAfter: 60 };
  }

  // For production / deployed environments, use the shared restrictive rate-limit bucket
  // unless in test environment with an established IP
  const isTest = process.env.NODE_ENV === 'test';
  const useSharedBucket = !isTest || !clientIp;
  const rateLimitKey = useSharedBucket
    ? `${TESTER_RATE_LIMIT_PREFIX}shared_restrictive`
    : `${TESTER_RATE_LIMIT_PREFIX}${clientIp}`;

  const maxAttempts = useSharedBucket ? 2 : TESTER_MAX_ATTEMPTS;

  try {
    const attempts = await store.incrRaw(rateLimitKey, TESTER_RATE_LIMIT_WINDOW_SECONDS);
    if (attempts > maxAttempts) {
      return { allowed: false, retryAfter: TESTER_RATE_LIMIT_WINDOW_SECONDS };
    }
    return { allowed: true };
  } catch {
    console.error('[Tester Rate Limit]: Redis rate limit check failed, failing closed: reason=RATE_LIMIT_STORE_FAILED');
    return { allowed: false, retryAfter: 60 };
  }
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

async function readRequestBodyText(req: IncomingMessage, maxBytes = 16384): Promise<string> {
  const reqAny = req as any;
  if (reqAny.body) {
    if (typeof reqAny.body === 'string') return reqAny.body;
    if (Buffer.isBuffer(reqAny.body)) return reqAny.body.toString('utf8');
    if (typeof reqAny.body === 'object') return JSON.stringify(reqAny.body);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
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
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // ------------------------------------------------------------------------
    // Controlled Production Tester Gate Endpoints
    // ------------------------------------------------------------------------
    if (action === 'tester-gate') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sanelow Tester Gate</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 1rem; padding: 2rem; max-width: 28rem; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 1.25rem; font-weight: 700; margin-top: 0; margin-bottom: 0.5rem; letter-spacing: -0.025em; }
    p { font-size: 0.875rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; color: #d4d4d8; }
    input { width: 100%; box-sizing: border-box; background: #27272a; border: 1px solid #3f3f46; border-radius: 0.5rem; padding: 0.75rem 1rem; color: #fff; font-family: monospace; font-size: 0.875rem; margin-bottom: 1.25rem; outline: none; }
    input:focus { border-color: #ef4444; }
    button { width: 100%; background: #dc2626; color: #fff; font-weight: 600; border: none; border-radius: 0.5rem; padding: 0.75rem 1rem; cursor: pointer; font-size: 0.875rem; transition: background 0.15s; }
    button:hover { background: #b91c1c; }
    .badge { display: inline-block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 9999px; background: #7f1d1d; color: #fca5a5; margin-bottom: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Controlled Verification</span>
    <h1>Sanelow Tester Gate</h1>
    <p>Enter the 64-character hexadecimal tester secret to unlock custom customer account testing for this browser session.</p>
    <form method="POST" action="/api/auth?action=tester-access">
      <label for="secret">Tester Secret</label>
      <input type="password" id="secret" name="secret" autocomplete="off" required placeholder="32-byte (64-hex) secret" minlength="64" maxlength="64" />
      <button type="submit">Unlock Testing</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    if (action === 'tester-access') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
        return;
      }

      // 1. Exact-origin CSRF validation
      if (!validateExactOrigin(req, trustedBaseUrl)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Unauthorized origin.' }));
        return;
      }

      // 2. Fail closed if testing is not explicitly enabled
      if (!isTestingEnabled()) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'TESTING_DISABLED', message: 'Testing is currently disabled.' }));
        return;
      }

      // 3. Distributed rate limiting per client IP
      const clientIp = getClientIp(req);
      const rateLimit = await checkTesterRateLimit(clientIp);
      if (!rateLimit.allowed) {
        res.statusCode = 429;
        if (rateLimit.retryAfter) {
          res.setHeader('Retry-After', String(rateLimit.retryAfter));
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Try again later.' }));
        return;
      }

      // 4. Extract submitted secret
      let candidateSecret = '';
      try {
        const bodyText = await readRequestBodyText(req, 16384);
        const ctype = (req.headers['content-type'] || '').toLowerCase();
        if (ctype.includes('application/json')) {
          const parsed = JSON.parse(bodyText);
          candidateSecret = typeof parsed.secret === 'string' ? parsed.secret : '';
        } else if (ctype.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(bodyText);
          candidateSecret = params.get('secret') || '';
        } else {
          try {
            const parsed = JSON.parse(bodyText);
            candidateSecret = typeof parsed.secret === 'string' ? parsed.secret : '';
          } catch {
            const params = new URLSearchParams(bodyText);
            candidateSecret = params.get('secret') || '';
          }
        }
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'MALFORMED_BODY', message: 'Unable to parse request body.' }));
        return;
      }

      // 5. Constant-time verification
      const isValid = verifyTesterSecret(candidateSecret);
      if (!isValid) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid tester secret.' }));
        return;
      }

      // 6. Check Redis kill switch
      const killSwitchActive = await isTesterKillSwitchActive();
      if (killSwitchActive) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'TESTING_KILLED', message: 'Testing is disabled via kill switch.' }));
        return;
      }

      // 7. Require mandatory storage capabilities before issuing session or cookies
      let store: SessionStoreAdapter;
      try {
        store = getSessionStore();
      } catch {
        console.error('[Tester Access Error]: Session store initialization failed, failing closed: reason=STORAGE_CONFIG_ERROR');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_CONFIG_ERROR', message: 'Storage service configuration error.' }));
        return;
      }
      if (!store.setRaw || !store.getRaw) {
        console.error('[Tester Access Error]: Session store missing required raw capabilities, failing closed: reason=STORAGE_CAPABILITY_MISSING');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_CONFIG_ERROR', message: 'Storage service configuration error.' }));
        return;
      }

      // 8. Generate opaque cryptographically random tester session ID (32 bytes / 64 hex characters)
      const testerSessionId = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      const expiresAt = now + TESTER_SESSION_TTL_SECONDS * 1000;
      const testerPayload = JSON.stringify({
        createdAt: now,
        expiresAt,
        ip: clientIp || 'unverified',
      });

      // Require confirmed storage write before issuing cookies
      try {
        await store.setRaw(`sanelow:tester_sess:${testerSessionId}`, testerPayload, TESTER_SESSION_TTL_SECONDS);
      } catch {
        console.error('[Tester Access Error]: Storage write failed: reason=SESSION_WRITE_FAILED');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_WRITE_FAILED', message: 'Unable to establish tester session in storage.' }));
        return;
      }

      // Host-only cookie: No Domain attribute
      const testerCookieHeader = buildSetCookieHeader(TESTER_COOKIE_NAME, testerSessionId, {
        maxAgeSeconds: TESTER_SESSION_TTL_SECONDS,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      res.setHeader('Set-Cookie', testerCookieHeader);

      const acceptHeader = req.headers['accept'] || '';
      if (
        acceptHeader.includes('text/html') ||
        (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
      ) {
        res.statusCode = 303;
        res.setHeader('Location', '/account');
        res.end();
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Tester session established.', returnTo: '/account' }));
      return;
    }

    if (action === 'tester-logout') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
        return;
      }

      if (!validateExactOrigin(req, trustedBaseUrl)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Unauthorized origin.' }));
        return;
      }

      const cookies = parseCookies(req);
      const testerSessionId = cookies[TESTER_COOKIE_NAME];
      const customerSessionId = cookies[AUTH_COOKIE_NAME];

      const clearTesterCookie = buildSetCookieHeader(TESTER_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      const clearAuthCookie = buildSetCookieHeader(AUTH_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      let store: SessionStoreAdapter;
      try {
        store = getSessionStore();
      } catch {
        console.error('[Tester Logout Error]: Session store initialization failed: reason=STORAGE_CONFIG_ERROR');
        res.statusCode = 500;
        res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_REVOCATION_INCOMPLETE',
            message: 'Browser credentials cleared, but storage configuration prevented full revocation.',
          })
        );
        return;
      }

      // Require store capabilities
      if (!store.smembersRaw || !store.sremRaw || !store.delRaw || !store.markTesterSessionRevoked) {
        console.error('[Tester Logout Error]: Storage adapter missing required set/del capabilities: reason=STORAGE_CAPABILITY_MISSING');
        res.statusCode = 500;
        res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_REVOCATION_INCOMPLETE',
            message: 'Browser credentials cleared, but storage configuration prevented full revocation.',
          })
        );
        return;
      }

      // 1. Before reading linked customer IDs, atomically mark the tester session revoked
      // and register it for pending cleanup. Require this operation to succeed before continuing.
      if (testerSessionId && /^[0-9a-fA-F]{64}$/.test(testerSessionId)) {
        const revokeResult = await store.markTesterSessionRevoked(testerSessionId, CUSTOMER_SESSION_TTL_SECONDS);
        if (!revokeResult.success) {
          console.error('[Tester Logout Error]: Failed to mark tester session revoked: reason=' + revokeResult.reason);
          res.statusCode = 503;
          res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: 'STORAGE_REVOCATION_INCOMPLETE',
              message: 'Browser credentials cleared, but recording session revocation failed. Please retry.',
            })
          );
          return;
        }
      }

      const custIdsKey = testerSessionId ? `sanelow:tester_cust_ids:${testerSessionId}` : null;
      const testerKey = testerSessionId ? `sanelow:tester_sess:${testerSessionId}` : null;

      // 2. If SMEMBERS fails, preserve the revoked tester record, linked-session index,
      // and pending-cleanup entry. Clear browser cookies but return HTTP 503 with STORAGE_REVOCATION_INCOMPLETE.
      let linkedCustomerIds: string[] = [];
      let indexReadFailed = false;
      if (custIdsKey) {
        try {
          linkedCustomerIds = await store.smembersRaw(custIdsKey);
        } catch {
          console.error('[Tester Logout]: Failed to read linked customer IDs: reason=SMEMBERS_FAILED');
          indexReadFailed = true;
        }
      }

      if (indexReadFailed) {
        res.statusCode = 503;
        res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_REVOCATION_INCOMPLETE',
            message: 'Browser credentials cleared, but reading linked sessions failed. Revocation preserved in pending cleanups.',
          })
        );
        return;
      }

      const customerSessionsToRevoke = new Set<string>(linkedCustomerIds);
      if (customerSessionId && /^[0-9a-fA-F]{64}$/.test(customerSessionId)) {
        customerSessionsToRevoke.add(customerSessionId);
      }

      let partialRevocationFailed = false;

      // 3. Delete customer sessions using the existing store.delete adapter.
      // Retain failed IDs for retry. Remove cleanup records only after every linked customer session has been confirmed deleted.
      for (const custSessId of customerSessionsToRevoke) {
        try {
          await store.delete(custSessId);
          if (custIdsKey) {
            await store.sremRaw(custIdsKey, custSessId).catch(() => {});
          }
        } catch {
          console.error('[Tester Logout]: Partial session revocation failure: reason=CUSTOMER_SESSION_CLEANUP_FAILED');
          partialRevocationFailed = true;
        }
      }

      let finalizationSuccess = false;
      if (!partialRevocationFailed && testerSessionId && store.finalizeTesterCleanup) {
        const finRes = await store.finalizeTesterCleanup(testerSessionId);
        finalizationSuccess = finRes.success;
      }

      if (partialRevocationFailed || !finalizationSuccess) {
        res.statusCode = 500;
        res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_REVOCATION_INCOMPLETE',
            message: 'Browser credentials cleared, but server-side revocation was incomplete. Please retry.',
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Set-Cookie', [clearTesterCookie, clearAuthCookie]);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          message: 'Tester session and associated customer sessions revoked.',
        })
      );
      return;
    }

    if (action === 'tester-cleanup' || action === 'tester-cleanup-retry') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
        return;
      }

      if (!validateExactOrigin(req, trustedBaseUrl)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Unauthorized origin.' }));
        return;
      }

      const clientIp = getClientIp(req);
      const rateLimit = await checkTesterRateLimit(clientIp);
      if (!rateLimit.allowed) {
        res.statusCode = 429;
        if (rateLimit.retryAfter) {
          res.setHeader('Retry-After', String(rateLimit.retryAfter));
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Try again later.' }));
        return;
      }

      let candidateSecret = '';
      try {
        const bodyText = await readRequestBodyText(req, 16384);
        const ctype = (req.headers['content-type'] || '').toLowerCase();
        if (ctype.includes('application/json')) {
          const parsed = JSON.parse(bodyText);
          candidateSecret = typeof parsed.secret === 'string' ? parsed.secret : '';
        } else {
          try {
            const parsed = JSON.parse(bodyText);
            candidateSecret = typeof parsed.secret === 'string' ? parsed.secret : '';
          } catch {
            const params = new URLSearchParams(bodyText);
            candidateSecret = params.get('secret') || '';
          }
        }
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'MALFORMED_BODY', message: 'Unable to parse request body.' }));
        return;
      }

      if (!verifyTesterSecret(candidateSecret)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid tester secret.' }));
        return;
      }

      let cleanupResult: any;
      try {
        cleanupResult = await runAdministrativeTesterCleanup();
      } catch (err: any) {
        if (err?.message === 'STORAGE_CAPABILITY_MISSING') {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'STORAGE_CONFIG_ERROR', message: 'Storage adapter missing required capabilities.' }));
          return;
        }
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_REVOCATION_INCOMPLETE', message: 'Cleanup retry could not complete. Please retry.' }));
        return;
      }

      if (!cleanupResult.success || cleanupResult.remainingPendingTesters > 0) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: 'STORAGE_REVOCATION_INCOMPLETE',
            message: 'Cleanup retry incomplete with remaining pending records. Please retry.',
            processedTesters: cleanupResult.processedTesters,
            cleanedCustomerSessions: cleanupResult.cleanedCustomerSessions,
            completedTesters: cleanupResult.completedTesters,
            remainingPendingTesters: cleanupResult.remainingPendingTesters,
          })
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          processedTesters: cleanupResult.processedTesters,
          cleanedCustomerSessions: cleanupResult.cleanedCustomerSessions,
          completedTesters: cleanupResult.completedTesters,
          remainingPendingTesters: 0,
        })
      );
      return;
    }

    if (action === 'tester-kill') {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
        return;
      }

      if (!validateExactOrigin(req, trustedBaseUrl)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Unauthorized origin.' }));
        return;
      }

      if (!isTestingEnabled()) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'TESTING_DISABLED', message: 'Testing is currently disabled.' }));
        return;
      }

      const clientIp = getClientIp(req);
      const rateLimit = await checkTesterRateLimit(clientIp);
      if (!rateLimit.allowed) {
        res.statusCode = 429;
        if (rateLimit.retryAfter) {
          res.setHeader('Retry-After', String(rateLimit.retryAfter));
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Try again later.' }));
        return;
      }

      let secret = '';
      let kill = true;
      try {
        const bodyText = await readRequestBodyText(req, 16384);
        const parsed = JSON.parse(bodyText);
        secret = typeof parsed.secret === 'string' ? parsed.secret : '';
        kill = parsed.kill !== false;
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'MALFORMED_BODY' }));
        return;
      }

      if (!verifyTesterSecret(secret)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }

      let store: SessionStoreAdapter;
      try {
        store = getSessionStore();
      } catch {
        console.error('[Tester Kill Error]: Session store initialization failed: reason=STORAGE_CONFIG_ERROR');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_CONFIG_ERROR', message: 'Storage service configuration error.' }));
        return;
      }
      if (!store.setRaw || !store.delRaw) {
        console.error('[Tester Kill Error]: Storage adapter missing required write capabilities: reason=STORAGE_CAPABILITY_MISSING');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_CONFIG_ERROR', message: 'Storage service configuration error.' }));
        return;
      }

      try {
        if (kill) {
          await store.setRaw(TESTER_KILL_SWITCH_KEY, '1');
        } else {
          await store.delRaw(TESTER_KILL_SWITCH_KEY);
        }
      } catch {
        console.error('[Tester Kill Error]: Redis write failed: reason=KILL_SWITCH_WRITE_FAILED');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'STORAGE_WRITE_FAILED', message: 'Unable to update kill switch state in storage.' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, killSwitchActive: kill }));
      return;
    }

    // ------------------------------------------------------------------------
    // Effective Feature Enablement: Flag OR Active Authorized Tester Session
    // ------------------------------------------------------------------------
    const globalEnabled = isCustomAccountsEnabled();
    const testerAccess = await hasTesterAccess(req);
    const effectiveEnabled = globalEnabled || testerAccess;

    if (action === 'status') {
      const clientId = getCustomerAccountClientId();
      const clientSecret = getCustomerAccountClientSecret();
      const hasClientConfig = Boolean(clientId);

      let session: StoredSession | null = null;
      if (effectiveEnabled) {
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
          enabled: effectiveEnabled,
          isTester: testerAccess,
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

      const clearSessionCookie = buildSetCookieHeader(AUTH_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure,
      });

      // Always revoke the server-side session from Redis if the cookie is present,
      // even if tester access has expired or been disabled!
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
        } catch {
          console.error('[Session Storage Error]: Failed to delete session on logout');
          storageDeletionFailed = true;
        }
      }

      if (!effectiveEnabled) {
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
    if (!effectiveEnabled) {
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
            isTester: false,
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
      } catch {
        console.error('[Session Storage Error]: Failed to persist session: reason=CUSTOMER_SESSION_WRITE_FAILED');
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

      // If this login was initiated under tester access, recheck tester expiry & revocation, and atomically link in Redis
      if (testerAccess) {
        const cookies = parseCookies(req);
        const tSessId = cookies[TESTER_COOKIE_NAME];
        let linkSuccess = false;

        if (tSessId && /^[0-9a-fA-F]{64}$/.test(tSessId) && store.linkTesterCustomerSession) {
          try {
            const linkResult = await store.linkTesterCustomerSession(tSessId, sessionId);
            linkSuccess = linkResult.success;
          } catch {
            linkSuccess = false;
          }
        }

        // Do not issue the customer cookie unless storage and tester linkage succeed!
        // On failure, immediately revoke any newly created customer session!
        if (!linkSuccess) {
          console.error('[Tester Callback Error]: Atomic session linkage failed, rolling back customer session: reason=TESTER_LINK_FAILED');
          let rollbackDeleted = false;
          try {
            await store.delete(sessionId);
            rollbackDeleted = true;
          } catch {
            console.error('[Tester Callback Error]: Rollback customer session deletion failed: reason=ROLLBACK_DELETE_FAILED');
          }

          if (!rollbackDeleted && tSessId) {
            let registrationSuccess = false;
            try {
              if (store.registerOrphanedCustomerSession) {
                const regRes = await store.registerOrphanedCustomerSession(tSessId, sessionId, CUSTOMER_SESSION_TTL_SECONDS);
                registrationSuccess = regRes.success;
              }
            } catch (regErr: any) {
              console.error('[Tester Callback Error]: Registration of orphaned customer session failed: reason=REGISTRATION_FAILED', regErr?.message);
              registrationSuccess = false;
            }

            if (!registrationSuccess) {
              // Registration failure must NEVER be silently swallowed!
              // Clear cookies and return safe HTTP 500 storage failure documenting the issue and what remains recoverable.
              res.statusCode = 500;
              res.setHeader('Set-Cookie', clearStateCookie);
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'STORAGE_REGISTRATION_FAILED',
                  message: 'Authentication rejected and session rollback cleanup registration failed. The customer session will expire automatically in storage; run administrative cleanup or review storage logs to remediate.',
                  recoverable: false,
                })
              );
              return;
            }
          }

          res.statusCode = 302;
          res.setHeader('Set-Cookie', clearStateCookie);
          res.setHeader('Location', `/account?auth_error=tester_session_revoked`);
          res.end();
          return;
        }
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
            enabled: effectiveEnabled,
            isTester: testerAccess,
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
          enabled: effectiveEnabled,
          isTester: testerAccess,
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
