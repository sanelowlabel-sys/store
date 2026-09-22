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
  | 'Tour Vault';

export type MerchSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'ZAR' | 'CAD' | 'AUD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  rateFromUSD: number;
  label: string;
}

export interface Review {
  id: string;
  author: string;
  country: string;
  countryCode?: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
  userImage?: string;
  sizePurchased?: string;
  heightWeight?: string;
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
  size: MerchSize;
  chest: string;
  length: string;
  shoulder?: string;
}

export interface Product {
  id: string;
  title: string;
  tagline: string;
  category: Category;
  dropCollection: string;
  sku: string;
  priceUSD: number;
  compareAtPriceUSD: number;
  discountPercent: number;
  badge?: 'LIMITED DROP' | 'PRE-ORDER' | 'BESTSELLER' | 'SOLD OUT RISK' | 'CORE ESSENTIAL' | 'ARCHIVE' | 'HOT DROP';
  isPreOrder: boolean;
  preOrderShipDate?: string;
  stockCount: number;
  soldCount: number;
  rating: number;
  reviewsCount: number;
  description: string;
  features: string[];
  fabricSpecs: FabricSpec[];
  sizingDetails: SizingSpec[];
  sizes: MerchSize[];
  colors: ProductColor[];
  images: string[];
  bundleDeals?: BundleDeal[];
  reviews: Review[];
  shippingEstimate: string;
}

export interface CartItem {
  id: string; // composite key: product.id + size + color.name
  product: Product;
  selectedSize: MerchSize;
  selectedColor: ProductColor;
  quantity: number;
  appliedDiscountPercent?: number;
}

export interface ShippingAddress {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  apartment?: string;
  city: string;
  provinceOrState: string;
  postalCode: string;
  country: string;
  shippingMethod: 'standard_tracked' | 'express_courier' | 'vip_insured';
  paymentMethod: 'card' | 'paypal' | 'apple_pay' | 'instant_eft';
}

export interface TrackingStep {
  title: string;
  date: string;
  completed: boolean;
  current: boolean;
  location: string;
  description: string;
}

export interface OrderTrackResult {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  statusText: string;
  origin: string;
  destination: string;
  items: { title: string; image: string; quantity: number; size?: string; color?: string }[];
  timeline: TrackingStep[];
}

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  street: string;
  apartment?: string;
  city: string;
  provinceOrState: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerOrderItem {
  product: Product;
  size: MerchSize;
  color: string;
  quantity: number;
  priceUSD: number;
}

export interface CustomerOrderRecord {
  id: string;
  date: string;
  status: 'Fulfilling' | 'In Transit' | 'Delivered';
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  items: CustomerOrderItem[];
  totalUSD: number;
  shippingAddress: ShippingAddress;
  receiptNumber: string;
}

export interface CustomerUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  tier: 'VIP Member' | 'Streetwear Insider' | 'Diamond Club';
  loyaltyPoints: number;
  totalOrders: number;
  savedAddresses: SavedAddress[];
  sizePreferences: { top: MerchSize; bottom: MerchSize; headwear?: string };
  joinedDate: string;
}
