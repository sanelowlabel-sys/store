export type Category =
  | 'all'
  | 'hoodies-fleece'
  | 'graphic-tees'
  | 'outerwear'
  | 'headwear'
  | 'bottoms'
  | 'accessories';

export type DropCollection =
  | 'all'
  | "Summer '26 Drop"
  | 'Limited Edition'
  | 'Core Essentials'
  | 'Heavyweight Fleece'
  | 'Tour Vault'
  | string;

export type MerchSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL' | string;

export type CurrencyCode = 'ZAR' | 'USD' | 'EUR' | 'GBP' | string;

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  label: string;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml?: string;
  image?: {
    url: string;
    altText?: string;
  };
  products?: Product[];
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  verified?: boolean;
}

export interface ProductColor {
  name: string;
  hex: string;
  inStock?: boolean;
}

export interface BundleDeal {
  quantity: number;
  discountPercent: number;
  label: string;
  popular?: boolean;
}

export interface FabricSpec {
  label: string;
  value: string;
}

export interface SizingSpec {
  size: string;
  chest: string;
  length: string;
  shoulder?: string;
}

// Shopify Specific Variant Model
export interface ShopifyVariant {
  id: string; // gid://shopify/ProductVariant/...
  title: string;
  availableForSale: boolean;
  sku?: string;
  price: {
    amount: string;
    currencyCode: string;
  };
  compareAtPrice?: {
    amount: string;
    currencyCode: string;
  } | null;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  image?: {
    url: string;
    altText?: string;
  } | null;
}

export interface ShopifyOption {
  id?: string;
  name: string;
  values: string[];
}

// Unified Storefront Product Model backed by Shopify
export interface Product {
  id: string; // gid://shopify/Product/...
  shopifyId: string;
  handle: string;
  title: string;
  tagline: string;
  category: Category;
  dropCollection: string;
  sku: string;
  // Real pricing from Shopify
  priceAmount: number;
  compareAtPriceAmount?: number;
  currencyCode: string;
  // Legacy / fallback numeric fields for backward compatibility
  priceUSD: number;
  compareAtPriceUSD: number;
  discountPercent: number;
  // Real availability
  availableForSale: boolean;
  totalVariantsCount: number;
  // Badge only if real supporting data
  badge?: 'LIMITED DROP' | 'PRE-ORDER' | 'BESTSELLER' | 'SOLD OUT RISK' | 'CORE ESSENTIAL' | 'ARCHIVE' | 'HOT DROP';
  isPreOrder: boolean;
  preOrderShipDate?: string;
  // Content & attributes
  description: string;
  descriptionHtml?: string;
  features: string[];
  fabricSpecs: FabricSpec[];
  sizingDetails: SizingSpec[];
  sizes: string[];
  colors: ProductColor[];
  images: string[];
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  tags: string[];
  bundleDeals?: BundleDeal[];
  reviews: Review[];
  rating?: number;
  reviewsCount?: number;
}

// Shopify Cart Models
export interface ShopifyCartLine {
  id: string; // Line item ID
  quantity: number;
  cost: {
    totalAmount: {
      amount: string;
      currencyCode: string;
    };
    subtotalAmount: {
      amount: string;
      currencyCode: string;
    };
    amountPerQuantity: {
      amount: string;
      currencyCode: string;
    };
    compareAtAmountPerQuantity?: {
      amount: string;
      currencyCode: string;
    } | null;
  };
  merchandise: {
    id: string;
    title: string;
    availableForSale: boolean;
    sku?: string;
    selectedOptions: {
      name: string;
      value: string;
    }[];
    image?: {
      url: string;
      altText?: string;
    } | null;
    price: {
      amount: string;
      currencyCode: string;
    };
    product: {
      id: string;
      title: string;
      handle: string;
    };
  };
  discountAllocations: {
    discountedAmount: {
      amount: string;
      currencyCode: string;
    };
  }[];
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: {
    totalAmount: {
      amount: string;
      currencyCode: string;
    };
    subtotalAmount: {
      amount: string;
      currencyCode: string;
    };
    totalTaxAmount?: {
      amount: string;
      currencyCode: string;
    } | null;
    totalDutyAmount?: {
      amount: string;
      currencyCode: string;
    } | null;
  };
  discountCodes: {
    code: string;
    applicable: boolean;
  }[];
  lines: ShopifyCartLine[];
}

// Backward-compatible CartItem representation for UI components
export interface CartItem {
  id: string; // Shopify Cart Line ID
  variantId: string;
  product: Product;
  selectedSize: string;
  selectedColor?: ProductColor;
  quantity: number;
  appliedDiscountPercent?: number;
  unitPriceAmount: number;
  currencyCode: string;
}

// Local Wishlist Item
export interface WishlistItem {
  productId: string;
  handle: string;
  title: string;
  priceAmount: number;
  currencyCode: string;
  image: string;
  addedAt: number;
}

// Connection Status
export interface ShopifyStoreConfig {
  domain: string;
  countryCode: string;
  currencyCode: string;
  isConfigured: boolean;
  errorMessage?: string;
}
