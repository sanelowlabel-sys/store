import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Tag, Check, Truck, Lock } from 'lucide-react';
import { CartItem, CurrencyCode } from '../types';
import { formatPrice } from '../data/products';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: CurrencyCode;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onOpenCheckout: (promoCode?: string, discountPercent?: number) => void;
  onBrowseProducts: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  onUpdateQuantity,
  onRemoveItem,
  onOpenCheckout,
  onBrowseProducts,
}) => {
  if (!isOpen) return null;

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPercent: number } | null>(null);

  // Subtotal calculation
  const rawSubtotalUSD = items.reduce((acc, item) => {
    const unitPrice = item.appliedDiscountPercent
      ? item.product.priceUSD * (1 - item.appliedDiscountPercent / 100)
      : item.product.priceUSD;
    return acc + unitPrice * item.quantity;
  }, 0);

  const discountAmountUSD = appliedPromo ? (rawSubtotalUSD * appliedPromo.discountPercent) / 100 : 0;
  const subtotalUSD = rawSubtotalUSD - discountAmountUSD;

  // Free shipping threshold: $45 USD
  const freeShippingThresholdUSD = 45;
  const remainingForFreeShipping = Math.max(0, freeShippingThresholdUSD - rawSubtotalUSD);
  const freeShippingPercent = Math.min(100, (rawSubtotalUSD / freeShippingThresholdUSD) * 100);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    if (code === 'MERCH15' || code === 'WELCOME15') {
      setAppliedPromo({ code, discountPercent: 15 });
      setPromoInput('');
    } else if (code === 'SANELOW10' || code === 'DROP10') {
      setAppliedPromo({ code, discountPercent: 10 });
      setPromoInput('');
    } else if (code === 'FREESHIP') {
      setAppliedPromo({ code, discountPercent: 10 });
      setPromoInput('');
    } else {
      setPromoError('Invalid coupon. Try MERCH15 or SANELOW10');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="cart-drawer-container"
        className="w-full max-w-md h-full bg-white border-l border-zinc-200 text-black flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-black text-black uppercase tracking-wider">
              Merch Bag ({items.reduce((a, b) => a + b.quantity, 0)})
            </h2>
          </div>
          <button
            id="close-cart-drawer-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Progress Meter */}
        <div className="px-5 py-3.5 bg-zinc-50 border-b border-zinc-200">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-zinc-700 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-red-600" />
              {remainingForFreeShipping === 0 ? (
                <strong className="text-red-600 font-bold">Complimentary Tracked Air Freight Unlocked!</strong>
              ) : (
                <>
                  Add <strong className="text-red-600">{formatPrice(remainingForFreeShipping, currency)}</strong> for FREE Shipping
                </>
              )}
            </span>
            <span className="font-bold text-black">{Math.round(freeShippingPercent)}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                remainingForFreeShipping === 0 ? 'bg-red-600' : 'bg-red-500'
              }`}
              style={{ width: `${freeShippingPercent}%` }}
            />
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-black">Your bag is empty</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                  Browse heavyweight French Terry hoodies, vintage wash graphic tees, and streetwear accessories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBrowseProducts();
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Explore Merch Drops
              </button>
            </div>
          ) : (
            items.map((item) => {
              const unitPrice = item.appliedDiscountPercent
                ? item.product.priceUSD * (1 - item.appliedDiscountPercent / 100)
                : item.product.priceUSD;

              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 flex gap-3.5 relative group"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-24 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                    <img
                      src={item.product.images[0]}
                      alt={item.product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-black text-black line-clamp-1">
                          {item.product.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="text-zinc-400 hover:text-red-600 p-0.5 transition-colors cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Merch tags: SKU, Size, Color */}
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-black text-white text-[10px] font-mono font-bold">
                          {item.selectedSize || 'M'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800 text-[10px] font-mono">
                          {item.product.sku}
                        </span>
                        {item.selectedColor && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800 text-[10px] font-mono flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full border border-zinc-400"
                              style={{ backgroundColor: item.selectedColor.hex }}
                            />
                            {item.selectedColor.name}
                          </span>
                        )}
                        {item.appliedDiscountPercent && item.appliedDiscountPercent > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-mono font-bold">
                            Bundle -{item.appliedDiscountPercent}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity + Item Total */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200">
                      <div className="flex items-center rounded-lg bg-white border border-zinc-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          className="px-2 py-0.5 text-xs text-zinc-600 hover:text-black cursor-pointer"
                          disabled={item.quantity <= 1}
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-black">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-zinc-600 hover:text-black cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-xs font-mono font-black text-red-600">
                        {formatPrice(unitPrice * item.quantity, currency)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Checkout & Promo */}
        {items.length > 0 && (
          <div className="p-5 border-t border-zinc-200 bg-white space-y-3">
            {/* Promo Code Input */}
            <form onSubmit={handleApplyPromo} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Discount code (e.g. MERCH15)"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black placeholder-zinc-400 focus:outline-none focus:border-red-600 uppercase font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold font-mono uppercase transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </div>

              {promoError && <p className="text-[11px] text-red-600 font-mono">{promoError}</p>}

              {appliedPromo && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200 text-xs font-mono text-red-700">
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-red-600" />
                    Code {appliedPromo.code} applied (-{appliedPromo.discountPercent}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAppliedPromo(null)}
                    className="text-zinc-500 hover:text-black text-[11px] underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </form>

            {/* Calculations */}
            <div className="space-y-1.5 text-xs font-mono text-zinc-600 pt-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-black font-semibold">{formatPrice(rawSubtotalUSD, currency)}</span>
              </div>
              {appliedPromo && (
                <div className="flex justify-between text-red-600">
                  <span>Coupon Savings</span>
                  <span>-{formatPrice(discountAmountUSD, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>International Delivery</span>
                <span className="text-red-600 font-bold">
                  {remainingForFreeShipping === 0 ? 'COMPLIMENTARY' : 'Calculated at checkout'}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-black pt-2 border-t border-zinc-200">
                <span>Total Estimated</span>
                <span className="text-base font-mono font-black text-red-600">
                  {formatPrice(subtotalUSD, currency)}
                </span>
              </div>
            </div>

            {/* Checkout CTA in red */}
            <button
              id="proceed-to-checkout-btn"
              type="button"
              onClick={() => onOpenCheckout(appliedPromo?.code, appliedPromo?.discountPercent)}
              className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Proceed to Secure Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Trust Seals */}
            <div className="flex items-center justify-center gap-3 pt-1 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1 text-zinc-600">
                <ShieldCheck className="w-3.5 h-3.5 text-red-600" />
                256-Bit SSL Encryption
              </span>
              <span>•</span>
              <span className="text-zinc-600">30-Day Authentic Fit Guarantee</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
