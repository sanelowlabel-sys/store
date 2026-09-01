import React, { useState, useRef, useEffect } from 'react';
import { 
  ShoppingBag, 
  Heart, 
  Search, 
  Sparkles, 
  Moon, 
  Sun, 
  PackageCheck, 
  X, 
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { Product, ProductCategory } from '../types';

interface HeaderProps {
  categories: ProductCategory[];
  selectedCategory: ProductCategory;
  onSelectCategory: (category: ProductCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenAiAssistant: () => void;
  onOpenOrderLookup: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

export const Header: React.FC<HeaderProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  cartCount,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenAiAssistant,
  onOpenOrderLookup,
  isDarkMode,
  onToggleDarkMode,
  products,
  onSelectProduct
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Filter products for quick search dropdown
  const searchResults = searchQuery.trim().length > 0
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 5)
    : [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-stone-900/90 border-b border-stone-200 dark:border-stone-800 transition-colors duration-200">
      {/* Top Banner Notice */}
      <div className="bg-stone-900 dark:bg-stone-950 text-stone-100 dark:text-stone-300 text-xs py-1.5 px-4 text-center tracking-wide font-medium flex items-center justify-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Complimentary Express Worldwide Shipping on Orders Over $100 &bull; 30-Day Effortless Returns</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onSelectCategory('All')} 
              className="text-left group focus:outline-none"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-xl font-sans shadow-md shadow-red-500/20">
                  S
                </span>
                <div>
                  <h1 className="text-lg sm:text-xl font-black tracking-wider text-stone-900 dark:text-stone-100 font-sans uppercase">
                    SANELOW
                  </h1>
                  <p className="text-[10px] tracking-widest text-red-600 dark:text-red-400 font-sans uppercase -mt-1 font-bold">
                    LABEL MERCHANDISE
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Center Search Input with Live Dropdown */}
          <div ref={searchRef} className="hidden md:block flex-1 max-w-md relative">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Search products, categories, styles..."
                className="w-full pl-10 pr-9 py-2 rounded-full text-sm bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 border border-transparent focus:border-stone-400 dark:focus:border-stone-600 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Search Autocomplete Popup */}
            {isSearchFocused && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-stone-800 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2 border-b border-stone-100 dark:border-stone-700 text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider px-3">
                  Matching Products ({searchResults.length})
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-700/50">
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        onSelectProduct(product);
                        setIsSearchFocused(false);
                      }}
                      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition text-left group"
                    >
                      <img 
                        src={product.images[0]} 
                        alt={product.name} 
                        className="w-10 h-10 object-cover rounded-md flex-shrink-0 bg-stone-100" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate group-hover:text-red-600 dark:group-hover:text-red-400">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {product.category} &bull; ${product.price}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-500 dark:group-hover:text-stone-300 transition" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* AI Assistant Button */}
            <button
              onClick={onOpenAiAssistant}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 dark:bg-red-400/10 text-red-700 dark:text-red-300 border border-red-500/20 text-xs font-semibold hover:bg-red-500/20 transition cursor-pointer"
              title="Ask Sanelow AI Music Concierge"
            >
              <Sparkles className="w-3.5 h-3.5 text-red-600 dark:text-red-400 animate-pulse" />
              <span>Music Concierge</span>
            </button>

            {/* Order Tracking */}
            <button
              onClick={onOpenOrderLookup}
              className="p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition relative"
              title="Track Order"
            >
              <PackageCheck className="w-5 h-5" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={onToggleDarkMode}
              className="p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition"
              title="Toggle Dark/Light Mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5 text-red-400" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Wishlist Button */}
            <button
              onClick={onOpenWishlist}
              className="p-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition relative"
              title="Saved Wishlist"
            >
              <Heart className="w-5 h-5" />
              {wishlistCount > 0 && (
                <span className="absolute top-1 right-1 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Shopping Cart Drawer Button */}
            <button
              onClick={onOpenCart}
              className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 px-3.5 py-2 rounded-full font-medium text-xs sm:text-sm transition shadow-sm cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden xs:inline">Bag</span>
              <span className="bg-red-600 text-white font-bold px-1.5 py-0.5 rounded-full text-[11px] leading-none min-w-[18px] text-center">
                {cartCount}
              </span>
            </button>
          </div>

        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 no-scrollbar border-t border-stone-100 dark:border-stone-800/80">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
