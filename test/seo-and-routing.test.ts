import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import renderHandler from '../api/render';
import sitemapHandler from '../api/sitemap';
import robotsHandler from '../api/robots';
import {
  getBaseUrl,
  getRobotsDirective,
  isPreviewDeployment,
  generateProductSchema,
  generateCollectionSchema,
  generateBreadcrumbSchema,
  renderFullHtmlDocument,
  escapeXml,
  serializeJsonLd,
} from '../api/render';
import vercelConfig from '../vercel.json';

// Helper to create a mock HTTP request and response
function createMockHttp({
  method = 'GET',
  url = '/',
  headers = {},
}: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
} = {}) {
  const req: any = {
    method,
    url,
    headers: { ...headers },
  };

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

describe('Technical SEO, Structured Data & Routing Tests', () => {
  const origEnv = process.env.VERCEL_ENV;
  const origSiteUrl = process.env.SITE_URL;

  test('1. Base URL defaults to https://shop.sanelowmusiclabel.co.za and is configurable', () => {
    delete process.env.SITE_URL;
    delete process.env.VITE_SITE_URL;
    assert.equal(getBaseUrl(), 'https://shop.sanelowmusiclabel.co.za');

    process.env.SITE_URL = 'https://custom.sanelow.com/';
    assert.equal(getBaseUrl(), 'https://custom.sanelow.com'); // Trailing slash stripped
    delete process.env.SITE_URL;
  });

  test('2. Distinguish preview from production using VERCEL_ENV and do not treat every *.vercel.app as preview', () => {
    // 1) Explicit VERCEL_ENV=preview -> ALWAYS preview
    process.env.VERCEL_ENV = 'preview';
    assert.equal(isPreviewDeployment('any-host.com'), true);
    let directive = getRobotsDirective('any-host.com');
    assert.match(directive.metaTag, /noindex,\s*nofollow/);
    assert.equal(directive.headerValue, 'noindex, nofollow');

    // 2) Explicit VERCEL_ENV=production -> NOT preview even on vercel.app default project alias!
    process.env.VERCEL_ENV = 'production';
    assert.equal(isPreviewDeployment('sanelow-merch.vercel.app'), false);
    assert.equal(isPreviewDeployment('shop.sanelowmusiclabel.co.za'), false);
    directive = getRobotsDirective('shop.sanelowmusiclabel.co.za');
    assert.match(directive.metaTag, /index,\s*follow/);
    assert.equal(directive.headerValue, 'index, follow');

    // 3) When VERCEL_ENV is undefined, preview subdomains like -git- or preview are detected
    delete process.env.VERCEL_ENV;
    assert.equal(isPreviewDeployment('sanelow-merch-git-feature-preview.vercel.app'), true);
    assert.equal(isPreviewDeployment('localhost:3000'), true);
    assert.equal(isPreviewDeployment('shop.sanelowmusiclabel.co.za'), false);

    process.env.VERCEL_ENV = origEnv;
  });

  test('3. Canonical URLs are NEVER set to preview domains', () => {
    delete process.env.SITE_URL;
    delete process.env.VITE_SITE_URL;
    process.env.VERCEL_ENV = 'preview';

    const html = renderFullHtmlDocument({
      title: 'Heavyweight Hoodie | Sanelow',
      description: 'Authentic Sanelow piece.',
      canonicalUrl: `${getBaseUrl()}/products/heavyweight-hoodie-black`,
      host: 'sanelow-abc123-preview.vercel.app',
      bodyHtml: '<p>Test</p>',
    });

    // Must be canonicalised to https://shop.sanelowmusiclabel.co.za, never vercel.app
    assert.match(html, /<link rel="canonical" href="https:\/\/shop\.sanelowmusiclabel\.co\.za\/products\/heavyweight-hoodie-black" \/>/);
    assert.doesNotMatch(html, /href=".*\.vercel\.app/);
    // Preview host triggers noindex in HTML
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);

    process.env.VERCEL_ENV = origEnv;
  });

  test('4. Truthful ProductGroup and Product variant structured data for multi-variant products', () => {
    const mockMultiVariantProduct = {
      id: 'gid://shopify/Product/1',
      title: 'Sanelow Archive Heavyweight Hoodie',
      handle: 'sanelow-archive-heavyweight-hoodie',
      description: 'Heavyweight 450 GSM fleece hoodie made in Cape Town.',
      vendor: 'Sanelow Label Merch',
      options: [
        { name: 'Size', values: ['M', 'L'] },
      ],
      images: {
        edges: [
          { node: { url: 'https://cdn.shopify.com/s/files/hoodie-front.jpg' } },
        ],
      },
      variants: {
        edges: [
          {
            node: {
              id: 'gid://shopify/ProductVariant/101',
              title: 'M / Black',
              availableForSale: true,
              sku: 'SNLW-HD-001-M',
              price: { amount: '1299.00', currencyCode: 'ZAR' },
              selectedOptions: [{ name: 'Size', value: 'M' }],
            },
          },
          {
            node: {
              id: 'gid://shopify/ProductVariant/102',
              title: 'L / Black',
              availableForSale: false,
              sku: 'SNLW-HD-001-L',
              price: { amount: '1299.00', currencyCode: 'ZAR' },
              selectedOptions: [{ name: 'Size', value: 'L' }],
            },
          },
        ],
      },
    };

    const schema = generateProductSchema(mockMultiVariantProduct, 'https://shop.sanelowmusiclabel.co.za');

    assert.equal(schema['@context'], 'https://schema.org');
    // Multi-variant uses ProductGroup according to Google Search Central
    assert.equal(schema['@type'], 'ProductGroup');
    assert.equal(schema.name, 'Sanelow Archive Heavyweight Hoodie');
    assert.equal(schema.url, 'https://shop.sanelowmusiclabel.co.za/products/sanelow-archive-heavyweight-hoodie');
    assert.deepEqual(schema.variesBy, ['https://schema.org/size']);
    assert.equal(schema.brand?.name, 'Sanelow Label Merch');

    // Verify variants under hasVariant
    assert.equal(Array.isArray(schema.hasVariant), true);
    assert.equal(schema.hasVariant.length, 2);

    const v1 = schema.hasVariant[0];
    assert.equal(v1['@type'], 'Product');
    assert.equal(v1.sku, 'SNLW-HD-001-M');
    assert.equal(v1.size, 'M');
    assert.equal(v1.offers.price, '1299.00');
    assert.equal(v1.offers.priceCurrency, 'ZAR');
    assert.equal(v1.offers.availability, 'https://schema.org/InStock');

    const v2 = schema.hasVariant[1];
    assert.equal(v2['@type'], 'Product');
    assert.equal(v2.sku, 'SNLW-HD-001-L');
    assert.equal(v2.size, 'L');
    assert.equal(v2.offers.availability, 'https://schema.org/OutOfStock');

    // Strict truthful check: no fabricated reviews or ratings
    assert.equal(schema.aggregateRating, undefined);
    assert.equal(schema.review, undefined);
  });

  test('5. Single-variant products output schema.org/Product with Offer', () => {
    const mockSingleProduct = {
      title: 'Sanelow Enamel Pin',
      handle: 'sanelow-enamel-pin',
      description: 'Exclusive enamel pin badge.',
      vendor: 'Sanelow Label Merch',
      variants: {
        edges: [
          {
            node: {
              id: 'gid://shopify/ProductVariant/201',
              title: 'Default Title',
              availableForSale: true,
              sku: 'SNLW-PIN-01',
              price: { amount: '150.00', currencyCode: 'ZAR' },
            },
          },
        ],
      },
    };

    const schema = generateProductSchema(mockSingleProduct, 'https://shop.sanelowmusiclabel.co.za');
    assert.equal(schema['@context'], 'https://schema.org');
    assert.equal(schema['@type'], 'Product');
    assert.equal(schema.name, 'Sanelow Enamel Pin');
    assert.equal(schema.offers['@type'], 'Offer');
    assert.equal(schema.offers.price, '150.00');
    assert.equal(schema.offers.priceCurrency, 'ZAR');
    assert.equal(schema.offers.availability, 'https://schema.org/InStock');
  });

  test('6. Truthful CollectionPage JSON-LD schema with ItemList', () => {
    const mockCollection = {
      title: 'Heavyweight Fleece Drop',
      handle: 'heavyweight-fleece',
      description: 'Curated heavyweight fleece essentials.',
      products: {
        edges: [
          { node: { title: 'Boxy Hoodie', handle: 'boxy-hoodie' } },
          { node: { title: 'Fleece Sweatpant', handle: 'fleece-sweatpant' } },
        ],
      },
    };

    const schema = generateCollectionSchema(mockCollection, 'https://shop.sanelowmusiclabel.co.za');
    assert.equal(schema['@context'], 'https://schema.org');
    assert.equal(schema['@type'], 'CollectionPage');
    assert.equal(schema.name, 'Heavyweight Fleece Drop');
    assert.equal(schema.mainEntity['@type'], 'ItemList');
    assert.equal(schema.mainEntity.itemListElement.length, 2);
    assert.equal(schema.mainEntity.itemListElement[0].url, 'https://shop.sanelowmusiclabel.co.za/products/boxy-hoodie');
  });

  test('7. BreadcrumbList JSON-LD schema contains correct positional hierarchy', () => {
    const breadcrumbs = generateBreadcrumbSchema([
      { name: 'Home', url: 'https://shop.sanelowmusiclabel.co.za/' },
      { name: 'Collections', url: 'https://shop.sanelowmusiclabel.co.za/#catalog' },
      { name: 'Tour Cap', url: 'https://shop.sanelowmusiclabel.co.za/products/tour-cap' },
    ]);

    assert.equal(breadcrumbs['@context'], 'https://schema.org');
    assert.equal(breadcrumbs['@type'], 'BreadcrumbList');
    assert.equal(breadcrumbs.itemListElement.length, 3);
    assert.equal(breadcrumbs.itemListElement[0].position, 1);
    assert.equal(breadcrumbs.itemListElement[0].name, 'Home');
    assert.equal(breadcrumbs.itemListElement[2].position, 3);
    assert.equal(breadcrumbs.itemListElement[2].name, 'Tour Cap');
  });

  test('8. Safe escaping of content in XML, HTML and JSON-LD', () => {
    // XML escaping
    const unsafeXml = '<hello> & "world" \'test\'';
    assert.equal(escapeXml(unsafeXml), '&lt;hello&gt; &amp; &quot;world&quot; &apos;test&apos;');

    // JSON-LD script breakout prevention
    const unsafeJson = { title: '</script><script>alert(1)</script>' };
    const serialized = serializeJsonLd(unsafeJson);
    assert.doesNotMatch(serialized, /<\/script>/);
    assert.match(serialized, /\\u003c\/script\\u003e/);
  });

  test('9. robots.txt on production allows general indexing, excludes sensitive paths, and links sitemap', async () => {
    process.env.VERCEL_ENV = 'production';
    const { req, res, resState } = createMockHttp({
      url: '/robots.txt',
      headers: { host: 'shop.sanelowmusiclabel.co.za' },
    });

    await robotsHandler(req, res);

    assert.equal(resState.statusCode, 200);
    assert.match(resState.headers['content-type'], /text\/plain/);
    assert.match(resState.body, /Disallow: \/cart/);
    assert.match(resState.body, /Disallow: \/checkout/);
    assert.match(resState.body, /Disallow: \/account/);
    assert.match(resState.body, /Disallow: \/api\//);
    assert.match(resState.body, /Disallow: \/\*\?\*q=/);
    assert.match(resState.body, /Sitemap: https:\/\/shop\.sanelowmusiclabel\.co\.za\/sitemap\.xml/);

    process.env.VERCEL_ENV = origEnv;
  });

  test('10. robots.txt on preview deployments completely blocks indexing with Disallow: / and X-Robots-Tag', async () => {
    process.env.VERCEL_ENV = 'preview';
    const { req, res, resState } = createMockHttp({
      url: '/robots.txt',
      headers: { host: 'sanelow-merchant-preview-deploy.vercel.app' },
    });

    await robotsHandler(req, res);

    assert.equal(resState.statusCode, 200);
    assert.equal(resState.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(resState.body, /Disallow: \/\n/);

    process.env.VERCEL_ENV = origEnv;
  });

  test('11. sitemap.xml generates valid XML and excludes cart/account/search query strings', async () => {
    const { req, res, resState } = createMockHttp({
      url: '/sitemap.xml',
      headers: { host: 'shop.sanelowmusiclabel.co.za' },
    });

    await sitemapHandler(req, res);

    assert.equal(resState.statusCode, 200);
    assert.match(resState.headers['content-type'], /application\/xml/);
    assert.match(resState.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(resState.body, /<loc>https:\/\/shop\.sanelowmusiclabel\.co\.za\/<\/loc>/);
    // Must NOT contain cart, checkout, or query parameters
    assert.doesNotMatch(resState.body, /\/cart/);
    assert.doesNotMatch(resState.body, /\/checkout/);
    assert.doesNotMatch(resState.body, /\/account/);
    assert.doesNotMatch(resState.body, /\?q=/);
  });

  test('12. Vercel rewrites route /sitemap.xml, /robots.txt, /products/:handle, and /collections/:handle', () => {
    const sitemapRule = vercelConfig.rewrites.find((r: any) => r.source === '/sitemap.xml');
    assert.equal(sitemapRule?.destination, '/api/sitemap');

    const robotsRule = vercelConfig.rewrites.find((r: any) => r.source === '/robots.txt');
    assert.equal(robotsRule?.destination, '/api/robots');

    const productRule = vercelConfig.rewrites.find((r: any) => r.source === '/products/:handle');
    assert.equal(productRule?.destination, '/api/render?type=product&handle=:handle');

    const collectionRule = vercelConfig.rewrites.find((r: any) => r.source === '/collections/:handle');
    assert.equal(collectionRule?.destination, '/api/render?type=collection&handle=:handle');

    const spaFallback = vercelConfig.rewrites.find((r: any) => r.destination === '/index.html');
    assert.ok(spaFallback, 'SPA fallback to /index.html must exist');
  });

  test('13. render handler serves homepage SSR with 200 and Organization/WebSite schema', async () => {
    process.env.VERCEL_ENV = 'production';
    const { req, res, resState } = createMockHttp({
      url: '/api/render',
      headers: { host: 'shop.sanelowmusiclabel.co.za' },
    });

    await renderHandler(req, res);

    assert.equal(resState.statusCode, 200);
    assert.match(resState.headers['content-type'], /text\/html/);
    assert.equal(resState.headers['x-robots-tag'], 'index, follow');
    assert.match(resState.body, /<title>Sanelow Merchant Store \| Official Streetwear &amp; Merch<\/title>/);
    assert.match(resState.body, /<link rel="canonical" href="https:\/\/shop\.sanelowmusiclabel\.co\.za" \/>/);
    assert.match(resState.body, /<meta property="og:site_name" content="Sanelow Merchant Store" \/>/);
    assert.match(resState.body, /"name":\s*"Sanelow Merchant Store"/);

    process.env.VERCEL_ENV = origEnv;
  });

  test('14. render handler applies X-Robots-Tag: noindex, nofollow on preview deployments', async () => {
    process.env.VERCEL_ENV = 'preview';
    const { req, res, resState } = createMockHttp({
      url: '/api/render',
      headers: { host: 'sanelow-abc123-preview.vercel.app' },
    });

    await renderHandler(req, res);

    assert.equal(resState.statusCode, 200);
    assert.equal(resState.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(resState.body, /<meta name="robots" content="noindex, nofollow" \/>/);

    process.env.VERCEL_ENV = origEnv;
  });
});
