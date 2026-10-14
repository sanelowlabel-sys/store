import fs from 'fs';
import path from 'path';

// Technical SEO, Canonical URL, OpenGraph & Schema.org JSON-LD Helpers
// Base URL defaults to https://shop.sanelowmusiclabel.co.za and is configurable via environment variables.

export const DEFAULT_SITE_URL = 'https://shop.sanelowmusiclabel.co.za';

export function getBaseUrl(): string {
  const envUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
  if (envUrl && envUrl.trim()) {
    // Strip trailing slashes
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_SITE_URL;
}

/**
 * Determines whether the current request is a preview deployment.
 *
 * NOTE: We do NOT treat every *.vercel.app domain as a preview deployment, because
 * a production Vercel deployment without a custom domain, or before DNS records finish
 * propagating, runs on <project-name>.vercel.app with VERCEL_ENV="production".
 * VERCEL_ENV is the primary authority:
 * - 'preview' => preview branch or PR deployment
 * - 'development' => local vercel dev
 * - 'production' => live production deployment (custom domain or production alias)
 */
export function isPreviewDeployment(host?: string): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development';
  }

  // Fallback if VERCEL_ENV is not set (e.g. running in local development or custom proxy)
  if (host) {
    const cleanHost = host.toLowerCase().split(':')[0];
    if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
      return true;
    }
    // Only detect branch-specific preview subdomains when VERCEL_ENV is not explicitly provided
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

/**
 * Safely serialize JSON-LD script bodies so that closing script tags,
 * HTML entities, or special characters cannot break out of the script block.
 */
export function serializeJsonLd(data: any): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// 1. Organization Schema
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

// 2. WebSite Schema
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

// 3. BreadcrumbList Schema
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

/**
 * 4. Truthful Product & Variant Structured Data
 *
 * Implements Google Search Central's Product Group and Product Variant specifications.
 * When a product has multiple variants (e.g. sizes, colors), we use `@type: "ProductGroup"`
 * with `variesBy` and `hasVariant` representing each distinct product variant.
 * When a product has only 1 variant or no options, we use `@type: "Product"` with a single `Offer`.
 * Only authentic data from Shopify (SKU, brand, price, currency, availability) is output.
 * No fabricated ratings, reviews, shipping, or returns are ever added.
 */
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

  // Determine what attributes vary across variants (e.g. size, color)
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

  // Single-variant product: use schema.org/Product
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

  // Multi-variant product: use schema.org/ProductGroup with hasVariant
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

    // Assign size / color properties from selectedOptions
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

// 5. Truthful CollectionPage Schema
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

// Cache production asset tags so we only read dist/index.html once in memory
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
    // If not found (e.g. vite dev server), fallback below
  }

  // Development fallback
  return {
    scriptTag: '<script type="module" src="/src/main.tsx"></script>',
    styleTag: '',
  };
}

// 6. Complete Server-Rendered HTML Template
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
