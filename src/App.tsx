import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { WishlistDrawer } from './components/WishlistDrawer';
import { BrandStorySection } from './components/BrandStorySection';
import { Footer } from './components/Footer';
import { FaqModal } from './components/FaqModal';
import { TrackOrderModal } from './components/TrackOrderModal';
import { CustomerPortalModal } from './components/CustomerPortalModal';
import { MerchLoader } from './components/MerchLoader';

import {
  PRODUCTS,
  DEMO_CUSTOMER_USER,
  DEMO_CUSTOMER_ORDERS,
} from './data/products';
import {
  Product,
  Category,
  CurrencyCode,
  CartItem,
  ProductColor,
  MerchSize,
  CustomerUser,
  CustomerOrderRecord,
} from './types';
import { Sparkles, Filter, ChevronDown, Check, Flame, Zap, Package, ShoppingBag, Layers, Scissors } from 'lucide-react';

export default function App() {
  // App initialization loader
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Navigation & filtering state
  const [currentCategory, setCurrentCategory] = useState<Category>('all');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount'>('featured');
  const [onlyDrop26, setOnlyDrop26] = useState(false);
  const [onlyHeavyweight, setOnlyHeavyweight] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyUnder60, setOnlyUnder60] = useState(false);

  // Modals & Drawers state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isTrackOrderOpen, setIsTrackOrderOpen] = useState(false);
  const [selectedTrackOrderId, setSelectedTrackOrderId] = useState<string>('SNLW-8492');
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Customer Account state
  const [currentUser, setCurrentUser] = useState<CustomerUser | null>(() => {
    try {
      const saved = localStorage.getItem('sanelow_user');
      return saved ? JSON.parse(saved) : DEMO_CUSTOMER_USER;
    } catch {
      return DEMO_CUSTOMER_USER;
    }
  });

  const [customerOrders, setCustomerOrders] = useState<CustomerOrderRecord[]>(() => {
    try {
      const saved = localStorage.getItem('sanelow_orders');
      return saved ? JSON.parse(saved) : DEMO_CUSTOMER_ORDERS;
    } catch {
      return DEMO_CUSTOMER_ORDERS;
    }
  });

  // Cart & Wishlist persistence
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('sanelow_merch_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('sanelow_merch_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeCheckoutPromo, setActiveCheckoutPromo] = useState<{ code?: string; discountPercent?: number }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const catalogRef = useRef<HTMLDivElement>(null);

  // Initial loader effect (runs once briefly for smooth feel)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 550);
    return () => clearTimeout(timer);
  }, []);

  // Sync with local storage
  useEffect(() => {
    try {
      localStorage.setItem('sanelow_merch_cart', JSON.stringify(cartItems));
    } catch {
      // ignore
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      localStorage.setItem('sanelow_merch_wishlist', JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('sanelow_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('sanelow_user');
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem('sanelow_orders', JSON.stringify(customerOrders));
    } catch {
      // ignore
    }
  }, [customerOrders]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Cart Actions
  const handleAddToCart = (
    product: Product,
    size?: MerchSize,
    color?: ProductColor,
    quantity = 1,
    appliedDiscountPercent = 0
  ) => {
    const chosenSize = size || (product.sizes.length > 0 ? product.sizes[0] : 'M');
    const compositeId = `${product.id}-${chosenSize}-${color?.name || 'default'}-${appliedDiscountPercent}`;

    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === compositeId);
      if (existing) {
        return prev.map((item) =>
          item.id === compositeId
            ? { ...item, quantity: Math.min(product.stockCount, item.quantity + quantity) }
            : item
        );
      }
      return [
        ...prev,
        {
          id: compositeId,
          product,
          selectedSize: chosenSize,
          selectedColor: color,
          quantity,
          appliedDiscountPercent,
        },
      ];
    });

    showToast(`Added "${product.title}" (${chosenSize}) to your bag`);
  };

  const handleUpdateCartQuantity = (compositeId: string, qty: number) => {
    setCartItems((prev) =>
      prev.map((item) => (item.id === compositeId ? { ...item, quantity: qty } : item))
    );
  };

  const handleRemoveFromCart = (compositeId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== compositeId));
  };

  const handleOrderSuccess = (orderId: string, trackingNumber: string) => {
    // Record new customer order in history
    const newOrder: CustomerOrderRecord = {
      id: orderId,
      date: 'Just Now',
      status: 'Fulfilling',
      trackingNumber,
      carrier: 'DHL Express Global Logistics',
      estimatedDelivery: 'In 3 - 5 business days',
      receiptNumber: `RCPT-${Math.floor(100000 + Math.random() * 900000)}`,
      totalUSD: cartItems.reduce((sum, item) => sum + item.product.priceUSD * item.quantity, 0),
      shippingAddress: {
        fullName: currentUser?.name || 'Valued Customer',
        email: currentUser?.email || 'meandmusicdistributors@gmail.com',
        phone: '+1 (555) 234-8901',
        street: '742 Evergreen Terrace',
        city: 'Springfield',
        provinceOrState: 'OR',
        postalCode: '97477',
        country: 'United States',
        shippingMethod: 'standard_tracked',
        paymentMethod: 'card',
      },
      items: cartItems.map((item) => ({
        product: item.product,
        size: item.selectedSize || 'M',
        color: item.selectedColor?.name || 'Default Color',
        quantity: item.quantity,
        priceUSD: item.product.priceUSD,
      })),
    };

    setCustomerOrders((prev) => [newOrder, ...prev]);
    setCartItems([]);
    setSelectedTrackOrderId(orderId);
    showToast(`Drop order ${orderId} secured! Live tracking code issued.`);
  };

  // Wishlist Actions
  const handleToggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        showToast(`Removed from saved merch`);
        return prev.filter((p) => p.id !== product.id);
      } else {
        showToast(`Saved "${product.title}" to drop wishlist`);
        return [...prev, product];
      }
    });
  };

  // Filtered and Sorted Products
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) => {
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
        const matchesCollection = p.dropCollection?.toLowerCase().includes(query) || false;
        const matchesFeatures = p.features.some((f) => f.toLowerCase().includes(query));
        if (!matchesTitle && !matchesTagline && !matchesDesc && !matchesSku && !matchesCollection && !matchesFeatures) {
          return false;
        }
      }
      // Only Summer '26 Drop
      if (onlyDrop26 && !p.dropCollection?.toLowerCase().includes('26')) {
        return false;
      }
      // Heavyweight (450+ GSM)
      if (onlyHeavyweight) {
        const isHeavy = p.fabricSpecs.some((s) => s.value.includes('450') || s.value.includes('500') || s.value.includes('Heavyweight'));
        if (!isHeavy) return false;
      }
      // In stock
      if (onlyInStock && p.stockCount <= 0) {
        return false;
      }
      // Under $60
      if (onlyUnder60 && p.priceUSD >= 60) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortOption === 'price-asc') return a.priceUSD - b.priceUSD;
      if (sortOption === 'price-desc') return b.priceUSD - a.priceUSD;
      if (sortOption === 'rating') return b.rating - a.rating;
      if (sortOption === 'discount') return b.discountPercent - a.discountPercent;
      // Featured: Limited drop and high ratings first
      const aScore = (a.badge === 'LIMITED DROP' ? 3 : a.badge === 'BESTSELLER' ? 2 : 1) * 10 + a.rating;
      const bScore = (b.badge === 'LIMITED DROP' ? 3 : b.badge === 'BESTSELLER' ? 2 : 1) * 10 + b.rating;
      return bScore - aScore;
    });
  }, [currentCategory, searchQuery, onlyDrop26, onlyHeavyweight, onlyInStock, onlyUnder60, sortOption]);

  const featuredProduct = PRODUCTS[0];

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const isProductInWishlist = (id: string) => wishlist.some((p) => p.id === id);

  // Cart total in USD for Navbar display
  const cartTotalUSD = cartItems.reduce((acc, item) => {
    const unitPrice = item.appliedDiscountPercent
      ? item.product.priceUSD * (1 - item.appliedDiscountPercent / 100)
      : item.product.priceUSD;
    return acc + unitPrice * item.quantity;
  }, 0);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-red-600 selection:text-white">
      {/* Optional brief initial brand loader */}
      {isInitialLoading && (
        <MerchLoader
          message="SANELOW MERCH ARCHIVE"
          submessage="Initializing Summer '26 Inventory & Fabric Specs..."
          fullscreen={true}
        />
      )}

      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-4 z-50 px-4 py-3 rounded-2xl bg-black text-white text-xs font-mono shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 border border-red-600">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Navigation (Pure White Background, Red Accents, No text beside logo) */}
      <Navbar
        currentCategory={currentCategory}
        onSelectCategory={(cat) => {
          setCurrentCategory(cat);
          scrollToCatalog();
        }}
        currency={currency}
        onSelectCurrency={setCurrency}
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        cartTotalUSD={cartTotalUSD}
        wishlistCount={wishlist.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomerPortal={() => setIsCustomerPortalOpen(true)}
        currentUser={currentUser}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Hero Banner (Summer '26 Drop & Apparel Focus) */}
      <HeroBanner
        featuredProduct={featuredProduct}
        currency={currency}
        onQuickView={setSelectedProduct}
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
              <span>CUSTOM MILLED APPAREL & MERCH ARCHIVE</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-black mt-1">
              {currentCategory === 'all'
                ? 'Complete Merch Archive'
                : currentCategory === 'hoodies-fleece'
                ? 'Heavyweight Hoodies & Loopback Fleece'
                : currentCategory === 'graphic-tees'
                ? 'Custom Washed Graphic Tees'
                : currentCategory === 'outerwear'
                ? 'Structured Jackets & Layering Outerwear'
                : currentCategory === 'headwear'
                ? 'Embroidered Snapbacks & Wool Beanies'
                : currentCategory === 'bottoms'
                ? 'Raw-Edge French Terry Sweats & Shorts'
                : 'Merchandise Accessories & Bags'}
            </h2>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Showing {filteredProducts.length} curated apparel pieces with verified fabric GSM & international air tracking
            </p>
          </div>

          {/* Filters & Sorting */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick toggles */}
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
              <span>Summer '26 Drop</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyHeavyweight(!onlyHeavyweight)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyHeavyweight
                  ? 'bg-red-50 border-red-600 text-red-600 font-black'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:text-black hover:border-black'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>450+ GSM Only</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyUnder60(!onlyUnder60)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                onlyUnder60
                  ? 'bg-red-50 border-red-600 text-red-600 font-black'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:text-black hover:border-black'
              }`}
            >
              Under $60
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
              In Stock
            </button>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                id="sort-select-dropdown"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as unknown as typeof sortOption)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-black focus:outline-none focus:border-red-600 cursor-pointer"
              >
                <option value="featured">Sort: Most Popular</option>
                <option value="rating">Top Customer Rated</option>
                <option value="discount">Biggest Savings (%)</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-400">
              <Filter className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-black">
              No merch drops found matching your filter
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
              Try resetting filters or searching for "hoodie", "tee", "acid wash", or "cap" to browse our collection.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCurrentCategory('all');
                setOnlyDrop26(false);
                setOnlyHeavyweight(false);
                setOnlyInStock(false);
                setOnlyUnder60(false);
              }}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Reset All Filters
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
                onQuickView={setSelectedProduct}
                onAddToCart={(prod, size, color) => handleAddToCart(prod, size, color, 1, 0)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Brand Craft & Milling Advantage Section */}
      <BrandStorySection />

      {/* Footer (Pure White, Red Accents, Support email & Customer Portal link) */}
      <Footer
        onOpenFaq={() => setIsFaqOpen(true)}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomerPortal={() => setIsCustomerPortalOpen(true)}
      />

      {/* Quick View / Full Product Details Modal */}
      <ProductModal
        product={selectedProduct}
        currency={currency}
        isWishlisted={selectedProduct ? isProductInWishlist(selectedProduct.id) : false}
        onToggleWishlist={handleToggleWishlist}
        onAddToCart={(prod, size, color, qty, discount) =>
          handleAddToCart(prod, size, color, qty, discount)
        }
        onClose={() => setSelectedProduct(null)}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        currency={currency}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onOpenCheckout={(code, discount) => {
          setActiveCheckoutPromo({ code, discountPercent: discount });
          setIsCheckoutOpen(true);
        }}
        onBrowseProducts={scrollToCatalog}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        currency={currency}
        promoCode={activeCheckoutPromo.code}
        discountPercent={activeCheckoutPromo.discountPercent}
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlist={wishlist}
        currency={currency}
        onRemoveFromWishlist={handleToggleWishlist}
        onAddToCart={(prod) => {
          handleAddToCart(prod, 'L');
          handleToggleWishlist(prod);
        }}
        onQuickView={setSelectedProduct}
      />

      {/* Customer Portal & Account Dashboard Modal */}
      <CustomerPortalModal
        isOpen={isCustomerPortalOpen}
        onClose={() => setIsCustomerPortalOpen(false)}
        currentUser={currentUser}
        onLogin={(user) => {
          setCurrentUser(user);
          showToast(`Welcome back, ${user.name}!`);
        }}
        onLogout={() => {
          setCurrentUser(null);
          showToast('Signed out of account');
        }}
        orders={customerOrders}
        savedProducts={wishlist}
        currency={currency}
        onOpenTrackingModal={(orderId) => {
          setSelectedTrackOrderId(orderId);
          setIsCustomerPortalOpen(false);
          setIsTrackOrderOpen(true);
        }}
        onAddToCart={(prod, size) => handleAddToCart(prod, size)}
        onToggleWishlist={handleToggleWishlist}
      />

      {/* FAQ & Sizing Guide Modal */}
      <FaqModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        onOpenTrackOrder={() => {
          setIsTrackOrderOpen(true);
        }}
      />

      {/* Live Track Order Modal */}
      <TrackOrderModal
        isOpen={isTrackOrderOpen}
        onClose={() => setIsTrackOrderOpen(false)}
        defaultTrackingNumber={selectedTrackOrderId}
      />
    </div>
  );
}
