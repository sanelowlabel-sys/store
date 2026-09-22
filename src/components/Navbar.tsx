import React, { useState } from 'react';
import { ShoppingBag, Heart, Search, Globe, X, Menu, Truck, User, Sparkles } from 'lucide-react';
import { CurrencyCode, Category, CustomerUser } from '../types';
import { SUPPORTED_CURRENCIES, formatPrice } from '../data/products';

interface NavbarProps {
  currentCategory: Category;
  onSelectCategory: (cat: Category) => void;
  currency: CurrencyCode;
  onSelectCurrency: (curr: CurrencyCode) => void;
  cartCount: number;
  cartTotalUSD: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenTrackOrder: () => void;
  onOpenCustomerPortal: () => void;
  currentUser: CustomerUser | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentCategory,
  onSelectCategory,
  currency,
  onSelectCurrency,
  cartCount,
  cartTotalUSD,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenTrackOrder,
  onOpenCustomerPortal,
  currentUser,
  searchQuery,
  onSearchChange,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

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
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md">
      {/* Top Notice Bar */}
      <div className="bg-black text-white text-[11px] font-mono py-1.5 px-4 text-center tracking-wider flex items-center justify-center gap-3">
        <span className="flex items-center gap-1.5 text-red-500 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          SUMMER '26 ARCHIVE DROP LIVE
        </span>
        <span className="hidden sm:inline text-zinc-400">•</span>
        <span className="hidden sm:inline text-zinc-300">
          Complimentary Global Air Freight on Orders Over $45
        </span>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 sm:h-20 gap-4">
          {/* Mobile menu trigger */}
          <button
            id="mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-zinc-700 hover:text-black rounded-xl hover:bg-zinc-100 transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Brand Logo Only - Clean standalone logo without adjacent text */}
          <button
            type="button"
            id="navbar-brand-logo"
            className="flex items-center cursor-pointer select-none shrink-0 p-1 rounded-xl hover:opacity-90 transition-opacity"
            onClick={() => onSelectCategory('all')}
            aria-label="Sanelow Store Home"
          >
            <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-white border border-zinc-200 shadow-sm group shrink-0">
              <img
                src="/sanelow-logo.jpg"
                alt="Sanelow Store Logo"
                className="w-full h-full object-contain p-0.5 group-hover:scale-105 transition-transform"
              />
            </div>
          </button>

          {/* Desktop Categories */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                id={`nav-cat-${cat.key}`}
                onClick={() => onSelectCategory(cat.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all cursor-pointer ${
                  currentCategory === cat.key
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-black hover:bg-zinc-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </nav>

          {/* Action Buttons: Track Order, Customer Portal, Currency, Search, Wishlist, Cart */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Track Order Button */}
            <button
              id="track-order-btn"
              onClick={onOpenTrackOrder}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100/90 border border-zinc-200 text-xs font-bold text-zinc-700 hover:text-black hover:border-zinc-300 transition-colors cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-red-600" />
              <span>Track Order</span>
            </button>

            {/* Currency Selector */}
            <div className="relative">
              <button
                id="currency-dropdown-toggle"
                onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-100/90 border border-zinc-200 text-xs font-mono font-bold text-zinc-800 hover:border-zinc-300 transition-colors cursor-pointer"
                aria-label="Change currency"
              >
                <Globe className="w-3.5 h-3.5 text-zinc-500" />
                <span>{currency}</span>
              </button>

              {isCurrencyDropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-xl bg-white border border-zinc-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-100">
                    Select Currency
                  </div>
                  {(Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[]).map((cCode) => (
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
                          : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <span>{SUPPORTED_CURRENCIES[cCode].label}</span>
                      <span className="font-mono text-zinc-400 font-medium">
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
              className="p-2 text-zinc-700 hover:text-black rounded-xl hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="Search store"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Customer Account Button */}
            <button
              id="customer-account-btn"
              onClick={onOpenCustomerPortal}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl border border-zinc-200 hover:border-black hover:bg-zinc-50 text-zinc-800 transition-all cursor-pointer"
              aria-label="Member Account"
            >
              {currentUser ? (
                <>
                  <div className="w-5 h-5 rounded-full overflow-hidden border border-red-600 shrink-0">
                    <img
                      src={
                        currentUser.avatarUrl ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'
                      }
                      alt={currentUser.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="hidden xl:inline text-xs font-bold text-black max-w-[90px] truncate">
                    {currentUser.name.split(' ')[0]}
                  </span>
                </>
              ) : (
                <>
                  <User className="w-4 h-4 text-zinc-600" />
                  <span className="hidden sm:inline text-xs font-bold">Sign In</span>
                </>
              )}
            </button>

            {/* Wishlist Button */}
            <button
              id="wishlist-drawer-btn"
              onClick={onOpenWishlist}
              className="relative p-2 text-zinc-700 hover:text-black rounded-xl hover:bg-zinc-100 transition-colors cursor-pointer"
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
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold tracking-wide transition-all shadow-md cursor-pointer"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">
                {cartTotalUSD > 0 ? formatPrice(cartTotalUSD, currency) : 'BAG'}
              </span>
              <span className="w-5 h-5 rounded-full bg-white text-black text-[11px] font-mono font-black flex items-center justify-center">
                {cartCount}
              </span>
            </button>
          </div>
        </div>

        {/* Live Search Bar Overlay if open */}
        {isSearchOpen && (
          <div className="py-3 border-t border-zinc-200 animate-in fade-in">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                id="header-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search heavyweight hoodies (450 GSM), acid wash tees, varsity jackets, caps, cargos..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-red-600 focus:bg-white transition-all font-sans"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-zinc-200 space-y-2 animate-in slide-in-from-top-4 bg-white">
            <div className="px-2 pb-2 text-[11px] font-mono uppercase text-zinc-500 font-bold">
              Apparel Categories
            </div>
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => {
                  onSelectCategory(cat.key);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between ${
                  currentCategory === cat.key
                    ? 'bg-red-50 text-red-600 font-black'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <span>{cat.label}</span>
                {currentCategory === cat.key && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                )}
              </button>
            ))}
            <div className="pt-2 border-t border-zinc-200 space-y-1">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenCustomerPortal();
                }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2 rounded-xl"
              >
                <User className="w-4 h-4 text-red-600" />
                <span>{currentUser ? 'Member Account Dashboard' : 'Sign In / Register'}</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenTrackOrder();
                }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2 rounded-xl"
              >
                <Truck className="w-4 h-4 text-red-600" />
                <span>Track My Merch Shipment</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
