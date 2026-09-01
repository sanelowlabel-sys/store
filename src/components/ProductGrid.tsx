import React from 'react';
import { SlidersHorizontal, ArrowUpDown, X, RotateCcw } from 'lucide-react';
import { Product, FilterState } from '../types';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  wishlistIds: string[];
  cartProductIds: string[];
  filters: FilterState;
  onUpdateFilters: (updater: (prev: FilterState) => FilterState) => void;
  onResetFilters: () => void;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  wishlistIds,
  cartProductIds,
  filters,
  onUpdateFilters,
  onResetFilters,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
}) => {
  // Collect all unique tags
  const allTags = Array.from(
    new Set(products.flatMap(p => p.tags))
  ).slice(0, 8);

  const hasActiveFilters = 
    filters.category !== 'All' ||
    filters.searchQuery !== '' ||
    filters.sortBy !== 'featured' ||
    filters.inStockOnly ||
    filters.selectedTag !== null ||
    filters.maxPrice < 500;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h2 className="text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <span>{filters.category === 'All' ? 'Curated Collection' : filters.category}</span>
            <span className="text-sm font-sans font-normal text-stone-400">
              ({products.length} {products.length === 1 ? 'item' : 'items'})
            </span>
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Crafted for endurance, precision aesthetics, and daily delight.
          </p>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Stock Filter Toggle */}
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 cursor-pointer hover:bg-stone-200 dark:hover:bg-stone-700 transition">
            <input
              type="checkbox"
              checked={filters.inStockOnly}
              onChange={(e) => onUpdateFilters(prev => ({ ...prev, inStockOnly: e.target.checked }))}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <span>In Stock Only</span>
          </label>

          {/* Sort Dropdown */}
          <div className="relative inline-flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-400 absolute left-3 pointer-events-none" />
            <select
              value={filters.sortBy}
              onChange={(e) => onUpdateFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
              className="pl-8 pr-8 py-1.5 rounded-full bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 border border-transparent focus:border-stone-400 focus:outline-none cursor-pointer appearance-none"
            >
              <option value="featured">Featured First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">New Arrivals</option>
            </select>
          </div>

        </div>
      </div>

      {/* Filter Tag Pills */}
      <div className="flex flex-wrap items-center gap-2 py-4">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider mr-1">
          Popular Tags:
        </span>
        {allTags.map(tag => {
          const isSelected = filters.selectedTag === tag;
          return (
            <button
              key={tag}
              onClick={() => onUpdateFilters(prev => ({
                ...prev,
                selectedTag: isSelected ? null : tag
              }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                isSelected
                  ? 'bg-red-600 text-white font-semibold'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              #{tag}
            </button>
          );
        })}

        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 ml-auto text-xs font-medium text-rose-500 hover:text-rose-600 transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Active Filter Pills Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {filters.category !== 'All' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold">
              Category: {filters.category}
              <X className="w-3 h-3 cursor-pointer" onClick={() => onUpdateFilters(p => ({ ...p, category: 'All' }))} />
            </span>
          )}
          {filters.searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold">
              Search: "{filters.searchQuery}"
              <X className="w-3 h-3 cursor-pointer" onClick={() => onUpdateFilters(p => ({ ...p, searchQuery: '' }))} />
            </span>
          )}
          {filters.selectedTag && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-600 text-white text-xs font-semibold">
              Tag: #{filters.selectedTag}
              <X className="w-3 h-3 cursor-pointer" onClick={() => onUpdateFilters(p => ({ ...p, selectedTag: null }))} />
            </span>
          )}
          {filters.inStockOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-800 text-stone-200 text-xs font-semibold">
              In Stock Only
              <X className="w-3 h-3 cursor-pointer" onClick={() => onUpdateFilters(p => ({ ...p, inStockOnly: false }))} />
            </span>
          )}
        </div>
      )}

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="text-center py-16 bg-stone-50 dark:bg-stone-900/50 rounded-3xl border border-dashed border-stone-300 dark:border-stone-800 my-6">
          <p className="text-stone-500 dark:text-stone-400 text-sm font-medium mb-4">
            No products match your current search and filter combination.
          </p>
          <button
            onClick={onResetFilters}
            className="px-5 py-2.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold hover:bg-stone-800 dark:hover:bg-white transition"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 my-6">
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlistIds.includes(product.id)}
              isInCart={cartProductIds.includes(product.id)}
              onToggleWishlist={onToggleWishlist}
              onQuickView={onQuickView}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}

    </section>
  );
};
