import {
  Product,
  ShopifyCart,
  ShopifyCartLine,
  ShopifyVariant,
  Category,
  ProductColor,
  ShopifyCollection,
  CustomerAccountOrder,
  CustomerProfile,
  CustomerSession,
  CustomerOrdersPage,
} from '../types';

export const SHOPIFY_STORE_DOMAIN =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SHOPIFY_STORE_DOMAIN) ||
  (typeof process !== 'undefined' && (process.env?.SHOPIFY_STORE_DOMAIN || process.env?.VITE_SHOPIFY_STORE_DOMAIN)) ||
  'sx71id-uy.myshopify.com';

// Configurable Shopify Hosted Customer Account URL (from Shopify Admin -> Settings -> Customer accounts)
// Do NOT invent or infer an account URL from the storefront domain.
export const SHOPIFY_CUSTOMER_ACCOUNT_URL: string = (
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SHOPIFY_CUSTOMER_ACCOUNT_URL || import.meta.env?.SHOPIFY_CUSTOMER_ACCOUNT_URL)) ||
  (typeof process !== 'undefined' && (process.env?.SHOPIFY_CUSTOMER_ACCOUNT_URL || process.env?.VITE_SHOPIFY_CUSTOMER_ACCOUNT_URL)) ||
  ''
).trim();

// Feature flag controlling custom Customer Account API dashboard rollout
export const ENABLE_CUSTOM_CUSTOMER_ACCOUNTS: boolean = (
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || import.meta.env?.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS)) ||
  (typeof process !== 'undefined' && (process.env?.ENABLE_CUSTOM_CUSTOMER_ACCOUNTS || process.env?.VITE_ENABLE_CUSTOM_CUSTOMER_ACCOUNTS)) ||
  'false'
).toString() === 'true';

export const SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: string = (
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || import.meta.env?.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID)) ||
  (typeof process !== 'undefined' && (process.env?.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || process.env?.VITE_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID)) ||
  ''
).trim();

export const DEFAULT_COUNTRY = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_COUNTRY_CODE) ||
  (typeof process !== 'undefined' && (process.env?.DEFAULT_COUNTRY_CODE || process.env?.VITE_DEFAULT_COUNTRY_CODE)) ||
  'ZA'
).toUpperCase();

export const DEFAULT_CURRENCY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_CURRENCY) ||
  (typeof process !== 'undefined' && (process.env?.DEFAULT_CURRENCY || process.env?.VITE_DEFAULT_CURRENCY)) ||
  'USD';

const CART_STORAGE_KEY = 'sanelow_shopify_cart_id';

// Clean currency formatter using native Intl with South Africa context and explicit USD display
export function formatPrice(amount: number | string, currency: string = DEFAULT_CURRENCY): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const curr = (currency || DEFAULT_CURRENCY).toUpperCase();
  if (isNaN(num)) return `${curr} 0.00`;

  try {
    if (curr === 'USD') {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
      return `${formatted} USD`;
    }
    return new Intl.NumberFormat(curr === 'ZAR' ? 'en-ZA' : 'en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    if (curr === 'USD') {
      return `$${num.toFixed(2)} USD`;
    }
    if (curr === 'ZAR') {
      return `R ${num.toFixed(2)}`;
    }
    return `${curr} ${num.toFixed(2)}`;
  }
}

let customShopifyFetch: any = null;

export function setCustomShopifyFetchForTest(fn: any) {
  customShopifyFetch = fn;
}

// Low-level caller: routes operations exclusively through the secure /api/shopify serverless proxy.
// The browser sends { operation, variables } - never raw GraphQL queries.
export async function shopifyFetch<T>({
  operation,
  variables = {},
}: {
  operation: string;
  variables?: Record<string, unknown>;
}): Promise<{ data?: T; errors?: any[]; configured: boolean; message?: string }> {
  if (customShopifyFetch) {
    return customShopifyFetch({ operation, variables });
  }
  try {
    const proxyResponse = await fetch('/api/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, variables }),
    });

    if (proxyResponse.status === 503) {
      const errJson = await proxyResponse.json().catch(() => ({}));
      return {
        configured: false,
        message:
          errJson.message ||
          'Shopify Storefront Access Token is not configured on the server. Please add SHOPIFY_STOREFRONT_ACCESS_TOKEN in Vercel.',
      };
    }

    if (!proxyResponse.ok) {
      const errJson = await proxyResponse.json().catch(() => ({}));
      return {
        configured: true,
        errors: [{ message: errJson.message || `Proxy error: HTTP ${proxyResponse.status}` }],
      };
    }

    const result = await proxyResponse.json();
    return { data: result.data, errors: result.errors, configured: true };
  } catch (err: any) {
    return {
      configured: false,
      message: err?.message || 'Failed to connect to the /api/shopify proxy endpoint.',
    };
  }
}

// Helper: infer category from tags, productType, and title
function mapCategory(productType: string, tags: string[], title: string): Category {
  const text = `${productType} ${tags.join(' ')} ${title}`.toLowerCase();
  if (text.includes('hoodie') || text.includes('fleece') || text.includes('sweater') || text.includes('crewneck')) {
    return 'hoodies-fleece';
  }
  if (text.includes('tee') || text.includes('t-shirt') || text.includes('top') || text.includes('shirt')) {
    return 'graphic-tees';
  }
  if (text.includes('jacket') || text.includes('coat') || text.includes('outerwear') || text.includes('bomber') || text.includes('windbreaker')) {
    return 'outerwear';
  }
  if (text.includes('hat') || text.includes('cap') || text.includes('beanie') || text.includes('snapback') || text.includes('headwear')) {
    return 'headwear';
  }
  if (text.includes('pant') || text.includes('short') || text.includes('sweatpant') || text.includes('bottom') || text.includes('trouser')) {
    return 'bottoms';
  }
  if (text.includes('bag') || text.includes('tote') || text.includes('accessory') || text.includes('sock') || text.includes('belt')) {
    return 'accessories';
  }
  return 'all';
}

// Clearly defined mapping of fashion & merch colours to accurate hex values
const COLOR_HEX_MAP: Record<string, string> = {
  // Pastel, fashion & seasonal shades
  peppermint: '#a7f3d0',
  'vanilla milkshake': '#fef3c7',
  vanilla: '#fef3c7',
  milkshake: '#fef3c7',
  cream: '#fef08a',
  butter: '#fef08a',
  bone: '#e7e5e4',
  ivory: '#fffff0',
  natural: '#f5f5f4',
  sand: '#d6d3d1',
  'desert sand': '#e7d8c9',
  beige: '#e7e5e4',
  khaki: '#d6d3d1',
  tan: '#d2b48c',
  camel: '#c19a6b',

  // Monochromes & neutrals
  black: '#18181b',
  'jet black': '#09090b',
  white: '#ffffff',
  'arctic white': '#ffffff',
  'pure white': '#ffffff',
  'off white': '#fafaf9',
  'off-white': '#fafaf9',
  grey: '#71717a',
  gray: '#71717a',
  'heather grey': '#94a3b8',
  'heather gray': '#94a3b8',
  'light grey': '#e2e8f0',
  'light gray': '#e2e8f0',
  'dark grey': '#3f3f46',
  'dark gray': '#3f3f46',
  charcoal: '#334155',
  anthracite: '#334155',

  // Reds, pinks & purples
  red: '#dc2626',
  crimson: '#be123c',
  ruby: '#be123c',
  cherry: '#991b1b',
  cardinal: '#991b1b',
  scarlet: '#dc2626',
  maroon: '#881337',
  burgundy: '#831843',
  wine: '#701a75',
  pink: '#ec4899',
  'light pink': '#fbcfe8',
  'baby pink': '#fce7f3',
  'dusty rose': '#fda4af',
  rose: '#f43f5e',
  magenta: '#d946ef',
  fuchsia: '#c026d3',
  purple: '#9333ea',
  violet: '#7c3aed',
  lavender: '#c084fc',
  lilac: '#d8b4fe',
  plum: '#581c87',

  // Blues & cyans
  blue: '#2563eb',
  'royal blue': '#1d4ed8',
  navy: '#1e3a8a',
  'navy blue': '#1e3a8a',
  'midnight blue': '#0f172a',
  'sky blue': '#38bdf8',
  'light blue': '#7dd3fc',
  'baby blue': '#bae6fd',
  'powder blue': '#bae6fd',
  'ice blue': '#e0f2fe',
  cyan: '#06b6d4',
  teal: '#0d9488',
  turquoise: '#14b8a6',
  aqua: '#22d3ee',

  // Greens
  green: '#16a34a',
  'forest green': '#14532d',
  'dark green': '#14532d',
  emerald: '#059669',
  mint: '#6ee7b7',
  sage: '#84a98c',
  'sage green': '#84a98c',
  olive: '#4d7c0f',
  'olive green': '#4d7c0f',
  'army green': '#3f4f2c',
  'khaki green': '#575f4a',
  'moss green': '#4a5d43',
  lime: '#84cc16',

  // Yellows, oranges & browns
  yellow: '#eab308',
  'sun yellow': '#facc15',
  mustard: '#ca8a04',
  gold: '#eab308',
  orange: '#ea580c',
  'burnt orange': '#c2410c',
  peach: '#fed7aa',
  coral: '#fb7185',
  salmon: '#fda4af',
  amber: '#d97706',
  rust: '#b45309',
  copper: '#b45309',
  brown: '#78350f',
  chocolate: '#451a03',
  mocha: '#5c3d2e',
  coffee: '#4a3728',
  caramel: '#b45309',
  bronze: '#78350f',
};

const SORTED_COLOR_KEYS = Object.keys(COLOR_HEX_MAP).sort((a, b) => b.length - a.length);

/**
 * Resolves color name to a clearly defined hex code.
 * Returns null for unknown colors rather than an inaccurate fallback hex.
 */
export function resolveColorSwatchHex(colorName: string): string | null {
  if (!colorName || typeof colorName !== 'string') return null;
  const lower = colorName.trim().toLowerCase();
  if (!lower) return null;

  // 1. Exact match
  if (COLOR_HEX_MAP[lower]) {
    return COLOR_HEX_MAP[lower];
  }

  // 2. Keyword/substring match (e.g. "Heather Mint" -> "mint", "Dark Navy" -> "navy")
  for (const key of SORTED_COLOR_KEYS) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(lower)) {
      return COLOR_HEX_MAP[key];
    }
  }

  // Unknown colour: return null so UI can render readable text rather than inaccurate black
  return null;
}

// Map Shopify GraphQL node to clean Product
export function transformShopifyProduct(node: any): Product {
  const variantsTruncated = Boolean(node.variants?.pageInfo?.hasNextPage);
  const variants: ShopifyVariant[] = (node.variants?.edges || []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    availableForSale: Boolean(e.node.availableForSale),
    sku: e.node.sku || '',
    price: e.node.price,
    compareAtPrice: e.node.compareAtPrice,
    selectedOptions: e.node.selectedOptions || [],
    image: e.node.image,
  }));

  const images: string[] = (node.images?.edges || []).map((e: any) => e.node.url);
  if (images.length === 0) {
    images.push('https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=800&q=80');
  }

  const options = (node.options || []).map((opt: any) => ({
    id: opt.id,
    name: opt.name,
    values: opt.values || [],
    optionValues: opt.optionValues || [],
  }));

  // Extract Sizes and Colors from options
  const sizeOption = options.find((o: any) =>
    ['size', 'sizes', 'size (mens)', 'size (womens)'].includes(o.name.toLowerCase())
  );
  const colorOption = options.find((o: any) =>
    ['color', 'colour', 'colorway'].includes(o.name.toLowerCase())
  );

  const sizes = sizeOption ? sizeOption.values : variants.map((v) => v.title).slice(0, 7);
  const colors: ProductColor[] = colorOption
    ? colorOption.values.map((val: string) => {
        const optionVal = (colorOption as any).optionValues?.find(
          (ov: any) => ov.name?.toLowerCase() === val.toLowerCase()
        );
        const shopifySwatchColor = optionVal?.swatch?.color || null;
        const shopifySwatchImg = optionVal?.swatch?.image?.previewImage?.url || null;
        const resolvedHex = shopifySwatchColor || resolveColorSwatchHex(val);

        return {
          name: val,
          hex: resolvedHex,
          hasSwatch: Boolean(resolvedHex || shopifySwatchImg),
          swatchImage: shopifySwatchImg,
          inStock: variants.some((v) =>
            v.selectedOptions.some(
              (so: any) =>
                so.name.toLowerCase() === colorOption.name.toLowerCase() &&
                so.value.toLowerCase() === val.toLowerCase() &&
                v.availableForSale
            )
          ),
        };
      })
    : [];

  const minPrice = parseFloat(node.priceRange?.minVariantPrice?.amount || '0');
  const currencyCode = node.priceRange?.minVariantPrice?.currencyCode || DEFAULT_CURRENCY;
  const comparePrice = node.compareAtPriceRange?.minVariantPrice?.amount
    ? parseFloat(node.compareAtPriceRange.minVariantPrice.amount)
    : undefined;

  const discountPercent =
    comparePrice && comparePrice > minPrice
      ? Math.round(((comparePrice - minPrice) / comparePrice) * 100)
      : 0;

  const tags: string[] = node.tags || [];
  const collections: string[] = (node.collections?.edges || []).map((e: any) => e.node.title);

  // Derive badge ONLY from real tags/data
  let badge: Product['badge'] = undefined;
  if (tags.some((t: string) => t.toLowerCase() === 'limited drop' || t.toLowerCase() === 'limited-drop')) {
    badge = 'LIMITED DROP';
  } else if (tags.some((t: string) => t.toLowerCase() === 'bestseller')) {
    badge = 'BESTSELLER';
  } else if (tags.some((t: string) => t.toLowerCase() === 'pre-order' || t.toLowerCase() === 'preorder')) {
    badge = 'PRE-ORDER';
  }

  // Derive features ONLY from real specifications
  const features: string[] = [];
  if (tags.some((t: string) => t.toLowerCase().includes('heavyweight'))) {
    features.push('Heavyweight premium construction');
  }
  if (tags.some((t: string) => t.toLowerCase().includes('organic'))) {
    features.push('100% certified organic fabric');
  }
  if (tags.some((t: string) => t.toLowerCase().includes('oversized'))) {
    features.push('Oversized streetwear drape');
  }

  return {
    id: node.id,
    shopifyId: node.id,
    handle: node.handle || '',
    title: node.title || '',
    tagline: tags.find((t: string) => t.startsWith('tagline:'))?.replace('tagline:', '') || 'Official Sanelow Merch',
    category: mapCategory(node.productType || '', tags, node.title || ''),
    dropCollection: collections[0] || "Summer '26 Drop",
    sku: variants[0]?.sku || '',
    priceAmount: minPrice,
    compareAtPriceAmount: comparePrice,
    currencyCode,
    priceUSD: minPrice,
    compareAtPriceUSD: comparePrice || minPrice,
    discountPercent,
    availableForSale: Boolean(node.availableForSale),
    totalVariantsCount: variants.length,
    variantsTruncated,
    badge,
    isPreOrder: badge === 'PRE-ORDER',
    description: node.description || 'Authentic Sanelow merchandise piece.',
    descriptionHtml: node.descriptionHtml,
    features,
    fabricSpecs: [],
    sizingDetails: [],
    sizes: sizes.length > 0 ? sizes : ['One Size'],
    colors: colors.length > 0 ? colors : [{ name: 'Original', hex: '#18181b', hasSwatch: true, inStock: true }],
    images,
    variants,
    options,
    tags,
    reviews: [],
  };
}

// Fetch live catalogue using server-owned GetProducts operation with cursor pagination
export async function fetchLiveCatalogue(onBatch?: (products: Product[]) => void): Promise<{
  products: Product[];
  configured: boolean;
  errorMessage?: string;
  isTruncated?: boolean;
  totalFetched?: number;
}> {
  const allProducts: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 10; // Safety guard for up to 1,000 products

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    const variables: Record<string, unknown> = { first: 100 };
    if (cursor) {
      variables.after = cursor;
    }

    const result = await shopifyFetch<{
      products: {
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        edges: any[];
      };
    }>({
      operation: 'GetProducts',
      variables,
    });

    if (!result.configured) {
      return {
        products: [],
        configured: false,
        errorMessage: result.message,
        isTruncated: false,
        totalFetched: 0,
      };
    }

    if (result.errors && result.errors.length > 0) {
      return {
        products: allProducts.length > 0 ? allProducts : [],
        configured: true,
        errorMessage: result.errors[0]?.message || 'GraphQL error fetching products',
        isTruncated: false,
        totalFetched: allProducts.length,
      };
    }

    const edges = result.data?.products?.edges || [];
    for (const e of edges) {
      if (e?.node) {
        allProducts.push(transformShopifyProduct(e.node));
      }
    }

    // Immediately deliver available products so user can interact without blocking on subsequent pages
    if (onBatch && allProducts.length > 0) {
      onBatch([...allProducts]);
    }

    const pageInfo = result.data?.products?.pageInfo;
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor || null;

    if (!pageInfo || !cursor) {
      break;
    }
  }

  const isTruncated = Boolean(hasNextPage && pageCount >= MAX_PAGES);

  return {
    products: allProducts,
    configured: true,
    isTruncated,
    totalFetched: allProducts.length,
  };
}

// Fetch single product by handle
export async function fetchProductByHandle(handle: string): Promise<{
  product: Product | null;
  configured: boolean;
  errorMessage?: string;
  variantsIncomplete?: boolean;
  incompleteReason?: string;
}> {
  const result = await shopifyFetch<{ product: any }>({
    operation: 'GetProductByHandle',
    variables: { handle },
  });

  if (!result.configured) {
    return {
      product: null,
      configured: false,
      errorMessage: result.message,
    };
  }

  if (result.errors && result.errors.length > 0) {
    return {
      product: null,
      configured: true,
      errorMessage: result.errors[0]?.message || 'Error fetching product',
    };
  }

  const raw = result.data?.product;
  if (!raw) {
    return {
      product: null,
      configured: true,
    };
  }

  // Paginate variants so every purchasable option can be selected in the storefront
  let hasMoreVariants = Boolean(raw.variants?.pageInfo?.hasNextPage);
  let variantsCursor = raw.variants?.pageInfo?.endCursor;
  let variantPageCount = 0;
  const MAX_VARIANT_PAGES = 10; // Supports up to 2,500 variants per product
  const seenCursors = new Set<string>();
  let variantsIncomplete = false;
  let incompleteReason: string | undefined = undefined;
  let paginationErrorMessage: string | undefined = undefined;

  while (hasMoreVariants) {
    // 1. Detect missing or empty cursor while hasNextPage is true
    if (!variantsCursor || typeof variantsCursor !== 'string' || !variantsCursor.trim()) {
      variantsIncomplete = true;
      incompleteReason = 'Shopify indicated hasNextPage: true but provided a missing or empty endCursor.';
      break;
    }

    // 2. Detect repeated cursor while hasNextPage is true
    if (seenCursors.has(variantsCursor)) {
      variantsIncomplete = true;
      incompleteReason = `Repeated pagination cursor detected (${variantsCursor}) while hasNextPage is true.`;
      break;
    }
    seenCursors.add(variantsCursor);

    // 3. Safety limit check
    if (variantPageCount >= MAX_VARIANT_PAGES) {
      variantsIncomplete = true;
      incompleteReason = `Safety limit reached (${MAX_VARIANT_PAGES * 250} variants) while more variants exist.`;
      break;
    }

    variantPageCount++;
    const nextPage = await shopifyFetch<{ product: any }>({
      operation: 'GetProductByHandle',
      variables: { handle, variantsCursor },
    });

    // Check configured on every pagination request
    if (!nextPage.configured) {
      variantsIncomplete = true;
      incompleteReason = nextPage.message || 'Storefront unconfigured during variant pagination';
      paginationErrorMessage = incompleteReason;
      break;
    }

    // Check GraphQL errors on every pagination request
    if (nextPage.errors && nextPage.errors.length > 0) {
      variantsIncomplete = true;
      incompleteReason = nextPage.errors[0]?.message || 'GraphQL error during variant pagination';
      paginationErrorMessage = incompleteReason;
      break;
    }

    // Check missing product or variants data on every pagination request
    const nextRaw = nextPage.data?.product;
    if (!nextRaw || !nextRaw.variants) {
      variantsIncomplete = true;
      incompleteReason = 'Missing product or variants data on subsequent pagination page';
      paginationErrorMessage = incompleteReason;
      break;
    }

    const nextEdges = nextRaw.variants.edges;
    if (Array.isArray(nextEdges) && nextEdges.length > 0) {
      if (!Array.isArray(raw.variants.edges)) {
        raw.variants.edges = [];
      }
      raw.variants.edges.push(...nextEdges);
    }

    hasMoreVariants = Boolean(nextRaw.variants.pageInfo?.hasNextPage);
    variantsCursor = nextRaw.variants.pageInfo?.endCursor;
  }

  if (raw.variants?.pageInfo) {
    raw.variants.pageInfo.hasNextPage = hasMoreVariants;
  }

  const transformed = transformShopifyProduct(raw);
  if (variantsIncomplete) {
    transformed.variantsIncomplete = true;
    transformed.variantsTruncated = true;
    transformed.incompleteVariantsReason = incompleteReason;
  }

  return {
    product: transformed,
    configured: true,
    errorMessage: paginationErrorMessage,
    variantsIncomplete,
    incompleteReason,
  };
}

// Fetch genuine collections
export async function fetchCollections(): Promise<{
  collections: ShopifyCollection[];
  configured: boolean;
  errorMessage?: string;
}> {
  const result = await shopifyFetch<{ collections: { edges: any[] } }>({
    operation: 'GetCollections',
    variables: { first: 50 },
  });

  if (!result.configured) {
    return {
      collections: [],
      configured: false,
      errorMessage: result.message,
    };
  }

  if (result.errors && result.errors.length > 0) {
    return {
      collections: [],
      configured: true,
      errorMessage: result.errors[0]?.message || 'Error fetching collections',
    };
  }

  const collections: ShopifyCollection[] = (result.data?.collections?.edges || []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    handle: e.node.handle,
    description: e.node.description || '',
    image: e.node.image,
    products: (e.node.products?.edges || []).map((pe: any) => transformShopifyProduct(pe.node)),
  }));

  return {
    collections,
    configured: true,
  };
}

// Fetch collection by handle
export async function fetchCollectionByHandle(handle: string): Promise<{
  collection: ShopifyCollection | null;
  configured: boolean;
  errorMessage?: string;
}> {
  const result = await shopifyFetch<{ collection: any }>({
    operation: 'GetCollectionByHandle',
    variables: { handle },
  });

  if (!result.configured) {
    return {
      collection: null,
      configured: false,
      errorMessage: result.message,
    };
  }

  if (result.errors && result.errors.length > 0) {
    return {
      collection: null,
      configured: true,
      errorMessage: result.errors[0]?.message || 'Error fetching collection',
    };
  }

  const raw = result.data?.collection;
  if (!raw) {
    return {
      collection: null,
      configured: true,
    };
  }

  const collection: ShopifyCollection = {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    description: raw.description || '',
    image: raw.image,
    products: (raw.products?.edges || []).map((pe: any) => transformShopifyProduct(pe.node)),
  };

  return {
    collection,
    configured: true,
  };
}

// Transform raw Shopify Cart response to clean ShopifyCart
function transformCart(rawCart: any): ShopifyCart {
  const lines: ShopifyCartLine[] = (rawCart.lines?.edges || []).map((e: any) => e.node);
  return {
    id: rawCart.id,
    checkoutUrl: rawCart.checkoutUrl,
    totalQuantity: rawCart.totalQuantity || 0,
    cost: rawCart.cost,
    discountCodes: rawCart.discountCodes || [],
    lines,
  };
}

/**
 * Detects whether the application is running inside an embedded preview (e.g. iframe).
 * In an embedded preview, direct navigation inside the iframe leads to "[store].myshopify.com refused to connect"
 * because Shopify checkout frames are blocked with X-Frame-Options: DENY.
 */
export function isEmbeddedPreview(): boolean {
  if (typeof window === 'undefined') return false;

  // Test-runner override hook
  if ((window as any).__MOCK_EMBEDDED_PREVIEW__ !== undefined) {
    return Boolean((window as any).__MOCK_EMBEDDED_PREVIEW__);
  }

  // URL query parameter check (?embedded=true / ?embedded=false)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embedded') === 'true') return true;
    if (params.get('embedded') === 'false') return false;
  } catch {
    // Ignore URL parsing errors
  }

  try {
    if (window.self !== window.top) {
      return true;
    }
  } catch {
    // Cross-origin iframe throws error accessing window.top, which indicates embedding
    return true;
  }

  return false;
}

/**
 * Fetches the current state of an existing Shopify cart by ID to revalidate
 * lines, availability, totals, and checkoutUrl directly from Shopify.
 */
export async function getShopifyCart(cartId: string): Promise<ShopifyCart | null> {
  const res = await shopifyFetch<{ cart: any }>({
    operation: 'GetCart',
    variables: { cartId },
  });

  if (res.data?.cart) {
    return transformCart(res.data.cart);
  }
  return null;
}

// Get or Create Cart with local storage persistence and invalid-cart recovery
export async function getOrCreateShopifyCart(): Promise<ShopifyCart | null> {
  const existingCartId = localStorage.getItem(CART_STORAGE_KEY);

  if (existingCartId) {
    const res = await shopifyFetch<{ cart: any }>({
      operation: 'GetCart',
      variables: { cartId: existingCartId },
    });

    if (res.data?.cart) {
      return transformCart(res.data.cart);
    } else {
      // Invalid or expired cart ID; purge and create fresh one
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }

  // Create new cart using server-owned CartCreate operation
  const createRes = await shopifyFetch<{ cartCreate: { cart: any; userErrors: any[] } }>({
    operation: 'CartCreate',
    variables: {
      input: {
        buyerIdentity: { countryCode: 'ZA' },
      },
    },
  });

  if (createRes.data?.cartCreate?.cart) {
    const newCart = transformCart(createRes.data.cartCreate.cart);
    localStorage.setItem(CART_STORAGE_KEY, newCart.id);
    return newCart;
  }

  return null;
}

// Add lines to Shopify cart
export async function addLinesToCart(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>
): Promise<{ cart: ShopifyCart | null; userErrors: any[] }> {
  const res = await shopifyFetch<{ cartLinesAdd: { cart: any; userErrors: any[] } }>({
    operation: 'CartLinesAdd',
    variables: { cartId, lines },
  });

  const cart = res.data?.cartLinesAdd?.cart ? transformCart(res.data.cartLinesAdd.cart) : null;
  const userErrors = res.data?.cartLinesAdd?.userErrors || [];
  return { cart, userErrors };
}

// Update line quantity in Shopify cart
export async function updateLineInCart(
  cartId: string,
  lineId: string,
  quantity: number
): Promise<{ cart: ShopifyCart | null; userErrors: any[] }> {
  const res = await shopifyFetch<{ cartLinesUpdate: { cart: any; userErrors: any[] } }>({
    operation: 'CartLinesUpdate',
    variables: {
      cartId,
      lines: [{ id: lineId, quantity }],
    },
  });

  const cart = res.data?.cartLinesUpdate?.cart ? transformCart(res.data.cartLinesUpdate.cart) : null;
  const userErrors = res.data?.cartLinesUpdate?.userErrors || [];
  return { cart, userErrors };
}

// Remove line from Shopify cart
export async function removeLineFromCart(
  cartId: string,
  lineId: string
): Promise<{ cart: ShopifyCart | null; userErrors: any[] }> {
  const res = await shopifyFetch<{ cartLinesRemove: { cart: any; userErrors: any[] } }>({
    operation: 'CartLinesRemove',
    variables: {
      cartId,
      lineIds: [lineId],
    },
  });

  const cart = res.data?.cartLinesRemove?.cart ? transformCart(res.data.cartLinesRemove.cart) : null;
  const userErrors = res.data?.cartLinesRemove?.userErrors || [];
  return { cart, userErrors };
}

// Apply coupon code via Shopify Storefront Cart
export async function applyDiscountToCart(
  cartId: string,
  codes: string[]
): Promise<{ cart: ShopifyCart | null; userErrors: any[] }> {
  const res = await shopifyFetch<{ cartDiscountCodesUpdate: { cart: any; userErrors: any[] } }>({
    operation: 'CartDiscountCodesUpdate',
    variables: {
      cartId,
      discountCodes: codes,
    },
  });

  const cart = res.data?.cartDiscountCodesUpdate?.cart
    ? transformCart(res.data.cartDiscountCodesUpdate.cart)
    : null;
  const userErrors = res.data?.cartDiscountCodesUpdate?.userErrors || [];
  return { cart, userErrors };
}

// ============================================================================
// Shopify Customer Account API Client Methods
// ============================================================================

export function transformCustomerOrder(node: any): CustomerAccountOrder {
  const lineItems = (node.lineItems?.edges || []).map((e: any) => ({
    id: e.node?.id || '',
    title: e.node?.title || 'Sanelow Merch Piece',
    quantity: typeof e.node?.quantity === 'number' ? e.node.quantity : 1,
    variantTitle: e.node?.variantTitle || null,
    price: e.node?.price || { amount: '0.00', currencyCode: DEFAULT_CURRENCY },
    totalDiscount: e.node?.totalDiscount || undefined,
    image: e.node?.image ? { url: e.node.image.url, altText: e.node.image.altText || null } : null,
  }));

  const fulfillments = (node.fulfillments?.edges || []).map((e: any) => ({
    id: e.node?.id || '',
    status: e.node?.status || 'UNFULFILLED',
    latestShipmentStatus: e.node?.latestShipmentStatus || null,
    estimatedDeliveryAt: e.node?.estimatedDeliveryAt || null,
    trackingInformation: (e.node?.trackingInformation || []).map((t: any) => ({
      company: t.company || null,
      number: t.number || null,
      url: t.url || null,
    })),
  }));

  return {
    id: node.id || '',
    name: node.name || (node.number ? `#${node.number}` : 'Order'),
    number: typeof node.number === 'number' ? node.number : undefined,
    processedAt: node.processedAt || new Date().toISOString(),
    financialStatus: node.financialStatus || 'PAID',
    fulfillmentStatus: node.fulfillmentStatus || 'UNFULFILLED',
    totalPrice: node.totalPrice || { amount: '0.00', currencyCode: DEFAULT_CURRENCY },
    subtotal: node.subtotal,
    totalTax: node.totalTax,
    totalShipping: node.totalShipping,
    lineItems,
    fulfillments,
  };
}

export function transformCustomerProfile(raw: any): CustomerProfile {
  return {
    id: raw.id || '',
    firstName: raw.firstName || null,
    lastName: raw.lastName || null,
    displayName: raw.displayName || (raw.firstName ? `${raw.firstName} ${raw.lastName || ''}`.trim() : 'Customer'),
    emailAddress: raw.emailAddress || null,
    phoneNumber: raw.phoneNumber || null,
    defaultAddress: raw.defaultAddress || null,
    addresses: (raw.addresses?.edges || []).map((e: any) => e.node),
  };
}

// Fetch session and auth status from server
export async function fetchCustomerSession(): Promise<CustomerSession> {
  try {
    const res = await fetch('/api/auth?action=session', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        authenticated: false,
        configured: Boolean(SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID),
        enabled: ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
        hostedFallbackUrl: SHOPIFY_CUSTOMER_ACCOUNT_URL || 'https://shopify.com/79461089448/account',
      };
    }
    return await res.json();
  } catch {
    return {
      authenticated: false,
      configured: Boolean(SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID),
      enabled: ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
      hostedFallbackUrl: SHOPIFY_CUSTOMER_ACCOUNT_URL || 'https://shopify.com/79461089448/account',
    };
  }
}

// Fetch dashboard customer data (profile + first 10 orders)
export async function fetchCustomerDashboardData(): Promise<{
  profile: CustomerProfile | null;
  orders: CustomerAccountOrder[];
  error?: string;
  sessionExpired?: boolean;
}> {
  try {
    const res = await fetch('/api/customer?action=dashboard', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.status === 401) {
      return { profile: null, orders: [], sessionExpired: true };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { profile: null, orders: [], error: err.message || 'Failed to load customer dashboard.' };
    }

    const json = await res.json();
    const rawCustomer = json.data?.customer;
    if (!rawCustomer) {
      return { profile: null, orders: [], error: 'No customer data returned.' };
    }

    const profile = transformCustomerProfile(rawCustomer);
    const orders = (rawCustomer.orders?.edges || []).map((e: any) => transformCustomerOrder(e.node));

    return { profile, orders };
  } catch (err: any) {
    return { profile: null, orders: [], error: err?.message || 'Error communicating with server.' };
  }
}

// Fetch paginated customer orders
export async function fetchCustomerOrdersList(
  cursor?: string,
  direction?: 'next' | 'prev'
): Promise<CustomerOrdersPage & { error?: string; sessionExpired?: boolean }> {
  try {
    const params = new URLSearchParams({ action: 'orders' });
    if (cursor) params.set('cursor', cursor);
    if (direction) params.set('direction', direction);

    const res = await fetch(`/api/customer?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.status === 401) {
      return {
        orders: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        sessionExpired: true,
      };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        orders: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        error: err.message || 'Failed to load orders.',
      };
    }

    const json = await res.json();
    const rawOrders = json.data?.customer?.orders;
    const orders = (rawOrders?.edges || []).map((e: any) => transformCustomerOrder(e.node));
    const pageInfo = rawOrders?.pageInfo || { hasNextPage: false, hasPreviousPage: false };

    return { orders, pageInfo };
  } catch (err: any) {
    return {
      orders: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      error: err?.message || 'Error connecting to orders service.',
    };
  }
}

// Fetch customer profile & addresses
export async function fetchCustomerProfileData(): Promise<{
  profile: CustomerProfile | null;
  error?: string;
  sessionExpired?: boolean;
}> {
  try {
    const res = await fetch('/api/customer?action=profile', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.status === 401) {
      return { profile: null, sessionExpired: true };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { profile: null, error: err.message || 'Failed to load profile.' };
    }

    const json = await res.json();
    const rawCustomer = json.data?.customer;
    if (!rawCustomer) {
      return { profile: null, error: 'Customer profile not found.' };
    }

    return { profile: transformCustomerProfile(rawCustomer) };
  } catch (err: any) {
    return { profile: null, error: err?.message || 'Error communicating with profile service.' };
  }
}

// Log customer out
export async function logoutCustomer(): Promise<{ success: boolean; logoutUrl?: string }> {
  try {
    const res = await fetch('/api/auth?action=logout', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, logoutUrl: data.logoutUrl };
    }
  } catch {
    // Ignore error
  }
  return { success: true, logoutUrl: '/account' };
}

