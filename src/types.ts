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
  variantsTruncated?: boolean;
  variantsIncomplete?: boolean;
  incompleteVariantsReason?: string;
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

// ============================================================================
// Shopify Customer Account API Types
// ============================================================================

export interface CustomerAccountAddress {
  id: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  formatted?: string[];
}

export interface CustomerAccountLineItem {
  id: string;
  title: string;
  quantity: number;
  variantTitle?: string | null;
  price?: {
    amount: string;
    currencyCode: string;
  };
  totalDiscount?: {
    amount: string;
    currencyCode: string;
  };
  image?: {
    url: string;
    altText?: string | null;
  } | null;
}

export interface CustomerAccountTrackingInfo {
  company?: string | null;
  number?: string | null;
  url?: string | null;
}

export interface CustomerAccountFulfillment {
  id: string;
  status: string; // SUCCESS, OPEN, IN_PROGRESS, PENDING, CANCELLED, ERROR
  latestShipmentStatus?: string | null; // LABEL_PRINTED, LABEL_PURCHASED, ATTEMPTED_DELIVERY, READY_FOR_PICKUP, CONFIRMED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILURE
  estimatedDeliveryAt?: string | null;
  trackingInformation?: CustomerAccountTrackingInfo[];
}

export interface CustomerAccountOrder {
  id: string;
  name: string;
  number?: number;
  processedAt: string;
  financialStatus: 'PAID' | 'PENDING' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED' | string;
  fulfillmentStatus: 'FULFILLED' | 'UNFULFILLED' | 'PARTIALLY_FULFILLED' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESTOCKED' | string;
  totalPrice: {
    amount: string;
    currencyCode: string;
  };
  subtotal?: {
    amount: string;
    currencyCode: string;
  };
  totalTax?: {
    amount: string;
    currencyCode: string;
  };
  totalShipping?: {
    amount: string;
    currencyCode: string;
  };
  lineItems: CustomerAccountLineItem[];
  fulfillments: CustomerAccountFulfillment[];
}

export interface CustomerProfile {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  emailAddress?: {
    emailAddress: string;
  } | null;
  phoneNumber?: {
    phoneNumber: string;
  } | null;
  defaultAddress?: CustomerAccountAddress | null;
  addresses?: CustomerAccountAddress[];
}

export interface CustomerSession {
  authenticated: boolean;
  configured: boolean;
  enabled: boolean;
  customer?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
  expiresAt?: number;
  hostedFallbackUrl: string;
}

export interface CustomerOrdersPage {
  orders: CustomerAccountOrder[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string | null;
    endCursor?: string | null;
  };
}

