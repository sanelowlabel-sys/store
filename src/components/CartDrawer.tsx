import React, { useState } from 'react';
import {
  X,
  Trash2,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Tag,
  Check,
  Truck,
  Lock,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ShopifyCart } from '../types';
import { formatPrice } from '../lib/shopify';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: ShopifyCart | null;
  isLoading: boolean;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveItem: (lineId: string) => void;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; message?: string }>;
  onBrowseProducts: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  isLoading,
  onUpdateQuantity,
  onRemoveItem,
  onApplyDiscount,
  onBrowseProducts,
}) => {
  if (!isOpen) return null;

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const lines = cart?.lines || [];
  const totalQuantity = cart?.totalQuantity || 0;
  const currencyCode = cart?.cost?.totalAmount?.currencyCode || 'ZAR';

  const subtotalAmount = cart?.cost?.subtotalAmount?.amount
    ? parseFloat(cart.cost.subtotalAmount.amount)
    : 0;

  const totalAmount = cart?.cost?.totalAmount?.amount
    ? parseFloat(cart.cost.totalAmount.amount)
    : subtotalAmount;

  const discountCodes = cart?.discountCodes || [];
  const applicableCodes = discountCodes.filter((d) => d.applicable);

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    setIsApplyingPromo(true);
    const result = await onApplyDiscount(code);
    setIsApplyingPromo(false);

    if (result.success) {
      setPromoInput('');
    } else {
      setPromoError(result.message || 'Discount code not applicable or expired in Shopify.');
    }
  };

  const handleCheckoutRedirect = () => {
    if (!cart?.checkoutUrl) return;
    setIsRedirecting(true);
    window.location.href = cart.checkoutUrl;
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
              Merch Bag ({totalQuantity})
            </h2>
            {isLoading && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />}
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

        {/* Real Shopify Order Context Notice */}
        <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-mono text-zinc-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-zinc-700">
            <Truck className="w-3.5 h-3.5 text-red-600" />
            <span>Official Shopify Storefront Cart</span>
          </span>
          <span className="text-[11px] font-bold text-red-600 uppercase">
            {currencyCode} Context
          </span>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-black">Your bag is empty</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                  Browse our live collection of custom-milled apparel and exclusive streetwear drops.
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
            lines.map((line) => {
              const merchandise = line.merchandise;
              const product = merchandise.product;
              const unitPrice = parseFloat(merchandise.price.amount);
              const lineTotal = parseFloat(line.cost.totalAmount.amount);
              const imageUrl =
                merchandise.image?.url ||
                'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80';

              return (
                <div
                  key={line.id}
                  className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 flex gap-3.5 relative group"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-24 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                    <img
                      src={imageUrl}
                      alt={merchandise.title || product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-black text-black line-clamp-1">
                          {product.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(line.id)}
                          className="text-zinc-400 hover:text-red-600 p-0.5 transition-colors cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Selected Options Pills */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {merchandise.selectedOptions.map((opt) => (
                          <span
                            key={opt.name}
                            className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800 text-[10px] font-mono font-medium"
                          >
                            {opt.name}: <strong>{opt.value}</strong>
                          </span>
                        ))}
                        {merchandise.sku && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 text-[10px] font-mono">
                            {merchandise.sku}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity + Real Shopify Line Total */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200">
                      <div className="flex items-center rounded-lg bg-white border border-zinc-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(line.id, Math.max(0, line.quantity - 1))}
                          className="px-2 py-0.5 text-xs text-zinc-600 hover:text-black cursor-pointer disabled:opacity-40"
                          disabled={isLoading}
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-black">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-zinc-600 hover:text-black cursor-pointer disabled:opacity-40"
                          disabled={isLoading}
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-black text-red-600">
                          {formatPrice(lineTotal, currencyCode)}
                        </div>
                        {line.quantity > 1 && (
                          <div className="text-[10px] font-mono text-zinc-400">
                            {formatPrice(unitPrice, currencyCode)} each
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Checkout & Promo */}
        {lines.length > 0 && (
          <div className="p-5 border-t border-zinc-200 bg-white space-y-3">
            {/* Promo Code Input (Validated by Shopify) */}
            <form onSubmit={handleApplyPromo} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Shopify discount code"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black placeholder-zinc-400 focus:outline-none focus:border-red-600 uppercase font-mono"
                    disabled={isApplyingPromo}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isApplyingPromo || !promoInput.trim()}
                  className="px-3 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold font-mono uppercase transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  {isApplyingPromo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Apply</span>}
                </button>
              </div>

              {promoError && (
                <p className="text-[11px] text-red-600 font-mono flex items-center gap-1 pt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{promoError}</span>
                </p>
              )}

              {applicableCodes.map((d) => (
                <div
                  key={d.code}
                  className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800"
                >
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Shopify Code <strong>{d.code}</strong> Applied
                  </span>
                </div>
              ))}
            </form>

            {/* Calculations from Shopify Cart */}
            <div className="space-y-1.5 text-xs font-mono text-zinc-600 pt-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-black font-semibold">
                  {formatPrice(subtotalAmount, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Shipping & Taxes</span>
                <span className="italic">Calculated at Shopify checkout</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-black pt-2 border-t border-zinc-200">
                <span>Estimated Total</span>
                <span className="text-base font-mono font-black text-red-600">
                  {formatPrice(totalAmount, currencyCode)}
                </span>
              </div>
            </div>

            {/* Direct Redirect to Shopify Checkout */}
            <button
              id="proceed-to-checkout-btn"
              type="button"
              onClick={handleCheckoutRedirect}
              disabled={isRedirecting || !cart?.checkoutUrl}
              className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Shopify Checkout...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Proceed to Secure Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Trust Seals */}
            <div className="flex items-center justify-center gap-3 pt-1 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1 text-zinc-600">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Shopify PCI-Compliant Checkout
              </span>
              <span>•</span>
              <span className="text-zinc-600">South Africa Delivery</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
