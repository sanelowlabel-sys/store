/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_STORE_DOMAIN?: string;
  readonly VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN?: string;
  readonly VITE_DEFAULT_COUNTRY_CODE?: string;
  readonly VITE_DEFAULT_CURRENCY?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
