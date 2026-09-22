import React from 'react';
import { X, Heart, Trash2, ShoppingBag } from 'lucide-react';
import { Product, CurrencyCode } from '../types';
import { formatPrice } from '../data/products';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlist: Product[];
  currency: CurrencyCode;
  onRemoveFromWishlist: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  wishlist,
  currency,
  onRemoveFromWishlist,
  onAddToCart,
  onQuickView,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div
        id="wishlist-drawer-container"
        className="relative z-10 w-full max-w-md bg-white border-l border-zinc-200 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 text-black"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Heart className="w-5 h-5 text-red-600 fill-current" />
            <h2 className="text-base font-black text-black uppercase tracking-wider">
              Saved Merch ({wishlist.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {wishlist.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400">
                <Heart className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-black">
                  No saved merch
                </h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                  Tap the heart icon on any drop or collection piece to bookmark it for future drops.
                </p>
              </div>
            </div>
          ) : (
            wishlist.map((prod) => (
              <div
                key={prod.id}
                className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 flex gap-3.5 relative group"
              >
                {/* Thumbnail */}
                <div
                  className="w-20 h-24 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200 cursor-pointer"
                  onClick={() => {
                    onClose();
                    onQuickView(prod);
                  }}
                >
                  <img src={prod.images[0]} alt={prod.title} className="w-full h-full object-cover" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        onClick={() => {
                          onClose();
                          onQuickView(prod);
                        }}
                        className="text-xs font-black text-black line-clamp-1 hover:text-red-600 cursor-pointer"
                      >
                        {prod.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => onRemoveFromWishlist(prod)}
                        className="text-zinc-400 hover:text-red-600 p-1 cursor-pointer"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      SKU: {prod.sku} • {prod.dropCollection}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200">
                    <span className="text-xs font-mono font-black text-red-600">
                      {formatPrice(prod.priceUSD, currency)}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        onAddToCart(prod);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>Select Size & Move</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
