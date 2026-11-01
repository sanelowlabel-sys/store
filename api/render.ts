import type { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';

// Pinned Stable Shopify Storefront API Version
export const SHOPIFY_API_VERSION = '2026-10';
export const DEFAULT_SITE_URL = 'https://shop.sanelowmusiclabel.co.za';
const REQUIRED_STORE_DOMAIN = 'sx71id-uy.myshopify.com';

export function getBaseUrl(): string {
  const envUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_SITE_URL;
}

export function isPreviewDeployment(host?: string): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development';
  }

  if (host) {
    const cleanHost = host.toLowerCase().split(':')[0];
    if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
      return true;
    }
    if (cleanHost.includes('-git-') || cleanHost.includes('preview') || cleanHost.includes('ais-dev')) {
      return true;
    }
  }

  return false;
}

export function getRobotsDirective(host?: string): { metaTag: string; headerValue: string } {
  if (isPreviewDeployment(host)) {
    return {
      metaTag: '<meta name="robots" content="noindex, nofollow" />',
      headerValue: 'noindex, nofollow',
    };
  }
  return {
    metaTag: '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
    headerValue: 'index, follow',
  };
}

export function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeJsonLd(data: any): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function generateOrganizationSchema(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: 'Sanelow Merchant Store',
    url: baseUrl,
    logo: `${baseUrl}/sanelow-logo.jpg`,
    sameAs: [
      'https://sanelowmusiclabel.co.za',
    ],
  };
}

export function generateWebSiteSchema(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    name: 'Sanelow Merchant Store',
    url: baseUrl,
    publisher: {
      '@id': `${baseUrl}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function generateProductSchema(productNode: any, baseUrl: string) {
  const cleanDesc = stripHtml(productNode.description || productNode.descriptionHtml || 'Official Sanelow merchandise piece.');
  const canonicalUrl = `${baseUrl}/products/${productNode.handle}`;
  const images: string[] = (productNode.images?.edges || [])
    .map((e: any) => e.node?.url)
    .filter(Boolean);

  const fallbackImage = `${baseUrl}/sanelow-logo.jpg`;
  const productImages = images.length > 0 ? images : [fallbackImage];

  const variants = productNode.variants?.edges?.map((e: any) => e.node) || [];
  const options = productNode.options || [];

  const variesByList: string[] = [];
  for (const opt of options) {
    const optName = (opt.name || '').toLowerCase();
    if (['size', 'sizes'].includes(optName)) {
      variesByList.push('https://schema.org/size');
    } else if (['color', 'colour', 'colors', 'colours'].includes(optName)) {
      variesByList.push('https://schema.org/color');
    }
  }

  const brandObj = productNode.vendor && productNode.vendor.trim()
    ? {
        '@type': 'Brand',
        name: productNode.vendor.trim(),
      }
    : undefined;

  if (variants.length <= 1) {
    const singleVar = variants[0];
    const offer: Record<string, any> = {
      '@type': 'Offer',
      url: singleVar?.id ? `${canonicalUrl}?variant=${encodeURIComponent(singleVar.id)}` : canonicalUrl,
      price: singleVar?.price?.amount || productNode.priceRange?.minVariantPrice?.amount || '0.00',
      priceCurrency: singleVar?.price?.currencyCode || productNode.priceRange?.minVariantPrice?.currencyCode || 'ZAR',
      availability: singleVar
        ? (singleVar.availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock')
        : (productNode.availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'),
      itemCondition: 'https://schema.org/NewCondition',
    };

    if (singleVar?.sku && singleVar.sku.trim()) {
      offer.sku = singleVar.sku.trim();
    }

    const singleSchema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: productNode.title,
      description: cleanDesc,
      url: canonicalUrl,
      image: productImages,
      offers: offer,
    };

    if (brandObj) singleSchema.brand = brandObj;
    if (singleVar?.sku && singleVar.sku.trim()) singleSchema.sku = singleVar.sku.trim();

    return singleSchema;
  }

  const hasVariant = variants.map((v: any) => {
    const variantUrl = `${canonicalUrl}?variant=${encodeURIComponent(v.id)}`;
    const variantImg = v.image?.url || productImages[0];
    const variantOffer: Record<string, any> = {
      '@type': 'Offer',
      url: variantUrl,
      price: v.price?.amount || '0.00',
      priceCurrency: v.price?.currencyCode || 'ZAR',
      availability: v.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    };

    if (v.sku && v.sku.trim()) {
      variantOffer.sku = v.sku.trim();
    }

    const variantProduct: Record<string, any> = {
      '@type': 'Product',
      name: `${productNode.title} - ${v.title}`,
      description: cleanDesc,
      image: variantImg,
      url: variantUrl,
      offers: variantOffer,
    };

    if (v.sku && v.sku.trim()) {
      variantProduct.sku = v.sku.trim();
    }

    if (brandObj) {
      variantProduct.brand = brandObj;
    }

    if (v.selectedOptions && Array.isArray(v.selectedOptions)) {
      for (const so of v.selectedOptions) {
        const nameLower = (so.name || '').toLowerCase();
        if (['size', 'sizes'].includes(nameLower)) {
          variantProduct.size = so.value;
        } else if (['color', 'colour', 'colors', 'colours'].includes(nameLower)) {
          variantProduct.color = so.value;
        }
      }
    }

    return variantProduct;
  });

  const productGroupSchema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: productNode.title,
    description: cleanDesc,
    url: canonicalUrl,
    productGroupID: productNode.id || productNode.handle,
    image: productImages,
    hasVariant,
  };

  if (variesByList.length > 0) {
    productGroupSchema.variesBy = variesByList;
  }

  if (brandObj) {
    productGroupSchema.brand = brandObj;
  }

  return productGroupSchema;
}

export function generateCollectionSchema(collectionNode: any, baseUrl: string) {
  const canonicalUrl = `${baseUrl}/collections/${collectionNode.handle}`;
  const cleanDesc = stripHtml(collectionNode.description || 'Curated Sanelow Merch Collection');
  const products = collectionNode.products?.edges?.map((e: any) => e.node) || [];

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collectionNode.title,
    description: cleanDesc,
    url: canonicalUrl,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: products.map((prod: any, index: number) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${baseUrl}/products/${prod.handle}`,
        name: prod.title,
      })),
    },
  };
}

let cachedAssets: { scriptTag: string; styleTag: string } | null = null;

export function getProductionAssetTags(): { scriptTag: string; styleTag: string } {
  if (cachedAssets) return cachedAssets;

  try {
    const distHtmlPath = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distHtmlPath)) {
      const html = fs.readFileSync(distHtmlPath, 'utf8');
      const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
      const styleMatch = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);

      if (scriptMatch && styleMatch) {
        cachedAssets = {
          scriptTag: `<script type="module" crossorigin src="${scriptMatch[1]}"></script>`,
          styleTag: `<link rel="stylesheet" crossorigin href="${styleMatch[1]}">`,
        };
        return cachedAssets;
      }
    }
  } catch {
    // If not found, use development fallback
  }

  return {
    scriptTag: '<script type="module" src="/src/main.tsx"></script>',
    styleTag: '',
  };
}

export interface RenderHtmlOptions {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType?: 'website' | 'product';
  ogImage?: string;
  host?: string;
  jsonLd?: Record<string, any>[];
  bodyHtml: string;
  initialData?: any;
}

export function renderFullHtmlDocument(options: RenderHtmlOptions): string {
  const {
    title,
    description,
    canonicalUrl,
    ogType = 'website',
    ogImage = `${getBaseUrl()}/sanelow-logo.jpg`,
    host,
    jsonLd = [],
    bodyHtml,
    initialData,
  } = options;

  const { metaTag: robotsMeta } = getRobotsDirective(host);
  const cleanTitle = escapeHtml(title);
  const cleanDesc = escapeHtml(description);
  const cleanCanonical = escapeHtml(canonicalUrl);
  const cleanOgImage = escapeHtml(ogImage);

  const jsonLdScripts = jsonLd
    .map((data) => `    <script type="application/ld+json">\n${serializeJsonLd(data)}\n    </script>`)
    .join('\n');

  const initialDataScript = initialData
    ? `    <script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`
    : '';

  const { scriptTag, styleTag } = getProductionAssetTags();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${cleanTitle}</title>
    <meta name="description" content="${cleanDesc}" />
    <link rel="canonical" href="${cleanCanonical}" />
    ${robotsMeta}
    
    <!-- OpenGraph Social Sharing -->
    <meta property="og:site_name" content="Sanelow Merchant Store" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:title" content="${cleanTitle}" />
    <meta property="og:description" content="${cleanDesc}" />
    <meta property="og:url" content="${cleanCanonical}" />
    <meta property="og:image" content="${cleanOgImage}" />
    
    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${cleanTitle}" />
    <meta name="twitter:description" content="${cleanDesc}" />
    <meta name="twitter:image" content="${cleanOgImage}" />

    <!-- Favicon & Brand Theme -->
    <link rel="icon" type="image/jpeg" href="/sanelow-logo.jpg" />
    <meta name="theme-color" content="#dc2626" />

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Production CSS Bundle -->
    ${styleTag}

    <!-- Structured Data (JSON-LD) -->
${jsonLdScripts}

${initialDataScript}
  </head>
  <body class="bg-white text-black font-sans antialiased selection:bg-red-600 selection:text-white">
    <div id="root">${bodyHtml}</div>
    ${scriptTag}
  </body>
</html>`;
}

const GET_PRODUCT_BY_HANDLE_QUERY = `
  query GetProductByHandle($handle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      productType
      vendor
      availableForSale
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      options {
        id
        name
        values
      }
      images(first: 10) {
        edges {
          node {
            url
            altText
            width
            height
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            availableForSale
            price {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`;

const GET_COLLECTION_BY_HANDLE_QUERY = `
  query GetCollectionByHandle($handle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
        altText
        width
        height
      }
      products(first: 50) {
        edges {
          node {
            id
            handle
            title
            description
            productType
            vendor
            availableForSale
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 2) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Direct execution of Shopify Storefront API queries for server-side rendering
async function executeShopifyQuery(operationName: string, variables: Record<string, any>) {
  const query = operationName === 'GetProductByHandle'
    ? GET_PRODUCT_BY_HANDLE_QUERY
    : operationName === 'GetCollectionByHandle'
    ? GET_COLLECTION_BY_HANDLE_QUERY
    : null;

  if (!query) throw new Error(`Unknown server operation: ${operationName}`);

  const privateToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN;
  const publicToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!privateToken && !publicToken) {
    return { configured: false, data: null };
  }

  const endpoint = `https://${REQUIRED_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (privateToken) {
    headers['Shopify-Storefront-Private-Token'] = privateToken;
  } else if (publicToken) {
    headers['X-Shopify-Storefront-Access-Token'] = publicToken;
  }

  const varsWithContext = {
    country: 'ZA',
    language: 'EN',
    ...variables,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: varsWithContext }),
  });

  if (!res.ok) {
    return { configured: true, data: null, status: res.status };
  }

  const json = await res.json();
  return { configured: true, data: json.data, errors: json.errors };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsedUrl = parse(req.url || '/', true);
    const host = req.headers.host || '';
    const baseUrl = getBaseUrl();
    const query = parsedUrl.query;

    let type = query.type as string;
    let handle = query.handle as string;

    const pathname = parsedUrl.pathname || '/';
    if (!type) {
      const productMatch = pathname.match(/^\/products\/([a-zA-Z0-9_\-]+)/);
      if (productMatch) {
        type = 'product';
        handle = productMatch[1];
      } else {
        const collectionMatch = pathname.match(/^\/collections\/([a-zA-Z0-9_\-]+)/);
        if (collectionMatch) {
          type = 'collection';
          handle = collectionMatch[1];
        }
      }
    }

    const robots = getRobotsDirective(host);

    // 1. PRODUCT PAGE SSR
    if (type === 'product' && handle) {
      try {
        const result = await executeShopifyQuery('GetProductByHandle', { handle });
        const product = result.data?.product;

        // Real HTTP 404 for nonexistent products
        if (result.configured && !product) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');

          const notFoundHtml = `
            <div class="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6 text-center">
              <div class="max-w-md w-full space-y-6">
                <span class="inline-block px-3 py-1 bg-red-100 text-red-600 font-mono text-xs font-bold rounded-full">HTTP 404</span>
                <h1 class="text-3xl font-black uppercase tracking-tight">Piece Not Found</h1>
                <p class="text-sm text-zinc-600 leading-relaxed">
                  The product requested ("${escapeHtml(handle)}") is not currently available in the active archive or does not exist on Shopify.
                </p>
                <div class="pt-4">
                  <a href="/" class="inline-block px-6 py-3 rounded-xl bg-black hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider transition-colors">
                    Return to Archive Storefront
                  </a>
                </div>
              </div>
            </div>
          `;

          const fullDoc = renderFullHtmlDocument({
            title: 'Piece Not Found | Sanelow Merchant Store',
            description: 'The requested product is not available in the Sanelow catalogue.',
            canonicalUrl: `${baseUrl}/products/${encodeURIComponent(handle)}`,
            host,
            bodyHtml: notFoundHtml,
          });

          res.end(fullDoc);
          return;
        }

        // Found Product -> Render 200 with truthful metadata & JSON-LD
        if (product) {
          const title = `${product.title} | Sanelow Merchant Store`;
          const description = stripHtml(product.description || 'Authentic Sanelow merchandise piece.');
          const canonicalUrl = `${baseUrl}/products/${product.handle}`;
          const primaryImage = product.images?.edges?.[0]?.node?.url || `${baseUrl}/sanelow-logo.jpg`;

          const productJsonLd = generateProductSchema(product, baseUrl);
          const breadcrumbsJsonLd = generateBreadcrumbSchema([
            { name: 'Home', url: `${baseUrl}/` },
            { name: 'Merch Catalogue', url: `${baseUrl}/#catalog` },
            { name: product.title, url: canonicalUrl },
          ]);

          const minPrice = product.priceRange?.minVariantPrice?.amount || '0.00';
          const currency = product.priceRange?.minVariantPrice?.currencyCode || 'ZAR';

          const bodyHtml = `
            <article class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
              <nav aria-label="Breadcrumb" class="mb-6 text-xs font-mono text-zinc-500">
                <ol class="flex items-center gap-2">
                  <li><a href="/" class="hover:text-black">Home</a></li>
                  <li>/</li>
                  <li><a href="/#catalog" class="hover:text-black">Merch</a></li>
                  <li>/</li>
                  <li class="text-black font-bold" aria-current="page">${escapeHtml(product.title)}</li>
                </ol>
              </nav>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div class="relative aspect-[4/5] bg-zinc-100 rounded-2xl overflow-hidden border border-zinc-200">
                  <img src="${escapeHtml(primaryImage)}" alt="${escapeHtml(product.title)}" class="w-full h-full object-cover" width="800" height="1000" />
                </div>
                <div class="space-y-6">
                  <div>
                    <span class="text-xs font-mono font-bold text-red-600 uppercase tracking-wider">${escapeHtml(product.productType || 'Exclusive Piece')}</span>
                    <h1 class="text-3xl sm:text-4xl font-black text-black tracking-tight mt-1">${escapeHtml(product.title)}</h1>
                    <p class="text-2xl font-black text-black mt-3">${escapeHtml(currency)} ${escapeHtml(minPrice)}</p>
                  </div>
                  <div class="prose text-sm text-zinc-600 leading-relaxed">
                    <p>${escapeHtml(description)}</p>
                  </div>
                  <div class="pt-4">
                    <span class="inline-block px-3 py-1 rounded-full text-xs font-mono font-semibold ${product.availableForSale ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}">
                      ${product.availableForSale ? 'In stock' : 'Unavailable'}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          `;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Robots-Tag', robots.headerValue);

          const fullDoc = renderFullHtmlDocument({
            title,
            description,
            canonicalUrl,
            ogType: 'product',
            ogImage: primaryImage,
            host,
            jsonLd: [productJsonLd, breadcrumbsJsonLd],
            bodyHtml,
            initialData: { type: 'product', product },
          });

          res.end(fullDoc);
          return;
        }
      } catch {
        // Fall through to default template on network failure
      }
    }

    // 2. COLLECTION PAGE SSR
    if (type === 'collection' && handle) {
      try {
        const result = await executeShopifyQuery('GetCollectionByHandle', { handle });
        const collection = result.data?.collection;

        // Real HTTP 404 for nonexistent collections
        if (result.configured && !collection) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');

          const notFoundHtml = `
            <div class="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6 text-center">
              <div class="max-w-md w-full space-y-6">
                <span class="inline-block px-3 py-1 bg-red-100 text-red-600 font-mono text-xs font-bold rounded-full">HTTP 404</span>
                <h1 class="text-3xl font-black uppercase tracking-tight">Collection Not Found</h1>
                <p class="text-sm text-zinc-600 leading-relaxed">
                  The collection requested ("${escapeHtml(handle)}") is not currently available or does not exist on Shopify.
                </p>
                <div class="pt-4">
                  <a href="/" class="inline-block px-6 py-3 rounded-xl bg-black hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider transition-colors">
                    Return to Storefront
                  </a>
                </div>
              </div>
            </div>
          `;

          const fullDoc = renderFullHtmlDocument({
            title: 'Collection Not Found | Sanelow Merchant Store',
            description: 'The requested collection does not exist.',
            canonicalUrl: `${baseUrl}/collections/${encodeURIComponent(handle)}`,
            host,
            bodyHtml: notFoundHtml,
          });

          res.end(fullDoc);
          return;
        }

        if (collection) {
          const title = `${collection.title} | Sanelow Merchant Store`;
          const description = stripHtml(collection.description || 'Exclusive Sanelow collection pieces.');
          const canonicalUrl = `${baseUrl}/collections/${collection.handle}`;
          const primaryImage = collection.image?.url || `${baseUrl}/sanelow-logo.jpg`;

          const collectionJsonLd = generateCollectionSchema(collection, baseUrl);
          const breadcrumbsJsonLd = generateBreadcrumbSchema([
            { name: 'Home', url: `${baseUrl}/` },
            { name: 'Collections', url: `${baseUrl}/#catalog` },
            { name: collection.title, url: canonicalUrl },
          ]);

          const products = collection.products?.edges?.map((e: any) => e.node) || [];

          const bodyHtml = `
            <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
              <nav aria-label="Breadcrumb" class="mb-6 text-xs font-mono text-zinc-500">
                <ol class="flex items-center gap-2">
                  <li><a href="/" class="hover:text-black">Home</a></li>
                  <li>/</li>
                  <li><a href="/#catalog" class="hover:text-black">Collections</a></li>
                  <li>/</li>
                  <li class="text-black font-bold" aria-current="page">${escapeHtml(collection.title)}</li>
                </ol>
              </nav>
              <div class="border-b border-zinc-200 pb-8 mb-8">
                <h1 class="text-3xl sm:text-4xl font-black text-black tracking-tight">${escapeHtml(collection.title)}</h1>
                <p class="text-sm text-zinc-600 mt-2 max-w-2xl">${escapeHtml(description)}</p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${products
                  .map(
                    (prod: any) => `
                  <div class="rounded-2xl border border-zinc-200 p-4 flex flex-col justify-between">
                    <a href="/products/${escapeHtml(prod.handle)}" class="group block">
                      <div class="aspect-[4/5] bg-zinc-100 rounded-xl overflow-hidden mb-3">
                        <img src="${escapeHtml(prod.images?.edges?.[0]?.node?.url || primaryImage)}" alt="${escapeHtml(prod.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                      </div>
                      <h2 class="text-sm font-black text-black group-hover:text-red-600 transition-colors">${escapeHtml(prod.title)}</h2>
                    </a>
                    <p class="text-xs font-mono font-bold mt-2">${escapeHtml(prod.priceRange?.minVariantPrice?.currencyCode || 'ZAR')} ${escapeHtml(prod.priceRange?.minVariantPrice?.amount || '0.00')}</p>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </section>
          `;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Robots-Tag', robots.headerValue);

          const fullDoc = renderFullHtmlDocument({
            title,
            description,
            canonicalUrl,
            ogImage: primaryImage,
            host,
            jsonLd: [collectionJsonLd, breadcrumbsJsonLd],
            bodyHtml,
            initialData: { type: 'collection', collection },
          });

          res.end(fullDoc);
          return;
        }
      } catch {
        // Fall through
      }
    }

    // 3. GALLERY PAGE SSR (/gallery & /lookbook alias)
    if (type === 'gallery' || pathname === '/gallery' || pathname === '/lookbook') {
      const title = 'Gallery — Styling & Archive | Sanelow Merchant Store';
      const description =
        'AI-generated styling mockups showcasing curated apparel and merchandise styling concepts from the Sanelow collection.';
      const canonicalUrl = `${baseUrl}/gallery`;
      const primaryImage = `${baseUrl}/sanelow-logo.jpg`;

      const breadcrumbsJsonLd = generateBreadcrumbSchema([
        { name: 'Home', url: `${baseUrl}/` },
        { name: 'Gallery', url: canonicalUrl },
      ]);

      const bodyHtml = `
        <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
          <nav aria-label="Breadcrumb" class="mb-6 text-xs font-mono text-zinc-500">
            <ol class="flex items-center gap-2">
              <li><a href="/" class="hover:text-black">Home</a></li>
              <li>/</li>
              <li class="text-black font-bold" aria-current="page">Gallery</li>
            </ol>
          </nav>
          <div class="border-b border-zinc-200 pb-8 mb-8">
            <span class="inline-block px-3 py-1 bg-red-50 text-red-600 font-mono text-xs font-bold rounded-full mb-3 uppercase">Gallery • Styling Previews</span>
            <h1 class="text-3xl sm:text-5xl font-black text-black tracking-tight">The Sanelow Gallery</h1>
            <p class="text-sm text-zinc-600 mt-2 max-w-2xl leading-relaxed">${escapeHtml(description)}</p>
          </div>
          <div class="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-600">
            <strong>Notice:</strong> AI-generated styling mockups — Illustrative styling previews, not customer photographs. Refer to product photos and descriptions for item details.
          </div>
        </section>
      `;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', robots.headerValue);

      const fullDoc = renderFullHtmlDocument({
        title,
        description,
        canonicalUrl,
        ogImage: primaryImage,
        host,
        jsonLd: [breadcrumbsJsonLd],
        bodyHtml,
        initialData: { type: 'gallery' },
      });

      res.end(fullDoc);
      return;
    }

    // 4. DEFAULT / HOME PAGE SSR
    const defaultTitle = 'Sanelow Merchant Store | Official Streetwear & Merch';
    const defaultDesc =
      'Official Sanelow merchandise store. Exclusive heavyweight hoodies, graphic tees, outerwear and accessories crafted in South Africa.';
    const defaultCanonical = baseUrl;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', robots.headerValue);

    const fullDoc = renderFullHtmlDocument({
      title: defaultTitle,
      description: defaultDesc,
      canonicalUrl: defaultCanonical,
      host,
      jsonLd: [
        generateOrganizationSchema(baseUrl),
        generateWebSiteSchema(baseUrl),
      ],
      bodyHtml: '<div id="app-loading-placeholder"></div>',
    });

    res.end(fullDoc);
  } catch (err: any) {
    try {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.end('<!doctype html><html><body><h1>Internal Server Error</h1></body></html>');
    } catch {
      // Ignore if response already finalized
    }
  }
}
