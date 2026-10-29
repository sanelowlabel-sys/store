import React from 'react';
import { X, Heart, Trash2, ShoppingBag, Info } from 'lucide-react';
import { Product } from '../types';
import { formatPrice } from '../lib/shopify';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlist: Product[];
  currency?: string;
  onRemoveFromWishlist: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  wishlist,
  currency = 'USD',
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
        className="relative z-10 w-full max-w-md bg-white border-l border-[#e2e8f0] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 text-[#0f172a] font-sans"
      >
        {/* Header */}
        <div className="p-5 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Heart className="w-5 h-5 text-red-600 fill-current" />
            <h2 className="text-base font-heading font-extrabold text-[#0f172a] uppercase tracking-wider">
              Saved Merch ({wishlist.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Local device storage indicator */}
        <div className="px-5 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-mono text-[#64748b] flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
          <span>Saved locally on this device in your browser.</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {wishlist.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b] shadow-xs">
                <Heart className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-heading font-extrabold text-[#0f172a]">
                  No saved merch
                </h3>
                <p className="text-xs text-[#64748b] mt-1 max-w-xs leading-relaxed">
                  Tap the heart icon on any drop or collection piece to bookmark it on this device.
                </p>
              </div>
            </div>
          ) : (
            wishlist.map((prod) => (
              <div
                key={prod.id}
                className="p-3.5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-red-600 transition-colors flex gap-3.5 relative group shadow-xs"
              >
                {/* Thumbnail */}
                <div
                  className="w-20 h-24 rounded-xl overflow-hidden bg-white shrink-0 border border-[#e2e8f0] cursor-pointer"
                  onClick={() => {
                    onClose();
                    onQuickView(prod);
                  }}
                >
                  <img
                    src={prod.images[0]}
                    alt={prod.title}
                    className="w-full h-full object-cover"
                  />
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
                        className="text-xs font-heading font-bold text-[#0f172a] line-clamp-1 hover:text-red-600 cursor-pointer"
                      >
                        {prod.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => onRemoveFromWishlist(prod)}
                        className="text-[#64748b] hover:text-red-600 p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] text-[#64748b] font-mono mt-0.5 line-clamp-1">
                      {prod.dropCollection}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e2e8f0]">
                    <span className="text-xs font-mono font-bold text-red-600">
                      {formatPrice(prod.priceAmount, prod.currencyCode || currency)}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        onAddToCart(prod);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>View & Add</span>
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
