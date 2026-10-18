import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
  SessionStorageError,
  AUTH_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  SHOPIFY_SHOP_ID,
  HOSTED_ACCOUNT_FALLBACK_URL,
  OpenIdDiscoveryConfig,
} from '../api/auth.js';
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
} from '../src/lib/shopify';

function createMockReqRes(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const req = new EventEmitter() as any;
  req.method = options.method || 'GET';
  req.url = options.url || '/';
  req.headers = options.headers || {};

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

      assert.equal(res.variantsIncomplete, true);
      assert.ok(res.incompleteReason?.includes('missing or empty endCursor'));
      assert.ok(res.product !== null);
      assert.equal(res.product.variants.length, 1);
    });
  });
});

