import React, { useState } from 'react';
import { ShoppingBag, Heart, Search, Globe, X, Menu, Truck, User } from 'lucide-react';
import { Category, CustomerSession } from '../types';
import { SUPPORTED_CURRENCIES, formatPrice } from '../data/products';
import { SHOPIFY_CUSTOMER_ACCOUNT_URL, ENABLE_CUSTOM_CUSTOMER_ACCOUNTS } from '../lib/shopify';

interface NavbarProps {
  currentCategory: Category;
  onSelectCategory: (cat: Category) => void;
  currency: string;
  onSelectCurrency: (curr: string) => void;
  cartCount: number;
  cartTotalAmount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenTrackOrder: () => void;
  onOpenCustomerPortal: () => void;
  onNavigateAccount?: (section?: 'overview' | 'orders' | 'profile') => void;
  isCustomAccountsEnabled?: boolean;
  customerSession?: CustomerSession | null;
  customerAccountUrl?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading?: boolean;
  currentView?: string;
  onNavigateGallery?: () => void;
  onNavigateLookbook?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentCategory,
  onSelectCategory,
  currency,
  onSelectCurrency,
  cartCount,
  cartTotalAmount,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenTrackOrder,
  onOpenCustomerPortal,
  onNavigateAccount,
  isCustomAccountsEnabled = ENABLE_CUSTOM_CUSTOMER_ACCOUNTS,
  customerSession = null,
  customerAccountUrl = SHOPIFY_CUSTOMER_ACCOUNT_URL,
  searchQuery,
  onSearchChange,
  isLoading = false,
  currentView = 'home',
  onNavigateGallery,
  onNavigateLookbook,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

  const handleGalleryNavigation = onNavigateGallery || onNavigateLookbook;
  const isCustomAccountsActive = isCustomAccountsEnabled || Boolean(customerSession?.isTester);

  const categories: { key: Category; label: string }[] = [
    { key: 'all', label: 'All Merch' },
    { key: 'hoodies-fleece', label: 'Hoodies & Fleece' },
    { key: 'graphic-tees', label: 'Graphic Tees' },
    { key: 'outerwear', label: 'Outerwear' },
    { key: 'headwear', label: 'Headwear' },
    { key: 'bottoms', label: 'Bottoms & Shorts' },
    { key: 'accessories', label: 'Accessories' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#e2e8f0] bg-white/95 backdrop-blur-md">
      {/* Minimal Navigation Loading Indicator Bar without text */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-100 overflow-hidden z-50">
          <div className="h-full bg-red-600 animate-[shimmer_1s_infinite] w-2/5" />
        </div>
      )}
      {/* Top Notice Bar */}
      <div className="bg-[#0f172a] text-white text-[11px] font-mono py-1.5 px-4 text-center tracking-wider flex items-center justify-center gap-3">
        <span className="flex items-center gap-1.5 text-red-500 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          SUMMER '26 ARCHIVE DROP LIVE
        </span>
        <span className="hidden sm:inline text-slate-400">•</span>
        <span className="hidden sm:inline text-slate-300">
          Official Shopify Storefront • South Africa & Worldwide Delivery
        </span>
      </div>

      {/* Main Bar: CSS Grid with 1fr auto 1fr on collapsed viewports (< xl) guarantees exact center alignment */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-18 sm:h-20 gap-2 sm:gap-4 xl:flex xl:items-center xl:justify-between w-full">
          {/* Col 1 on collapsed viewports (< xl): Left-aligned mobile hamburger menu trigger */}
          <div className="flex items-center justify-start xl:hidden shrink-0 z-10">
            <button
              id="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-[#0f172a] hover:text-red-600 rounded-xl hover:bg-[#f8fafc] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 cursor-pointer"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Col 2 on collapsed (< xl): Mathematically centered brand logo; Left-aligned on desktop (xl+) */}
          <div className="flex items-center justify-center xl:block shrink-0 z-10">
            <a
              href="/"
              id="navbar-brand-logo"
              className="flex items-center cursor-pointer select-none shrink-0 p-1 rounded-xl hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onSelectCategory('all');
                }
              }}
              aria-label="Sanelow Store Home"
            >
              <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-white border border-[#e2e8f0] shadow-xs group shrink-0">
                <img
                  src="/sanelow-logo.jpg"
                  alt="Sanelow Store Logo"
                  width="48"
                  height="48"
                  className="w-full h-full object-contain p-0.5 group-hover:scale-105 transition-transform motion-reduce:transition-none"
                />
              </div>
            </a>
          </div>

          {/* Desktop Categories & Gallery - Visible on xl+ where full navigation fits without collision */}
          <nav className="hidden xl:flex items-center gap-1 xl:gap-1.5" aria-label="Merchandise Categories">
            {categories.map((cat) => (
              <a
                key={cat.key}
                id={`nav-cat-${cat.key}`}
                href={cat.key === 'all' ? '/' : `/collections/${cat.key}`}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onSelectCategory(cat.key);
                  }
                }}
                className={`px-2 2xl:px-2.5 py-1.5 rounded-xl text-xs font-semibold tracking-normal transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                  currentCategory === cat.key && currentView !== 'gallery' && currentView !== 'lookbook'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc]'
                }`}
              >
                <span>{cat.label}</span>
              </a>
            ))}

            {/* Gallery link in desktop navigation (renamed from Lookbook) */}
            <a
              id="nav-link-gallery"
              href="/gallery"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  handleGalleryNavigation?.();
                }
              }}
              className={`px-2 2xl:px-2.5 py-1.5 rounded-xl text-xs font-semibold tracking-normal transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                currentView === 'gallery' || currentView === 'lookbook'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc]'
              }`}
            >
              <span>Gallery</span>
            </a>
          </nav>

          {/* Col 3 on collapsed (< xl): Action Buttons aligned right; xl:ml-auto on desktop */}
          <div className="flex items-center justify-end gap-1 sm:gap-2.5 shrink-0 z-10 xl:ml-auto">
            {/* My orders link - preserved on 2xl+, accessible via mobile menu on other viewports */}
            <a
              id="nav-my-orders-link"
              href={isCustomAccountsActive ? '/account/orders' : (customerAccountUrl || '#my-orders')}
              onClick={(e) => {
                if (isCustomAccountsActive && onNavigateAccount && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onNavigateAccount('orders');
                } else if (!customerAccountUrl && !isCustomAccountsActive) {
                  e.preventDefault();
                  onOpenTrackOrder();
                }
              }}
              target={!isCustomAccountsActive && customerAccountUrl ? '_blank' : undefined}
              rel={!isCustomAccountsActive && customerAccountUrl ? 'noopener noreferrer' : undefined}
              className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs font-semibold text-[#0f172a] hover:border-red-600 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              aria-label="My orders"
            >
              <Truck className="w-3.5 h-3.5 text-red-600" />
              <span>My orders</span>
            </a>

            {/* Currency Selector - visible on sm+, accessible via mobile menu on narrow screens */}
            <div className="relative hidden sm:block">
              <button
                id="currency-dropdown-toggle"
                onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono font-semibold text-[#0f172a] hover:border-red-600 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                aria-label="Change currency"
              >
                <Globe className="w-3.5 h-3.5 text-[#64748b]" />
                <span>{currency}</span>
              </button>

              {isCurrencyDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-[#e2e8f0] shadow-lg py-1 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] font-mono uppercase text-[#64748b] border-b border-[#e2e8f0]">
                    Storefront Market
                  </div>
                  {Object.keys(SUPPORTED_CURRENCIES).map((cCode) => (
                    <button
                      key={cCode}
                      id={`curr-select-${cCode}`}
                      onClick={() => {
                        onSelectCurrency(cCode);
                        setIsCurrencyDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        currency === cCode
                          ? 'bg-red-50 text-red-600 font-bold'
                          : 'text-[#0f172a] hover:bg-[#f8fafc]'
                      }`}
                    >
                      <span>{SUPPORTED_CURRENCIES[cCode].label}</span>
                      <span className="font-mono text-[#64748b] font-medium">
                        {SUPPORTED_CURRENCIES[cCode].symbol}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search trigger */}
            <button
              id="search-toggle-btn"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="p-2 text-[#64748b] hover:text-[#0f172a] rounded-xl hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              aria-label="Search store"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Sign in / Create account Link - collapsed on < sm, preserved in mobile menu */}
            <a
              id="nav-customer-account-link"
              href={isCustomAccountsActive ? '/account' : (customerAccountUrl || '#sign-in')}
              onClick={(e) => {
                if (isCustomAccountsActive && onNavigateAccount && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onNavigateAccount('overview');
                } else if (!customerAccountUrl && !isCustomAccountsActive) {
                  e.preventDefault();
                  onOpenCustomerPortal();
                }
              }}
              target={!isCustomAccountsActive && customerAccountUrl ? '_blank' : undefined}
              rel={!isCustomAccountsActive && customerAccountUrl ? 'noopener noreferrer' : undefined}
              className="hidden sm:flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl border border-[#e2e8f0] hover:border-red-600 hover:bg-[#f8fafc] text-[#0f172a] transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              aria-label="Sign in / Create account"
            >
              <User className="w-4 h-4 text-[#64748b]" />
              <span className="hidden md:inline 2xl:hidden text-xs font-semibold">
                {customerSession?.authenticated && customerSession.customer?.name
                  ? `Hi, ${customerSession.customer.name.split(' ')[0]}`
                  : 'Account'}
              </span>
              <span className="hidden 2xl:inline text-xs font-semibold">
                {customerSession?.authenticated && customerSession.customer?.name
                  ? `Hi, ${customerSession.customer.name.split(' ')[0]}`
                  : 'Sign in / Create account'}
              </span>
            </a>

            {/* Wishlist Button - visible on >= 380px, accessible via mobile menu on narrow viewports */}
            <button
              id="wishlist-drawer-btn"
              onClick={onOpenWishlist}
              className="relative hidden min-[380px]:flex p-2 text-[#64748b] hover:text-[#0f172a] rounded-xl hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
              aria-label="View Wishlist"
            >
              <Heart className="w-4 h-4" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Cart Button */}
            <button
              id="cart-drawer-btn"
              onClick={onOpenCart}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold tracking-wide transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">
                {cartTotalAmount > 0 ? formatPrice(cartTotalAmount, currency) : 'BAG'}
              </span>
              <span className="w-5 h-5 rounded-md bg-white text-[#0f172a] text-[11px] font-mono font-bold flex items-center justify-center">
                {cartCount}
              </span>
            </button>
          </div>
        </div>

        {/* Expandable Search Input Bar */}
        {isSearchOpen && (
          <div className="pb-4 pt-1 animate-in fade-in slide-in-from-top-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search live catalogue by title, tag, or style..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#0f172a] placeholder-[#64748b] font-mono focus:outline-none focus:border-red-600 focus-visible:ring-2 focus-visible:ring-red-600"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="xl:hidden pb-4 pt-2 border-t border-[#e2e8f0] flex flex-col gap-1">
            <div className="px-3 py-1 text-[10px] font-mono uppercase font-bold text-[#64748b]">
              Collections
            </div>
            {categories.map((cat) => (
              <a
                key={cat.key}
                href={cat.key === 'all' ? '/' : `/collections/${cat.key}`}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onSelectCategory(cat.key);
                    setIsMobileMenuOpen(false);
                  }
                }}
                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold ${
                  currentCategory === cat.key && currentView !== 'gallery' && currentView !== 'lookbook' ? 'bg-red-50 text-red-600 font-bold' : 'text-[#0f172a] hover:bg-[#f8fafc]'
                }`}
              >
                {cat.label}
              </a>
            ))}

            {/* Gallery Section in Mobile Menu */}
            <div className="mt-2 pt-2 border-t border-[#e2e8f0] flex flex-col gap-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase font-bold text-[#64748b]">
                Editorial & Archive
              </div>
              <a
                id="mobile-nav-gallery"
                href="/gallery"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    handleGalleryNavigation?.();
                    setIsMobileMenuOpen(false);
                  }
                }}
                className={`text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between ${
                  currentView === 'gallery' || currentView === 'lookbook' ? 'bg-red-50 text-red-600 font-bold' : 'text-[#0f172a] hover:bg-[#f8fafc]'
                }`}
              >
                <span>Gallery — Styling & Archive</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold uppercase">
                  Curated
                </span>
              </a>
            </div>

            {/* Mobile Wishlist Access */}
            <div className="mt-2 pt-2 border-t border-[#e2e8f0] flex flex-col gap-1">
              <button
                type="button"
                id="mobile-nav-wishlist"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenWishlist();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-600" />
                  <span>Saved Wishlist</span>
                </span>
                {wishlistCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-mono text-[10px] font-bold">
                    {wishlistCount}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Currency Selection */}
            <div className="mt-2 pt-2 border-t border-[#e2e8f0] flex flex-col gap-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase font-bold text-[#64748b] flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-[#64748b]" />
                <span>Storefront Currency ({currency})</span>
              </div>
              <div className="grid grid-cols-2 gap-1 px-3 py-1">
                {Object.keys(SUPPORTED_CURRENCIES).map((cCode) => (
                  <button
                    key={cCode}
                    type="button"
                    onClick={() => {
                      onSelectCurrency(cCode);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono text-left flex items-center justify-between border cursor-pointer ${
                      currency === cCode
                        ? 'bg-red-50 border-red-600 text-red-600 font-bold'
                        : 'bg-white border-[#e2e8f0] text-[#0f172a] hover:bg-[#f8fafc]'
                    }`}
                  >
                    <span>{cCode}</span>
                    <span className="text-[#64748b]">{SUPPORTED_CURRENCIES[cCode].symbol}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-[#e2e8f0] flex flex-col gap-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase font-bold text-[#64748b]">
                Customer Account & Orders
              </div>
              <a
                id="mobile-nav-sign-in"
                href={isCustomAccountsActive ? '/account' : (customerAccountUrl || '#sign-in')}
                onClick={(e) => {
                  if (isCustomAccountsActive && onNavigateAccount && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onNavigateAccount('overview');
                  } else if (!customerAccountUrl && !isCustomAccountsActive) {
                    e.preventDefault();
                    onOpenCustomerPortal();
                  }
                  setIsMobileMenuOpen(false);
                }}
                target={!isCustomAccountsActive && customerAccountUrl ? '_blank' : undefined}
                rel={!isCustomAccountsActive && customerAccountUrl ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer"
                aria-label="Sign in / Create account"
              >
                <User className="w-4 h-4 text-red-600" />
                <span>
                  {customerSession?.authenticated && customerSession.customer?.name
                    ? `Account (${customerSession.customer.name.split(' ')[0]})`
                    : 'Sign in / Create account'}
                </span>
              </a>
              <a
                id="mobile-nav-my-orders"
                href={isCustomAccountsActive ? '/account/orders' : (customerAccountUrl || '#my-orders')}
                onClick={(e) => {
                  if (isCustomAccountsActive && onNavigateAccount && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onNavigateAccount('orders');
                  } else if (!customerAccountUrl && !isCustomAccountsActive) {
                    e.preventDefault();
                    onOpenTrackOrder();
                  }
                  setIsMobileMenuOpen(false);
                }}
                target={!isCustomAccountsActive && customerAccountUrl ? '_blank' : undefined}
                rel={!isCustomAccountsActive && customerAccountUrl ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer"
                aria-label="My orders"
              >
                <Truck className="w-4 h-4 text-red-600" />
                <span>My orders</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
