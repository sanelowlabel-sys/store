import {
  Product,
  ShopifyCart,
  ShopifyCartLine,
  ShopifyVariant,
  Category,
  ProductColor,
  ShopifyCollection,
} from '../types';

export const SHOPIFY_STORE_DOMAIN =
  import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || 'sx71id-uy.myshopify.com';

export const DEFAULT_COUNTRY =
  (import.meta.env.VITE_DEFAULT_COUNTRY_CODE || 'ZA').toUpperCase();

export const DEFAULT_CURRENCY =
  import.meta.env.VITE_DEFAULT_CURRENCY || 'ZAR';

const CART_STORAGE_KEY = 'sanelow_shopify_cart_id';

// Clean currency formatter using native Intl with South Africa (ZAR) support
export function formatPrice(amount: number | string, currency: string = DEFAULT_CURRENCY): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${currency} 0.00`;

  const curr = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(curr === 'ZAR' ? 'en-ZA' : 'en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    if (curr === 'ZAR') {
      return `R ${num.toFixed(2)}`;
    }
    return `${curr} ${num.toFixed(2)}`;
  }
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

// Convert common color names to approximate hex for UI swatch preview
function getColorHex(colorName: string): string {
  const map: Record<string, string> = {
    black: '#18181b',
    white: '#f4f4f5',
    grey: '#71717a',
    gray: '#71717a',
    charcoal: '#3f3f46',
    red: '#dc2626',
    maroon: '#881337',
    burgundy: '#881337',
    blue: '#2563eb',
    navy: '#1e3a8a',
    green: '#16a34a',
    olive: '#3f6212',
    cream: '#fef08a',
    beige: '#e7e5e4',
    khaki: '#d6d3d1',
    brown: '#78350f',
  };
  const lower = colorName.trim().toLowerCase();
  return map[lower] || '#27272a';
}

// Map Shopify GraphQL node to clean Product
export function transformShopifyProduct(node: any): Product {
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
    ? colorOption.values.map((val: string) => ({
        name: val,
        hex: getColorHex(val),
        inStock: variants.some((v) =>
          v.selectedOptions.some((so) => so.name.toLowerCase() === colorOption.name.toLowerCase() && so.value === val && v.availableForSale)
        ),
      }))
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
    badge,
    isPreOrder: badge === 'PRE-ORDER',
    description: node.description || 'Authentic Sanelow merchandise piece.',
    descriptionHtml: node.descriptionHtml,
    features,
    fabricSpecs: [],
    sizingDetails: [],
    sizes: sizes.length > 0 ? sizes : ['One Size'],
    colors: colors.length > 0 ? colors : [{ name: 'Original', hex: '#18181b', inStock: true }],
    images,
    variants,
    options,
    tags,
    reviews: [],
  };
}

// Fetch live catalogue using server-owned GetProducts operation
export async function fetchLiveCatalogue(): Promise<{
  products: Product[];
  configured: boolean;
  errorMessage?: string;
}> {
  const result = await shopifyFetch<{ products: { edges: any[] } }>({
    operation: 'GetProducts',
    variables: { first: 50 },
  });

  if (!result.configured) {
    return {
      products: [],
      configured: false,
      errorMessage: result.message,
    };
  }

  if (result.errors && result.errors.length > 0) {
    return {
      products: [],
      configured: true,
      errorMessage: result.errors[0]?.message || 'GraphQL error fetching products',
    };
  }

  const edges = result.data?.products?.edges || [];
  const products = edges.map((e: any) => transformShopifyProduct(e.node));

  return {
    products,
    configured: true,
  };
}

// Fetch single product by handle
export async function fetchProductByHandle(handle: string): Promise<{
  product: Product | null;
  configured: boolean;
  errorMessage?: string;
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

  return {
    product: transformShopifyProduct(raw),
    configured: true,
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
