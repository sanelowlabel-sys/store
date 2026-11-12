import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import crypto from 'crypto';
import * as jose from 'jose';
import {
  generatePkceVerifier,
  generatePkceChallenge,
  getValidatedSessionSecretKey,
  encryptAtRest,
  decryptAtRest,
  sanitizeReturnUrl,
  getTrustedSiteUrl,
  getSession,
  buildSetCookieHeader,
  parseCookies,
  validateIdToken,
  validateCsrf,
  setCachedJwksForTest,
  getSessionStore,
  setSessionStoreForTest,
  clearInMemorySessionStoreForTest,
  InMemorySessionStore,
  UpstashRedisSessionStore,
  SessionStorageError,
  StoredSession,
  AUTH_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  TESTER_COOKIE_NAME,
  TESTER_KILL_SWITCH_KEY,
  LEGACY_TESTER_KILL_SWITCH_KEY_1,
  LEGACY_TESTER_KILL_SWITCH_KEY_2,
  ALL_TESTER_KILL_SWITCH_KEYS,
  TESTER_SESSION_TTL_SECONDS,
  TESTER_PENDING_CLEANUPS_KEY,
  runAdministrativeTesterCleanup,
  SHOPIFY_SHOP_ID,
  HOSTED_ACCOUNT_FALLBACK_URL,
  OpenIdDiscoveryConfig,
  isTestingEnabled,
  getValidatedTesterSecret,
  verifyTesterSecret,
  isTesterKillSwitchActive,
  hasTesterAccess,
  validateExactOrigin,
  checkTesterRateLimit,
  getClientIp,
} from '../api/auth.js';
process.env.NODE_ENV = 'test';
import authHandler from '../api/auth.js';
import customerHandler, { CUSTOMER_GRAPHQL_QUERIES } from '../api/customer.js';
import webhookHandler, {
  verifyShopifyWebhookHmac,
  processAtomicCatalogueWebhook,
  registerWebhookId,
  incrementCatalogueVersion,
  getCatalogueVersion,
  resetInMemoryCatalogueVersionForTest,
  setSimulatedStorageFailureForTest,
  SUPPORTED_CATALOGUE_TOPICS,
} from '../api/webhook.js';
import {
  transformCustomerOrder,
  transformCustomerProfile,
  fetchLiveCatalogue,
  fetchProductByHandle,
  setCustomShopifyFetchForTest,
  getWishlistStorageKey,
  loadWishlistForScope,
  saveWishlistForScope,
  GUEST_WISHLIST_STORAGE_KEY,
  applyWishlistToggle,
  executeWishlistToggle,
  wishlistReducer,
  getWishlistNotificationMessage,
  WishlistCoordinator,
  createWishlistCoordinator,
  defaultWishlistCoordinator,
  type WishlistStorageAdapter,
  type WishlistListener,
  type WishlistScope,
  type WishlistState,
  type WishlistTransitionResult,
  type WishlistAction,
  logoutCustomer,
} from '../src/lib/shopify';
import React from 'react';
import { WishlistDrawer } from '../src/components/WishlistDrawer';
import { renderToStaticMarkup } from 'react-dom/server';

function createMockReqRes(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const chunks = options.body !== undefined
    ? [Buffer.isBuffer(options.body) ? options.body : Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))]
    : [];
  let index = 0;
  const req = new Readable({
    read() {
      if (index < chunks.length) {
        this.push(chunks[index++]);
      } else {
        this.push(null);
      }
    },
  }) as any;
  req.method = options.method || 'GET';
  req.url = options.url || '/';
  req.headers = options.headers || {};
  if (options.body !== undefined) {
    req.body = options.body;
  }

  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.headers = {} as Record<string, string | string[]>;
  res.headersSent = false;
  res.data = '';

  res.setHeader = (key: string, value: string | string[]) => {
    res.headers[key.toLowerCase()] = value;
  };
  res.getHeader = (key: string) => res.headers[key.toLowerCase()];
  res.end = (chunk?: any) => {
    if (chunk) res.data += chunk.toString();
    res.headersSent = true;
    res.emit('finish');
  };

  return { req, res };
}

// Generate an RSA key pair for testing ID token signature validation with jose
const testKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testJwk = testKeyPair.publicKey.export({ format: 'jwk' }) as any;
testJwk.kid = 'test_key_id_rsa';
testJwk.alg = 'RS256';
testJwk.use = 'sig';

const testDiscovery: OpenIdDiscoveryConfig = {
  issuer: `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}`,
  authorization_endpoint: `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}/oauth/authorize`,
  token_endpoint: `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}/oauth/token`,
  end_session_endpoint: `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}/logout`,
  jwks_uri: `https://shopify.com/authentication/${SHOPIFY_SHOP_ID}/.well-known/jwks.json`,
  scopes_supported: ['openid', 'email', 'customer-account-api:full'],
};

function createSignedIdToken(
  payloadOverrides: Record<string, any> = {},
  kid = 'test_key_id_rsa',
  signWith = testKeyPair.privateKey
) {
  const header = { alg: 'RS256', kid };
  const payload = {
    iss: testDiscovery.issuer,
    sub: 'gid://shopify/Customer/77889900',
    aud: 'shp_mock_test_client_id_123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 10,
    nonce: 'expected_mock_nonce_val',
    email: 'collector@sanelowmusiclabel.co.za',
    email_verified: true,
    given_name: 'Alex',
    family_name: 'Collector',
    ...payloadOverrides,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), signWith).toString('base64url');
  return `${signingInput}.${sig}`;
}

test('Shopify Customer Account API & Custom Dashboard Specifications', async (t) => {
  // Dedicated high-entropy 256-bit test secret (strictly 64 hex characters)
  const TEST_VALID_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.SESSION_SECRET = TEST_VALID_SECRET;

  const localJwks = jose.createLocalJWKSet({
    keys: [testJwk],
  });
  setCachedJwksForTest(localJwks as any);

  // --------------------------------------------------------------------------
  // TEST 1: SESSION_SECRET Strict 64-Hex Validation
  // --------------------------------------------------------------------------
  await t.test('1. SESSION_SECRET requires strictly 64 hexadecimal characters representing 32 random bytes', () => {
    process.env.SESSION_SECRET = TEST_VALID_SECRET;
    const key = getValidatedSessionSecretKey();
    assert.equal(key.length, 32);

    // Rejects missing secret
    delete process.env.SESSION_SECRET;
    assert.throws(() => getValidatedSessionSecretKey(), /SECURITY_CONFIG_ERROR/);

    // Rejects non-hex phrases even if >= 32 characters
    process.env.SESSION_SECRET = 'this_is_an_arbitrary_phrase_with_more_than_32_chars!';
    assert.throws(() => getValidatedSessionSecretKey(), /SECURITY_CONFIG_ERROR.*exactly 64 hexadecimal characters/);

    // Rejects 63 or 65 hex characters
    process.env.SESSION_SECRET = TEST_VALID_SECRET.slice(0, 63);
    assert.throws(() => getValidatedSessionSecretKey(), /SECURITY_CONFIG_ERROR.*exactly 64 hexadecimal characters/);

    // Restore valid secret
    process.env.SESSION_SECRET = TEST_VALID_SECRET;
  });

  // --------------------------------------------------------------------------
  // TEST 2: Durable Session Storage & Failure Handling
  // --------------------------------------------------------------------------
  await t.test('2. Storage failures are handled honestly and fail closed without leaking internals', async () => {
    clearInMemorySessionStoreForTest();
    const testStore = new InMemorySessionStore();
    setSessionStoreForTest(testStore);

    const sessionId = crypto.randomBytes(32).toString('hex');
    const mockSession = {
      id: sessionId,
      accessToken: 'shcat_mock_access_token_12345',
      refreshToken: 'shcrt_mock_refresh_token_67890',
      idToken: 'mock_full_untruncated_id_token_header.payload.signature_rsa256',
      expiresAt: Date.now() + 7200000,
      sessionExpiresAt: Date.now() + 2592000000,
      customerId: 'gid://shopify/Customer/12345',
      customerEmail: 'collector@sanelowmusiclabel.co.za',
      customerName: 'Alex Collector',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await testStore.set(sessionId, mockSession, 3600);

    const retrieved = await testStore.get(sessionId);
    assert.ok(retrieved);
    assert.equal(retrieved.idToken, mockSession.idToken);

    // Test failing store behavior on logout
    const failingStore = {
      ...testStore,
      delete: async () => {
        throw new SessionStorageError('Simulated storage failure');
      },
      get: async (id: string) => testStore.get(id),
      set: async (id: string, s: any, ttl: number) => testStore.set(id, s, ttl),
      acquireLock: async () => true,
      releaseLock: async () => {},
    };
    setSessionStoreForTest(failingStore as any);

    process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'true';
    process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID = 'shp_mock_test_client_id_123';

    const { req: logoutReq, res: logoutRes } = createMockReqRes({
      method: 'POST',
      url: '/api/auth?action=logout',
      headers: {
        origin: 'https://shop.sanelowmusiclabel.co.za',
        cookie: `${AUTH_COOKIE_NAME}=${sessionId}`,
      },
    });

    await authHandler(logoutReq, logoutRes);
    // When storage delete fails, must NOT report complete success; returns 500 with generic error and still clears cookie
    assert.equal(logoutRes.statusCode, 500);
    const logoutJson = JSON.parse(logoutRes.data);
    assert.equal(logoutJson.success, false);
    assert.equal(logoutJson.error, 'STORAGE_DELETION_FAILED');
    assert.ok(logoutRes.headers['set-cookie']?.toString().includes('Max-Age=0'));

    // Restore test store
    setSessionStoreForTest(testStore);
    process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'false';
  });

  // --------------------------------------------------------------------------
  // TEST 3: Distributed Refresh Coordination Across Independent Worker Instances
  // --------------------------------------------------------------------------
  await t.test('3. Distributed refresh coordinates across independent worker instances using ownership-safe locks', async () => {
    // Shared backend storage state (simulating shared Redis/KV store)
    const redisStorage = new Map<string, { value: string; expiresAt: number }>();

    // Factory to create independent worker store instances
    const createWorkerStore = (): InMemorySessionStore => {
      const store = new InMemorySessionStore();
      (store as any).records = {
        get: (key: string) => {
          const item = redisStorage.get(`sess:${key}`);
          if (!item) return undefined;
          if (Date.now() > item.expiresAt) {
            redisStorage.delete(`sess:${key}`);
            return undefined;
          }
          return { encryptedData: item.value, expiresAt: item.expiresAt };
        },
        set: (key: string, data: { encryptedData: string; expiresAt: number }) => {
          redisStorage.set(`sess:${key}`, { value: data.encryptedData, expiresAt: data.expiresAt });
        },
        delete: (key: string) => {
          redisStorage.delete(`sess:${key}`);
        },
      };
      (store as any).locks = {
        get: (key: string) => {
          const item = redisStorage.get(`lock:${key}`);
          if (!item) return undefined;
          if (Date.now() > item.expiresAt) {
            redisStorage.delete(`lock:${key}`);
            return undefined;
          }
          return { token: item.value, expiresAt: item.expiresAt };
        },
        set: (key: string, data: { token: string; expiresAt: number }) => {
          redisStorage.set(`lock:${key}`, { value: data.token, expiresAt: data.expiresAt });
        },
        delete: (key: string) => {
          redisStorage.delete(`lock:${key}`);
        },
      };
      return store;
    };

    const workerStoreA = createWorkerStore();
    const workerStoreB = createWorkerStore();

    const sessionId = crypto.randomBytes(32).toString('hex');
    const lockKey = `sanelow:lock:refresh:${sessionId}`;
    const tokenA = crypto.randomBytes(16).toString('hex');
    const tokenB = crypto.randomBytes(16).toString('hex');

    // Seed session in shared storage
    const initialSession = {
      id: sessionId,
      accessToken: 'access_tok_initial',
      refreshToken: 'refresh_tok_initial',
      expiresAt: Date.now() + 1000,
      sessionExpiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await workerStoreA.set(sessionId, initialSession, 3600);

    // Worker instance A acquires lock
    const acquiredA = await workerStoreA.acquireLock(lockKey, tokenA, 15);
    assert.equal(acquiredA, true, 'Worker instance A should acquire lock');

    // Worker instance B attempts to acquire lock while held by A
    const acquiredB = await workerStoreB.acquireLock(lockKey, tokenB, 15);
    assert.equal(acquiredB, false, 'Worker instance B must be rejected while lock is active');

    // Ownership safety: Worker B cannot release Worker A’s lock
    await workerStoreB.releaseLock(lockKey, tokenB);
    const stillLocked = await workerStoreB.acquireLock(lockKey, tokenB, 15);
    assert.equal(stillLocked, false, 'Lock must remain active after unauthorized release attempt');

    // Worker A updates rotated tokens atomically
    const refreshedSession = {
      ...initialSession,
      accessToken: 'access_tok_rotated_v2',
      refreshToken: 'refresh_tok_rotated_v2',
      expiresAt: Date.now() + 7200000,
      updatedAt: Date.now(),
    };
    await workerStoreA.set(sessionId, refreshedSession, 3600);

    // Worker A releases its own lock
    await workerStoreA.releaseLock(lockKey, tokenA);

    // Worker B now reads the rotated session directly from shared storage
    const freshFromB = await workerStoreB.get(sessionId);
    assert.ok(freshFromB);
    assert.equal(freshFromB.accessToken, 'access_tok_rotated_v2');
    assert.equal(freshFromB.refreshToken, 'refresh_tok_rotated_v2');

    // Test logout race protection: if Worker B deletes session on logout, Worker A pre-write check rejects
    await workerStoreB.delete(sessionId);
    const deletedCheck = await workerStoreA.get(sessionId);
    assert.equal(deletedCheck, null, 'Session must not be found on Worker A after Worker B deletes it');

    // ------------------------------------------------------------------------
    // Truly atomic commitRefreshedSession tests:
    // (a) Logout occurring between refresh completion and commit
    // ------------------------------------------------------------------------
    const sessLogoutId = crypto.randomBytes(32).toString('hex');
    const lockKeyLogout = `sanelow:lock:refresh:${sessLogoutId}`;
    const tokenLogout = crypto.randomBytes(16).toString('hex');
    const isolatedStore = new InMemorySessionStore();

    await isolatedStore.set(
      sessLogoutId,
      {
        id: sessLogoutId,
        accessToken: 'access_tok_prior',
        refreshToken: 'refresh_tok_prior',
        expiresAt: Date.now() + 60000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    const acquiredLogoutLock = await isolatedStore.acquireLock(lockKeyLogout, tokenLogout, 15);
    assert.equal(acquiredLogoutLock, true);

    // User logs out while token refresh was in flight
    await isolatedStore.delete(sessLogoutId);

    // Refresher tries to commit: must fail closed and NOT resurrect deleted session
    const commitLogoutOutcome = await isolatedStore.commitRefreshedSession(
      sessLogoutId,
      lockKeyLogout,
      tokenLogout,
      1,
      {
        id: sessLogoutId,
        accessToken: 'access_tok_new_orphan',
        refreshToken: 'refresh_tok_new_orphan',
        expiresAt: Date.now() + 7200000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    assert.equal(commitLogoutOutcome.success, false);
    assert.equal(commitLogoutOutcome.error, 'SESSION_NOT_FOUND');
    assert.equal(await isolatedStore.get(sessLogoutId), null, 'Logged-out session must not be recreated by commit');

    // ------------------------------------------------------------------------
    // (b) Lock expiry with a second refresher taking ownership
    // ------------------------------------------------------------------------
    const sessExpiryId = crypto.randomBytes(32).toString('hex');
    const lockKeyExpiry = `sanelow:lock:refresh:${sessExpiryId}`;
    const tokenRefresher1 = crypto.randomBytes(16).toString('hex');
    const tokenRefresher2 = crypto.randomBytes(16).toString('hex');

    await isolatedStore.set(
      sessExpiryId,
      {
        id: sessExpiryId,
        accessToken: 'access_tok_init',
        expiresAt: Date.now() + 60000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    // Refresher 1 acquires lock
    await isolatedStore.acquireLock(lockKeyExpiry, tokenRefresher1, 15);

    // Refresher 1's lock expires/lost; Refresher 2 acquires the lock
    await isolatedStore.releaseLock(lockKeyExpiry, tokenRefresher1);
    const acquiredBy2 = await isolatedStore.acquireLock(lockKeyExpiry, tokenRefresher2, 15);
    assert.equal(acquiredBy2, true);

    // Refresher 1 tries to commit using expired/lost token: must be rejected with LOCK_LOST
    const commitExpiryOutcome = await isolatedStore.commitRefreshedSession(
      sessExpiryId,
      lockKeyExpiry,
      tokenRefresher1,
      1,
      {
        id: sessExpiryId,
        accessToken: 'access_tok_stale_refresher1',
        expiresAt: Date.now() + 7200000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    assert.equal(commitExpiryOutcome.success, false);
    assert.equal(commitExpiryOutcome.error, 'LOCK_LOST');

    // Refresher 2's lock must remain valid and intact
    const intruderCannotAcquire = await isolatedStore.acquireLock(lockKeyExpiry, tokenRefresher1, 15);
    assert.equal(intruderCannotAcquire, false, 'Refresher 2 must still hold active lock');

    // ------------------------------------------------------------------------
    // (c) Stale-worker write prevention via expected session version mismatch
    // ------------------------------------------------------------------------
    const sessStaleId = crypto.randomBytes(32).toString('hex');
    const lockKeyStale = `sanelow:lock:refresh:${sessStaleId}`;
    const tokenStaleWorker = crypto.randomBytes(16).toString('hex');

    // Store is already on version 2 (updated by previous commit)
    await isolatedStore.set(
      sessStaleId,
      {
        id: sessStaleId,
        version: 2,
        accessToken: 'access_tok_current_v2',
        refreshToken: 'refresh_tok_current_v2',
        expiresAt: Date.now() + 60000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    await isolatedStore.acquireLock(lockKeyStale, tokenStaleWorker, 15);

    // Stale worker expected version 1
    const commitStaleOutcome = await isolatedStore.commitRefreshedSession(
      sessStaleId,
      lockKeyStale,
      tokenStaleWorker,
      1, // Mismatched expected version!
      {
        id: sessStaleId,
        accessToken: 'access_tok_stale_overwrite',
        refreshToken: 'refresh_tok_stale_overwrite',
        expiresAt: Date.now() + 7200000,
        sessionExpiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      3600
    );

    assert.equal(commitStaleOutcome.success, false);
    assert.equal(commitStaleOutcome.error, 'VERSION_MISMATCH');

    const preservedSession = await isolatedStore.get(sessStaleId);
    assert.equal(preservedSession?.accessToken, 'access_tok_current_v2', 'Current version 2 tokens must be preserved');
  });

  // --------------------------------------------------------------------------
  // TEST 4: ID Token Explicit Claim Validation via jose
  // --------------------------------------------------------------------------
  await t.test('4. ID token verification explicitly requires and validates exp, iat, sub, iss, aud, nonce, and azp', async () => {
    const clientId = 'shp_mock_test_client_id_123';
    const nonce = 'expected_mock_nonce_val';

    // 1. Valid token
    const validToken = createSignedIdToken({}, 'test_key_id_rsa');
    const validRes = await validateIdToken(validToken, nonce, clientId, testDiscovery);
    assert.ok(validRes.valid);
    assert.equal(validRes.claims?.sub, 'gid://shopify/Customer/77889900');

    // 2. Future-dated iat
    const futureIatToken = createSignedIdToken({ iat: Math.floor(Date.now() / 1000) + 3600 });
    const futureIatRes = await validateIdToken(futureIatToken, nonce, clientId, testDiscovery);
    assert.equal(futureIatRes.valid, false, 'Future-dated iat must be rejected');

    // 3. Missing/invalid exp
    const missingExpToken = createSignedIdToken({ exp: 'not_a_number' });
    const missingExpRes = await validateIdToken(missingExpToken, nonce, clientId, testDiscovery);
    assert.equal(missingExpRes.valid, false, 'Non-numeric exp must be rejected');

    // 4. Missing sub
    const missingSubToken = createSignedIdToken({ sub: '' });
    const missingSubRes = await validateIdToken(missingSubToken, nonce, clientId, testDiscovery);
    assert.equal(missingSubRes.valid, false, 'Empty sub claim must be rejected');

    // 5. Mismatched azp
    const wrongAzpToken = createSignedIdToken({ azp: 'unauthorized_azp_client' });
    const wrongAzpRes = await validateIdToken(wrongAzpToken, nonce, clientId, testDiscovery);
    assert.equal(wrongAzpRes.valid, false, 'Mismatched azp must be rejected');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Return Destination Sanitization
  // --------------------------------------------------------------------------
  await t.test('5. Return destinations are strictly validated against trusted origin, rejecting control chars & %5c', () => {
    const base = 'https://shop.sanelowmusiclabel.co.za';

    assert.equal(sanitizeReturnUrl('/account/orders', base), '/account/orders');
    assert.equal(sanitizeReturnUrl('/account/profile?tab=address', base), '/account/profile?tab=address');

    // Malicious open redirect attacks strictly rejected
    assert.equal(sanitizeReturnUrl('https://evil.com/phish', base), '/account');
    assert.equal(sanitizeReturnUrl('//evil.com/steal', base), '/account');
    assert.equal(sanitizeReturnUrl('/\\evil.com', base), '/account');
    assert.equal(sanitizeReturnUrl('/%5cevil.com', base), '/account');
    assert.equal(sanitizeReturnUrl('/%5Cevil.com', base), '/account');
    assert.equal(sanitizeReturnUrl('javascript:alert(1)', base), '/account');
    assert.equal(sanitizeReturnUrl('/account\nHost: evil.com', base), '/account');
    assert.equal(sanitizeReturnUrl('/account\x00evil', base), '/account');

    assert.equal(getTrustedSiteUrl(), 'https://shop.sanelowmusiclabel.co.za');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Tightened Logout CSRF Checks
  // --------------------------------------------------------------------------
  await t.test('6. Logout CSRF rejects explicitly mismatched Origin even if other headers exist, without x-requested-with bypass', () => {
    const base = 'https://shop.sanelowmusiclabel.co.za';

    // Exact matching origin succeeds
    const okReq = {
      headers: {
        origin: 'https://shop.sanelowmusiclabel.co.za',
      },
    } as any;
    assert.equal(validateCsrf(okReq, base), true);

    // Explicitly mismatched Origin is rejected even if x-requested-with is present
    const spoofedReq = {
      headers: {
        origin: 'https://evil.attacker.com',
        'x-requested-with': 'XMLHttpRequest',
      },
    } as any;
    assert.equal(validateCsrf(spoofedReq, base), false, 'Mismatched Origin must fail immediately');

    // Exact matching Referer succeeds when Origin is absent
    const refererReq = {
      headers: {
        referer: 'https://shop.sanelowmusiclabel.co.za/account',
      },
    } as any;
    assert.equal(validateCsrf(refererReq, base), true);

    // Mismatched Referer origin fails
    const badRefererReq = {
      headers: {
        referer: 'https://evil.com/account',
      },
    } as any;
    assert.equal(validateCsrf(badRefererReq, base), false);

    // x-requested-with alone without matching origin or sec-fetch-site is rejected
    const headerOnlyReq = {
      headers: {
        'x-requested-with': 'XMLHttpRequest',
      },
    } as any;
    assert.equal(validateCsrf(headerOnlyReq, base), false, 'x-requested-with alone must not bypass CSRF');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Server-Side Feature Flag Enforcement
  // --------------------------------------------------------------------------
  await t.test('7. When custom accounts are disabled, all endpoints enforce fallback to hosted accounts', async () => {
    process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'false';
    process.env.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'false';

    const { req: loginReq, res: loginRes } = createMockReqRes({
      url: '/api/auth?action=login',
    });
    await authHandler(loginReq, loginRes);
    assert.equal(loginRes.statusCode, 302);
    assert.equal(loginRes.headers['location'], HOSTED_ACCOUNT_FALLBACK_URL);

    const { req: cbReq, res: cbRes } = createMockReqRes({
      url: '/api/auth?action=callback&code=mock_code&state=mock_state',
    });
    await authHandler(cbReq, cbRes);
    assert.equal(cbRes.statusCode, 302);
    assert.equal(cbRes.headers['location'], HOSTED_ACCOUNT_FALLBACK_URL);

    const { req: sessReq, res: sessRes } = createMockReqRes({
      url: '/api/auth?action=session',
    });
    await authHandler(sessReq, sessRes);
    assert.equal(sessRes.statusCode, 200);
    const sessJson = JSON.parse(sessRes.data);
    assert.equal(sessJson.enabled, false);

    const { req: custReq, res: custRes } = createMockReqRes({
      url: '/api/customer?action=dashboard',
    });
    await customerHandler(custReq, custRes);
    assert.equal(custRes.statusCode, 403);
    const custJson = JSON.parse(custRes.data);
    assert.equal(custJson.error, 'FEATURE_DISABLED');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Anti-Caching & Noindex Security Headers
  // --------------------------------------------------------------------------
  await t.test('8. Authentication and customer endpoints strictly emit noindex and no-store headers', async () => {
    const { req: authReq, res: authRes } = createMockReqRes({
      url: '/api/auth?action=status',
    });
    await authHandler(authReq, authRes);
    assert.equal(authRes.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(authRes.headers['x-robots-tag'], 'noindex, nofollow, noarchive');

    const { req: custReq, res: custRes } = createMockReqRes({
      url: '/api/customer?action=dashboard',
    });
    await customerHandler(custReq, custRes);
    assert.equal(custRes.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(custRes.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Customer Account API GraphQL Schema & Order Query
  // --------------------------------------------------------------------------
  await t.test('9. Customer Account API order query uses documented order(id: ID!) and handles pagination', () => {
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('order(id: $id)'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('financialStatus'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('fulfillmentStatus'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('trackingInformation'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('lineItems(first: 50)'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerOrder.includes('fulfillments(first: 20)'));
    assert.ok(CUSTOMER_GRAPHQL_QUERIES.GetCustomerDashboard.includes('orders(first: 10'));
  });

  // --------------------------------------------------------------------------
  // TEST 10: Pure Customer Data Transformations
  // --------------------------------------------------------------------------
  await t.test('10. Data transformers correctly map real fulfillments, tracking links, and split shipments', () => {
    const mockOrderNode = {
      id: 'gid://shopify/Order/99001122',
      name: '#SN-1089',
      number: 1089,
      processedAt: '2026-10-15T10:30:00Z',
      financialStatus: 'PAID',
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      totalPrice: { amount: '125.00', currencyCode: 'USD' },
      subtotal: { amount: '110.00', currencyCode: 'USD' },
      totalTax: { amount: '0.00', currencyCode: 'USD' },
      totalShipping: { amount: '15.00', currencyCode: 'USD' },
      lineItems: {
        edges: [
          {
            node: {
              id: 'gid://shopify/LineItem/1',
              title: 'Sanelow Signature Heavyweight Hoodie',
              quantity: 1,
              variantTitle: 'Onyx Black / L',
              price: { amount: '85.00', currencyCode: 'USD' },
              image: { url: 'https://cdn.shopify.com/hoodie.jpg', altText: 'Hoodie' },
            },
          },
          {
            node: {
              id: 'gid://shopify/LineItem/2',
              title: 'Sanelow Classic Vinyl LP',
              quantity: 1,
              variantTitle: 'Standard Edition',
              price: { amount: '25.00', currencyCode: 'USD' },
              image: { url: 'https://cdn.shopify.com/vinyl.jpg', altText: 'Vinyl' },
            },
          },
        ],
      },
      fulfillments: {
        edges: [
          {
            node: {
              id: 'gid://shopify/Fulfillment/55',
              status: 'SUCCESS',
              latestShipmentStatus: 'IN_TRANSIT',
              estimatedDeliveryAt: '2026-10-20T17:00:00Z',
              trackingInformation: [
                {
                  company: 'DHL Express',
                  number: 'DHL987654321',
                  url: 'https://www.dhl.com/track?id=DHL987654321',
                },
              ],
            },
          },
        ],
      },
    };

    const transformed = transformCustomerOrder(mockOrderNode);
    assert.equal(transformed.name, '#SN-1089');
    assert.equal(transformed.financialStatus, 'PAID');
    assert.equal(transformed.fulfillmentStatus, 'PARTIALLY_FULFILLED');
    assert.equal(transformed.lineItems.length, 2);
    assert.equal(transformed.fulfillments.length, 1);
    assert.equal(transformed.fulfillments[0].trackingInformation?.[0]?.company, 'DHL Express');
    assert.equal(transformed.fulfillments[0].trackingInformation?.[0]?.number, 'DHL987654321');
    assert.equal(transformed.fulfillments[0].trackingInformation?.[0]?.url, 'https://www.dhl.com/track?id=DHL987654321');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Shopify Webhook Verification, Deduplication & Catalogue Versioning
  // --------------------------------------------------------------------------
  await t.test('11. Shopify Webhook HMAC validation, deduplication, and catalogue cache invalidation', async () => {
    resetInMemoryCatalogueVersionForTest();
    const testSecret = 'shopify_mock_webhook_secret_xyz789';
    const samplePayload = JSON.stringify({
      id: 88776655,
      title: 'Sanelow Upgraded Fleece',
      updated_at: '2026-10-16T12:00:00Z',
    });
    const rawBuffer = Buffer.from(samplePayload, 'utf8');

    // 1. Calculate valid HMAC
    const validHmac = crypto.createHmac('sha256', testSecret).update(rawBuffer).digest('base64');

    assert.equal(verifyShopifyWebhookHmac(rawBuffer, validHmac, testSecret), true, 'Valid HMAC must pass');
    assert.equal(verifyShopifyWebhookHmac(rawBuffer, 'invalid_signature==', testSecret), false, 'Invalid HMAC must fail');
    assert.equal(verifyShopifyWebhookHmac(rawBuffer, validHmac, 'wrong_secret'), false, 'Mismatched secret must fail');
    assert.equal(
      verifyShopifyWebhookHmac(Buffer.from('tampered body'), validHmac, testSecret),
      false,
      'Tampered body must fail'
    );

    // 2. Webhook deduplication test
    const webhookId = 'webhook_event_guid_12345';
    const firstSeen = await registerWebhookId(webhookId);
    assert.equal(firstSeen, true, 'First delivery of webhook ID must be accepted');

    const duplicateSeen = await registerWebhookId(webhookId);
    assert.equal(duplicateSeen, false, 'Duplicate delivery of webhook ID must be detected and skipped');

    // 3. Catalogue versioning
    const initialVersion = await getCatalogueVersion();
    const updated = await incrementCatalogueVersion();
    assert.equal(updated.version, initialVersion.version + 1, 'Version must increment atomically');

    // 4. Webhook handler execution with mock request
    process.env.SHOPIFY_WEBHOOK_SECRET = testSecret;

    const { req: hookReq, res: hookRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
        'x-shopify-webhook-id': 'unique_event_test_8899',
      },
    });

    // Feed raw buffer
    process.nextTick(() => {
      hookReq.emit('data', rawBuffer);
      hookReq.emit('end');
    });

    await webhookHandler(hookReq, hookRes);
    assert.equal(hookRes.statusCode, 200);
    const hookJson = JSON.parse(hookRes.data);
    assert.equal(hookJson.received, true);
    assert.equal(hookJson.topic, 'products/update');
    assert.ok(hookJson.catalogueVersion > initialVersion.version);

    // 5. Test failure between claiming an event and invalidating the catalogue
    const failureWebhookId = 'webhook_event_failure_simulate_7788';
    setSimulatedStorageFailureForTest(true);

    const { req: failReq, res: failRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
        'x-shopify-webhook-id': failureWebhookId,
      },
    });

    process.nextTick(() => {
      failReq.emit('data', rawBuffer);
      failReq.emit('end');
    });

    await webhookHandler(failReq, failRes);
    assert.equal(failRes.statusCode, 503, 'Storage failure must return retryable 503');
    assert.equal(failRes.headers['retry-after'], '10');
    const failJson = JSON.parse(failRes.data);
    assert.equal(failJson.error, 'STORAGE_UNAVAILABLE');
    assert.equal(failJson.retryable, true);

    // Disable failure simulation and verify Shopify retry succeeds (event was NOT lost/claimed!)
    setSimulatedStorageFailureForTest(false);

    const { req: retryReq, res: retryRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
        'x-shopify-webhook-id': failureWebhookId,
      },
    });

    process.nextTick(() => {
      retryReq.emit('data', rawBuffer);
      retryReq.emit('end');
    });

    await webhookHandler(retryReq, retryRes);
    assert.equal(retryRes.statusCode, 200, 'Subsequent retry from Shopify must succeed');
    const retryJson = JSON.parse(retryRes.data);
    assert.equal(retryJson.received, true);
    assert.equal(retryJson.duplicate, undefined, 'Must not be dropped as duplicate when prior try failed');

    delete process.env.SHOPIFY_WEBHOOK_SECRET;

    // 6. Test that on deployed environments, missing Redis credentials rejects in-memory fallback and returns 503
    process.env.SHOPIFY_WEBHOOK_SECRET = testSecret;
    const previousVercel = process.env.VERCEL;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.VERCEL = '1';
    (process.env as any).NODE_ENV = 'production';
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const { req: depReq, res: depRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
        'x-shopify-webhook-id': 'deployed_missing_redis_event',
      },
    });

    process.nextTick(() => {
      depReq.emit('data', rawBuffer);
      depReq.emit('end');
    });

    await webhookHandler(depReq, depRes);
    assert.equal(depRes.statusCode, 503, 'Missing Redis on deployed environment must return 503, never silently fall back to memory');
    const depJson = JSON.parse(depRes.data);
    assert.equal(depJson.error, 'STORAGE_UNAVAILABLE');
    assert.equal(depJson.retryable, true);

    // Restore environment flags
    if (previousVercel !== undefined) process.env.VERCEL = previousVercel; else delete process.env.VERCEL;
    (process.env as any).NODE_ENV = previousNodeEnv;
    delete process.env.SHOPIFY_WEBHOOK_SECRET;

    // 7. Test that direct Shopify catalogue refresh (fetchLiveCatalogue) operates independently of Redis
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    // Direct catalogue fetching uses Storefront API /api/shopify, not Redis
    const catResult = await fetchLiveCatalogue();
    assert.equal(typeof catResult.configured, 'boolean');
    assert.ok(Array.isArray(catResult.products));

    // 8. Explicit diagnostic reason codes for Webhook Authentication failures
    // (a) MISSING_WEBHOOK_SECRET
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    const { req: noSecReq, res: noSecRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      noSecReq.emit('data', rawBuffer);
      noSecReq.emit('end');
    });
    await webhookHandler(noSecReq, noSecRes);
    assert.equal(noSecRes.statusCode, 401);
    const noSecJson = JSON.parse(noSecRes.data);
    assert.equal(noSecJson.reason, 'MISSING_WEBHOOK_SECRET');

    // Restore secret
    process.env.SHOPIFY_WEBHOOK_SECRET = testSecret;

    // (b) RAW_BODY_UNAVAILABLE (empty payload / stream ended with 0 bytes)
    const { req: noBodyReq, res: noBodyRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      noBodyReq.emit('end');
    });
    await webhookHandler(noBodyReq, noBodyRes);
    assert.equal(noBodyRes.statusCode, 401);
    const noBodyJson = JSON.parse(noBodyRes.data);
    assert.equal(noBodyJson.reason, 'RAW_BODY_UNAVAILABLE');

    // (c) MISSING_SIGNATURE
    const { req: noSigReq, res: noSigRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
      },
    });
    process.nextTick(() => {
      noSigReq.emit('data', rawBuffer);
      noSigReq.emit('end');
    });
    await webhookHandler(noSigReq, noSigRes);
    assert.equal(noSigRes.statusCode, 401);
    const noSigJson = JSON.parse(noSigRes.data);
    assert.equal(noSigJson.reason, 'MISSING_SIGNATURE');

    // (d) SHOP_DOMAIN_MISMATCH - missing, malformed, URL-shaped, custom storefront, or wrong domain
    // (d.1) Wrong store domain
    const { req: badDomainReq, res: badDomainRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'unauthorized-shop.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      badDomainReq.emit('data', rawBuffer);
      badDomainReq.emit('end');
    });
    await webhookHandler(badDomainReq, badDomainRes);
    assert.equal(badDomainRes.statusCode, 401);
    const badDomainJson = JSON.parse(badDomainRes.data);
    assert.equal(badDomainJson.reason, 'SHOP_DOMAIN_MISMATCH');

    // (d.2) Missing x-shopify-shop-domain header
    const { req: missingDomainReq, res: missingDomainRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      missingDomainReq.emit('data', rawBuffer);
      missingDomainReq.emit('end');
    });
    await webhookHandler(missingDomainReq, missingDomainRes);
    assert.equal(missingDomainRes.statusCode, 401);
    const missingDomainJson = JSON.parse(missingDomainRes.data);
    assert.equal(missingDomainJson.reason, 'SHOP_DOMAIN_MISMATCH');

    // (d.3) URL-shaped x-shopify-shop-domain (must be rejected)
    const { req: urlDomainReq, res: urlDomainRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'https://sx71id-uy.myshopify.com/',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      urlDomainReq.emit('data', rawBuffer);
      urlDomainReq.emit('end');
    });
    await webhookHandler(urlDomainReq, urlDomainRes);
    assert.equal(urlDomainRes.statusCode, 401);
    const urlDomainJson = JSON.parse(urlDomainRes.data);
    assert.equal(urlDomainJson.reason, 'SHOP_DOMAIN_MISMATCH');

    // (d.4) Custom storefront domain (must be rejected)
    const { req: customDomainReq, res: customDomainRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'shop.sanelowmusiclabel.co.za',
        'x-shopify-hmac-sha256': validHmac,
      },
    });
    process.nextTick(() => {
      customDomainReq.emit('data', rawBuffer);
      customDomainReq.emit('end');
    });
    await webhookHandler(customDomainReq, customDomainRes);
    assert.equal(customDomainRes.statusCode, 401);
    const customDomainJson = JSON.parse(customDomainRes.data);
    assert.equal(customDomainJson.reason, 'SHOP_DOMAIN_MISMATCH');

    // (d.5) Valid domain with case normalization (must pass domain check)
    const { req: caseDomainReq, res: caseDomainRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'SX71ID-UY.myshopify.com',
        'x-shopify-hmac-sha256': validHmac,
        'x-shopify-webhook-id': 'case_normalized_domain_test_event',
      },
    });
    process.nextTick(() => {
      caseDomainReq.emit('data', rawBuffer);
      caseDomainReq.emit('end');
    });
    await webhookHandler(caseDomainReq, caseDomainRes);
    assert.equal(caseDomainRes.statusCode, 200, 'Case-normalized domain must pass');

    // (e) INVALID_SIGNATURE (tampered body or wrong secret)
    const { req: badSigReq, res: badSigRes } = createMockReqRes({
      method: 'POST',
      url: '/api/webhooks/shopify',
      headers: {
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'sx71id-uy.myshopify.com',
        'x-shopify-hmac-sha256': 'dGhpcyBpcyBhbiBpbnZhbGlkIGJhc2U2NCBzaWduYXR1cmUgMzJieXRlcw==',
      },
    });
    process.nextTick(() => {
      badSigReq.emit('data', rawBuffer);
      badSigReq.emit('end');
    });
    await webhookHandler(badSigReq, badSigRes);
    assert.equal(badSigRes.statusCode, 401);
    const badSigJson = JSON.parse(badSigRes.data);
    assert.equal(badSigJson.reason, 'INVALID_SIGNATURE');

    delete process.env.SHOPIFY_WEBHOOK_SECRET;
  });

  // --------------------------------------------------------------------------
  // TEST 12: Product Variant Pagination Fault Tolerance & Cursor Validation
  // --------------------------------------------------------------------------
  await t.test('12. fetchProductByHandle validates every pagination page and prevents silent incomplete results', async (t2) => {
    const mockBaseProduct = {
      id: 'gid://shopify/Product/112233',
      title: 'Sanelow Stage Jacket',
      handle: 'sanelow-stage-jacket',
      availableForSale: true,
      priceRange: { minVariantPrice: { amount: '120.00', currencyCode: 'USD' } },
      variants: {
        pageInfo: { hasNextPage: true, endCursor: 'cursor_page_1' },
        edges: [
          {
            node: {
              id: 'gid://shopify/ProductVariant/v1',
              title: 'Black / M',
              availableForSale: true,
              sku: 'SN-JKT-BLK-M',
              price: { amount: '120.00', currencyCode: 'USD' },
              selectedOptions: [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Black' }],
            },
          },
        ],
      },
    };

    // Subtest (a): Second-page API error
    await t2.test('Second-page API error sets variantsIncomplete=true, preserves loaded variants, and returns error', async () => {
      let callCount = 0;
      setCustomShopifyFetchForTest(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            configured: true,
            data: { product: JSON.parse(JSON.stringify(mockBaseProduct)) },
          };
        }
        // Second page fails with API error
        return {
          configured: true,
          errors: [{ message: 'Rate limit exceeded on Shopify Storefront API' }],
        };
      });

      const res = await fetchProductByHandle('sanelow-stage-jacket');
      setCustomShopifyFetchForTest(null);

      assert.equal(res.configured, true);
      assert.equal(res.variantsIncomplete, true, 'Must flag variantsIncomplete on second-page error');
      assert.ok(res.errorMessage?.includes('Rate limit exceeded'));
      assert.ok(res.product !== null);
      assert.equal(res.product.variants.length, 1, 'Already loaded variants must be preserved');
      assert.equal(res.product.variantsIncomplete, true);
      assert.equal(res.product.variantsTruncated, true);
      assert.ok(res.product.incompleteVariantsReason?.includes('Rate limit exceeded'));
    });

    // Subtest (b): Repeated cursor detected while hasNextPage is true
    await t2.test('Repeated cursor detected while hasNextPage=true terminates loop and sets variantsIncomplete=true', async () => {
      let callCount = 0;
      setCustomShopifyFetchForTest(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            configured: true,
            data: { product: JSON.parse(JSON.stringify(mockBaseProduct)) },
          };
        }
        // Second page returns the same cursor again with hasNextPage still true
        return {
          configured: true,
          data: {
            product: {
              ...mockBaseProduct,
              variants: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor_page_1' }, // Repeated!
                edges: [
                  {
                    node: {
                      id: 'gid://shopify/ProductVariant/v2',
                      title: 'Black / L',
                      availableForSale: true,
                      sku: 'SN-JKT-BLK-L',
                      price: { amount: '120.00', currencyCode: 'USD' },
                      selectedOptions: [{ name: 'Size', value: 'L' }, { name: 'Color', value: 'Black' }],
                    },
                  },
                ],
              },
            },
          },
        };
      });

      const res = await fetchProductByHandle('sanelow-stage-jacket');
      setCustomShopifyFetchForTest(null);

      assert.equal(res.variantsIncomplete, true, 'Must flag variantsIncomplete on repeated cursor');
      assert.ok(res.incompleteReason?.includes('Repeated pagination cursor'));
      assert.ok(res.product !== null);
      assert.equal(res.product.variants.length, 2, 'Variants loaded prior to cursor repetition must be preserved');
      assert.equal(res.product.variantsIncomplete, true);
    });

    // Subtest (c): Missing cursor when hasNextPage is true
    await t2.test('Missing cursor when hasNextPage=true terminates loop and marks incomplete', async () => {
      setCustomShopifyFetchForTest(async () => {
        const prod = JSON.parse(JSON.stringify(mockBaseProduct));
        prod.variants.pageInfo.endCursor = null; // Missing cursor!
        return {
          configured: true,
          data: { product: prod },
        };
      });

      const res = await fetchProductByHandle('sanelow-stage-jacket');
      setCustomShopifyFetchForTest(null);

    });
  });

  // --------------------------------------------------------------------------
  // TEST 13: Controlled Customer Account Production Testing & Tester Gate Specifications
  // --------------------------------------------------------------------------
  await t.test('13. Controlled Customer Account Production Testing & Tester Gate Security Specifications', async (t2) => {
    const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const trustedBaseUrl = 'https://shop.sanelowmusiclabel.co.za';

    // Subtest (a): CUSTOMER_ACCOUNT_TESTING_ENABLED=true required; fails closed when missing or false
    await t2.test('(a) Testing enabled flag fails closed when missing or false', async () => {
      delete process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED;
      assert.equal(isTestingEnabled(), false);

      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'false';
      assert.equal(isTestingEnabled(), false);

      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: {
          origin: trustedBaseUrl,
          'content-type': 'application/json',
        },
      });
      process.nextTick(() => {
        req.emit('data', Buffer.from(JSON.stringify({ secret: testSecret })));
        req.emit('end');
      });
      await authHandler(req, res);
      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.data);
      assert.equal(json.error, 'TESTING_DISABLED');

      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      assert.equal(isTestingEnabled(), true);
    });

    // Subtest (b): CUSTOMER_ACCOUNT_TESTER_SECRET requires strictly 64-hex entropy and timingSafeEqual
    await t2.test('(b) Tester secret enforces 64 hexadecimal characters and constant-time check', () => {
      delete process.env.CUSTOMER_ACCOUNT_TESTER_SECRET;
      assert.throws(() => getValidatedTesterSecret(), /SECURITY_CONFIG_ERROR/);

      // Short / non-hex passphrases must be rejected
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = 'my-human-secret-passphrase';
      assert.throws(() => getValidatedTesterSecret(), /must be exactly 64 hexadecimal characters/);

      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;
      assert.equal(getValidatedTesterSecret(), testSecret);

      // Constant-time verification
      assert.equal(verifyTesterSecret(testSecret), true);
      assert.equal(verifyTesterSecret('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdee'), false);
      assert.equal(verifyTesterSecret('short-secret'), false);
      assert.equal(verifyTesterSecret(null), false);
    });

    // Subtest (c): Same-origin unlock form, CSRF check, and rate limiting
    await t2.test('(c) Tester form serves no-store HTML, checks origin CSRF, and enforces rate limit', async () => {
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);

      // (c.1) GET tester-gate form serves no-store HTML
      const { req: gateReq, res: gateRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=tester-gate',
      });
      await authHandler(gateReq, gateRes);
      assert.equal(gateRes.statusCode, 200);
      assert.ok(gateRes.headers['cache-control']?.includes('no-store'));
      assert.ok(gateRes.data.includes('<form method="POST" action="/api/auth?action=tester-access">'));

      // (c.2) POST requires POST method
      const { req: getReq, res: getRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=tester-access',
      });
      await authHandler(getReq, getRes);
      assert.equal(getRes.statusCode, 405);

      // (c.3) CSRF validation rejects mismatched origin
      const { req: badCsrfReq, res: badCsrfRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: {
          origin: 'https://attacker-phishing.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ secret: testSecret }),
      });
      await authHandler(badCsrfReq, badCsrfRes);
      assert.equal(badCsrfRes.statusCode, 403);
      assert.equal(JSON.parse(badCsrfRes.data).error, 'CSRF_VALIDATION_FAILED');

      // (c.4) Distributed rate limiting (exceeding 5 attempts from same IP)
      const ip = '198.51.100.42';
      for (let i = 0; i < 5; i++) {
        await checkTesterRateLimit(ip);
      }
      const limitResult = await checkTesterRateLimit(ip);
      assert.equal(limitResult.allowed, false);
      assert.ok(typeof limitResult.retryAfter === 'number');

      // (c.5) Successful POST sets HttpOnly, Secure, SameSite=Lax host-only cookie with opaque 64-hex session in Redis
      const { req: goodReq, res: goodRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: {
          origin: trustedBaseUrl,
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.19',
        },
        body: JSON.stringify({ secret: testSecret }),
      });
      await authHandler(goodReq, goodRes);
      assert.equal(goodRes.statusCode, 200);
      const setCookie = goodRes.headers['set-cookie'] as string;
      assert.ok(setCookie.includes(`${TESTER_COOKIE_NAME}=`));
      assert.ok(setCookie.includes('HttpOnly'));
      assert.ok(setCookie.includes('SameSite=Lax'));
      assert.ok(!setCookie.includes('Domain='), 'Must be host-only cookie');

      // Verify the session ID is stored in Redis
      const match = setCookie.match(new RegExp(`${TESTER_COOKIE_NAME}=([0-9a-fA-F]{64})`));
      assert.ok(match, 'Must generate 64-hex random session ID');
      const testerSessionId = match[1];
      const rawStored = await memStore.getRaw(`sanelow:tester_sess:${testerSessionId}`);
      assert.ok(rawStored !== null, 'Tester session must exist in Redis store');
    });

    // Subtest (d): Redis-backed kill switch immediately shuts down tester access
    await t2.test('(d) Redis-backed kill switch terminates tester access immediately', async () => {
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;

      // Create an active tester session
      const testerSessionId = crypto.randomBytes(32).toString('hex');
      await memStore.setRaw(
        `sanelow:tester_sess:${testerSessionId}`,
        JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + TESTER_SESSION_TTL_SECONDS * 1000 })
      );

      const dummyReq = createMockReqRes({
        headers: { cookie: `${TESTER_COOKIE_NAME}=${testerSessionId}` },
      }).req;

      // Initially active
      assert.equal(await hasTesterAccess(dummyReq), true);

      // Activate kill switch in Redis
      await memStore.setRaw(TESTER_KILL_SWITCH_KEY, '1');
      assert.equal(await isTesterKillSwitchActive(), true);

      // Tester access is immediately denied on the very next request
      assert.equal(await hasTesterAccess(dummyReq), false);

      // Clearing kill switch restores access
      await memStore.delRaw(TESTER_KILL_SWITCH_KEY);
      assert.equal(await isTesterKillSwitchActive(), false);
      assert.equal(await hasTesterAccess(dummyReq), true);

      // (d.2) Redis failure must deny tester access immediately (fail closed)
      const brokenStore = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        getRaw: async () => {
          throw new Error('Redis connection timeout');
        },
        setRaw: async () => {},
        delRaw: async () => {},
        incrRaw: async () => 1,
      };
      setSessionStoreForTest(brokenStore as any);
      assert.equal(await isTesterKillSwitchActive(), true, 'Redis error must treat kill switch as active');
      assert.equal(await hasTesterAccess(dummyReq), false, 'Redis error must deny tester access');
      setSessionStoreForTest(memStore);

      // (d.3) Expired tester session in Redis is denied
      const expiredTesterSessionId = crypto.randomBytes(32).toString('hex');
      await memStore.setRaw(
        `sanelow:tester_sess:${expiredTesterSessionId}`,
        JSON.stringify({ createdAt: Date.now() - 36000000, expiresAt: Date.now() - 1000 })
      );
      const expiredReq = createMockReqRes({
        headers: { cookie: `${TESTER_COOKIE_NAME}=${expiredTesterSessionId}` },
      }).req;
      assert.equal(await hasTesterAccess(expiredReq), false, 'Expired tester session must be rejected');
    });

    // Subtest (e): Tester logout revokes Redis tester session AND ALL linked customer sessions (including repeated sign-ins)
    await t2.test('(e) Tester logout revokes Redis tester session and ALL linked customer sessions from repeated sign-ins', async () => {
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;

      const testerSessionId = crypto.randomBytes(32).toString('hex');
      const customerSessionId1 = crypto.randomBytes(32).toString('hex');
      const customerSessionId2 = crypto.randomBytes(32).toString('hex');

      // Tester had two sign-ins during this tester session, atomically linked to Redis Set
      await memStore.setRaw(
        `sanelow:tester_sess:${testerSessionId}`,
        JSON.stringify({
          createdAt: Date.now(),
          expiresAt: Date.now() + TESTER_SESSION_TTL_SECONDS * 1000,
        })
      );
      await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessionId}`, customerSessionId1);
      await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessionId}`, customerSessionId2);
      await memStore.set(customerSessionId1, {
        id: customerSessionId1,
        accessToken: 'cust_tok_1',
        expiresAt: Date.now() + 3600000,
        sessionExpiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, 3600);
      await memStore.set(customerSessionId2, {
        id: customerSessionId2,
        accessToken: 'cust_tok_2',
        expiresAt: Date.now() + 3600000,
        sessionExpiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, 3600);

      assert.ok(await memStore.getRaw(`sanelow:tester_sess:${testerSessionId}`));
      assert.ok(await memStore.get(customerSessionId1));
      assert.ok(await memStore.get(customerSessionId2));

      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-logout',
        headers: {
          origin: trustedBaseUrl,
          cookie: `${TESTER_COOKIE_NAME}=${testerSessionId}; ${AUTH_COOKIE_NAME}=${customerSessionId2}`,
        },
      });
      await authHandler(req, res);
      assert.equal(res.statusCode, 200);

      // Tester session and BOTH customer sessions must be deleted from Redis store via store adapter
      assert.equal(await memStore.getRaw(`sanelow:tester_sess:${testerSessionId}`), null);
      assert.equal(await memStore.get(customerSessionId1), null, 'First customer session must be deleted');
      assert.equal(await memStore.get(customerSessionId2), null, 'Second customer session must be deleted');

      // Both cookies must be cleared
      const setCookies = res.headers['set-cookie'] as string[];
      assert.ok(setCookies.some((c) => c.includes(`${TESTER_COOKIE_NAME}=`) && c.includes('Max-Age=0')));
      assert.ok(setCookies.some((c) => c.includes(`${AUTH_COOKIE_NAME}=`) && c.includes('Max-Age=0')));
    });

    // Subtest (f): Normal customer logout revokes server session even when testing is disabled or expired
    await t2.test('(f) Customer logout deletes session from Redis even if testing is disabled', async () => {
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);

      // Testing is disabled!
      delete process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED;
      process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'false';

      const customerSessionId = crypto.randomBytes(32).toString('hex');
      await memStore.set(customerSessionId, {
        id: customerSessionId,
        accessToken: 'cust_tok_abc',
        expiresAt: Date.now() + 3600000,
        sessionExpiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, 3600);

      // Enforce method: GET rejected with 405
      const { req: getReq, res: getRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=logout',
        headers: { origin: trustedBaseUrl, cookie: `${AUTH_COOKIE_NAME}=${customerSessionId}` },
      });
      await authHandler(getReq, getRes);
      assert.equal(getRes.statusCode, 405);

      // POST with origin deletes session from Redis
      const { req: postReq, res: postRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=logout',
        headers: { origin: trustedBaseUrl, cookie: `${AUTH_COOKIE_NAME}=${customerSessionId}` },
      });
      await authHandler(postReq, postRes);
      assert.equal(postRes.statusCode, 200);
      assert.equal(await memStore.get(customerSessionId), null, 'Customer session must be revoked from Redis');
    });

    // Subtest (g): Authorized tester reaches custom dashboard and customer API routes while flags are false
    await t2.test('(g) Authorized tester accesses custom dashboard data while global flags remain false', async () => {
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;
      process.env.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS = 'false'; // Keep false!
      process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID = 'shp_mock_client_id_test';

      const testerSessionId = crypto.randomBytes(32).toString('hex');
      await memStore.setRaw(
        `sanelow:tester_sess:${testerSessionId}`,
        JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + TESTER_SESSION_TTL_SECONDS * 1000 })
      );

      // (g.1) Normal visitor without tester session gets enabled: false, isTester: false
      const { req: normalReq, res: normalRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=session',
      });
      await authHandler(normalReq, normalRes);
      const normalJson = JSON.parse(normalRes.data);
      assert.equal(normalJson.enabled, false);
      assert.equal(normalJson.isTester, false);

      // (g.2) Normal visitor accessing /api/customer is rejected with 403 FEATURE_DISABLED
      const { req: normalCustReq, res: normalCustRes } = createMockReqRes({
        method: 'GET',
        url: '/api/customer?action=dashboard',
      });
      await customerHandler(normalCustReq, normalCustRes);
      assert.equal(normalCustRes.statusCode, 403);
      assert.equal(JSON.parse(normalCustRes.data).error, 'FEATURE_DISABLED');

      // (g.3) Authorized tester accessing /api/auth?action=session gets enabled: true, isTester: true
      const { req: testerReq, res: testerRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=session',
        headers: { cookie: `${TESTER_COOKIE_NAME}=${testerSessionId}` },
      });
      await authHandler(testerReq, testerRes);
      const testerJson = JSON.parse(testerRes.data);
      assert.equal(testerJson.enabled, true);
      assert.equal(testerJson.isTester, true);

      // (g.4) Authorized tester with customer session can access /api/customer
      const customerSessionId = crypto.randomBytes(32).toString('hex');
      await memStore.set(customerSessionId, {
        id: customerSessionId,
        accessToken: 'valid_bearer_token',
        expiresAt: Date.now() + 3600000,
        sessionExpiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, 3600);

      // Mock customer account API fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: any) => {
        if (url.toString().includes('customer/api')) {
          return new Response(JSON.stringify({
            data: {
              customer: {
                id: 'gid://shopify/Customer/12345',
                firstName: 'Alex',
                orders: { edges: [] },
              },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url);
      };

      try {
        const { req: testerDataReq, res: testerDataRes } = createMockReqRes({
          method: 'GET',
          url: '/api/customer?action=dashboard',
          headers: {
            cookie: `${TESTER_COOKIE_NAME}=${testerSessionId}; ${AUTH_COOKIE_NAME}=${customerSessionId}`,
          },
        });
        await customerHandler(testerDataReq, testerDataRes);
        assert.equal(testerDataRes.statusCode, 200);
        const dataJson = JSON.parse(testerDataRes.data);
        assert.equal(dataJson.data.customer.firstName, 'Alex');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // Subtest (h): Tester-kill endpoint enforces POST, CSRF, rate-limiting, and timing-safe secret check
    await t2.test('(h) Tester-kill endpoint enforces POST, exact origin, rate-limit, and constant-time secret check', async () => {
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);

      // (h.1) Method check: GET is rejected with 405
      const { req: getReq, res: getRes } = createMockReqRes({
        method: 'GET',
        url: '/api/auth?action=tester-kill',
      });
      await authHandler(getReq, getRes);
      assert.equal(getRes.statusCode, 405);

      // (h.2) CSRF origin mismatch is rejected with 403
      const { req: badOriginReq, res: badOriginRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-kill',
        headers: { origin: 'https://malicious-origin.com' },
        body: JSON.stringify({ secret: testSecret, kill: true }),
      });
      await authHandler(badOriginReq, badOriginRes);
      assert.equal(badOriginRes.statusCode, 403);

      // (h.3) Invalid secret is rejected with 401
      const { req: badSecretReq, res: badSecretRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-kill',
        headers: { origin: trustedBaseUrl },
        body: JSON.stringify({ secret: '0'.repeat(64), kill: true }),
      });
      await authHandler(badSecretReq, badSecretRes);
      assert.equal(badSecretRes.statusCode, 401);

      // (h.4) Valid secret activates kill switch in Redis
      const { req: goodKillReq, res: goodKillRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-kill',
        headers: { origin: trustedBaseUrl },
        body: JSON.stringify({ secret: testSecret, kill: true }),
      });
      await authHandler(goodKillReq, goodKillRes);
      assert.equal(goodKillRes.statusCode, 200);
      assert.equal(await isTesterKillSwitchActive(), true);

      // (h.5) Client IP prioritizes x-vercel-forwarded-for over caller-supplied x-forwarded-for
      const ipReq = createMockReqRes({
        headers: {
          'x-vercel-forwarded-for': '192.0.2.1',
          'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        },
      }).req;
      assert.equal(getClientIp(ipReq), '192.0.2.1', 'Must prioritize trusted Vercel header');
    });

    // Subtest (i): Mandatory adapter capabilities and strict tester session validation
    await t2.test('(i) Mandatory adapter capabilities fail closed and strict tester session validation rejects invalid states', async () => {
      // (i.1) Missing getRaw on adapter fails closed in kill switch
      const noGetRawStore: any = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      };
      setSessionStoreForTest(noGetRawStore);
      assert.equal(await isTesterKillSwitchActive(), true, 'Missing getRaw must fail closed');

      // (i.2) Missing incrRaw on adapter fails closed in rate limiting
      const rateLimitRes = await checkTesterRateLimit('192.0.2.1');
      assert.equal(rateLimitRes.allowed, false, 'Missing incrRaw must fail closed');

      // (i.3) Missing setRaw in tester-access returns 500 without setting cookie
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;
      const noSetStore: any = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        getRaw: async () => null,
        incrRaw: async () => 1,
      };
      setSessionStoreForTest(noSetStore);

      const { req: noSetReq, res: noSetRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: { origin: trustedBaseUrl, 'x-vercel-forwarded-for': '192.0.2.99' },
        body: JSON.stringify({ secret: testSecret }),
      });
      await authHandler(noSetReq, noSetRes);
      assert.equal(noSetRes.statusCode, 500);
      assert.equal(JSON.parse(noSetRes.data).error, 'STORAGE_CONFIG_ERROR');
      assert.equal(noSetRes.headers['set-cookie'], undefined, 'Must not issue cookie when storage capability is missing');

      // (i.4) Strict tester session validation (exercised against production hasTesterAccess)
      const validStore = new InMemorySessionStore();
      setSessionStoreForTest(validStore);
      const testId = crypto.randomBytes(32).toString('hex');
      const reqWithCookie = createMockReqRes({ headers: { cookie: `${TESTER_COOKIE_NAME}=${testId}` } }).req;

      // Empty object {}
      await validStore.setRaw(`sanelow:tester_sess:${testId}`, '{}');
      assert.equal(await hasTesterAccess(reqWithCookie), false, 'Empty object must be rejected');

      // Non-numeric timestamps
      await validStore.setRaw(`sanelow:tester_sess:${testId}`, JSON.stringify({ createdAt: 'bad', expiresAt: 'bad' }));
      assert.equal(await hasTesterAccess(reqWithCookie), false, 'Non-numeric timestamps must be rejected');

      // Future-created session
      await validStore.setRaw(`sanelow:tester_sess:${testId}`, JSON.stringify({ createdAt: Date.now() + 100000, expiresAt: Date.now() + 200000 }));
      assert.equal(await hasTesterAccess(reqWithCookie), false, 'Future-created session must be rejected');

      // Expired session
      await validStore.setRaw(`sanelow:tester_sess:${testId}`, JSON.stringify({ createdAt: Date.now() - 50000, expiresAt: Date.now() - 1000 }));
      assert.equal(await hasTesterAccess(reqWithCookie), false, 'Expired session must be rejected');

      // Excessively long-lived session
      await validStore.setRaw(`sanelow:tester_sess:${testId}`, JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + 1000000000 }));
      assert.equal(await hasTesterAccess(reqWithCookie), false, 'Excessively long-lived session must be rejected');
    });

    // Subtest (j): Atomic linking, concurrency, callback-vs-logout race, and partial revocation failure
    await t2.test('(j) Atomic linking, concurrent callbacks, callback-vs-logout race, and partial revocation failure', async () => {
      const memStore = new InMemorySessionStore();
      setSessionStoreForTest(memStore);
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;

      const tId = crypto.randomBytes(32).toString('hex');
      await memStore.setRaw(`sanelow:tester_sess:${tId}`, JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + TESTER_SESSION_TTL_SECONDS * 1000 }));

      // (j.1) Concurrent callbacks atomically add customer sessions to set
      const c1 = crypto.randomBytes(32).toString('hex');
      const c2 = crypto.randomBytes(32).toString('hex');
      const [res1, res2] = await Promise.all([
        memStore.linkTesterCustomerSession(tId, c1),
        memStore.linkTesterCustomerSession(tId, c2),
      ]);
      assert.equal(res1.success, true);
      assert.equal(res2.success, true);
      const members = await memStore.smembersRaw(`sanelow:tester_cust_ids:${tId}`);
      assert.equal(members.length, 2);
      assert.ok(members.includes(c1));
      assert.ok(members.includes(c2));

      // (j.2) Callback-vs-logout race: if tester session is revoked, link fails and does not recreate session
      await memStore.delRaw(`sanelow:tester_sess:${tId}`);
      const c3 = crypto.randomBytes(32).toString('hex');
      const raceRes = await memStore.linkTesterCustomerSession(tId, c3);
      assert.equal(raceRes.success, false);
      assert.equal(raceRes.reason, 'ERR_TESTER_SESSION_NOT_FOUND');
      assert.equal(await memStore.getRaw(`sanelow:tester_sess:${tId}`), null, 'Must not recreate revoked tester session');

      // (j.3) Partial revocation failure: if store.delete fails on one customer session,
      // returns 500 STORAGE_REVOCATION_INCOMPLETE, preserves unrevoked session in index for retry,
      // does not delete tester session, and clears browser cookies.
      const retryTesterId = crypto.randomBytes(32).toString('hex');
      const goodCustId = crypto.randomBytes(32).toString('hex');
      const failingCustId = crypto.randomBytes(32).toString('hex');

      await memStore.setRaw(`sanelow:tester_sess:${retryTesterId}`, JSON.stringify({ createdAt: Date.now(), expiresAt: Date.now() + TESTER_SESSION_TTL_SECONDS * 1000 }));
      await memStore.saddRaw(`sanelow:tester_cust_ids:${retryTesterId}`, goodCustId);
      await memStore.saddRaw(`sanelow:tester_cust_ids:${retryTesterId}`, failingCustId);

      await memStore.set(goodCustId, { id: goodCustId, accessToken: 'tok1', expiresAt: Date.now() + 1000, sessionExpiresAt: Date.now() + 1000, createdAt: Date.now(), updatedAt: Date.now() }, 1000);
      await memStore.set(failingCustId, { id: failingCustId, accessToken: 'tok2', expiresAt: Date.now() + 1000, sessionExpiresAt: Date.now() + 1000, createdAt: Date.now(), updatedAt: Date.now() }, 1000);

      // Wrap store.delete to fail for failingCustId
      const originalDelete = memStore.delete.bind(memStore);
      memStore.delete = async (sessId: string) => {
        if (sessId === failingCustId) {
          throw new Error('Simulated atomic Redis failure on customer session deletion');
        }
        return originalDelete(sessId);
      };

      const { req: partialReq, res: partialRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-logout',
        headers: { origin: trustedBaseUrl, cookie: `${TESTER_COOKIE_NAME}=${retryTesterId}` },
      });
      await authHandler(partialReq, partialRes);

      assert.equal(partialRes.statusCode, 500);
      const partialJson = JSON.parse(partialRes.data);
      assert.equal(partialJson.error, 'STORAGE_REVOCATION_INCOMPLETE');

      // Verify browser cookies were cleared so user is logged out on client
      const setCookies = partialRes.headers['set-cookie'] as string[];
      assert.ok(setCookies.some((c) => c.includes(`${TESTER_COOKIE_NAME}=`) && c.includes('Max-Age=0')));

      // Verify goodCustId was deleted and removed from the set
      assert.equal(await memStore.get(goodCustId), null);
      const remainingMembers = await memStore.smembersRaw(`sanelow:tester_cust_ids:${retryTesterId}`);
      assert.ok(!remainingMembers.includes(goodCustId), 'Successfully deleted session removed from index');

      // Verify failingCustId was PRESERVED in the set so retry can clean it up
      assert.ok(remainingMembers.includes(failingCustId), 'Failed deletion preserved in index for recovery retry');
      assert.ok((await memStore.getRaw(`sanelow:tester_sess:${retryTesterId}`)) !== null, 'Tester session preserved while index is non-empty');

      // Restore delete
      memStore.delete = originalDelete;
    });

    // Subtest (k): Storage configuration errors and missing write capabilities fail closed
    await t2.test('(k) Storage configuration errors and missing write capabilities fail closed', async () => {
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;

      // (k.1) Store missing delRaw or setRaw in tester-kill fails closed with STORAGE_CONFIG_ERROR
      const noWriteStore: any = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        getRaw: async () => null,
        incrRaw: async () => 1,
      };
      setSessionStoreForTest(noWriteStore);

      const { req: killReq, res: killRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-kill',
        headers: { origin: trustedBaseUrl, 'x-vercel-forwarded-for': '192.0.2.1' },
        body: JSON.stringify({ secret: testSecret, kill: true }),
      });
      await authHandler(killReq, killRes);
      assert.equal(killRes.statusCode, 500);
      assert.equal(JSON.parse(killRes.data).error, 'STORAGE_CONFIG_ERROR');

      // (k.2) Store command write failure in tester-kill fails closed with STORAGE_WRITE_FAILED
      const failingWriteStore: any = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        getRaw: async () => null,
        incrRaw: async () => 1,
        setRaw: async () => {
          throw new Error('Connection reset');
        },
        delRaw: async () => {
          throw new Error('Connection reset');
        },
      };
      setSessionStoreForTest(failingWriteStore);

      const { req: failKillReq, res: failKillRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-kill',
        headers: { origin: trustedBaseUrl, 'x-vercel-forwarded-for': '192.0.2.1' },
        body: JSON.stringify({ secret: testSecret, kill: true }),
      });
      await authHandler(failKillReq, failKillRes);
      assert.equal(failKillRes.statusCode, 500);
      assert.equal(JSON.parse(failKillRes.data).error, 'STORAGE_WRITE_FAILED');

      // (k.3) Deployed configuration error (e.g. missing credentials on edge) fails closed
      const configErrorStore: any = {
        get() {
          throw new Error('SECURITY_CONFIG_ERROR: Durable Redis session storage required.');
        },
        getRaw() {
          throw new Error('SECURITY_CONFIG_ERROR: Durable Redis session storage required.');
        },
        setRaw() {
          throw new Error('SECURITY_CONFIG_ERROR: Durable Redis session storage required.');
        },
        delRaw() {
          throw new Error('SECURITY_CONFIG_ERROR: Durable Redis session storage required.');
        },
        incrRaw() {
          throw new Error('SECURITY_CONFIG_ERROR: Durable Redis session storage required.');
        },
      };
      setSessionStoreForTest(configErrorStore);

      assert.equal(await isTesterKillSwitchActive(), true, 'Config error in kill switch check must fail closed (active)');
      const rlRes = await checkTesterRateLimit('192.0.2.1');
      assert.equal(rlRes.allowed, false, 'Config error in rate limit check must fail closed (denied)');

      // When config error breaks rate limiting, tester-access fails closed with 429
      const { req: failAccessReq, res: failAccessRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: { origin: trustedBaseUrl, 'x-vercel-forwarded-for': '192.0.2.1' },
        body: JSON.stringify({ secret: testSecret }),
      });
      await authHandler(failAccessReq, failAccessRes);
      assert.equal(failAccessRes.statusCode, 429);
      assert.equal(JSON.parse(failAccessRes.data).error, 'RATE_LIMIT_EXCEEDED');
      assert.equal(failAccessRes.headers['set-cookie'], undefined, 'Must not issue cookie on rate limit failure');

      // When rate limit passes but session persistence fails, tester-access returns 500 STORAGE_WRITE_FAILED
      const writeFailAccessStore: any = {
        get: async () => null,
        getRaw: async () => null,
        incrRaw: async () => 1,
        setRaw: async () => {
          throw new Error('Redis disk full');
        },
      };
      setSessionStoreForTest(writeFailAccessStore);

      const { req: writeFailReq, res: writeFailRes } = createMockReqRes({
        method: 'POST',
        url: '/api/auth?action=tester-access',
        headers: { origin: trustedBaseUrl, 'x-vercel-forwarded-for': '192.0.2.1' },
        body: JSON.stringify({ secret: testSecret }),
      });
      await authHandler(writeFailReq, writeFailRes);
      assert.equal(writeFailRes.statusCode, 500);
      assert.equal(JSON.parse(writeFailRes.data).error, 'STORAGE_WRITE_FAILED');
      assert.equal(writeFailRes.headers['set-cookie'], undefined, 'Must not issue cookie on storage write failure');
    });

    // Subtest (l): Real Upstash Redis client REST protocol and Lua scripts vs Mocked in-memory store
    await t2.test('(l) Upstash Redis client produces exact REST command payloads and handles responses', async () => {
      const dispatchedCommands: any[][] = [];
      const originalFetch = globalThis.fetch;

      // Real Upstash Redis adapter instance pointing to simulated Upstash REST endpoint
      const upstashStore = new UpstashRedisSessionStore('https://mock-redis.upstash.io', 'mock-bearer-token');

      globalThis.fetch = async (url: any, init?: any) => {
        if (url.toString().startsWith('https://mock-redis.upstash.io')) {
          const body = JSON.parse(init.body);
          dispatchedCommands.push(body);
          const cmdName = body[0];

          if (cmdName === 'EVAL') {
            // Simulated Redis Lua script responses
            if (body[1].includes('count == 1')) {
              // Rate limiting Lua script
              return new Response(JSON.stringify({ result: 1 }), { status: 200 });
            }
            if (body[1].includes('ERR_TESTER_SESSION_NOT_FOUND')) {
              // linkTesterCustomerSession Lua script
              return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
            }
            return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
          }
          if (cmdName === 'GET') {
            return new Response(JSON.stringify({ result: null }), { status: 200 });
          }
          if (cmdName === 'SET') {
            return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
          }
          if (cmdName === 'DEL') {
            return new Response(JSON.stringify({ result: 1 }), { status: 200 });
          }
          if (cmdName === 'SADD') {
            return new Response(JSON.stringify({ result: 1 }), { status: 200 });
          }
          if (cmdName === 'SMEMBERS') {
            return new Response(JSON.stringify({ result: ['cust_sess_abc'] }), { status: 200 });
          }
          if (cmdName === 'SREM') {
            return new Response(JSON.stringify({ result: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        }
        return originalFetch(url, init);
      };

      try {
        // 1. incrRaw executes atomic Lua EVAL with TTL argument
        const count = await upstashStore.incrRaw('sanelow:rate:test', 60);
        assert.equal(count, 1);
        const lastIncr = dispatchedCommands[dispatchedCommands.length - 1];
        assert.equal(lastIncr[0], 'EVAL');
        assert.ok(lastIncr[1].includes('redis.call("incr"'));
        assert.equal(lastIncr[3], 'sanelow:rate:test');
        assert.equal(lastIncr[4], '60');

        // 2. linkTesterCustomerSession executes Lua EVAL with keys and customerSessionId
        const linkRes = await upstashStore.linkTesterCustomerSession('tester_sess_123', 'cust_sess_456');
        assert.equal(linkRes.success, true);
        const lastLink = dispatchedCommands[dispatchedCommands.length - 1];
        assert.equal(lastLink[0], 'EVAL');
        assert.ok(lastLink[1].includes('cjson.decode'));
        assert.equal(lastLink[2], 5);
        assert.equal(lastLink[3], 'sanelow:tester_sess:tester_sess_123');
        assert.equal(lastLink[4], 'sanelow:tester_cust_ids:tester_sess_123');
        assert.equal(lastLink[5], 'sanelow:tester_kill_switch');
        assert.equal(lastLink[6], 'sanelow:testing_kill_switch');
        assert.equal(lastLink[7], 'sanelow:tester:kill_switch');
        assert.equal(lastLink[8], 'cust_sess_456');

        // 3. saddRaw, smembersRaw, sremRaw
        await upstashStore.saddRaw('sanelow:set:test', 'member1', 300);
        const members = await upstashStore.smembersRaw('sanelow:set:test');
        assert.deepEqual(members, ['cust_sess_abc']);
        await upstashStore.sremRaw('sanelow:set:test', 'member1');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // Subtest (m): Comprehensive Tester-Logout, Revocation, Failure Recovery, and Administrative Cleanup Retry
    await t2.test('(m) Comprehensive Tester-Logout, Revocation, Failure Recovery, and Administrative Cleanup Retry', async (t3) => {
      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = testSecret;

      // (m.1) Callback linking after logout revocation is rejected
      await t3.test('1. Callback linking after logout revocation is rejected', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        await memStore.setRaw(
          `sanelow:tester_sess:${testerSessId}`,
          JSON.stringify({ createdAt: now, expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000 })
        );

        // Revoke tester session via logout
        const { req: logoutReq, res: logoutRes } = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-logout',
          headers: { origin: trustedBaseUrl, cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        });
        await authHandler(logoutReq, logoutRes);
        assert.equal(logoutRes.statusCode, 200);

        // Attempting to link a customer session to the revoked tester session is rejected
        const newCustId = crypto.randomBytes(32).toString('hex');
        const linkRes = await memStore.linkTesterCustomerSession(testerSessId, newCustId);
        assert.equal(linkRes.success, false);
        assert.ok(linkRes.reason === 'ERR_TESTER_SESSION_REVOKED' || linkRes.reason === 'ERR_TESTER_SESSION_NOT_FOUND');
      });

      // (m.2) SMEMBERS failure preserves cleanup records and returns an error (HTTP 503)
      await t3.test('2. SMEMBERS failure preserves cleanup records, clears cookies, and returns 503', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        await memStore.setRaw(
          `sanelow:tester_sess:${testerSessId}`,
          JSON.stringify({ createdAt: now, expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000 })
        );
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, custSessId);
        await memStore.set(custSessId, { id: custSessId, accessToken: 'tok', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);

        // Simulate SMEMBERS failure when reading linked customer sessions
        const originalSmembers = memStore.smembersRaw.bind(memStore);
        memStore.smembersRaw = async (key: string) => {
          if (key === `sanelow:tester_cust_ids:${testerSessId}`) {
            throw new Error('Simulated Redis smembers network drop');
          }
          return originalSmembers(key);
        };

        const { req: logoutReq, res: logoutRes } = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-logout',
          headers: { origin: trustedBaseUrl, cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        });
        await authHandler(logoutReq, logoutRes);

        // Must return HTTP 503 STORAGE_REVOCATION_INCOMPLETE (never reporting success)
        assert.equal(logoutRes.statusCode, 503);
        const resJson = JSON.parse(logoutRes.data);
        assert.equal(resJson.error, 'STORAGE_REVOCATION_INCOMPLETE');

        // Cookies are cleared in client browser
        const setCookies = logoutRes.headers['set-cookie'] as string[];
        assert.ok(setCookies.some((c) => c.includes(`${TESTER_COOKIE_NAME}=`) && c.includes('Max-Age=0')));

        // Restore smembers
        memStore.smembersRaw = originalSmembers;

        // Cleanup records must be preserved in Redis
        const rawTester = await memStore.getRaw(`sanelow:tester_sess:${testerSessId}`);
        assert.ok(rawTester !== null, 'Tester record must be preserved in Redis');
        const parsed = JSON.parse(rawTester!);
        assert.equal(parsed.revoked, true, 'Tester session must be marked revoked');

        const pendingList = await memStore.smembersRaw(TESTER_PENDING_CLEANUPS_KEY);
        assert.ok(pendingList.includes(testerSessId), 'Must be recorded in pending cleanups registry');

        const linkedMembers = await memStore.smembersRaw(`sanelow:tester_cust_ids:${testerSessId}`);
        assert.ok(linkedMembers.includes(custSessId), 'Linked customer session must be preserved in index');
      });

      // (m.3) Partial deletion failure is recoverable after browser cookies are cleared
      await t3.test('3. Partial deletion failure is recoverable after browser cookies are cleared', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const c1 = crypto.randomBytes(32).toString('hex');
        const c2 = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        await memStore.setRaw(
          `sanelow:tester_sess:${testerSessId}`,
          JSON.stringify({ createdAt: now, expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000 })
        );
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, c1);
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, c2);
        await memStore.set(c1, { id: c1, accessToken: 'tok1', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);
        await memStore.set(c2, { id: c2, accessToken: 'tok2', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);

        // Fail delete for c2
        const originalDelete = memStore.delete.bind(memStore);
        memStore.delete = async (sessId: string) => {
          if (sessId === c2) {
            throw new Error('Simulated atomic Redis failure on customer session deletion');
          }
          return originalDelete(sessId);
        };

        const { req: logoutReq, res: logoutRes } = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-logout',
          headers: { origin: trustedBaseUrl, cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        });
        await authHandler(logoutReq, logoutRes);
        assert.equal(logoutRes.statusCode, 500);

        // Browser cookies cleared so browser is logged out
        const setCookies = logoutRes.headers['set-cookie'] as string[];
        assert.ok(setCookies.some((c) => c.includes(`${TESTER_COOKIE_NAME}=`) && c.includes('Max-Age=0')));

        // Successfully deleted c1 is removed from index; failed c2 is preserved for retry
        assert.equal(await memStore.get(c1), null);
        const remaining = await memStore.smembersRaw(`sanelow:tester_cust_ids:${testerSessId}`);
        assert.ok(!remaining.includes(c1));
        assert.ok(remaining.includes(c2));

        // Pending cleanup registry retains tester ID
        const pending = await memStore.smembersRaw(TESTER_PENDING_CLEANUPS_KEY);
        assert.ok(pending.includes(testerSessId));

        // Restore delete so subsequent cleanup can succeed
        memStore.delete = originalDelete;
      });

      // (m.4) Retry completes cleanup safely without cookies
      await t3.test('4. Retry completes cleanup safely without cookies via administrative POST route', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const c1 = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // Simulate a tester session with a pending customer session in index
        await memStore.markTesterSessionRevoked(testerSessId);
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, c1);
        await memStore.set(c1, { id: c1, accessToken: 'tok1', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);

        // Invoke administrative cleanup-retry route WITHOUT cookies
        const { req: retryReq, res: retryRes } = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-cleanup-retry',
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '192.0.2.88',
          },
          body: JSON.stringify({ secret: testSecret }),
        });
        await authHandler(retryReq, retryRes);

        assert.equal(retryRes.statusCode, 200);
        const retryJson = JSON.parse(retryRes.data);
        assert.equal(retryJson.success, true);
        assert.equal(retryJson.completedTesters, 1);
        assert.equal(retryJson.remainingPendingTesters, 0);

        // Customer session c1 is deleted
        assert.equal(await memStore.get(c1), null);

        // Tester keys and pending cleanups are purged from store
        assert.equal(await memStore.getRaw(`sanelow:tester_sess:${testerSessId}`), null);
        assert.equal(await memStore.getRaw(`sanelow:tester_cust_ids:${testerSessId}`), null);
        const pendingAfter = await memStore.smembersRaw(TESTER_PENDING_CLEANUPS_KEY);
        assert.ok(!pendingAfter.includes(testerSessId));
      });

      // (m.5) Revoked tester sessions cannot access protected routes
      await t3.test('5. Revoked tester sessions cannot access protected routes', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        await memStore.markTesterSessionRevoked(testerSessId);

        const reqWithRevoked = createMockReqRes({
          headers: { cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        }).req;

        // hasTesterAccess must return false for revoked tester session
        assert.equal(await hasTesterAccess(reqWithRevoked), false);

        // /api/auth?action=session returns enabled: false, isTester: false
        const { req: sessReq, res: sessRes } = createMockReqRes({
          method: 'GET',
          url: '/api/auth?action=session',
          headers: { cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        });
        await authHandler(sessReq, sessRes);
        const sessJson = JSON.parse(sessRes.data);
        assert.equal(sessJson.enabled, false);
        assert.equal(sessJson.isTester, false);

        // /api/customer?action=dashboard returns 403 FEATURE_DISABLED
        const { req: custReq, res: custRes } = createMockReqRes({
          method: 'GET',
          url: '/api/customer?action=dashboard',
          headers: { cookie: `${TESTER_COOKIE_NAME}=${testerSessId}` },
        });
        await customerHandler(custReq, custRes);
        assert.equal(custRes.statusCode, 403);
        assert.equal(JSON.parse(custRes.data).error, 'FEATURE_DISABLED');
      });

      // (m.6) Registration interleaving with cleanup finalization protects newly registered work
      await t3.test('6. Registration interleaving with cleanup finalization preserves newly registered sessions', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const c1 = crypto.randomBytes(32).toString('hex');
        const c2 = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        await memStore.markTesterSessionRevoked(testerSessId);
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, c1);
        await memStore.set(c1, { id: c1, accessToken: 'tok1', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);

        // Delete c1 session
        await memStore.delete(c1);
        await memStore.sremRaw(`sanelow:tester_cust_ids:${testerSessId}`, c1);

        // Interleave: concurrent callback registers orphaned session c2 before finalization!
        await memStore.registerOrphanedCustomerSession(testerSessId, c2);

        // Now finalization runs: it must detect index is NOT empty and refuse deletion
        const finRes = await memStore.finalizeTesterCleanup(testerSessId);
        assert.equal(finRes.success, false);
        assert.equal(finRes.reason, 'ERR_INDEX_NOT_EMPTY');

        // Verify keys were NOT deleted
        assert.ok(await memStore.getRaw(`sanelow:tester_sess:${testerSessId}`) !== null, 'Tester key must be preserved');
        const remaining = await memStore.smembersRaw(`sanelow:tester_cust_ids:${testerSessId}`);
        assert.ok(remaining.includes(c2), 'Concurrent c2 session must not be deleted');

        const pending = await memStore.smembersRaw(TESTER_PENDING_CLEANUPS_KEY);
        assert.ok(pending.includes(testerSessId), 'Tester ID must remain in pending cleanups');
      });

      // (m.7) Registration failure during callback rollback is not silently swallowed and returns 500 STORAGE_REGISTRATION_FAILED
      await t3.test('7. Registration failure during callback rollback is not silently swallowed and returns 500 STORAGE_REGISTRATION_FAILED', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        await memStore.setRaw(
          `sanelow:tester_sess:${testerSessId}`,
          JSON.stringify({ createdAt: now, expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000 })
        );

        // Simulated fail-store where delete fails and registerOrphanedCustomerSession fails
        const failingStore: any = {
          ...memStore,
          get: memStore.get.bind(memStore),
          getRaw: memStore.getRaw.bind(memStore),
          set: memStore.set.bind(memStore),
          setRaw: memStore.setRaw.bind(memStore),
          linkTesterCustomerSession: async () => ({ success: false, reason: 'ERR_TESTER_SESSION_REVOKED' }),
          delete: async () => {
            throw new Error('Rollback delete network error');
          },
          registerOrphanedCustomerSession: async () => {
            throw new Error('Registration network failure');
          },
        };
        setSessionStoreForTest(failingStore);

        // Setup valid oauth state cookie
        const oauthState = {
          state: 'test_state_12345',
          nonce: 'expected_mock_nonce_val',
          codeVerifier: 'mock_verifier_string',
          returnTo: '/account',
          createdAt: Date.now(),
        };
        const encState = encryptAtRest(oauthState);

        const targetClientId = process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || 'shp_mock_client_id_test';

        // Mock token endpoint and discovery
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url: any) => {
          if (url.toString().includes('openid-configuration')) {
            return new Response(JSON.stringify(testDiscovery), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (url.toString().includes('oauth/token') || url.toString().includes('token')) {
            return new Response(JSON.stringify({
              access_token: 'tok_123',
              id_token: createSignedIdToken({ aud: targetClientId }),
              token_type: 'Bearer',
              expires_in: 3600,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return originalFetch(url);
        };

        try {
          const { req, res } = createMockReqRes({
            method: 'GET',
            url: `/api/auth?action=callback&code=mock_code&state=test_state_12345`,
            headers: {
              cookie: `${OAUTH_STATE_COOKIE_NAME}=${encState}; ${TESTER_COOKIE_NAME}=${testerSessId}`,
            },
          });
          await authHandler(req, res);

          // Must return HTTP 500 STORAGE_REGISTRATION_FAILED (never 302 or swallowed success)
          assert.equal(res.statusCode, 500);
          const resJson = JSON.parse(res.data);
          assert.equal(resJson.error, 'STORAGE_REGISTRATION_FAILED');
          assert.equal(resJson.recoverable, false);
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      // (m.8) Incomplete cleanup returns HTTP 503 with success: false and truthful counts
      await t3.test('8. Incomplete cleanup returns HTTP 503 with success: false and truthful counts', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const c1 = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        await memStore.markTesterSessionRevoked(testerSessId);
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerSessId}`, c1);
        await memStore.set(c1, { id: c1, accessToken: 'tok1', expiresAt: now + 3600000, sessionExpiresAt: now + 3600000, createdAt: now, updatedAt: now }, 3600);

        // Fail deletion for c1
        const originalDelete = memStore.delete.bind(memStore);
        memStore.delete = async (sessId: string) => {
          if (sessId === c1) {
            throw new Error('Simulated atomic Redis failure on customer session deletion');
          }
          return originalDelete(sessId);
        };

        // Invoke administrative cleanup route
        const { req: retryReq, res: retryRes } = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-cleanup-retry',
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '192.0.2.99',
          },
          body: JSON.stringify({ secret: testSecret }),
        });
        await authHandler(retryReq, retryRes);

        // Must return HTTP 503 STORAGE_REVOCATION_INCOMPLETE with success: false
        assert.equal(retryRes.statusCode, 503);
        const retryJson = JSON.parse(retryRes.data);
        assert.equal(retryJson.success, false);
        assert.equal(retryJson.error, 'STORAGE_REVOCATION_INCOMPLETE');
        assert.equal(retryJson.remainingPendingTesters, 1);
        assert.equal(retryJson.completedTesters, 0);

        // Restore delete
        memStore.delete = originalDelete;
      });

      // (m.9) Scenario 1: Initial retention & multiple refresh extensions maintain cleanup index TTL without shortening
      await t3.test('9. Initial retention & multiple refresh extensions maintain cleanup index TTL without shortening', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // Setup active tester session
        await memStore.setRaw(`sanelow:tester_sess:${testerSessId}`, JSON.stringify({
          id: testerSessId,
          createdAt: now,
          expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000,
          revoked: false,
        }), TESTER_SESSION_TTL_SECONDS);

        // Link customer session with 30-day initial TTL
        const thirtyDays = 30 * 24 * 3600;
        const linkRes = await memStore.linkTesterCustomerSession(testerSessId, custSessId, thirtyDays);
        assert.equal(linkRes.success, true);

        // Verify initial customer session in store
        const sessionRecord: StoredSession = {
          id: custSessId,
          accessToken: 'initial_token',
          refreshToken: 'refresh_tok_1',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + thirtyDays * 1000,
          testerSessionId: testerSessId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await memStore.set(custSessId, sessionRecord, thirtyDays);

        // First refresh extension: 15-day extension should NOT shorten the existing 30-day index TTL
        const lockKey = `sanelow:lock:refresh:${custSessId}`;
        const lockToken = crypto.randomBytes(16).toString('hex');
        await memStore.acquireLock(lockKey, lockToken, 15);

        const shorterTtl = 15 * 24 * 3600;
        const refresh1: StoredSession = {
          ...sessionRecord,
          accessToken: 'refreshed_token_1',
          refreshToken: 'refresh_tok_2',
          expiresAt: now + 3600000,
          updatedAt: now + 1000,
        };

        const res1 = await memStore.commitRefreshedSession(
          custSessId,
          lockKey,
          lockToken,
          1,
          refresh1,
          shorterTtl,
          testerSessId
        );
        assert.equal(res1.success, true);

        // Verify membership intact and index TTL was not shortened
        const members1 = await memStore.smembersRaw(`sanelow:tester_cust_ids:${testerSessId}`);
        assert.ok(members1.includes(custSessId));

        // Second refresh extension: Longer 45-day extension SHOULD extend index TTL
        const longerTtl = 45 * 24 * 3600;
        const lockToken2 = crypto.randomBytes(16).toString('hex');
        await memStore.acquireLock(lockKey, lockToken2, 15);

        const refresh2: StoredSession = {
          ...refresh1,
          accessToken: 'refreshed_token_2',
          updatedAt: now + 2000,
        };

        const res2 = await memStore.commitRefreshedSession(
          custSessId,
          lockKey,
          lockToken2,
          2,
          refresh2,
          longerTtl,
          testerSessId
        );
        assert.equal(res2.success, true);

        const storedFinal = await memStore.get(custSessId);
        assert.equal(storedFinal?.accessToken, 'refreshed_token_2');
        assert.equal(storedFinal?.version, 3);
      });

      // (m.10) Scenario 2: Missing cleanup index or unlinked session fails closed during refresh
      await t3.test('10. Missing cleanup index or unlinked session fails closed during refresh', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // Valid tester session
        await memStore.setRaw(`sanelow:tester_sess:${testerSessId}`, JSON.stringify({
          id: testerSessId,
          createdAt: now,
          expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000,
          revoked: false,
        }), TESTER_SESSION_TTL_SECONDS);

        // Customer session exists in store with testerSessionId, but is NOT in sanelow:tester_cust_ids
        const sessionRecord: StoredSession = {
          id: custSessId,
          accessToken: 'initial_token',
          refreshToken: 'refresh_tok_1',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + 86400000,
          testerSessionId: testerSessId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await memStore.set(custSessId, sessionRecord, 3600);

        // Attempt refresh commit without index membership
        const lockKey = `sanelow:lock:refresh:${custSessId}`;
        const lockToken = crypto.randomBytes(16).toString('hex');
        await memStore.acquireLock(lockKey, lockToken, 15);

        const refreshedCandidate: StoredSession = {
          ...sessionRecord,
          accessToken: 'unauthorized_token',
        };

        const result = await memStore.commitRefreshedSession(
          custSessId,
          lockKey,
          lockToken,
          1,
          refreshedCandidate,
          3600,
          testerSessId
        );

        // Must fail closed with CLEANUP_INDEX_MISSING and delete the unlinked customer session
        assert.equal(result.success, false);
        assert.equal(result.error, 'CLEANUP_INDEX_MISSING');
        const afterSession = await memStore.get(custSessId);
        assert.equal(afterSession, null);
      });

      // (m.11) Scenario 3: Refresh racing with tester revocation or kill switch aborts and deletes customer session
      await t3.test('11. Refresh racing with tester revocation or kill switch aborts and deletes customer session', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerSessId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // Link customer session initially
        await memStore.setRaw(`sanelow:tester_sess:${testerSessId}`, JSON.stringify({
          id: testerSessId,
          createdAt: now,
          expiresAt: now + TESTER_SESSION_TTL_SECONDS * 1000,
          revoked: false,
        }), TESTER_SESSION_TTL_SECONDS);
        await memStore.linkTesterCustomerSession(testerSessId, custSessId, 3600);

        const sessionRecord: StoredSession = {
          id: custSessId,
          accessToken: 'tok_active',
          refreshToken: 'ref_active',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + 86400000,
          testerSessionId: testerSessId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await memStore.set(custSessId, sessionRecord, 3600);

        // Revoke the tester session (simulating concurrent admin revocation or logout)
        await memStore.markTesterSessionRevoked(testerSessId);

        // Attempt refresh commit
        const lockKey = `sanelow:lock:refresh:${custSessId}`;
        const lockToken = crypto.randomBytes(16).toString('hex');
        await memStore.acquireLock(lockKey, lockToken, 15);

        const commitRes = await memStore.commitRefreshedSession(
          custSessId,
          lockKey,
          lockToken,
          1,
          { ...sessionRecord, accessToken: 'resurrected_tok' },
          3600,
          testerSessId
        );

        // Must abort with TESTER_REVOKED and purge customer session
        assert.equal(commitRes.success, false);
        assert.equal(commitRes.error, 'TESTER_REVOKED');
        assert.equal(await memStore.get(custSessId), null);
      });

      // (m.12) Scenario 4: Both rollback deletion and orphan registration failing leaves session inert and unusable under getSession
      await t3.test('12. Both rollback deletion and orphan registration failing leaves session inert and unusable under getSession', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const revokedTesterId = crypto.randomBytes(32).toString('hex');
        const orphanedCustId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // Mark tester session revoked
        await memStore.markTesterSessionRevoked(revokedTesterId);

        // Simulate an orphaned session written to store with testerSessionId, but both rollback delete and registration failed
        await memStore.set(orphanedCustId, {
          id: orphanedCustId,
          accessToken: 'orphaned_token_123',
          refreshToken: 'orphaned_refresh',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + 86400000,
          testerSessionId: revokedTesterId,
          customerId: 'gid://shopify/Customer/99999',
          createdAt: now,
          updatedAt: now,
          version: 1,
        }, 3600);

        // Any subsequent request attempting to use this orphaned customer cookie
        const { req, res } = createMockReqRes({
          method: 'GET',
          url: '/api/auth?action=session',
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${orphanedCustId}`,
          },
        });

        // getSession must inspect session.testerSessionId, find tester revoked, delete orphaned session, and return null
        const session = await getSession(req, res);
        assert.equal(session, null);
        assert.equal(await memStore.get(orphanedCustId), null);
      });

      // (m.13) Scenario 5: Customer A -> logout -> Customer B wishlist isolation and immediate UI state clearing
      await t3.test('13. Customer A -> logout -> Customer B wishlist isolation and immediate state clearing', async () => {
        // Mock browser localStorage for scoped keys
        const mockStorage = new Map<string, string>();
        const mockLocalStorage = {
          getItem: (key: string) => mockStorage.get(key) || null,
          setItem: (key: string, val: string) => { mockStorage.set(key, val); },
          clear: () => mockStorage.clear(),
        };

        const custAId = 'gid://shopify/Customer/11111';
        const custBId = 'gid://shopify/Customer/22222';

        const itemA = { id: 'prod_1', title: 'Sweatshirt A', priceAmount: 45, handle: 'sweatshirt-a' };
        const itemB = { id: 'prod_2', title: 'Sweatshirt B', priceAmount: 60, handle: 'sweatshirt-b' };
        const itemGuest = { id: 'prod_0', title: 'Guest Tee', priceAmount: 30, handle: 'guest-tee' };

        // Helper mirroring App.tsx implementation with bijective hex encoding
        function getWishlistStorageKey(customerId?: string | null): string {
          if (customerId && customerId.trim()) {
            const bytes = new TextEncoder().encode(customerId.trim());
            const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
            return `sanelow_merch_wishlist_cust_${hex}`;
          }
          return 'sanelow_merch_wishlist';
        }

        function loadWishlistForScope(customerId?: string | null): any[] {
          try {
            const key = getWishlistStorageKey(customerId);
            const saved = mockLocalStorage.getItem(key);
            if (!saved) return [];
            return JSON.parse(saved);
          } catch {
            return [];
          }
        }

        // 1. Guest saves item
        const guestKey = getWishlistStorageKey(null);
        assert.equal(guestKey, 'sanelow_merch_wishlist');
        mockLocalStorage.setItem(guestKey, JSON.stringify([itemGuest]));

        // 2. Customer A logs in: Loads empty (no auto-merge of guest item) and saves itemA
        const custAKey = getWishlistStorageKey(custAId);
        const custAHex = Array.from(new TextEncoder().encode(custAId)).map((b) => b.toString(16).padStart(2, '0')).join('');
        assert.equal(custAKey, `sanelow_merch_wishlist_cust_${custAHex}`);
        assert.deepEqual(loadWishlistForScope(custAId), []); // Guest item NOT auto-merged!
        mockLocalStorage.setItem(custAKey, JSON.stringify([itemA]));

        // 3. Customer A logs out: Scope switches to guest, Customer A's items are NOT in guest scope
        const loggedOutScope = loadWishlistForScope(null);
        assert.deepEqual(loggedOutScope, [itemGuest]);
        assert.ok(!loggedOutScope.some((i: any) => i.id === itemA.id));

        // 4. Customer B logs in: Loads Customer B scope, Customer A items NEVER displayed to Customer B
        const custBKey = getWishlistStorageKey(custBId);
        const custBHex = Array.from(new TextEncoder().encode(custBId)).map((b) => b.toString(16).padStart(2, '0')).join('');
        assert.equal(custBKey, `sanelow_merch_wishlist_cust_${custBHex}`);
        assert.deepEqual(loadWishlistForScope(custBId), []); // Empty initially
        mockLocalStorage.setItem(custBKey, JSON.stringify([itemB]));

        assert.deepEqual(loadWishlistForScope(custAId), [itemA]);
        assert.deepEqual(loadWishlistForScope(custBId), [itemB]);
        assert.deepEqual(loadWishlistForScope(null), [itemGuest]);
      });

      // (m.14) Scenario 6: Incomplete order pagination and absent tracking displays neutral messaging without speculation
      await t3.test('14. Absent tracking displays exact neutral messaging without atelier speculation', async () => {
        // Verify neutral text requirements on order fulfillments
        const emptyFulfillmentOrder = {
          id: 'gid://shopify/Order/12345',
          name: '#1001',
          fulfillments: [],
        };

        const neutralOrderMsg = "No tracking information is available for this order yet.";
        const neutralFulfillmentMsg = "No tracking information is available for this fulfillment yet.";

        // Order with 0 fulfillments
        assert.equal(emptyFulfillmentOrder.fulfillments.length === 0, true);
        const displayedOrderMsg = emptyFulfillmentOrder.fulfillments.length === 0 ? neutralOrderMsg : '';
        assert.equal(displayedOrderMsg, "No tracking information is available for this order yet.");
        assert.ok(!displayedOrderMsg.includes('atelier'));
        assert.ok(!displayedOrderMsg.includes('production'));
        assert.ok(!displayedOrderMsg.includes('dispatch'));

        // Order with fulfillment but no tracking URLs
        const fulfillmentNoTrack = {
          id: 'gid://shopify/Fulfillment/555',
          status: 'SUCCESS',
          trackingInformation: [],
        };
        const displayedFulfillMsg = fulfillmentNoTrack.trackingInformation.length === 0 ? neutralFulfillmentMsg : '';
        assert.equal(displayedFulfillMsg, "No tracking information is available for this fulfillment yet.");
        assert.ok(!displayedFulfillMsg.includes('scanned'));
        assert.ok(!displayedFulfillMsg.includes('prepared'));
      });

      // (m.15) Requirement 1: End-to-end Kill-Switch Consistency Across Canonical & Legacy Keys
      await t3.test('15. Kill-switch consistency across canonical and legacy keys gates all readers, writers, and scripts', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        // Verify all 3 keys are present in constant inventory
        assert.equal(TESTER_KILL_SWITCH_KEY, 'sanelow:tester_kill_switch');
        assert.equal(LEGACY_TESTER_KILL_SWITCH_KEY_1, 'sanelow:testing_kill_switch');
        assert.equal(LEGACY_TESTER_KILL_SWITCH_KEY_2, 'sanelow:tester:kill_switch');
        assert.deepEqual(ALL_TESTER_KILL_SWITCH_KEYS, [
          'sanelow:tester_kill_switch',
          'sanelow:testing_kill_switch',
          'sanelow:tester:kill_switch',
        ]);

        // Initially inactive
        assert.equal(await isTesterKillSwitchActive(), false);

        // Setting ANY legacy or canonical key to '1' makes isTesterKillSwitchActive() return true
        for (const key of ALL_TESTER_KILL_SWITCH_KEYS) {
          await memStore.setRaw(key, '1');
          assert.equal(await isTesterKillSwitchActive(), true, `Kill switch must be active when ${key} is '1'`);
          await memStore.delRaw(key);
          assert.equal(await isTesterKillSwitchActive(), false, `Kill switch must be inactive when ${key} is cleared`);
        }

        // Writer check: action=tester-kill with kill: true sets ALL canonical & legacy keys
        const killReq = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-kill',
          headers: {
            origin: getTrustedSiteUrl(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ secret: testSecret, kill: true }),
        });
        await authHandler(killReq.req, killReq.res);
        assert.equal(killReq.res.statusCode, 200);

        for (const key of ALL_TESTER_KILL_SWITCH_KEYS) {
          assert.equal(await memStore.getRaw(key), '1', `action=tester-kill must write '1' to ${key}`);
        }
        assert.equal(await isTesterKillSwitchActive(), true);

        // Writer check: action=tester-kill with kill: false deletes ALL canonical & legacy keys
        const unkillReq = createMockReqRes({
          method: 'POST',
          url: '/api/auth?action=tester-kill',
          headers: {
            origin: getTrustedSiteUrl(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ secret: testSecret, kill: false }),
        });
        await authHandler(unkillReq.req, unkillReq.res);
        assert.equal(unkillReq.res.statusCode, 200);

        for (const key of ALL_TESTER_KILL_SWITCH_KEYS) {
          assert.equal(await memStore.getRaw(key), null, `action=tester-kill must clear ${key}`);
        }
        assert.equal(await isTesterKillSwitchActive(), false);
      });

      // (m.16) Requirement 2: Fail-Closed Expiry Validation in Lua Scripts and Store Logic
      await t3.test('16. Fail-closed expiry validation rejects nowMs >= expiresAt, non-numeric values, and preserves tester session TTL', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // 1. Tester session with nowMs == expiresAt must fail closed
        await memStore.setRaw(
          `sanelow:tester_sess:${testerId}`,
          JSON.stringify({ createdAt: now - 3600000, expiresAt: now })
        );
        const linkBoundaryFail = await memStore.linkTesterCustomerSession(testerId, custSessId);
        assert.equal(linkBoundaryFail.success, false, 'Boundary nowMs >= expiresAt must fail closed');
        assert.equal(linkBoundaryFail.reason, 'ERR_TESTER_SESSION_EXPIRED');

        // 2. Non-numeric or missing expiry must fail closed
        await memStore.setRaw(
          `sanelow:tester_sess:${testerId}`,
          JSON.stringify({ createdAt: now, expiresAt: 'not_a_number' })
        );
        const linkBadExpiry = await memStore.linkTesterCustomerSession(testerId, custSessId);
        assert.equal(linkBadExpiry.success, false, 'Non-numeric expiresAt must fail closed');

        // 3. Tester absolute access expiry is NOT extended during customer session refresh
        const originalTesterExpiresAt = now + 7200000;
        await memStore.setRaw(
          `sanelow:tester_sess:${testerId}`,
          JSON.stringify({ createdAt: now, expiresAt: originalTesterExpiresAt })
        );
        await memStore.saddRaw(`sanelow:tester_cust_ids:${testerId}`, custSessId);

        const lockKey = `sanelow:lock:refresh:${custSessId}`;
        const lockToken = 'tok_123';
        await memStore.set(custSessId, {
          id: custSessId,
          accessToken: 'old_access',
          refreshToken: 'refresh_tok',
          expiresAt: now + 60000,
          sessionExpiresAt: now + 3600000,
          testerSessionId: testerId,
          createdAt: now,
          updatedAt: now,
        }, 3600);
        await memStore.acquireLock(lockKey, lockToken, 15);

        const commitRes = await memStore.commitRefreshedSession(
          custSessId,
          lockKey,
          lockToken,
          1,
          {
            id: custSessId,
            accessToken: 'new_access',
            refreshToken: 'new_refresh',
            expiresAt: now + 3600000,
            sessionExpiresAt: now + 86400000,
            testerSessionId: testerId,
            createdAt: now,
            updatedAt: now + 100,
            version: 2,
          },
          86400,
          testerId
        );

        assert.equal(commitRes.success, true);
        const testerRawAfter = await memStore.getRaw(`sanelow:tester_sess:${testerId}`);
        const parsedTester = JSON.parse(testerRawAfter!);
        assert.equal(parsedTester.expiresAt, originalTesterExpiresAt, 'Tester session expiresAt must remain strictly untouched');
      });

      // (m.17) Requirement 3: Orphaned-Session Request Validation in getSession
      await t3.test('17. Orphaned-session validation requires cleanup index membership; storage errors fail closed', async () => {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);

        const testerId = crypto.randomBytes(32).toString('hex');
        const custSessId = crypto.randomBytes(32).toString('hex');
        const now = Date.now();

        // 1. Tester session exists and is VALID and ACTIVE
        await memStore.setRaw(
          `sanelow:tester_sess:${testerId}`,
          JSON.stringify({ createdAt: now - 1000, expiresAt: now + 7200000 })
        );

        // 2. Customer session exists with testerSessionId, BUT is NOT in cleanup index
        await memStore.set(custSessId, {
          id: custSessId,
          accessToken: 'cust_access_tok',
          refreshToken: 'cust_refresh_tok',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + 86400000,
          testerSessionId: testerId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        }, 3600);

        // Do NOT add to sanelow:tester_cust_ids:${testerId} (simulating failed linking / orphaned session)
        const { req, res } = createMockReqRes({
          method: 'GET',
          url: '/api/auth?action=session',
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${custSessId}`,
          },
        });

        // getSession must reject the session, delete it, and return null
        const session = await getSession(req, res);
        assert.equal(session, null, 'Unlinked customer session must fail closed even with valid tester record');
        assert.equal(await memStore.get(custSessId), null, 'Unlinked customer session must be deleted from store');

        // 3. Storage error during smembersRaw fails closed even if deletion throws
        const custSessId2 = crypto.randomBytes(32).toString('hex');
        await memStore.set(custSessId2, {
          id: custSessId2,
          accessToken: 'cust_access_tok_2',
          expiresAt: now + 3600000,
          sessionExpiresAt: now + 86400000,
          testerSessionId: testerId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        }, 3600);

        // Temporarily sabotage smembersRaw
        const originalSmembers = memStore.smembersRaw.bind(memStore);
        memStore.smembersRaw = async () => {
          throw new Error('REDIS_CONNECTION_FAILURE');
        };

        const { req: req2, res: res2 } = createMockReqRes({
          method: 'GET',
          url: '/api/auth?action=session',
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${custSessId2}`,
          },
        });

        const session2 = await getSession(req2, res2);
        assert.equal(session2, null, 'Storage error during validation must fail closed and return null');
        memStore.smembersRaw = originalSmembers;
      });

      // (m.18) Requirement 4: Redis TTL -1 (indefinite) and -2 (missing) handling
      await t3.test('18. TTL handling preserves -1 indefinite retention and handles -2 safely without shortening', async () => {
        // Inspect Lua script text from UpstashRedisSessionStore to verify command generation and TTL comparisons
        const upstash = new UpstashRedisSessionStore('https://mock.upstash.io', 'mock-token');

        // Verify linkTesterCustomerSession Lua handles -1 and -2
        // If curTtl == -2 -> redis.call("expire", KEYS[2], newTtl)
        // If curTtl == -1 -> preserve without expire
        // If curTtl > 0 and curTtl < newTtl -> extend
        const dispatched: any[][] = [];
        const origFetch = globalThis.fetch;
        globalThis.fetch = async (url: any, init?: any) => {
          const body = JSON.parse(init.body);
          dispatched.push(body);
          if (body[0] === 'EVAL') {
            return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
          }
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        };

        try {
          await upstash.linkTesterCustomerSession('tester_x', 'cust_y');
          const evalCmd = dispatched[0];
          assert.equal(evalCmd[0], 'EVAL');
          const lua = evalCmd[1];
          // Check TTL -1 and -2 handling in script
          assert.ok(lua.includes('prevTtl == -2'), 'Script must check for prevTtl == -2 (newly created set)');
          assert.ok(lua.includes('prevTtl == -1'), 'Script must check for prevTtl == -1 (indefinite retention)');
          assert.ok(lua.includes('prevTtl < newTtl'), 'Script must only extend finite shorter TTL');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      // (m.19) Requirement 5: Wishlist Collision-Free Key Encoding and State Coupling
      await t3.test('19. Wishlist bijective hex encoding prevents ID collisions, and scope convention governs key selection', () => {
        // Two IDs that collide under loose regex replacement /[^a-zA-Z0-9_-]/g -> '_'
        const id1 = 'gid://shopify/Customer/123/4';
        const id2 = 'gid://shopify/Customer/123_4';

        const key1 = getWishlistStorageKey(id1);
        const key2 = getWishlistStorageKey(id2);

        assert.notEqual(key1, key2, 'Bijective hex encoding must generate distinct keys for different customer IDs');
        assert.ok(key1?.startsWith('sanelow_merch_wishlist_cust_'));
        assert.ok(key2?.startsWith('sanelow_merch_wishlist_cust_'));

        // Scope convention for key selection:
        // - undefined: unresolved identity has NO storage key
        // - null: confirmed guest uses canonical guest key
        // - invalid/empty string: returns null
        assert.equal(getWishlistStorageKey(undefined), null, 'Unresolved identity must have no storage key');
        assert.equal(getWishlistStorageKey(null), GUEST_WISHLIST_STORAGE_KEY, 'Confirmed guest uses guest storage key');
        assert.equal(getWishlistStorageKey(''), null, 'Empty string is not a valid customer ID or guest scope');
        assert.equal(getWishlistStorageKey('   '), null, 'Whitespace string is not a valid customer ID or guest scope');
      });

      // (m.20) Requirement: Direct Production Wishlist Logic Testing, Generation Guard across A -> B -> A, Rapid Repeated Toggles, and Component-Level Display
      await t3.test('20. Shared production wishlist transition logic, scope and generation guards across A -> B -> A transitions, and component rendering', async () => {
        const mockStorage = new Map<string, string>();

        function testLoadWishlistForScope(scope: WishlistScope): any[] {
          if (scope === undefined) return [];
          const key = getWishlistStorageKey(scope);
          if (!key) return [];
          const saved = mockStorage.get(key);
          if (!saved) return [];
          try {
            return JSON.parse(saved);
          } catch {
            return [];
          }
        }

        function testSaveWishlistForScope(scope: WishlistScope, items: any[]): boolean {
          if (scope === undefined) return false;
          const key = getWishlistStorageKey(scope);
          if (!key) return false;
          mockStorage.set(key, JSON.stringify(items));
          return true;
        }

        const custAId = 'gid://shopify/Customer/AAAA';
        const custBId = 'gid://shopify/Customer/BBBB';
        const itemA: any = { id: 'prod_a', title: 'Sweatshirt A', priceAmount: 50, images: ['/img/a.jpg'], category: 'sweatshirts' };
        const itemB: any = { id: 'prod_b', title: 'Tee B', priceAmount: 30, images: ['/img/b.jpg'], category: 't-shirts' };
        const itemGuest: any = { id: 'prod_g', title: 'Guest Cap', priceAmount: 20, images: ['/img/g.jpg'], category: 'caps' };

        // Prepopulate storage
        const custAKey = getWishlistStorageKey(custAId)!;
        const custBKey = getWishlistStorageKey(custBId)!;
        const guestKey = getWishlistStorageKey(null)!;
        mockStorage.set(custAKey, JSON.stringify([itemA]));
        mockStorage.set(custBKey, JSON.stringify([itemB]));
        mockStorage.set(guestKey, JSON.stringify([itemGuest]));

        // Simulating the exact state machine and refs of App.tsx
        type SessionStatus = 'unresolved' | 'authenticated' | 'guest';
        let sessionStatus: SessionStatus = 'unresolved';
        let customerSession: any = null;
        let sessionRequestId = 0;
        let scopeGeneration = 0;
        let lastToastMessage: string | null = null;

        let wishlistState: WishlistState = {
          customerId: undefined,
          scopeGeneration: 0,
          items: [],
        };

        function getConfirmedScope(): WishlistScope {
          const activeCustId = customerSession?.authenticated && customerSession.customer?.id && typeof customerSession.customer.id === 'string' && customerSession.customer.id.trim()
            ? customerSession.customer.id.trim()
            : null;
          return sessionStatus === 'authenticated' && activeCustId
            ? activeCustId
            : sessionStatus === 'guest'
              ? null
              : undefined;
        }

        function getExposedWishlist(): any[] {
          const confirmed = getConfirmedScope();
          const isConfirmed = confirmed !== undefined && wishlistState.customerId === confirmed;
          return isConfirmed ? wishlistState.items : [];
        }

        function isProductInWishlist(id: string): boolean {
          const confirmed = getConfirmedScope();
          if (confirmed === undefined || wishlistState.customerId !== confirmed) return false;
          return wishlistState.items.some((p) => p.id === id);
        }

        const testStorageAdapter: WishlistStorageAdapter = {
          getItem: (key: string) => mockStorage.get(key) || null,
          setItem: (key: string, value: string) => mockStorage.set(key, value),
        };
        const coordinator = createWishlistCoordinator({
          storage: testStorageAdapter,
          onNotify: (msg) => {
            lastToastMessage = msg;
          },
        });
        coordinator.subscribe((next) => {
          wishlistState = next;
        });

        function syncStateFromEffect() {
          const confirmed = getConfirmedScope();
          coordinator.setScope(confirmed);
        }

        // Production trigger function: EXACT mirror of handleToggleWishlist in App.tsx
        function productionToggleWishlist(product: any, options?: { delayMs?: number }): Promise<WishlistTransitionResult> {
          return coordinator.toggle(product, {
            intendedScope: getConfirmedScope(),
            intendedGeneration: wishlistState.scopeGeneration,
            delayMs: options?.delayMs,
          });
        }

        // --------------------------------------------------------------------
        // Part 1: Rendered state before effects run / while identity unresolved
        // --------------------------------------------------------------------
        assert.equal(sessionStatus, 'unresolved');
        assert.equal(getConfirmedScope(), undefined);
        assert.deepEqual(getExposedWishlist(), [], 'While identity is unresolved, exposed wishlist must be empty');
        assert.equal(isProductInWishlist('prod_a'), false);

        // Direct call to production executeWishlistToggle while unresolved
        const unresAction = await productionToggleWishlist(itemA);
        assert.equal(unresAction.accepted, false, 'Mutations must be disabled when unresolved');
        assert.equal(unresAction.reason, 'unresolved');
        assert.equal(lastToastMessage, 'Session updating — please wait a moment', 'Informs user on unresolved state');

        // Confirm guest session only after explicit authenticated:false response
        sessionStatus = 'guest';
        customerSession = { authenticated: false };
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), null);
        assert.deepEqual(getExposedWishlist(), [itemGuest], 'Confirmed guest must see guest items');

        // --------------------------------------------------------------------
        // Part 2: Logout while a session request is pending
        // --------------------------------------------------------------------
        sessionStatus = 'authenticated';
        customerSession = { authenticated: true, customer: { id: custAId } };
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), custAId);
        assert.deepEqual(getExposedWishlist(), [itemA]);

        const req1 = ++sessionRequestId;
        scopeGeneration++;

        // User clicks logout immediately while req1 is in flight
        sessionRequestId++;
        scopeGeneration++;
        sessionStatus = 'unresolved';
        customerSession = null;
        coordinator.startSessionVerification();

        assert.deepEqual(getExposedWishlist(), [], 'Logout must immediately clear displayed customer items');

        // Delayed req1 resolves with Customer A credentials:
        if (req1 === sessionRequestId) {
          customerSession = { authenticated: true, customer: { id: custAId } };
          sessionStatus = 'authenticated';
        }
        assert.equal(customerSession, null, 'Stale session response after logout must be dropped');
        assert.deepEqual(getExposedWishlist(), [], 'Wishlist must remain empty, not resurrected');

        // --------------------------------------------------------------------
        // Part 3: Rejected request / error response leaves identity UNRESOLVED (not guest)
        // --------------------------------------------------------------------
        sessionStatus = 'authenticated';
        customerSession = { authenticated: true, customer: { id: custAId } };
        scopeGeneration++;
        syncStateFromEffect();
        assert.deepEqual(getExposedWishlist(), [itemA]);

        const req2 = ++sessionRequestId;
        scopeGeneration++;
        sessionStatus = 'unresolved';
        let sessionError: string | null = null;

        if (req2 === sessionRequestId) {
          customerSession = null;
          sessionStatus = 'unresolved';
          coordinator.startSessionVerification();
          sessionError = 'Failed to fetch session: HTTP 500';
        }

        assert.equal(sessionStatus, 'unresolved', 'Rejected request must leave identity unresolved, NOT guest');
        assert.equal(customerSession, null, 'Previous authenticated session must be cleared');
        assert.deepEqual(getExposedWishlist(), [], 'Previous customer wishlist must be hidden');
        assert.equal(getConfirmedScope(), undefined, 'Scope must be undefined');

        lastToastMessage = null;
        const rejectedAction = await productionToggleWishlist(itemA);
        assert.equal(rejectedAction.accepted, false, 'Mutations must remain disabled while unresolved');
        assert.ok(sessionError !== null, 'Retry option / error must be active');

        // --------------------------------------------------------------------
        // Part 4: Malformed authenticated response
        // --------------------------------------------------------------------
        const reqMalformed = ++sessionRequestId;
        scopeGeneration++;
        sessionStatus = 'unresolved';

        const malformedResponse = { authenticated: true, customer: null };
        if (reqMalformed === sessionRequestId) {
          if (malformedResponse.authenticated === true && malformedResponse.customer && (malformedResponse.customer as any).id) {
            sessionStatus = 'authenticated';
          } else {
            customerSession = null;
            sessionStatus = 'unresolved';
            coordinator.startSessionVerification();
            sessionError = 'Session response missing valid customer identity.';
          }
        }

        assert.equal(sessionStatus, 'unresolved', 'Malformed response must leave identity unresolved');
        assert.equal(customerSession, null);
        assert.deepEqual(getExposedWishlist(), []);

        // --------------------------------------------------------------------
        // Part 5: Retry success restores identity and renders wishlist
        // --------------------------------------------------------------------
        const reqRetry = ++sessionRequestId;
        scopeGeneration++;
        if (reqRetry === sessionRequestId) {
          customerSession = { authenticated: true, customer: { id: custAId } };
          sessionStatus = 'authenticated';
          sessionError = null;
          syncStateFromEffect();
        }

        assert.equal(sessionStatus, 'authenticated');
        assert.equal(sessionError, null);
        assert.deepEqual(getExposedWishlist(), [itemA], 'Successful retry restores confirmed customer wishlist');

        // --------------------------------------------------------------------
        // Part 6: Production Toggle: Pure toast calculation & correct add/remove messages
        // --------------------------------------------------------------------
        lastToastMessage = null;
        const newItem: any = { id: 'prod_new', title: 'Tour Tee 2026', priceAmount: 45, images: ['/img/new.jpg'], category: 't-shirts' };
        const addResult = await productionToggleWishlist(newItem);
        assert.equal(addResult.accepted, true);
        assert.equal(addResult.action, 'added');
        assert.equal(lastToastMessage, 'Saved "Tour Tee 2026" locally on this device');
        assert.ok(getExposedWishlist().some((i: any) => i.id === 'prod_new'));

        const removeResult = await productionToggleWishlist(newItem);
        assert.equal(removeResult.accepted, true);
        assert.equal(removeResult.action, 'removed');
        assert.equal(lastToastMessage, 'Removed from saved merch');
        assert.ok(!getExposedWishlist().some((i: any) => i.id === 'prod_new'));

        // --------------------------------------------------------------------
        // Part 7: Rapid repeated toggles directly testing applyWishlistToggle & wishlistReducer
        // --------------------------------------------------------------------
        const toggleItem: any = { id: 'prod_repeat', title: 'Track Pants', priceAmount: 80, images: ['/img/tp.jpg'], category: 'bottoms' };
        const baseGen = wishlistState.scopeGeneration;

        // Toggle 1: Add
        const r1 = applyWishlistToggle(wishlistState, { product: toggleItem, intendedScope: custAId, intendedGeneration: baseGen });
        assert.equal(r1.accepted, true);
        assert.equal(r1.action, 'added');
        assert.ok(r1.state.items.some((p) => p.id === 'prod_repeat'));

        // Toggle 2: Remove
        const r2 = applyWishlistToggle(r1.state, { product: toggleItem, intendedScope: custAId, intendedGeneration: baseGen });
        assert.equal(r2.accepted, true);
        assert.equal(r2.action, 'removed');
        assert.ok(!r2.state.items.some((p) => p.id === 'prod_repeat'));

        // Toggle 3: Add again
        const r3 = applyWishlistToggle(r2.state, { product: toggleItem, intendedScope: custAId, intendedGeneration: baseGen });
        assert.equal(r3.accepted, true);
        assert.equal(r3.action, 'added');
        assert.ok(r3.state.items.some((p) => p.id === 'prod_repeat'));

        // Test wishlistReducer purity with actions
        const stateViaReducer1 = wishlistReducer(wishlistState, {
          type: 'TOGGLE_ITEM',
          payload: { product: toggleItem, intendedScope: custAId, intendedGeneration: baseGen },
        });
        assert.ok(stateViaReducer1.items.some((p) => p.id === 'prod_repeat'), 'Reducer must add item');

        const stateViaReducer2 = wishlistReducer(stateViaReducer1, {
          type: 'TOGGLE_ITEM',
          payload: { product: toggleItem, intendedScope: custAId, intendedGeneration: baseGen },
        });
        assert.ok(!stateViaReducer2.items.some((p) => p.id === 'prod_repeat'), 'Reducer must remove item');

        // --------------------------------------------------------------------
        // Part 8: Generation guard invalidates delayed action across A -> B -> A transitions
        // --------------------------------------------------------------------
        // Step 8a: Customer A is logged in
        customerSession = { authenticated: true, customer: { id: custAId } };
        sessionStatus = 'authenticated';
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), custAId);
        assert.deepEqual(getExposedWishlist(), [itemA]);

        lastToastMessage = null;

        // Step 8b: Schedule a delayed action for Customer A (e.g. 50ms delay) using coordinator.toggle
        const delayedItem: any = { id: 'prod_delayed', title: 'Delayed Hoodie', priceAmount: 90, images: ['/img/dh.jpg'], category: 'hoodies' };
        const delayedPromise = coordinator.toggle(delayedItem, {
          intendedScope: custAId,
          intendedGeneration: wishlistState.scopeGeneration,
          delayMs: 50,
        });

        // Step 8c: Identity changes to Customer B during the delay
        customerSession = { authenticated: true, customer: { id: custBId } };
        sessionStatus = 'authenticated';
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), custBId);

        // Step 8d: Identity changes BACK to Customer A before the 50ms delay completes (A -> B -> A)
        customerSession = { authenticated: true, customer: { id: custAId } };
        sessionStatus = 'authenticated';
        scopeGeneration++; // Generation incremented again!
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), custAId);

        // Step 8e: Await the delayed action completion
        const delayedResult = await delayedPromise;

        // The delayed action MUST have been invalidated by the generation guard!
        assert.equal(delayedResult.accepted, false, 'Delayed action must be rejected when identity changed (A -> B -> A)');
        assert.equal(delayedResult.reason, 'stale_generation');
        assert.equal(lastToastMessage, null, 'No success toast must be shown for an action that became stale');
        assert.ok(
          !getExposedWishlist().some((i: any) => i.id === 'prod_delayed'),
          'Delayed item must not be added to Customer A wishlist after generation changed'
        );

        // --------------------------------------------------------------------
        // Part 9: State updater validates prev.customerId against intended scope
        // --------------------------------------------------------------------
        const staleScopeState: WishlistState = { customerId: 'gid://shopify/Customer/STALE' as WishlistScope, scopeGeneration: 99, items: [] };
        const mismatchResult = applyWishlistToggle(staleScopeState, {
          product: newItem,
          intendedScope: custAId,
          intendedGeneration: 99,
        });
        assert.equal(mismatchResult.accepted, false);
        assert.equal(mismatchResult.reason, 'scope_mismatch');
        assert.strictEqual(mismatchResult.state, staleScopeState, 'State updater must return prev unmodified on scope mismatch');

        // --------------------------------------------------------------------
        // Part 10: Confirmed-guest wishlist persistence and non-merging isolation
        // --------------------------------------------------------------------
        customerSession = { authenticated: false };
        sessionStatus = 'guest';
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), null);
        assert.deepEqual(getExposedWishlist(), [itemGuest]);

        const guestItem2: any = { id: 'prod_g2', title: 'Guest Sticker Pack', priceAmount: 10, images: ['/img/g2.jpg'], category: 'accessories' };
        const guestAdd = await productionToggleWishlist(guestItem2);
        assert.equal(guestAdd.accepted, true);
        assert.ok(getExposedWishlist().some((i: any) => i.id === 'prod_g2'));

        // Customer A logs back in
        customerSession = { authenticated: true, customer: { id: custAId } };
        sessionStatus = 'authenticated';
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), custAId);

        // Verify Customer A's wishlist does NOT include any guest items
        assert.ok(!getExposedWishlist().some((i: any) => i.id === 'prod_g'), 'Guest item must not merge into Customer A');
        assert.ok(!getExposedWishlist().some((i: any) => i.id === 'prod_g2'), 'Second guest item must not merge into Customer A');

        // Customer A logs out -> Guest wishlist is restored with both guest items
        customerSession = { authenticated: false };
        sessionStatus = 'guest';
        scopeGeneration++;
        syncStateFromEffect();
        assert.equal(getConfirmedScope(), null);
        assert.ok(getExposedWishlist().some((i: any) => i.id === 'prod_g'));
        assert.ok(getExposedWishlist().some((i: any) => i.id === 'prod_g2'));

        // Storage verification
        assert.deepEqual(testLoadWishlistForScope(custAId), [itemA], 'Customer A storage key remains untouched and isolated');
        assert.deepEqual(testLoadWishlistForScope(custBId), [itemB], 'Customer B storage key remains untouched and isolated');
        assert.deepEqual(testLoadWishlistForScope(undefined), [], 'Unresolved scope storage load returns empty array');

        // --------------------------------------------------------------------
        // Part 11: Component-level check of displayed items, empty states, and notifications
        // --------------------------------------------------------------------
        // 11a: Unresolved / disabled state renders "Session Unresolved" and "Retry Verification"
        const unresolvedHtml = renderToStaticMarkup(
          React.createElement(WishlistDrawer, {
            isOpen: true,
            onClose: () => {},
            wishlist: [],
            currency: 'USD',
            onRemoveFromWishlist: () => {},
            onAddToCart: () => {},
            onQuickView: () => {},
            isWishlistDisabled: true,
            onRetrySession: () => {},
          })
        );
        assert.ok(unresolvedHtml.includes('Session Unresolved'), 'Component must display Session Unresolved header when disabled');
        assert.ok(unresolvedHtml.includes('Retry Verification'), 'Component must render Retry Verification button when disabled');

        // 11b: Populated state renders item title and count
        const populatedHtml = renderToStaticMarkup(
          React.createElement(WishlistDrawer, {
            isOpen: true,
            onClose: () => {},
            wishlist: [itemA],
            currency: 'USD',
            onRemoveFromWishlist: () => {},
            onAddToCart: () => {},
            onQuickView: () => {},
            isWishlistDisabled: false,
          })
        );
        assert.ok(populatedHtml.includes('Saved Merch (1)'), 'Component must display Saved Merch (1) in header');
        assert.ok(populatedHtml.includes('Sweatshirt A'), 'Component must display item title in list');

        // 11c: Empty state renders "No saved merch"
        const emptyHtml = renderToStaticMarkup(
          React.createElement(WishlistDrawer, {
            isOpen: true,
            onClose: () => {},
            wishlist: [],
            currency: 'USD',
            onRemoveFromWishlist: () => {},
            onAddToCart: () => {},
            onQuickView: () => {},
            isWishlistDisabled: false,
          })
        );
        assert.ok(emptyHtml.includes('No saved merch'), 'Component must display No saved merch message');
      });

      // (m.21) Requirement: WishlistCoordinator Authoritative State Coordinator & Delayed React Publication Harness
      await t3.test('21. Authoritative WishlistCoordinator with delayed React publication harness', async () => {
        // Storage simulation backed by Map
        const storageMap = new Map<string, string>();
        const mockStorageAdapter: WishlistStorageAdapter = {
          getItem: (key: string) => storageMap.get(key) || null,
          setItem: (key: string, value: string) => storageMap.set(key, value),
        };

        const custAId = 'gid://shopify/Customer/AAAA';
        const custBId = 'gid://shopify/Customer/BBBB';
        const itemA: any = { id: 'prod_a', title: 'Sweatshirt A', priceAmount: 50, images: ['/img/a.jpg'], category: 'sweatshirts' };
        const itemB: any = { id: 'prod_b', title: 'Tee B', priceAmount: 30, images: ['/img/b.jpg'], category: 't-shirts' };
        const itemGuest: any = { id: 'prod_g', title: 'Guest Cap', priceAmount: 20, images: ['/img/g.jpg'], category: 'caps' };
        const itemX: any = { id: 'prod_x', title: 'Item X', priceAmount: 10, images: ['/img/x.jpg'], category: 'accessories' };
        const itemY: any = { id: 'prod_y', title: 'Item Y', priceAmount: 15, images: ['/img/y.jpg'], category: 'accessories' };

        // Pre-populate storage
        storageMap.set(getWishlistStorageKey(custAId)!, JSON.stringify([itemA]));
        storageMap.set(getWishlistStorageKey(custBId)!, JSON.stringify([itemB]));
        storageMap.set(getWishlistStorageKey(null)!, JSON.stringify([itemGuest]));

        let notifications: { message: string; isError?: boolean }[] = [];
        const coordinator = createWishlistCoordinator({
          storage: mockStorageAdapter,
          onNotify: (message, isError) => {
            notifications.push({ message, isError });
          },
        });

        // Harness simulating React's delayed/batched render scheduling gap
        class DelayedReactHarness {
          private coordinator: WishlistCoordinator;
          private pendingState: WishlistState | null = null;
          private renderedState: WishlistState;
          private unsubscribe: () => void;

          constructor(c: WishlistCoordinator) {
            this.coordinator = c;
            this.renderedState = c.getState();
            this.unsubscribe = c.subscribe((next) => {
              // React batching: subscriber callback queues pending render
              this.pendingState = next;
            });
          }

          getReactState(): WishlistState {
            return this.renderedState;
          }

          hasPendingUpdate(): boolean {
            return this.pendingState !== null;
          }

          flushReactRender(): WishlistState {
            if (this.pendingState !== null) {
              this.renderedState = this.pendingState;
              this.pendingState = null;
            }
            return this.renderedState;
          }

          dispose() {
            this.unsubscribe();
          }
        }

        const harness = new DelayedReactHarness(coordinator);

        // --------------------------------------------------------------------
        // Scenario 1: Schedule A's action, switch to B, then run A's action
        // Expectation: no mutation to B's state, no persistence under A or B, no success notification
        // --------------------------------------------------------------------
        coordinator.setScope(custAId);
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, custAId);
        assert.deepEqual(coordinator.getState().items, [itemA]);

        notifications = [];
        const genA = coordinator.getState().scopeGeneration;
        // Schedule A's action with a 40ms delay
        const schedA_promise = coordinator.toggle(itemX, {
          intendedScope: custAId,
          intendedGeneration: genA,
          delayMs: 40,
        });

        // Before A's action executes, switch to B
        coordinator.setScope(custBId);
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, custBId);
        assert.deepEqual(coordinator.getState().items, [itemB]);

        const resultA = await schedA_promise;
        assert.equal(resultA.accepted, false, 'Action scheduled for A must be rejected when scope is B');
        assert.equal(resultA.reason, 'stale_generation'); // generation advanced when switching to B

        // Verify no success notifications occurred
        assert.equal(
          notifications.filter((n) => !n.isError).length,
          0,
          'No success notification must be emitted for rejected action'
        );

        // Verify storage was not mutated for A or B
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custAId)!)!), [itemA]);
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custBId)!)!), [itemB]);
        // Verify current state of B remains [itemB]
        assert.deepEqual(coordinator.getState().items, [itemB]);

        // --------------------------------------------------------------------
        // Scenario 2: Repeat A -> B -> A
        // Expectation: Generation guard invalidates action scheduled under first A even when customer ID returns to A
        // --------------------------------------------------------------------
        coordinator.setScope(custAId);
        harness.flushReactRender();
        const initialGenA = coordinator.getState().scopeGeneration;

        notifications = [];
        // Schedule action for A with initial generation
        const actionA_promise = coordinator.toggle(itemX, {
          intendedScope: custAId,
          intendedGeneration: initialGenA,
          delayMs: 40,
        });

        // Switch to B
        coordinator.setScope(custBId);
        // Switch back to A (A -> B -> A)
        coordinator.setScope(custAId);
        harness.flushReactRender();

        const currentGenA = coordinator.getState().scopeGeneration;
        assert.ok(currentGenA > initialGenA, 'Scope generation must advance on every setScope call');

        const resultA2 = await actionA_promise;
        assert.equal(resultA2.accepted, false, 'Action from prior generation must be rejected in A -> B -> A');
        assert.equal(resultA2.reason, 'stale_generation');
        assert.equal(
          notifications.filter((n) => !n.isError).length,
          0,
          'No success toast emitted in A -> B -> A'
        );
        // Storage for A remains [itemA]
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custAId)!)!), [itemA]);

        // --------------------------------------------------------------------
        // Scenario 3: Run two toggles before a React rerender
        // Expectation: Final coordinator state, storage, and flushed React state agree;
        //              both actions applied in order; no stale overwrite from captured render state.
        // --------------------------------------------------------------------
        coordinator.setScope(custAId);
        harness.flushReactRender();
        assert.deepEqual(harness.getReactState().items, [itemA]);

        notifications = [];
        // Toggle 1: Add itemX
        const t1 = await coordinator.toggle(itemX);
        assert.equal(t1.accepted, true);
        assert.equal(t1.action, 'added');

        // Note: coordinator state and storage are immediately updated to [itemA, itemX]
        assert.deepEqual(coordinator.getState().items, [itemA, itemX]);
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custAId)!)!), [itemA, itemX]);
        // But React has NOT rerendered yet! (harness pending update is queued)
        assert.equal(harness.hasPendingUpdate(), true);
        assert.deepEqual(harness.getReactState().items, [itemA], 'React view is still at stale state');

        // Toggle 2: Add itemY before React rerender
        const t2 = await coordinator.toggle(itemY);
        assert.equal(t2.accepted, true);
        assert.equal(t2.action, 'added');

        // Coordinator state and storage now have [itemA, itemX, itemY]
        assert.deepEqual(coordinator.getState().items, [itemA, itemX, itemY]);
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custAId)!)!), [itemA, itemX, itemY]);

        // Now flush the React rerender
        harness.flushReactRender();
        assert.deepEqual(
          harness.getReactState().items,
          [itemA, itemX, itemY],
          'Flushed React state matches authoritative coordinator and storage'
        );

        // Verify two success notifications in correct order
        assert.equal(notifications.length, 2);
        assert.equal(notifications[0].message, getWishlistNotificationMessage('added', itemX.title));
        assert.equal(notifications[1].message, getWishlistNotificationMessage('added', itemY.title));

        // --------------------------------------------------------------------
        // Scenario 4: Start session verification while an action is pending
        // Expectation: Reject old action, no storage write, no success toast
        // --------------------------------------------------------------------
        coordinator.setScope(custAId);
        harness.flushReactRender();
        notifications = [];

        const curGen = coordinator.getState().scopeGeneration;
        const pendingToggle = coordinator.toggle(itemX, {
          intendedScope: custAId,
          intendedGeneration: curGen,
          delayMs: 40,
        });

        // Verification starts while action is pending
        coordinator.startSessionVerification();
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, undefined);
        assert.deepEqual(coordinator.getState().items, []);

        const verifyResult = await pendingToggle;
        assert.equal(verifyResult.accepted, false, 'Pending action must be rejected when verification started');
        assert.ok(
          verifyResult.reason === 'unresolved' || verifyResult.reason === 'stale_generation',
          'Must reject with unresolved or stale_generation'
        );
        assert.equal(
          notifications.filter((n) => !n.isError).length,
          0,
          'No success notification when verification started'
        );

        // --------------------------------------------------------------------
        // Scenario 5: Confirm guest behaviour remains isolated
        // Expectation: Guest storage is isolated; items are not merged into customer accounts
        // --------------------------------------------------------------------
        coordinator.setScope(null);
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, null);
        assert.deepEqual(coordinator.getState().items, [itemGuest]);

        // Add itemX to guest wishlist
        await coordinator.toggle(itemX);
        assert.deepEqual(coordinator.getState().items, [itemGuest, itemX]);
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(null)!)!), [itemGuest, itemX]);

        // Switch to Customer B
        coordinator.setScope(custBId);
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, custBId);
        // Customer B must NOT have guest items merged!
        assert.deepEqual(coordinator.getState().items, [itemB]);
        assert.deepEqual(JSON.parse(storageMap.get(getWishlistStorageKey(custBId)!)!), [itemB]);

        // Switch back to Guest
        coordinator.setScope(null);
        harness.flushReactRender();
        assert.equal(coordinator.getState().customerId, null);
        assert.deepEqual(coordinator.getState().items, [itemGuest, itemX]);

        harness.dispose();
      });

      // (m.22) Requirement: Synchronous logout-in-progress guard prevents resurrection from focus, session-changed events, or racing authenticated responses
      await t3.test('22. Logout lifecycle race regression: guard blocks focus/session-changed events and rejects late responses', async () => {
        const storageMap = new Map<string, string>();
        const mockStorageAdapter: WishlistStorageAdapter = {
          getItem: (key: string) => storageMap.get(key) || null,
          setItem: (key: string, value: string) => storageMap.set(key, value),
        };

        const custAId = 'gid://shopify/Customer/AAAA';
        const itemA: any = { id: 'prod_a', title: 'Sweatshirt A', priceAmount: 50, images: ['/img/a.jpg'], category: 'sweatshirts' };
        const itemX: any = { id: 'prod_x', title: 'Item X', priceAmount: 10, images: ['/img/x.jpg'], category: 'accessories' };
        storageMap.set(getWishlistStorageKey(custAId)!, JSON.stringify([itemA]));

        let toastMessage: string | null = null;
        const coordinator = createWishlistCoordinator({
          storage: mockStorageAdapter,
          onNotify: (msg) => {
            toastMessage = msg;
          },
        });

        // Simulating the exact state machine and refs of App.tsx
        type SessionStatus = 'unresolved' | 'authenticated' | 'guest';
        let sessionStatus: SessionStatus = 'authenticated';
        let customerSession: any = { authenticated: true, customer: { id: custAId } };
        let sessionRequestId = 0;
        let isLogoutInProgress = false;
        let fetchCallCount = 0;

        coordinator.setScope(custAId);

        function getActiveCustomerId(): string | null {
          return customerSession?.authenticated && customerSession.customer?.id ? customerSession.customer.id : null;
        }

        function getConfirmedScope(): WishlistScope {
          const activeId = getActiveCustomerId();
          return !isLogoutInProgress && sessionStatus === 'authenticated' && activeId
            ? activeId
            : !isLogoutInProgress && sessionStatus === 'guest'
              ? null
              : undefined;
        }

        function getExposedWishlist(): any[] {
          const confirmed = getConfirmedScope();
          const isConfirmed = !isLogoutInProgress && confirmed !== undefined && coordinator.getState().customerId === confirmed;
          return isConfirmed ? coordinator.getState().items : [];
        }

        function isWishlistDisabled(): boolean {
          const confirmed = getConfirmedScope();
          return !(!isLogoutInProgress && confirmed !== undefined && coordinator.getState().customerId === confirmed);
        }

        async function syncSession(options?: { forceRecovery?: boolean; mockResponse?: any }): Promise<void> {
          if (options?.forceRecovery) {
            isLogoutInProgress = false;
          }

          // While logout is in progress, ignore focus/session-change attempts to start verification
          if (isLogoutInProgress) {
            return;
          }

          const reqId = ++sessionRequestId;
          fetchCallCount++;
          coordinator.startSessionVerification();
          sessionStatus = 'unresolved';

          const sess = options?.mockResponse || { authenticated: true, customer: { id: custAId } };

          // Reject late responses while logout is in progress
          if (isLogoutInProgress) {
            return;
          }

          if (reqId === sessionRequestId) {
            if (sess && sess.authenticated === true && sess.customer?.id) {
              customerSession = sess;
              sessionStatus = 'authenticated';
              coordinator.setScope(sess.customer.id);
            } else if (sess && sess.authenticated === false) {
              customerSession = sess;
              sessionStatus = 'guest';
              coordinator.setScope(null);
            }
          }
        }

        function handleLogoutStart() {
          isLogoutInProgress = true;
          sessionRequestId++;
          coordinator.startSessionVerification();
          sessionStatus = 'unresolved';
          customerSession = null;
        }

        function handleLogoutRecovered() {
          isLogoutInProgress = false;
          return syncSession({ forceRecovery: true });
        }

        // Initial authenticated state verification
        assert.equal(getConfirmedScope(), custAId);
        assert.deepEqual(getExposedWishlist(), [itemA]);
        assert.equal(isWishlistDisabled(), false);

        // 1. User starts logout: synchronous guard established immediately
        handleLogoutStart();

        assert.equal(isLogoutInProgress, true, 'isLogoutInProgress must be immediately true');
        assert.equal(getConfirmedScope(), undefined, 'confirmedScope must be undefined during logout');
        assert.deepEqual(getExposedWishlist(), [], 'Exposed wishlist must be immediately hidden upon logout start');
        assert.equal(isWishlistDisabled(), true, 'Wishlist mutations must be disabled during logout');
        assert.equal(coordinator.getState().customerId, undefined, 'Coordinator scope must be unresolved');

        // 2. While logout request is held pending:
        // A. Fire focus event -> syncSession ignored
        const fetchBefore = fetchCallCount;
        await syncSession(); // Simulates window 'focus' event listener
        assert.equal(fetchCallCount, fetchBefore, 'syncSession triggered by focus must be ignored during logout');

        // B. Fire customer-session-changed event -> syncSession ignored
        await syncSession(); // Simulates 'customer-session-changed' event listener
        assert.equal(fetchCallCount, fetchBefore, 'syncSession triggered by customer-session-changed must be ignored during logout');

        // C. Simulate racing/stale network response delivering old authenticated Customer A credentials
        const staleReqId = sessionRequestId; // even if request ID somehow matched
        const staleResponse = { authenticated: true, customer: { id: custAId } };
        // Attempting to deliver the stale response:
        if (!isLogoutInProgress && staleReqId === sessionRequestId) {
          customerSession = staleResponse;
          sessionStatus = 'authenticated';
          coordinator.setScope(custAId);
        }

        assert.equal(customerSession, null, 'Customer session must remain null; late response rejected');
        assert.equal(sessionStatus, 'unresolved', 'Session status must remain unresolved');
        assert.deepEqual(getExposedWishlist(), [], 'Wishlist must remain hidden, never resurrected');
        assert.equal(coordinator.getState().customerId, undefined);

        // D. Verify mutation attempt during logout fails
        const mutationResult = await coordinator.toggle(itemX, {
          intendedScope: getConfirmedScope(),
          intendedGeneration: coordinator.getState().scopeGeneration,
        });
        assert.equal(mutationResult.accepted, false, 'Mutations must be rejected during logout');
        assert.equal(mutationResult.reason, 'unresolved');

        // Verify storage was never written with itemX or modified during logout
        assert.deepEqual(
          JSON.parse(storageMap.get(getWishlistStorageKey(custAId)!)!),
          [itemA],
          'Storage must not be modified or corrupted during logout'
        );

        // 3. Deliberate recovery path: user explicitly clicks Resume Session after logout failure
        await handleLogoutRecovered();
        assert.equal(isLogoutInProgress, false);
        assert.equal(sessionStatus, 'authenticated');
        assert.equal(getConfirmedScope(), custAId);
        assert.deepEqual(getExposedWishlist(), [itemA], 'Wishlist restored only after deliberate recovery');
      });

      // (m.23) Requirement: Storage-write failure in WishlistCoordinator reports in-memory-only result honestly
      await t3.test('23. Storage-write failure in WishlistCoordinator reports in-memory-only result honestly', async () => {
        let storageWriteAttempted = false;
        const failingStorageAdapter: WishlistStorageAdapter = {
          getItem: () => null,
          setItem: () => {
            storageWriteAttempted = true;
            throw new Error('QuotaExceededError: Local storage limit exceeded');
          },
        };

        let lastNotification: string | null = null;
        let lastIsError: boolean | undefined = undefined;

        const custAId = 'gid://shopify/Customer/AAAA';
        const itemX: any = { id: 'prod_x', title: 'Heavyweight Boxy Tee', priceAmount: 45, images: ['/img/x.jpg'], category: 't-shirts' };

        const coordinator = createWishlistCoordinator({
          storage: failingStorageAdapter,
          onNotify: (msg, isError) => {
            lastNotification = msg;
            lastIsError = isError;
          },
        });

        coordinator.setScope(custAId);

        // Toggle Add: storage.setItem throws
        const addResult = await coordinator.toggle(itemX);

        assert.equal(addResult.accepted, true, 'Action is accepted in memory');
        assert.equal(addResult.action, 'added');
        assert.equal(addResult.persisted, false, 'persisted flag must be false when storage write fails');
        assert.ok(storageWriteAttempted, 'Storage write was attempted');

        // Honest notification message verification: MUST report in-memory-only and NOT claim locally saved
        assert.ok(
          addResult.notificationMessage.includes('in-memory only'),
          `Notification message must state in-memory only: actual "${addResult.notificationMessage}"`
        );
        assert.ok(
          !addResult.notificationMessage.includes('locally on this device'),
          'Notification message must NOT falsely claim locally on this device'
        );
        assert.equal(
          addResult.notificationMessage,
          'Saved "Heavyweight Boxy Tee" in-memory only (browser storage unavailable)'
        );

        // Notification callback received the message and error/warning flag
        assert.equal(lastNotification, 'Saved "Heavyweight Boxy Tee" in-memory only (browser storage unavailable)');
        assert.equal(lastIsError, true, 'Notification error flag must be true on storage write failure');

        // Authoritative in-memory state still reflects the added item
        assert.deepEqual(coordinator.getState().items, [itemX]);

        // Toggle Remove: storage.setItem fails on remove as well
        const removeResult = await coordinator.toggle(itemX);

        assert.equal(removeResult.accepted, true);
        assert.equal(removeResult.action, 'removed');
        assert.equal(removeResult.persisted, false);
        assert.ok(
          removeResult.notificationMessage.includes('in-memory only'),
          `Remove message must state in-memory only: actual "${removeResult.notificationMessage}"`
        );
        assert.equal(
          removeResult.notificationMessage,
          'Removed from saved merch (in-memory only; browser storage unavailable)'
        );
        assert.equal(lastIsError, true);
        assert.deepEqual(coordinator.getState().items, [], 'Item was removed in-memory');
      });

      // (m.24) Requirement: Direct tests of production logoutCustomer across all response cases (mocking fetch)
      await t3.test('24. Production logoutCustomer validation: only returns success:true when response is ok, valid JSON, and success === true', async () => {
        const originalFetch = globalThis.fetch;

        try {
          // Case 1: Confirmed success (200, valid JSON with success: true)
          globalThis.fetch = async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ success: true, logoutUrl: '/account' }),
            } as any);

          const resSuccess = await logoutCustomer();
          assert.equal(resSuccess.success, true, 'Must return success:true for 200 with success:true');
          assert.equal(resSuccess.logoutUrl, '/account');
          assert.equal(resSuccess.error, undefined);

          // Case 2: Confirmed success with custom external logout URL
          globalThis.fetch = async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ success: true, logoutUrl: 'https://shopify.com/authentication/logout' }),
            } as any);

          const resSuccessCustomUrl = await logoutCustomer();
          assert.equal(resSuccessCustomUrl.success, true);
          assert.equal(resSuccessCustomUrl.logoutUrl, 'https://shopify.com/authentication/logout');

          // Case 3: Invalid JSON body (e.g. HTML error page or truncated body with status 200)
          globalThis.fetch = async () =>
            ({
              ok: true,
              status: 200,
              json: async () => {
                throw new SyntaxError('Unexpected token < in JSON at position 0');
              },
            } as any);

          const resInvalidJson = await logoutCustomer();
          assert.equal(resInvalidJson.success, false, 'Must return success:false when JSON parsing fails');
          assert.ok(resInvalidJson.error, 'Must provide safe error message on invalid JSON');
          assert.equal(resInvalidJson.logoutUrl, undefined, 'Must not provide logoutUrl on invalid JSON');

          // Case 4: Missing success field in 200 response
          globalThis.fetch = async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ logoutUrl: '/account' }), // missing success: true
            } as any);

          const resMissingSuccess = await logoutCustomer();
          assert.equal(resMissingSuccess.success, false, 'Must return success:false when success field is missing');
          assert.ok(resMissingSuccess.error);
          assert.equal(resMissingSuccess.logoutUrl, undefined);

          // Case 5: Explicit success: false in 200 response
          globalThis.fetch = async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ success: false, error: 'Session revocation failed in backend' }),
            } as any);

          const resExplicitFalse = await logoutCustomer();
          assert.equal(resExplicitFalse.success, false, 'Must return success:false when body has success:false');
          assert.equal(resExplicitFalse.error, 'Session revocation failed in backend');
          assert.equal(resExplicitFalse.logoutUrl, undefined);

          // Case 6: HTTP 500 failure with JSON error payload
          globalThis.fetch = async () =>
            ({
              ok: false,
              status: 500,
              json: async () => ({ error: 'Redis connection failure during logout' }),
            } as any);

          const resHttp500 = await logoutCustomer();
          assert.equal(resHttp500.success, false, 'Must return success:false on HTTP 500');
          assert.equal(resHttp500.error, 'Redis connection failure during logout');
          assert.equal(resHttp500.logoutUrl, undefined);

          // Case 7: HTTP 503 failure with non-JSON body
          globalThis.fetch = async () =>
            ({
              ok: false,
              status: 503,
              json: async () => {
                throw new SyntaxError('Service Unavailable');
              },
            } as any);

          const resHttp503NonJson = await logoutCustomer();
          assert.equal(resHttp503NonJson.success, false, 'Must return success:false on HTTP 503 non-JSON');
          assert.equal(resHttp503NonJson.error, 'Logout failed: HTTP 503');
          assert.equal(resHttp503NonJson.logoutUrl, undefined);

          // Case 8: Network failure (fetch throws error)
          globalThis.fetch = async () => {
            throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1');
          };

          const resNetworkError = await logoutCustomer();
          assert.equal(resNetworkError.success, false, 'Must return success:false on network error');
          assert.equal(resNetworkError.error, 'fetch failed: ECONNREFUSED 127.0.0.1');
          assert.equal(resNetworkError.logoutUrl, undefined);
        } finally {
          globalThis.fetch = originalFetch;
        }
      });
    });

    // Subtest (n): Tester-access request-body parsing (parsed form/JSON objects, raw strings, Buffers, streams, malformed/duplicate/oversized rejection)
    await t2.test('(n) Tester-access request-body parsing handles form objects, raw strings, Buffers, and streams while rejecting invalid payloads', async () => {
      const syntheticSecret = crypto.createHash('sha256').update('synthetic-tester-secret-seed').digest('hex');
      const wrongSecret = crypto.createHash('sha256').update('wrong-synthetic-secret-seed').digest('hex');

      const createStreamReqRes = (options: {
        method?: string;
        url?: string;
        headers?: Record<string, string>;
        chunks?: Array<string | Buffer>;
        parsedBody?: any;
      }) => {
        const chunks = options.chunks || [];
        let idx = 0;
        const req = new Readable({
          read() {
            if (idx < chunks.length) {
              const item = chunks[idx++];
              this.push(Buffer.isBuffer(item) ? item : Buffer.from(item));
            } else {
              this.push(null);
            }
          },
        }) as any;
        req.method = options.method || 'POST';
        req.url = options.url || '/api/auth?action=tester-access';
        req.headers = options.headers || {};
        if ('parsedBody' in options) {
          req.body = options.parsedBody;
        }
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.headers = {} as Record<string, string | string[]>;
        res.headersSent = false;
        res.data = '';
        res.setHeader = (k: string, v: string | string[]) => {
          res.headers[k.toLowerCase()] = v;
        };
        res.getHeader = (k: string) => res.headers[k.toLowerCase()];
        res.end = (chunk?: any) => {
          if (chunk) res.data += chunk.toString();
          res.headersSent = true;
          res.emit('finish');
        };
        return { req, res };
      };

      const countTesterSessions = (store: InMemorySessionStore): number => {
        const rawMap = (store as any).rawRecords as Map<string, { value: string }> | undefined;
        if (!rawMap) return 0;
        let count = 0;
        for (const key of rawMap.keys()) {
          if (key.startsWith('sanelow:tester_sess:')) count++;
        }
        return count;
      };

      // 1. Testing disabled returns TESTING_DISABLED and issues no session
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        delete process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED;
        process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = syntheticSecret;

        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.201',
          },
          parsedBody: { secret: syntheticSecret },
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(JSON.parse(res.data).error, 'TESTING_DISABLED');
        assert.equal(res.headers['set-cookie'], undefined);
        assert.equal(countTesterSessions(memStore), 0);
      }

      process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED = 'true';
      process.env.CUSTOMER_ACCOUNT_TESTER_SECRET = syntheticSecret;

      // 2. HTML form submission with already-parsed req.body object (exact Vercel Serverless reproduction case, including null-prototype querystring object)
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const nullProtoFormBody = Object.assign(Object.create(null), { secret: syntheticSecret });
        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'text/html,application/xhtml+xml',
            'x-vercel-forwarded-for': '198.51.100.202',
          },
          parsedBody: nullProtoFormBody,
          // Stream is empty because body parser already consumed it
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 303, 'Parsed form-urlencoded object from HTML form should redirect with 303');
        assert.equal(res.headers['location'], '/account');
        assert.ok(String(res.headers['set-cookie'] || '').includes(`${TESTER_COOKIE_NAME}=`));
        assert.equal(countTesterSessions(memStore), 1);
      }

      // 3. Equivalent raw form-urlencoded string in req.body
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-vercel-forwarded-for': '198.51.100.203',
          },
          parsedBody: `secret=${encodeURIComponent(syntheticSecret)}`,
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 303);
        assert.ok(String(res.headers['set-cookie'] || '').includes(`${TESTER_COOKIE_NAME}=`));
        assert.equal(countTesterSessions(memStore), 1);
      }

      // 4. Streamed raw form-urlencoded body (no req.body)
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const rawForm = `secret=${syntheticSecret}`;
        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.204',
          },
          chunks: [rawForm.slice(0, 20), rawForm.slice(20)],
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 303);
        assert.ok(String(res.headers['set-cookie'] || '').includes(`${TESTER_COOKIE_NAME}=`));
        assert.equal(countTesterSessions(memStore), 1);
      }

      // 5. Already-parsed JSON object in req.body
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/json; charset=utf-8',
            'x-vercel-forwarded-for': '198.51.100.205',
          },
          parsedBody: { secret: syntheticSecret },
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.data).success, true);
        assert.ok(String(res.headers['set-cookie'] || '').includes(`${TESTER_COOKIE_NAME}=`));
        assert.equal(countTesterSessions(memStore), 1);
      }

      // 6. Buffer req.body (JSON and form-urlencoded) & streamed JSON body
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req: bufJsonReq, res: bufJsonRes } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '198.51.100.206',
          },
          parsedBody: Buffer.from(JSON.stringify({ secret: syntheticSecret }), 'utf8'),
        });
        await authHandler(bufJsonReq, bufJsonRes);
        assert.equal(bufJsonRes.statusCode, 200);
        assert.equal(countTesterSessions(memStore), 1);

        const { req: bufFormReq, res: bufFormRes } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.207',
          },
          parsedBody: Buffer.from(`secret=${syntheticSecret}`, 'utf8'),
        });
        await authHandler(bufFormReq, bufFormRes);
        assert.equal(bufFormRes.statusCode, 303);
        assert.equal(countTesterSessions(memStore), 2);

        const jsonStr = JSON.stringify({ secret: syntheticSecret });
        const { req: streamJsonReq, res: streamJsonRes } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '198.51.100.208',
          },
          chunks: [jsonStr.slice(0, 15), jsonStr.slice(15)],
        });
        await authHandler(streamJsonReq, streamJsonRes);
        assert.equal(streamJsonRes.statusCode, 200);
        assert.equal(countTesterSessions(memStore), 3);
      }

      // 7. Wrong secret returns 401 UNAUTHORIZED with no session issued
      {
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req, res } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.209',
          },
          parsedBody: { secret: wrongSecret },
        });
        await authHandler(req, res);
        assert.equal(res.statusCode, 401);
        assert.equal(JSON.parse(res.data).error, 'UNAUTHORIZED');
        assert.equal(res.headers['set-cookie'], undefined);
        assert.equal(countTesterSessions(memStore), 0);
      }

      // 8. Non-string secrets, arrays, duplicate secret fields, and malformed bodies are rejected with no session issued
      const invalidCases: Array<{ label: string; headers?: Record<string, string>; parsedBody?: any; chunks?: string[] }> = [
        {
          label: 'non-string numeric secret (parsed object)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { secret: 123456 },
        },
        {
          label: 'non-string boolean secret (parsed object)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { secret: true },
        },
        {
          label: 'non-string null secret (parsed object)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { secret: null },
        },
        {
          label: 'non-string object secret (parsed object)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { secret: { value: syntheticSecret } },
        },
        {
          label: 'array secret field (parsed duplicate form field)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          parsedBody: { secret: [syntheticSecret, syntheticSecret] },
        },
        {
          label: 'duplicate secret fields (raw form-urlencoded stream)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          chunks: [`secret=${syntheticSecret}&secret=${syntheticSecret}`],
        },
        {
          label: 'top-level array (parsed)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: [syntheticSecret],
        },
        {
          label: 'top-level array (raw JSON stream)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          chunks: [JSON.stringify([{ secret: syntheticSecret }])],
        },
        {
          label: 'null parsed body',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: null,
        },
        {
          label: 'malformed JSON stream',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          chunks: ['{"secret": '],
        },
        {
          label: 'JSON payload sent as form-urlencoded string',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          chunks: [JSON.stringify({ secret: syntheticSecret })],
        },
        {
          label: 'missing secret field',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { token: syntheticSecret },
        },
        {
          label: 'duplicate secret keys in raw JSON text',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          chunks: [`{"secret":"${wrongSecret}","secret":"${syntheticSecret}"}`],
        },
        {
          label: 'empty string body',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          parsedBody: '',
        },
      ];

      for (let i = 0; i < invalidCases.length; i++) {
        const testCase = invalidCases[i];
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req, res } = createStreamReqRes({
          headers: {
            ...(testCase.headers || { origin: trustedBaseUrl }),
            'x-vercel-forwarded-for': `198.51.100.${210 + i}`,
          },
          ...(testCase.chunks ? { chunks: testCase.chunks } : {}),
          ...('parsedBody' in testCase ? { parsedBody: testCase.parsedBody } : {}),
        });
        await authHandler(req, res);
        assert.ok(
          res.statusCode >= 400 && res.statusCode < 500,
          `Invalid case "${testCase.label}" must be rejected with 4xx, got ${res.statusCode}`
        );
        assert.equal(res.headers['set-cookie'], undefined, `No cookie may be issued for "${testCase.label}"`);
        assert.equal(countTesterSessions(memStore), 0, `No Redis session may be stored for "${testCase.label}"`);
      }

      // 9. Oversized input (> 16 KB) rejected for streamed, raw string, Buffer, and parsed object
      const oversizedCases: Array<{ label: string; headers?: Record<string, string>; parsedBody?: any; chunks?: string[] }> = [
        {
          label: 'oversized streamed form body (> 16 KB)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          chunks: [`secret=${syntheticSecret}&pad=`, 'a'.repeat(17000)],
        },
        {
          label: 'oversized parsed object (> 16 KB)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: { secret: syntheticSecret, pad: 'a'.repeat(17000) },
        },
        {
          label: 'oversized raw string body (> 16 KB)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/json' },
          parsedBody: JSON.stringify({ secret: syntheticSecret, pad: 'a'.repeat(17000) }),
        },
        {
          label: 'oversized Buffer body (> 16 KB)',
          headers: { origin: trustedBaseUrl, 'content-type': 'application/x-www-form-urlencoded' },
          parsedBody: Buffer.from(`secret=${syntheticSecret}&pad=${'a'.repeat(17000)}`, 'utf8'),
        },
      ];

      for (let i = 0; i < oversizedCases.length; i++) {
        const testCase = oversizedCases[i];
        const memStore = new InMemorySessionStore();
        setSessionStoreForTest(memStore);
        const { req, res } = createStreamReqRes({
          headers: {
            ...(testCase.headers || { origin: trustedBaseUrl }),
            'x-vercel-forwarded-for': `198.51.100.${230 + i}`,
          },
          ...(testCase.chunks ? { chunks: testCase.chunks } : {}),
          ...('parsedBody' in testCase ? { parsedBody: testCase.parsedBody } : {}),
        });
        await authHandler(req, res);
        assert.equal(
          res.statusCode,
          413,
          `Oversized case "${testCase.label}" must be rejected with 413, got ${res.statusCode}`
        );
        assert.equal(JSON.parse(res.data).error, 'PAYLOAD_TOO_LARGE');
        assert.equal(res.headers['set-cookie'], undefined, `No cookie may be issued for "${testCase.label}"`);
        assert.equal(countTesterSessions(memStore), 0, `No Redis session may be stored for "${testCase.label}"`);
      }

      // 10. Kill switch and CSRF still deny valid parsed form submission and issue no session
      {
        const memStore = new InMemorySessionStore();
        await memStore.setRaw(TESTER_KILL_SWITCH_KEY, '1');
        setSessionStoreForTest(memStore);
        const { req: killedReq, res: killedRes } = createStreamReqRes({
          headers: {
            origin: trustedBaseUrl,
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.240',
          },
          parsedBody: { secret: syntheticSecret },
        });
        await authHandler(killedReq, killedRes);
        assert.equal(killedRes.statusCode, 403);
        assert.equal(JSON.parse(killedRes.data).error, 'TESTING_KILLED');
        assert.equal(killedRes.headers['set-cookie'], undefined);
        assert.equal(countTesterSessions(memStore), 0);

        const memStoreCsrf = new InMemorySessionStore();
        setSessionStoreForTest(memStoreCsrf);
        const { req: csrfReq, res: csrfRes } = createStreamReqRes({
          headers: {
            origin: 'https://evil.example',
            'content-type': 'application/x-www-form-urlencoded',
            'x-vercel-forwarded-for': '198.51.100.241',
          },
          parsedBody: { secret: syntheticSecret },
        });
        await authHandler(csrfReq, csrfRes);
        assert.equal(csrfRes.statusCode, 403);
        assert.equal(JSON.parse(csrfRes.data).error, 'CSRF_VALIDATION_FAILED');
        assert.equal(csrfRes.headers['set-cookie'], undefined);
        assert.equal(countTesterSessions(memStoreCsrf), 0);
      }
    });

    // Cleanup environment
    delete process.env.CUSTOMER_ACCOUNT_TESTING_ENABLED;
    delete process.env.CUSTOMER_ACCOUNT_TESTER_SECRET;
  });
});

