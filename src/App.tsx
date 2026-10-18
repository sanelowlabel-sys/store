import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { ProductPage } from './components/ProductPage';
import { CollectionPage } from './components/CollectionPage';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { WishlistDrawer } from './components/WishlistDrawer';
import { BrandStorySection } from './components/BrandStorySection';
import { Footer } from './components/Footer';
import { FaqModal } from './components/FaqModal';
import { TrackOrderModal } from './components/TrackOrderModal';
import { CustomerPortalModal } from './components/CustomerPortalModal';
import { CustomerDashboard } from './components/CustomerDashboard';
import { MerchLoader } from './components/MerchLoader';
import { ShopifySetupBanner } from './components/ShopifySetupBanner';

import {
  Product,
  Category,
  ShopifyCart,
  ShopifyVariant,
  ShopifyCollection,
  CustomerSession,
} from './types';
import {
  fetchLiveCatalogue,
  fetchProductByHandle,
  fetchCollectionByHandle,
  getOrCreateShopifyCart,
  addLinesToCart,
  updateLineInCart,
  removeLineFromCart,
  applyDiscountToCart,
  fetchCustomerSession,
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_CUSTOMER_ACCOUNT_URL,
  ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
  DEFAULT_CURRENCY,
} from './lib/shopify';

import {
  Filter,
  ChevronDown,
  Flame,
  Scissors,
  RefreshCw,
  ShoppingBag,
  ArrowLeft,
} from 'lucide-react';

interface RouteState {
  view: 'home' | 'product' | 'collection' | 'account';
  handle?: string;
  accountSection?: 'overview' | 'orders' | 'order-detail' | 'profile';
  orderId?: string;
}

function parseUrlRoute(): RouteState {
  if (typeof window === 'undefined') return { view: 'home' };
  const pathname = window.location.pathname;
  const prodMatch = pathname.match(/^\/products\/([a-zA-Z0-9_\-]+)/);
  if (prodMatch) return { view: 'product', handle: prodMatch[1] };
  const colMatch = pathname.match(/^\/collections\/([a-zA-Z0-9_\-]+)/);
  if (colMatch) return { view: 'collection', handle: colMatch[1] };

  const orderDetailMatch = pathname.match(/^\/account\/orders\/([a-zA-Z0-9_\-:]+)/);
  if (orderDetailMatch) return { view: 'account', accountSection: 'order-detail', orderId: orderDetailMatch[1] };
  if (pathname === '/account/orders' || pathname.startsWith('/account/orders')) return { view: 'account', accountSection: 'orders' };
  if (pathname === '/account/profile' || pathname.startsWith('/account/profile')) return { view: 'account', accountSection: 'profile' };
  if (pathname === '/account' || pathname.startsWith('/account')) return { view: 'account', accountSection: 'overview' };

  return { view: 'home' };
}

export default function App() {
  // App initialization loader
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Routing State
  const [route, setRoute] = useState<RouteState>(parseUrlRoute);
  const [activeProductPage, setActiveProductPage] = useState<Product | null>(null);
  const [activeCollectionPage, setActiveCollectionPage] = useState<ShopifyCollection | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageNotFound, setPageNotFound] = useState(false);

  // Live Shopify Storefront State
  const [products, setProducts] = useState<Product[]>([]);
  const [isConfigured, setIsConfigured] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isCatalogueTruncated, setIsCatalogueTruncated] = useState(false);

  // Shopify Cart State
  const [shopifyCart, setShopifyCart] = useState<ShopifyCart | null>(null);
  const [isCartLoading, setIsCartLoading] = useState(false);

  // Navigation & Filtering State
  const [currentCategory, setCurrentCategory] = useState<Category>('all');
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'featured' | 'price-asc' | 'price-desc' | 'title'>('featured');
  const [onlyDrop26, setOnlyDrop26] = useState(false);
  const [onlyUnderThreshold, setOnlyUnderThreshold] = useState(false); // Under R1,000
  const [onlyInStock, setOnlyInStock] = useState(false);

  // Modals & Drawers State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isTrackOrderOpen, setIsTrackOrderOpen] = useState(false);
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Authenticated Shopify Customer Session State
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);

  useEffect(() => {
    fetchCustomerSession().then((sess) => {
      setCustomerSession(sess);
    }).catch(() => {});
  }, []);

  // Browser-Local Wishlist
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('sanelow_merch_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const backoffDelayRef = useRef<number>(60000); // 60s base
  const catalogueVersionRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // URL Navigation helper
  const navigateTo = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(parseUrlRoute());
  }, []);

  // 1. Fetch live catalogue from Shopify
  const loadLiveProducts = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setIsRefreshingCatalog(true);
    }

    try {
      const result = await fetchLiveCatalogue();
      lastFetchTimeRef.current = Date.now();

      if (!result.configured) {
        setIsConfigured(false);
        setCatalogError(result.errorMessage || 'Shopify Storefront Token is not configured');
        setProducts([]);
      } else if (result.errorMessage) {
        setCatalogError(result.errorMessage);
        backoffDelayRef.current = Math.min(300000, backoffDelayRef.current * 1.5);
      } else {
        setIsConfigured(true);
        setCatalogError(null);
        setProducts(result.products);
        setIsCatalogueTruncated(Boolean(result.isTruncated));
        setLastSyncedAt(new Date());
        backoffDelayRef.current = 60000;
      }
    } catch (err: any) {
      setCatalogError(err?.message || 'Error connecting to Shopify catalogue');
    } finally {
      setIsRefreshingCatalog(false);
      setIsInitialLoading(false);
    }
  }, []);

  // Check server-side catalogue version (triggered by Shopify webhooks)
  const checkCatalogueVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/webhooks/shopify', { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.version === 'number') {
          if (catalogueVersionRef.current !== null && json.version > catalogueVersionRef.current) {
            catalogueVersionRef.current = json.version;
            loadLiveProducts(true);
            return;
          }
          catalogueVersionRef.current = json.version;
        }
      }
    } catch {
      // Non-blocking background check
    }
  }, [loadLiveProducts]);

  // 2. Fetch or initialize Shopify Cart
  const loadCart = useCallback(async () => {
    setIsCartLoading(true);
    try {
      const cart = await getOrCreateShopifyCart();
      if (cart) {
        setShopifyCart(cart);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsCartLoading(false);
    }
  }, []);

  // Handle route change and load specific page data
  useEffect(() => {
    if (route.view === 'product' && route.handle) {
      const matchingLocal = products.find((p) => p.handle === route.handle);
      if (matchingLocal) {
        setActiveProductPage(matchingLocal);
        setPageNotFound(false);
        document.title = `${matchingLocal.title} | Sanelow Merchant Store`;
      } else {
        setPageLoading(true);
        fetchProductByHandle(route.handle).then((res) => {
          setPageLoading(false);
          if (res.product) {
            setActiveProductPage(res.product);
            setPageNotFound(false);
            document.title = `${res.product.title} | Sanelow Merchant Store`;
          } else {
            setActiveProductPage(null);
            setPageNotFound(true);
            document.title = 'Piece Not Found | Sanelow Merchant Store';
          }
        });
      }
    } else if (route.view === 'collection' && route.handle) {
      setPageLoading(true);
      fetchCollectionByHandle(route.handle).then((res) => {
        setPageLoading(false);
        if (res.collection) {
          setActiveCollectionPage(res.collection);
          setPageNotFound(false);
          document.title = `${res.collection.title} | Sanelow Merchant Store`;
        } else {
          setActiveCollectionPage(null);
          setPageNotFound(true);
          document.title = 'Collection Not Found | Sanelow Merchant Store';
        }
      });
    } else if (route.view === 'account') {
      setActiveProductPage(null);
      setActiveCollectionPage(null);
      setPageNotFound(false);
      document.title = 'Customer Account & Orders | Sanelow Merchant Store';

      // Exclude customer account views from search indexing
      let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
      if (!metaRobots) {
        metaRobots = document.createElement('meta');
        metaRobots.name = 'robots';
        document.head.appendChild(metaRobots);
      }
      metaRobots.content = 'noindex, nofollow';
    } else {
      setActiveProductPage(null);
      setActiveCollectionPage(null);
      setPageNotFound(false);
      document.title = 'Sanelow Merchant Store | Official Streetwear & Merch';

      const metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
      if (metaRobots) {
        metaRobots.content = 'index, follow';
      }
    }
  }, [route, products]);

  // Initial load
  useEffect(() => {
    loadLiveProducts();
    loadCart();
  }, [loadLiveProducts, loadCart]);

  // Periodic Refresh: Refresh every ~60s while page is visible
  useEffect(() => {
    let timerId: NodeJS.Timeout;

    const scheduleRefresh = () => {
      timerId = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await loadLiveProducts(true);
        }
        scheduleRefresh();
      }, backoffDelayRef.current);
    };

    scheduleRefresh();
    return () => clearTimeout(timerId);
  }, [loadLiveProducts]);

  // Tab visibility & focus change: re-fetch if tab becomes active and stale (>15s) or version changed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkCatalogueVersion();
        const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
        if (timeSinceLastFetch > 15000) {
          loadLiveProducts(true);
        }
      }
    };

    const handleFocus = () => {
      checkCatalogueVersion();
      const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
      if (timeSinceLastFetch > 25000) {
        loadLiveProducts(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadLiveProducts, checkCatalogueVersion]);

  // Save wishlist to local storage
  useEffect(() => {
    try {
      localStorage.setItem('sanelow_merch_wishlist', JSON.stringify(wishlist));
    } catch {
      // Ignore
    }
  }, [wishlist]);

  // Shopify Cart Operations
  const handleAddToCart = async (
    product: Product,
    variant: ShopifyVariant,
    quantity: number = 1
  ) => {
    setIsCartLoading(true);
    try {
      let currentCart = shopifyCart;
      if (!currentCart) {
        currentCart = await getOrCreateShopifyCart();
      }

      if (!currentCart) {
        showToast('Unable to initialize cart. Please check your connection.');
        return;
      }

      const { cart, userErrors } = await addLinesToCart(currentCart.id, [
        { merchandiseId: variant.id, quantity },
      ]);

      if (userErrors && userErrors.length > 0) {
        showToast(userErrors[0].message || 'Could not add variant to bag');
      } else if (cart) {
        setShopifyCart(cart);
        showToast(`Added ${quantity}x "${product.title}" (${variant.title}) to your bag`);
      }
    } catch {
      showToast('Error communicating with Shopify Cart');
    } finally {
      setIsCartLoading(false);
    }
  };

  const handleUpdateCartQuantity = async (lineId: string, quantity: number) => {
    if (!shopifyCart) return;
    setIsCartLoading(true);
    try {
      if (quantity <= 0) {
        const { cart } = await removeLineFromCart(shopifyCart.id, lineId);
        if (cart) setShopifyCart(cart);
      } else {
        const { cart } = await updateLineInCart(shopifyCart.id, lineId, quantity);
        if (cart) setShopifyCart(cart);
      }
    } catch {
      showToast('Error updating item in bag');
    } finally {
      setIsCartLoading(false);
    }
  };

  const handleRemoveFromCart = async (lineId: string) => {
    if (!shopifyCart) return;
    setIsCartLoading(true);
    try {
      const { cart } = await removeLineFromCart(shopifyCart.id, lineId);
      if (cart) {
        setShopifyCart(cart);
        showToast('Item removed from bag');
      }
    } catch {
      showToast('Error removing item from bag');
    } finally {
      setIsCartLoading(false);
    }
  };

  const handleApplyDiscount = async (code: string): Promise<{ success: boolean; message?: string }> => {
    if (!shopifyCart) return { success: false, message: 'Cart not initialized' };
    try {
      const { cart, userErrors } = await applyDiscountToCart(shopifyCart.id, [code]);
      if (userErrors && userErrors.length > 0) {
        return { success: false, message: userErrors[0].message };
      }
      if (cart) {
        setShopifyCart(cart);
        const applied = cart.discountCodes.some((d) => d.code.toUpperCase() === code.toUpperCase() && d.applicable);
        if (applied) {
          showToast(`Shopify discount ${code} applied successfully!`);
          return { success: true };
        } else {
          return { success: false, message: 'Code is not valid for items in your cart.' };
        }
      }
      return { success: false, message: 'Could not apply code' };
    } catch {
      return { success: false, message: 'Error checking code with Shopify' };
    }
  };

  // Wishlist Actions
  const handleToggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        showToast(`Removed from saved merch`);
        return prev.filter((p) => p.id !== product.id);
      } else {
        showToast(`Saved "${product.title}" locally on this device`);
        return [...prev, product];
      }
    });
  };

  const isProductInWishlist = (id: string) => wishlist.some((p) => p.id === id);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Category filter
        if (currentCategory !== 'all' && p.category !== currentCategory) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchesTitle = p.title.toLowerCase().includes(query);
          const matchesTagline = p.tagline.toLowerCase().includes(query);
          const matchesDesc = p.description.toLowerCase().includes(query);
          const matchesSku = p.sku.toLowerCase().includes(query);
          const matchesTags = p.tags.some((t) => t.toLowerCase().includes(query));
          if (!matchesTitle && !matchesTagline && !matchesDesc && !matchesSku && !matchesTags) {
            return false;
          }
        }
        // Summer '26 Drop filter
        if (onlyDrop26) {
          const hasDropTag =
            p.tags.some((t) => t.toLowerCase().includes('26') || t.toLowerCase().includes('drop')) ||
            p.dropCollection.toLowerCase().includes('26') ||
            p.title.toLowerCase().includes('26');
          if (!hasDropTag) return false;
        }
        // Under R1,000 threshold filter (ZAR adapted)
        if (onlyUnderThreshold) {
          const threshold = currency === 'ZAR' ? 1000 : 60;
          if (p.priceAmount >= threshold) return false;
        }
        // In stock
        if (onlyInStock && !p.availableForSale) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'price-asc') return a.priceAmount - b.priceAmount;
        if (sortOption === 'price-desc') return b.priceAmount - a.priceAmount;
        if (sortOption === 'title') return a.title.localeCompare(b.title);
        // Featured
        const aScore = (a.badge ? 2 : 1) * 10 + (a.availableForSale ? 5 : 0);
        const bScore = (b.badge ? 2 : 1) * 10 + (b.availableForSale ? 5 : 0);
        return bScore - aScore;
      });
  }, [products, currentCategory, searchQuery, onlyDrop26, onlyUnderThreshold, onlyInStock, sortOption, currency]);

  const featuredProduct = products.length > 0 ? products[0] : null;

  const scrollToCatalog = () => {
    if (route.view !== 'home') {
      navigateTo('/');
      setTimeout(() => {
        catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const cartTotalAmount = shopifyCart?.cost?.totalAmount?.amount
    ? parseFloat(shopifyCart.cost.totalAmount.amount)
    : 0;

  const cartTotalQuantity = shopifyCart?.totalQuantity || 0;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-red-600 selection:text-white">
      {/* Initial load feel - minimal without text */}
      {isInitialLoading && (
        <MerchLoader fullscreen={true} />
      )}

      {/* Shopify Setup / Connection Status Banner */}
      <ShopifySetupBanner
        storeDomain={SHOPIFY_STORE_DOMAIN}
        isConfigured={isConfigured}
        errorMessage={catalogError || undefined}
        onRetry={() => loadLiveProducts(false)}
        isRefreshing={isRefreshingCatalog}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-4 z-50 px-4 py-3 rounded-2xl bg-black text-white text-xs font-mono shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 border border-red-600">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Navigation */}
      <Navbar
        currentCategory={currentCategory}
        onSelectCategory={(cat) => {
          setCurrentCategory(cat);
          if (route.view !== 'home') {
            navigateTo('/');
          } else {
            scrollToCatalog();
          }
        }}
        currency={currency}
        onSelectCurrency={setCurrency}
        cartCount={cartTotalQuantity}
        cartTotalAmount={cartTotalAmount}
        wishlistCount={wishlist.length}
        onOpenCart={() => {
          setIsCartOpen(true);
          loadCart();
        }}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomerPortal={() => setIsCustomerPortalOpen(true)}
        customerAccountUrl={SHOPIFY_CUSTOMER_ACCOUNT_URL}
        onNavigateAccount={(section) => {
          if (section === 'orders') navigateTo('/account/orders');
          else if (section === 'profile') navigateTo('/account/profile');
          else navigateTo('/account');
        }}
        isCustomAccountsEnabled={ENABLE_CUSTOM_CUSTOMER_ACCOUNTS}
        customerSession={customerSession}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (route.view !== 'home') navigateTo('/');
        }}
        isLoading={pageLoading || isRefreshingCatalog}
      />

      {/* ROUTE 1: Dedicated Product Detail Page (/products/{handle}) */}
      {route.view === 'product' && (
        <main className="flex-1 w-full">
          {pageLoading ? (
            <div className="py-24 text-center">
              <MerchLoader fullscreen={false} />
            </div>
          ) : pageNotFound || !activeProductPage ? (
            <div className="py-24 text-center max-w-md mx-auto space-y-4 px-4">
              <span className="px-3 py-1 bg-red-100 text-red-600 font-mono text-xs font-bold rounded-full">HTTP 404</span>
              <h1 className="text-2xl font-black">Piece Not Found</h1>
              <p className="text-xs text-zinc-600 leading-relaxed">
                The product requested is not currently active in the Sanelow catalogue.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Catalogue</span>
              </button>
            </div>
          ) : (
            <ProductPage
              product={activeProductPage}
              currency={currency}
              isWishlisted={isProductInWishlist(activeProductPage.id)}
              onToggleWishlist={handleToggleWishlist}
              onAddToCart={handleAddToCart}
              onBackToCatalogue={() => navigateTo('/')}
              onRetryVariants={() => {
                if (route.handle) {
                  setPageLoading(true);
                  fetchProductByHandle(route.handle).then((res) => {
                    setPageLoading(false);
                    if (res.product) {
                      setActiveProductPage(res.product);
                    }
                  });
                }
              }}
            />
          )}
        </main>
      )}

      {/* ROUTE 2: Dedicated Collection Page (/collections/{handle}) */}
      {route.view === 'collection' && (
        <main className="flex-1 w-full">
          {pageLoading ? (
            <div className="py-24 text-center">
              <MerchLoader fullscreen={false} />
            </div>
          ) : pageNotFound || !activeCollectionPage ? (
            <div className="py-24 text-center max-w-md mx-auto space-y-4 px-4">
              <span className="px-3 py-1 bg-red-100 text-red-600 font-mono text-xs font-bold rounded-full">HTTP 404</span>
              <h1 className="text-2xl font-black">Collection Not Found</h1>
              <p className="text-xs text-zinc-600 leading-relaxed">
                The collection requested does not exist or has been archived.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Catalogue</span>
              </button>
            </div>
          ) : (
            <CollectionPage
              collection={activeCollectionPage}
              currency={currency}
              isWishlisted={isProductInWishlist}
              onToggleWishlist={handleToggleWishlist}
              onQuickView={(p) => navigateTo(`/products/${p.handle}`)}
              onAddToCart={(prod, variant) => handleAddToCart(prod, variant, 1)}
              onBackToHome={() => navigateTo('/')}
            />
          )}
        </main>
      )}

      {/* ROUTE 3: Dedicated Customer Account Dashboard (/account, /account/orders, /account/profile) */}
      {route.view === 'account' && (
        <main className="flex-1 w-full">
          <CustomerDashboard
            initialTab={route.accountSection || 'overview'}
            initialOrderId={route.orderId}
            onNavigateHome={() => navigateTo('/')}
            currency={currency}
          />
        </main>
      )}

      {/* ROUTE 4: Homepage Catalogue */}
      {route.view === 'home' && (
        <>
          {/* Hero Banner */}
          <HeroBanner
            featuredProduct={featuredProduct}
            currency={currency}
            onQuickView={(p) => navigateTo(`/products/${p.handle}`)}
            onScrollToCatalog={scrollToCatalog}
            onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
          />

          {/* Product Catalog Section */}
          <main ref={catalogRef} className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 w-full">
            {/* Catalog Header & Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-red-600 font-black uppercase tracking-wider">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>LIVE SHOPIFY STOREFRONT CATALOGUE</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-black mt-1">
                  {currentCategory === 'all'
                    ? 'Curated Merch Collection'
                    : currentCategory === 'hoodies-fleece'
                    ? 'Heavyweight Hoodies & Fleece'
                    : currentCategory === 'graphic-tees'
                    ? 'Graphic Tees & Tops'
                    : currentCategory === 'outerwear'
                    ? 'Jackets & Outerwear'
                    : currentCategory === 'headwear'
                    ? 'Caps & Headwear'
                    : currentCategory === 'bottoms'
                    ? 'Bottoms & Shorts'
                    : 'Accessories & Bags'}
                </h2>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 font-mono">
                  <span>
                    Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'piece' : 'pieces'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span>
                      {isConfigured
                        ? lastSyncedAt
                          ? `Refreshed ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Live sync active'
                        : 'Setup required'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => loadLiveProducts(false)}
                    disabled={isRefreshingCatalog}
                    className="text-zinc-500 hover:text-black flex items-center gap-1 transition-colors cursor-pointer"
                    title="Refresh Shopify catalogue"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingCatalog ? 'animate-spin text-red-600' : ''}`} />
                    <span className="underline">Sync</span>
                  </button>
                </div>
                {isCatalogueTruncated && (
                  <div className="mt-2.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-mono flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                    <span>Incomplete results notice: Safety ceiling of 1,000 products reached. Catalogue display is limited to the first 1,000 items.</span>
                  </div>
                )}
              </div>

              {/* Filters & Sorting */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setOnlyDrop26(!onlyDrop26)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                    onlyDrop26
                      ? 'bg-red-50 border-red-600 text-red-600 font-black'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:text-black hover:border-black'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Drop Collection</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyUnderThreshold(!onlyUnderThreshold)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    onlyUnderThreshold
                      ? 'bg-red-50 border-red-600 text-red-600 font-black'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:text-black hover:border-black'
                  }`}
                >
                  {currency === 'ZAR' ? 'Under R1,000' : 'Under $60'}
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyInStock(!onlyInStock)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    onlyInStock
                      ? 'bg-red-50 border-red-600 text-red-600 font-black'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:text-black hover:border-black'
                  }`}
                >
                  In Stock Only
                </button>

                {/* Sort Dropdown */}
                <div className="relative">
                  <select
                    id="sort-select-dropdown"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as unknown as typeof sortOption)}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-black focus:outline-none focus:border-red-600 cursor-pointer"
                  >
                    <option value="featured">Sort: Featured</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="title">Alphabetical (A-Z)</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Product Grid or Empty State */}
            {products.length === 0 ? (
              <div className="py-20 text-center space-y-5 max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mx-auto text-red-600">
                  <ShoppingBag className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-black text-black">
                    {!isConfigured
                      ? 'Shopify Storefront Token Required'
                      : 'No Published Products Found'}
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    {!isConfigured
                      ? `Connect to your Shopify store (${SHOPIFY_STORE_DOMAIN}) by setting SHOPIFY_STOREFRONT_ACCESS_TOKEN in your Vercel deployment or environment.`
                      : `Storefront connected to ${SHOPIFY_STORE_DOMAIN}, but no products were returned. Ensure your products are published to the Online Store / Headless sales channel in Shopify Admin.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => loadLiveProducts(false)}
                    disabled={isRefreshingCatalog}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCatalog ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingCatalog ? 'Connecting...' : 'Check Connection'}</span>
                  </button>

                  <a
                    href={`https://${SHOPIFY_STORE_DOMAIN}/admin`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Open Shopify Admin
                  </a>
                </div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-400">
                  <Filter className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-black">
                  No pieces match your active filters
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Try adjusting your category, price range, or search keyword.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentCategory('all');
                    setOnlyDrop26(false);
                    setOnlyUnderThreshold(false);
                    setOnlyInStock(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-8">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    currency={currency}
                    isWishlisted={isProductInWishlist(product.id)}
                    onToggleWishlist={handleToggleWishlist}
                    onQuickView={(p) => navigateTo(`/products/${p.handle}`)}
                    onAddToCart={(prod, variant) => handleAddToCart(prod, variant, 1)}
                  />
                ))}
              </div>
            )}
          </main>

          {/* Brand Craft Section */}
          <BrandStorySection />
        </>
      )}

      {/* Footer */}
      <Footer
        onOpenFaq={() => setIsFaqOpen(true)}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomerPortal={() => setIsCustomerPortalOpen(true)}
        customerAccountUrl={SHOPIFY_CUSTOMER_ACCOUNT_URL}
      />

      {/* Quick View / Full Product Details Modal (available as secondary quick preview) */}
      <ProductModal
        product={selectedProduct}
        currency={currency}
        isWishlisted={selectedProduct ? isProductInWishlist(selectedProduct.id) : false}
        onToggleWishlist={handleToggleWishlist}
        onAddToCart={(prod, variant, qty) => handleAddToCart(prod, variant, qty)}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Shopify Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={shopifyCart}
        isLoading={isCartLoading}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onApplyDiscount={handleApplyDiscount}
        onBrowseProducts={scrollToCatalog}
      />

      {/* Direct Shopify Checkout Redirect Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={shopifyCart}
        currency={currency}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlist={wishlist}
        currency={currency}
        onRemoveFromWishlist={handleToggleWishlist}
        onAddToCart={(prod) => {
          setSelectedProduct(prod);
        }}
        onQuickView={(p) => navigateTo(`/products/${p.handle}`)}
      />

      {/* Shopify Customer Account & Wishlist Modal */}
      <CustomerPortalModal
        isOpen={isCustomerPortalOpen}
        onClose={() => setIsCustomerPortalOpen(false)}
        savedProducts={wishlist}
        currency={currency}
        onAddToCart={(prod) => {
          setSelectedProduct(prod);
        }}
        onRemoveFromWishlist={handleToggleWishlist}
        customerAccountUrl={SHOPIFY_CUSTOMER_ACCOUNT_URL}
      />

      {/* Sizing & FAQ Modal */}
      <FaqModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
      />

      {/* Official Shopify Order Tracking Modal */}
      <TrackOrderModal
        isOpen={isTrackOrderOpen}
        onClose={() => setIsTrackOrderOpen(false)}
        customerAccountUrl={SHOPIFY_CUSTOMER_ACCOUNT_URL}
        onOpenCustomerPortal={() => {
          setIsTrackOrderOpen(false);
          setIsCustomerPortalOpen(true);
        }}
      />
    </div>
  );
}
