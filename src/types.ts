export type ProductCategory = 'All' | 'Hoodies & Sweats' | 'T-Shirts & Tees' | 'Hats & Headwear' | 'Vinyl & Physical' | 'Accessories & Bags' | 'Outerwear';

export interface ColorOption {
  name: string;
  hex: string;
}

export interface ProductVariants {
  sizes?: string[];
  colors?: ColorOption[];
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  category: ProductCategory;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockQuantity: number;
  isNew?: boolean;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  images: string[];
  description: string;
  features: string[];
  variants?: ProductVariants;
  specs?: Record<string, string>;
  tags: string[];
}

export interface Review {
  id: string;
  productId: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
}

export interface CartItem {
  id: string; // unique ID incorporating product id + variant selections
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: ColorOption;
}

export interface FilterState {
  category: ProductCategory;
  searchQuery: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'featured' | 'price-low' | 'price-high' | 'rating' | 'newest';
  inStockOnly: boolean;
  selectedTag: string | null;
}

export interface CustomerInfo {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  promoCode?: string;
  date: string;
  status: 'Processing' | 'Shipped' | 'Out for Delivery' | 'Delivered';
  customer: CustomerInfo;
  paymentMethod: string;
  estimatedDelivery: string;
}

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'error';
  image?: string;
}
