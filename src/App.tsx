import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { ProductGrid } from './components/ProductGrid';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderConfirmationModal } from './components/OrderConfirmationModal';
import { WishlistModal } from './components/WishlistModal';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { OrderLookupModal } from './components/OrderLookupModal';
import { ToastContainer } from './components/ToastContainer';
import { Footer } from './components/Footer';

import { 
  Product, 
  ProductCategory, 
  CartItem, 
  FilterState, 
  Order, 
  Review, 
  ToastNotification,
  ColorOption 
} from './types';
import { INITIAL_PRODUCTS, SAMPLE_REVIEWS, PROMO_CODES } from './data/products';

export function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Data State
  const [products] = useState<Product[]>(INITIAL_PRODUCTS);
  const [reviews, setReviews] = useState<Review[]>(SAMPLE_REVIEWS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>(['prod-1', 'prod-4']);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Modals & Drawers
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isOrderLookupOpen, setIsOrderLookupOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // Filters State
  const [filters, setFilters] = useState<FilterState>({
    category: 'All',
    searchQuery: '',
    minPrice: 0,
    maxPrice: 500,
    sortBy: 'featured',
    inStockOnly: false,
    selectedTag: null
  });

  const categories: ProductCategory[] = [
    'All', 
    'Hoodies & Sweats', 
    'T-Shirts & Tees', 
    'Hats & Headwear', 
    'Vinyl & Physical', 
    'Accessories & Bags', 
    'Outerwear'
  ];

  // Toast Trigger Helper
  const addToast = (title: string, message: string, type: 'success' | 'info' | 'error' = 'success', image?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, title, message, type, image }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleDismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Cart Handlers
  const handleAddToCart = (product: Product, quantity = 1, selectedSize?: string, selectedColor?: ColorOption) => {
    const cartItemId = `${product.id}-${selectedSize || 'default'}-${selectedColor?.name || 'default'}`;

    setCart(prev => {
      const existing = prev.find(item => item.id === cartItemId);
      if (existing) {
        return prev.map(item =>
          item.id === cartItemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          id: cartItemId,
          product,
          quantity,
          selectedSize: selectedSize || product.variants?.sizes?.[0],
          selectedColor: selectedColor || product.variants?.colors?.[0]
        }
      ];
    });

    addToast('Added to Shopping Bag', `${quantity}x ${product.name}`, 'success', product.images[0]);
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveCartItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Wishlist Handlers
  const handleToggleWishlist = (product: Product) => {
    setWishlistIds(prev => {
      const isSaved = prev.includes(product.id);
      if (isSaved) {
        addToast('Removed from Wishlist', product.name, 'info');
        return prev.filter(id => id !== product.id);
      } else {
        addToast('Saved to Wishlist', product.name, 'success', product.images[0]);
        return [...prev, product.id];
      }
    });
  };

  // Review Handler
  const handleAddReview = (newReview: Omit<Review, 'id' | 'date' | 'verified'>) => {
    const reviewObj: Review = {
      ...newReview,
      id: `rev-${Date.now()}`,
      date: 'Just now',
      verified: true
    };
    setReviews(prev => [reviewObj, ...prev]);
    addToast('Review Submitted', 'Thank you for your valuable product feedback!', 'success');
  };

  // Order Completion
  const handleCompleteOrder = (order: Order) => {
    setOrders(prev => [order, ...prev]);
    setCart([]);
    setAppliedPromo(null);
    setIsCheckoutOpen(false);
    setCompletedOrder(order);
    addToast('Order Successfully Placed!', `Confirmation ID: ${order.id}`, 'success');
  };

  // Filter Computation
  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        // Category filter
        if (filters.category !== 'All' && product.category !== filters.category) return false;
        // Search query filter
        if (filters.searchQuery.trim() !== '') {
          const q = filters.searchQuery.toLowerCase();
          const matchesName = product.name.toLowerCase().includes(q);
          const matchesCategory = product.category.toLowerCase().includes(q);
          const matchesDesc = product.description.toLowerCase().includes(q);
          const matchesTag = product.tags.some(t => t.toLowerCase().includes(q));
          if (!matchesName && !matchesCategory && !matchesDesc && !matchesTag) return false;
        }
        // In Stock filter
        if (filters.inStockOnly && (!product.inStock || product.stockQuantity === 0)) return false;
        // Tag filter
        if (filters.selectedTag && !product.tags.includes(filters.selectedTag)) return false;
        // Price Range filter
        if (product.price < filters.minPrice || product.price > filters.maxPrice) return false;

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === 'price-low') return a.price - b.price;
        if (filters.sortBy === 'price-high') return b.price - a.price;
        if (filters.sortBy === 'rating') return b.rating - a.rating;
        if (filters.sortBy === 'newest') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
      });
  }, [products, filters]);

  const wishlistProducts = useMemo(() => {
    return products.filter(p => wishlistIds.includes(p.id));
  }, [products, wishlistIds]);

  const cartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const cartProductIds = useMemo(() => {
    return cart.map(item => item.product.id);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  }, [cart]);

  let discount = 0;
  if (appliedPromo && PROMO_CODES[appliedPromo]) {
    const promo = PROMO_CODES[appliedPromo];
    discount = promo.type === 'percentage' ? (subtotal * promo.value) / 100 : promo.value;
  }

  const shipping = subtotal >= 100 || appliedPromo === 'FREESHIP' ? 0 : 15;
  const tax = (subtotal - discount) * 0.08;
  const grandTotal = Math.max(0, subtotal - discount + shipping + tax);

  return (
    <div className="min-h-screen bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors duration-200 flex flex-col">
      
      {/* Navigation Header */}
      <Header
        categories={categories}
        selectedCategory={filters.category}
        onSelectCategory={(cat) => setFilters(prev => ({ ...prev, category: cat }))}
        searchQuery={filters.searchQuery}
        onSearchChange={(q) => setFilters(prev => ({ ...prev, searchQuery: q }))}
        cartCount={cartCount}
        wishlistCount={wishlistIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        onOpenOrderLookup={() => setIsOrderLookupOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        products={products}
        onSelectProduct={(product) => setQuickViewProduct(product)}
      />

      {/* Main Container */}
      <main className="flex-1">
        
        {/* Hero Section Banner */}
        {filters.category === 'All' && filters.searchQuery === '' && (
          <HeroBanner
            onShopNow={() => {
              const el = document.getElementById('catalog-grid');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
          />
        )}

        {/* Product Catalog Grid */}
        <div id="catalog-grid">
          <ProductGrid
            products={filteredProducts}
            wishlistIds={wishlistIds}
            cartProductIds={cartProductIds}
            filters={filters}
            onUpdateFilters={setFilters}
            onResetFilters={() => setFilters({
              category: 'All',
              searchQuery: '',
              minPrice: 0,
              maxPrice: 500,
              sortBy: 'featured',
              inStockOnly: false,
              selectedTag: null
            })}
            onToggleWishlist={handleToggleWishlist}
            onQuickView={(p) => setQuickViewProduct(p)}
            onAddToCart={(p) => handleAddToCart(p)}
          />
        </div>

      </main>

      {/* Footer */}
      <Footer />

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={quickViewProduct}
        reviews={reviews}
        isWishlisted={quickViewProduct ? wishlistIds.includes(quickViewProduct.id) : false}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={handleAddToCart}
        onToggleWishlist={handleToggleWishlist}
        onAddReview={handleAddReview}
      />

      <CartDrawer
        isOpen={isCartOpen}
        items={cart}
        appliedPromo={appliedPromo}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onApplyPromo={(code) => {
          setAppliedPromo(code);
          addToast('Promo Code Applied', `Discount applied with ${code}`, 'success');
        }}
        onRemovePromo={() => setAppliedPromo(null)}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        items={cart}
        subtotal={subtotal}
        discount={discount}
        shipping={shipping}
        tax={tax}
        grandTotal={grandTotal}
        appliedPromo={appliedPromo}
        onClose={() => setIsCheckoutOpen(false)}
        onCompleteOrder={handleCompleteOrder}
      />

      <OrderConfirmationModal
        order={completedOrder}
        onClose={() => setCompletedOrder(null)}
        onContinueShopping={() => {
          setCompletedOrder(null);
          setFilters(p => ({ ...p, category: 'All', searchQuery: '' }));
        }}
      />

      <WishlistModal
        isOpen={isWishlistOpen}
        wishlistProducts={wishlistProducts}
        onClose={() => setIsWishlistOpen(false)}
        onRemoveFromWishlist={handleToggleWishlist}
        onAddToCart={(p) => handleAddToCart(p)}
      />

      <AiAssistantDrawer
        isOpen={isAiAssistantOpen}
        products={products}
        onClose={() => setIsAiAssistantOpen(false)}
        onQuickView={(p) => {
          setIsAiAssistantOpen(false);
          setQuickViewProduct(p);
        }}
        onAddToCart={(p) => handleAddToCart(p)}
      />

      <OrderLookupModal
        isOpen={isOrderLookupOpen}
        recentOrders={orders}
        onClose={() => setIsOrderLookupOpen(false)}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={handleDismissToast}
      />

    </div>
  );
}

export default App;
