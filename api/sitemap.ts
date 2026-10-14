import type { IncomingMessage, ServerResponse } from 'http';
import { SHOPIFY_API_VERSION } from './_operations';
import { getBaseUrl, escapeXml } from './_seo';

const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';

interface SitemapItem {
  handle: string;
  updatedAt?: string;
}

/**
 * Paginates through all published products in the Shopify Storefront API
 * using cursor-based pagination.
 */
async function fetchAllProducts(headers: Record<string, string>): Promise<SitemapItem[]> {
  const endpoint = `https://${REQUIRED_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const items: SitemapItem[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety guard for up to 5,000 products

  const query = `
    query SitemapProducts($cursor: String) @inContext(country: ZA) {
      products(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            handle
            updatedAt
          }
        }
      }
    }
  `;

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: { cursor } }),
      });

      if (!res.ok) break;
      const json = await res.json();
      const pageData = json.data?.products;
      if (!pageData) break;

      for (const edge of pageData.edges || []) {
        if (edge.node?.handle) {
          items.push(edge.node);
        }
      }

      hasNextPage = Boolean(pageData.pageInfo?.hasNextPage);
      cursor = pageData.pageInfo?.endCursor || null;
      if (!cursor) break;
    } catch {
      break;
    }
  }

  return items;
}

/**
 * Paginates through all published collections in the Shopify Storefront API
 * using cursor-based pagination.
 */
async function fetchAllCollections(headers: Record<string, string>): Promise<SitemapItem[]> {
  const endpoint = `https://${REQUIRED_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const items: SitemapItem[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 25; // Safety guard for up to 2,500 collections

  const query = `
    query SitemapCollections($cursor: String) @inContext(country: ZA) {
      collections(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            handle
            updatedAt
          }
        }
      }
    }
  `;

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: { cursor } }),
      });

      if (!res.ok) break;
      const json = await res.json();
      const pageData = json.data?.collections;
      if (!pageData) break;

      for (const edge of pageData.edges || []) {
        if (edge.node?.handle) {
          items.push(edge.node);
        }
      }

      hasNextPage = Boolean(pageData.pageInfo?.hasNextPage);
      cursor = pageData.pageInfo?.endCursor || null;
      if (!cursor) break;
    } catch {
      break;
    }
  }

  return items;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const baseUrl = getBaseUrl();
  const privateToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN;
  const publicToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  let products: SitemapItem[] = [];
  let collections: SitemapItem[] = [];

  if (privateToken || publicToken) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (privateToken) {
      headers['Shopify-Storefront-Private-Token'] = privateToken;
    } else if (publicToken) {
      headers['X-Shopify-Storefront-Access-Token'] = publicToken;
    }

    // Concurrently paginate products and collections
    const [fetchedProducts, fetchedCollections] = await Promise.all([
      fetchAllProducts(headers),
      fetchAllCollections(headers),
    ]);
    products = fetchedProducts;
    collections = fetchedCollections;
  }

  const now = new Date().toISOString().split('T')[0];

  const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [
    {
      loc: `${baseUrl}/`,
      lastmod: now,
      changefreq: 'daily',
      priority: '1.0',
    },
  ];

  for (const c of collections) {
    if (c.handle) {
      urls.push({
        loc: `${baseUrl}/collections/${encodeURIComponent(c.handle)}`,
        lastmod: c.updatedAt ? c.updatedAt.split('T')[0] : now,
        changefreq: 'weekly',
        priority: '0.8',
      });
    }
  }

  for (const p of products) {
    if (p.handle) {
      urls.push({
        loc: `${baseUrl}/products/${encodeURIComponent(p.handle)}`,
        lastmod: p.updatedAt ? p.updatedAt.split('T')[0] : now,
        changefreq: 'weekly',
        priority: '0.9',
      });
    }
  }

  // Construct XML with XML entity escaping to avoid XML syntax corruption
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ''}
    <changefreq>${escapeXml(u.changefreq)}</changefreq>
    <priority>${escapeXml(u.priority)}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.end(xml);
}
