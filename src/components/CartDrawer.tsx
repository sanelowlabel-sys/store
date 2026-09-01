import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  ArrowRight, 
  Tag, 
  Truck, 
  Sparkles,
  Check
} from 'lucide-react';
import { CartItem } from '../types';
import { PROMO_CODES } from '../data/products';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  appliedPromo: string | null;
  onClose: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onApplyPromo: (code: string) => void;
  onRemovePromo: () => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  items,
  appliedPromo,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onApplyPromo,
  onRemovePromo,
  onProceedToCheckout
}) => {
  if (!isOpen) return null;

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');

  const subtotal = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  // Discount calculation
  let discount = 0;
  if (appliedPromo && PROMO_CODES[appliedPromo]) {
    const promo = PROMO_CODES[appliedPromo];
    if (promo.type === 'percentage') {
      discount = (subtotal * promo.value) / 100;
    } else {
      discount = promo.value;
    }
  }

  const freeShippingThreshold = 100;
  const amountUntilFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  const shipping = subtotal >= freeShippingThreshold || appliedPromo === 'FREESHIP' ? 0 : 15;
  const tax = (subtotal - discount) * 0.08;
  const grandTotal = Math.max(0, subtotal - discount + shipping + tax);

  const handleApplyPromoCode = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    if (PROMO_CODES[code]) {
      const promo = PROMO_CODES[code];
      if (subtotal < promo.minSpend) {
        setPromoError(`Minimum spend of $${promo.minSpend} required for code ${code}.`);
      } else {
        onApplyPromo(code);
        setPromoInput('');
      }
    } else {
      setPromoError('Invalid promo code. Try WELCOME10 or SANELOW20');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-6 border-b border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-stone-900 dark:text-stone-100" />
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                Your Shopping Bag
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Meter */}
          <div className="px-6 py-3 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="flex items-center gap-1 text-stone-700 dark:text-stone-300">
                <Truck className="w-3.5 h-3.5 text-red-500" />
                {amountUntilFreeShipping === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">You earned Free Express Shipping!</span>
                ) : (
                  <span>Add <strong className="text-stone-900 dark:text-white">${amountUntilFreeShipping.toFixed(2)}</strong> more for Free Shipping</span>
                )}
              </span>
              <span className="text-stone-400 text-[10px]">{Math.round(freeShippingProgress)}%</span>
            </div>
            <div className="w-full bg-stone-200 dark:bg-stone-700 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-red-600 h-full transition-all duration-300"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 divide-y divide-stone-100 dark:divide-stone-800/80">
            {items.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-400 flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <p className="text-stone-800 dark:text-stone-200 font-semibold text-sm">Your bag is empty</p>
                <p className="text-stone-400 text-xs max-w-xs mx-auto">
                  Explore our curated collection of professional electric guitars, analog synthesizers, studio monitors, and audio gear.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 px-6 py-2.5 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold hover:bg-stone-800 transition"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="pt-4 first:pt-0 flex gap-4">
                  <img
                    src={item.product.images[0]}
                    alt={item.product.name}
                    className="w-20 h-20 object-cover rounded-xl bg-stone-100 dark:bg-stone-800 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between gap-2">
                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="text-stone-400 hover:text-rose-500 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Options info */}
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 space-x-2">
                        {item.selectedColor && (
                          <span>Color: <strong>{item.selectedColor.name}</strong></span>
                        )}
                        {item.selectedSize && (
                          <span>Size: <strong>{item.selectedSize}</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-stone-200 dark:border-stone-700 rounded-lg bg-stone-50 dark:bg-stone-800 text-xs">
                        <button
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          className="p-1 px-2 text-stone-500 hover:text-stone-900 dark:hover:text-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold text-stone-900 dark:text-stone-100">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, 1)}
                          className="p-1 px-2 text-stone-500 hover:text-stone-900 dark:hover:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        ${item.product.price * item.quantity}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Checkout Summary */}
          {items.length > 0 && (
            <div className="p-6 bg-stone-50 dark:bg-stone-800/60 border-t border-stone-200 dark:border-stone-800 space-y-4">
              
              {/* Promo code form */}
              <div className="space-y-1">
                {appliedPromo ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Code <strong>{appliedPromo}</strong> applied</span>
                    </div>
                    <button
                      onClick={onRemovePromo}
                      className="text-xs underline text-emerald-700 dark:text-emerald-400 hover:text-emerald-900"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyPromoCode} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Promo Code (e.g. WELCOME10)"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 uppercase focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold hover:bg-stone-800 transition"
                    >
                      Apply
                    </button>
                  </form>
                )}
                {promoError && (
                  <p className="text-[11px] text-rose-500 font-medium px-1">{promoError}</p>
                )}
              </div>

              {/* Subtotal & Totals breakdown */}
              <div className="space-y-1.5 text-xs text-stone-600 dark:text-stone-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">${subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-semibold">-${discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Tax (8%)</span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-stone-900 dark:text-stone-100 pt-2 border-t border-stone-200 dark:border-stone-700">
                  <span>Total</span>
                  <span>${grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                onClick={onProceedToCheckout}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white font-semibold text-sm transition shadow-lg cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
