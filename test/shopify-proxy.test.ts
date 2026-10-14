import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import handler from '../api/shopify';
import vercelConfig from '../vercel.json';

// Helper to create a mock HTTP request and response
function createMockHttp({
  method = 'POST',
  headers = { 'content-type': 'application/json' },
  body,
  streamChunks,
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  streamChunks?: string[];
}) {
  const req: any = {
    method,
    headers: { ...headers },
    body,
  };

  if (streamChunks) {
    req[Symbol.asyncIterator] = async function* () {
      for (const chunk of streamChunks) {
        yield Buffer.from(chunk);
      }
    };
  }

  const resState = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
  };

  const res: any = {
    get statusCode() {
      return resState.statusCode;
    },
    set statusCode(code: number) {
      resState.statusCode = code;
    },
    setHeader(key: string, value: string) {
      resState.headers[key.toLowerCase()] = value;
    },
    getHeader(key: string) {
      return resState.headers[key.toLowerCase()];
    },
    end(chunk?: string) {
      if (chunk) resState.body += chunk;
    },
  };

  return { req, res, resState };
}

describe('Shopify Proxy Security & Validation Tests', () => {
  // Set required dummy domain for tests to prevent domain mismatch error
  process.env.SHOPIFY_STORE_DOMAIN = 'sx71id-uy.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'test_token_123';

  test('1. A caller cannot supply arbitrary GraphQL, even under an allowed operation name', async () => {
    // Attempt to pass an arbitrary query along with an allowed operation
    const { req, res, resState } = createMockHttp({
      body: {
        operation: 'GetProducts',
        query: '{ customers(first: 10) { edges { node { id email } } } }',
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 400);
    const data = JSON.parse(resState.body);
    assert.equal(data.error, 'ARBITRARY_GRAPHQL_REJECTED');
    assert.match(data.message, /Client-supplied GraphQL query strings are not permitted/);
  });

  test('2. A caller supplying only arbitrary GraphQL without operation is rejected', async () => {
    const { req, res, resState } = createMockHttp({
      body: {
        query: '{ shop { name } }',
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 400);
    const data = JSON.parse(resState.body);
    assert.equal(data.error, 'ARBITRARY_GRAPHQL_REJECTED');
  });

  test('3. Oversized already-parsed request bodies (> 64 KB) are rejected with 413', async () => {
    // Create an object larger than 64 KB (65,536 bytes)
    const largePadding = 'A'.repeat(70 * 1024);
    const { req, res, resState } = createMockHttp({
      body: {
        operation: 'GetProducts',
        variables: { first: 10, padding: largePadding },
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 413);
    const data = JSON.parse(resState.body);
    assert.match(data.error, /Payload Too Large/i);
  });

  test('4. Oversized streamed request bodies (> 64 KB) are rejected with 413', async () => {
    const chunk1 = JSON.stringify({ operation: 'GetProducts', padding: 'x'.repeat(40 * 1024) }).slice(0, 35000);
    const chunk2 = 'y'.repeat(40 * 1024);

    const { req, res, resState } = createMockHttp({
      streamChunks: [chunk1, chunk2],
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 413);
    const data = JSON.parse(resState.body);
    assert.match(data.error, /Payload Too Large/i);
  });

  test('5. Malformed bodies (arrays, null, primitives) are rejected with 400', async () => {
    // Test array body
    const mockArray = createMockHttp({ body: ['GetProducts'] });
    await handler(mockArray.req, mockArray.res);
    assert.equal(mockArray.resState.statusCode, 400);

    // Test null body
    const mockNull = createMockHttp({ body: null });
    await handler(mockNull.req, mockNull.res);
    assert.equal(mockNull.resState.statusCode, 400);
  });

  test('6. Unknown operations are rejected with 400', async () => {
    const { req, res, resState } = createMockHttp({
      body: {
        operation: 'DropAllCollections',
        variables: {},
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 400);
    const data = JSON.parse(resState.body);
    assert.equal(data.error, 'UNKNOWN_OPERATION');
  });

  test('7. Invalid variables are strictly rejected: GetProducts pagination limit', async () => {
    // first > 100
    const { req, res, resState } = createMockHttp({
      body: {
        operation: 'GetProducts',
        variables: { first: 500 },
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 400);
    const data = JSON.parse(resState.body);
    assert.equal(data.error, 'INVALID_VARIABLES');
    assert.match(data.message, /first.*between 1 and 100/i);
  });

  test('8. Invalid variables are strictly rejected: CartLinesAdd quantity & line bounds', async () => {
    // Line quantity <= 0
    const mockZeroQty = createMockHttp({
      body: {
        operation: 'CartLinesAdd',
        variables: {
          cartId: 'gid://shopify/Cart/123',
          lines: [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 0 }],
        },
      },
    });

    await handler(mockZeroQty.req, mockZeroQty.res);
    assert.equal(mockZeroQty.resState.statusCode, 400);
    assert.match(JSON.parse(mockZeroQty.resState.body).message, /quantity must be an integer between 1 and 100/i);

    // Empty lines array
    const mockEmptyLines = createMockHttp({
      body: {
        operation: 'CartLinesAdd',
        variables: {
          cartId: 'gid://shopify/Cart/123',
          lines: [],
        },
      },
    });

    await handler(mockEmptyLines.req, mockEmptyLines.res);
    assert.equal(mockEmptyLines.resState.statusCode, 400);
    assert.match(JSON.parse(mockEmptyLines.resState.body).message, /non-empty array/i);
  });

  test('9. Admin API tokens (shpat_* / shpca_*) are rejected immediately with 500', async () => {
    const origToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'shpat_999999999999999999999';

    const { req, res, resState } = createMockHttp({
      body: {
        operation: 'GetProducts',
        variables: { first: 10 },
      },
    });

    await handler(req, res);

    assert.equal(resState.statusCode, 500);
    const data = JSON.parse(resState.body);
    assert.equal(data.error, 'ADMIN_TOKEN_NOT_SUPPORTED');

    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = origToken;
  });

  test('10. Vercel routing regex guarantees static assets and API routes work without hitting index.html fallback', () => {
    const rewriteRule = vercelConfig.rewrites.find((r: any) => r.destination === '/index.html');
    assert.ok(rewriteRule, 'Rewrite rule to index.html must exist');

    // Parse the negative lookahead regex
    const regex = new RegExp(`^${rewriteRule.source}$`);

    // API routes must NOT be rewritten to index.html (reaches serverless function)
    assert.equal(regex.test('/api/shopify'), false, '/api/shopify must NOT rewrite to index.html');
    assert.equal(regex.test('/api/health'), false, '/api/health must NOT rewrite to index.html');

    // Static assets with file extensions must NOT be rewritten to index.html
    assert.equal(regex.test('/assets/index-D8abc123.js'), false, 'JS assets must NOT rewrite to index.html');
    assert.equal(regex.test('/assets/style-A1b2c3.css'), false, 'CSS assets must NOT rewrite to index.html');
    assert.equal(regex.test('/favicon.ico'), false, 'Favicon must NOT rewrite to index.html');
    assert.equal(regex.test('/logo.svg'), false, 'SVG logo must NOT rewrite to index.html');
    assert.equal(regex.test('/sanelow-hoodie.webp'), false, 'WebP image must NOT rewrite to index.html');

    // Client-side page routes MUST be rewritten to index.html for SPA routing
    assert.equal(regex.test('/'), true, 'Root / must rewrite to index.html');
    assert.equal(regex.test('/cart'), true, '/cart must rewrite to index.html');
    assert.equal(regex.test('/products'), true, '/products must rewrite to index.html');
    assert.equal(regex.test('/collections/outerwear'), true, '/collections/outerwear must rewrite to index.html');
  });
});
