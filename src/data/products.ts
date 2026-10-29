import { CurrencyCode, CurrencyConfig, Product } from '../types';
import { formatPrice } from '../lib/shopify';

export { formatPrice };

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  ZAR: { code: 'ZAR', symbol: 'R', label: 'South African Rand (ZAR)' },
  EUR: { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  GBP: { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
};

// Initial empty catalogue. Production site fetches live data directly from Shopify Storefront API.
export const PRODUCTS: Product[] = [];
