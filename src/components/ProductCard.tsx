import React from 'react';
import { Heart, Star, Eye, ShoppingBag, Check } from 'lucide-react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  isInCart: boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  isInCart,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
}) => {
  const discountPercent = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="group relative bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full">
      
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-stone-100 dark:bg-stone-800 cursor-pointer" onClick={() => onQuickView(product)}>
        <img
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Badges Overlay */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.isBestSeller && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white shadow-sm">
              Best Seller
            </span>
          )}
          {product.isNew && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 shadow-sm">
              New Arrival
            </span>
          )}
          {discountPercent > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white shadow-sm">
              -{discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Wishlist Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product);
          }}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all duration-200 shadow-md z-10 cursor-pointer ${
            isWishlisted
              ? 'bg-rose-500 text-white'
              : 'bg-white/80 dark:bg-stone-900/80 text-stone-700 dark:text-stone-200 hover:scale-110'
          }`}
          title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>

        {/* Quick View Button Hover Layer */}
        <div className="absolute inset-0 bg-stone-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-xs font-semibold shadow-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition transform hover:scale-105"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Quick View</span>
          </button>
        </div>
      </div>

      {/* Content Info Section */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between">
        <div>
          {/* Category & Rating Row */}
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-stone-400 dark:text-stone-500">
              {product.category}
            </span>
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-red-500 fill-red-500" />
              <span className="font-bold text-stone-800 dark:text-stone-200">{product.rating}</span>
              <span className="text-stone-400">({product.reviewCount})</span>
            </div>
          </div>

          {/* Title */}
          <h3 
            onClick={() => onQuickView(product)}
            className="text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer line-clamp-1 mb-1"
          >
            {product.name}
          </h3>

          {/* Tagline / Subtitle */}
          <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 mb-3">
            {product.tagline}
          </p>
        </div>

        {/* Footer Price & Add to Cart Row */}
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2 mt-auto">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-stone-900 dark:text-stone-100">
                ${product.price}
              </span>
              {product.originalPrice && (
                <span className="text-xs text-stone-400 line-through">
                  ${product.originalPrice}
                </span>
              )}
            </div>
            {product.stockQuantity <= 10 && (
              <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                Only {product.stockQuantity} left
              </span>
            )}
          </div>

          <button
            onClick={() => onAddToCart(product)}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer ${
              isInCart
                ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                : 'bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white'
            }`}
          >
            {isInCart ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>In Bag</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
