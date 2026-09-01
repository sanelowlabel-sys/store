import React from 'react';
import { X, Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { Product } from '../types';

interface WishlistModalProps {
  isOpen: boolean;
  wishlistProducts: Product[];
  onClose: () => void;
  onRemoveFromWishlist: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export const WishlistModal: React.FC<WishlistModalProps> = ({
  isOpen,
  wishlistProducts,
  onClose,
  onRemoveFromWishlist,
  onAddToCart
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col">
          
          <div className="p-6 border-b border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500 fill-current" />
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                Saved Wishlist
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                {wishlistProducts.length}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-stone-100 dark:divide-stone-800">
            {wishlistProducts.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-400 flex items-center justify-center mx-auto">
                  <Heart className="w-8 h-8" />
                </div>
                <p className="text-stone-800 dark:text-stone-200 font-semibold text-sm">No saved items yet</p>
                <p className="text-stone-400 text-xs max-w-xs mx-auto">
                  Click the heart icon on any product to save your favorite pieces for later.
                </p>
              </div>
            ) : (
              wishlistProducts.map((product) => (
                <div key={product.id} className="pt-4 first:pt-0 flex gap-4 items-center">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-16 h-16 object-cover rounded-xl bg-stone-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                      {product.name}
                    </h4>
                    <p className="text-[11px] text-stone-400 truncate">{product.category}</p>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">${product.price}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onAddToCart(product);
                        onRemoveFromWishlist(product);
                      }}
                      className="p-2 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:scale-105 transition shadow-sm cursor-pointer"
                      title="Move to Bag"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onRemoveFromWishlist(product)}
                      className="p-2 text-stone-400 hover:text-rose-500 transition"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
