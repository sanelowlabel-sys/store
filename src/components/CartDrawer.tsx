import React, { useState, useEffect } from 'react';
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
import {
  formatPrice,
  isEmbeddedPreview,
  getShopifyCart,
  getOrCreateShopifyCart,
} from '../lib/shopify';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: ShopifyCart | null;
  isLoading: boolean;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemoveItem: (lineId: string) => void;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; message?: string }>;
  onBrowseProducts: () => void;
  onRevalidateCart?: () => Promise<ShopifyCart | null>;
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
  onRevalidateCart,
}) => {
  if (!isOpen) return null;

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const [verifiedCheckoutUrl, setVerifiedCheckoutUrl] = useState<string | null>(null);

  // Invalidate any prepared checkout URL if cart content changes
  useEffect(() => {
    setVerifiedCheckoutUrl(null);
    setRevalidationError(null);
  }, [cart?.id, cart?.totalQuantity, cart?.lines?.length]);

  const lines = cart?.lines || [];
  const totalQuantity = cart?.totalQuantity || 0;
  const currencyCode = cart?.cost?.totalAmount?.currencyCode || 'USD';

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
    setVerifiedCheckoutUrl(null);
    setRevalidationError(null);
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

  const handleItemQuantityChange = (lineId: string, qty: number) => {
    setVerifiedCheckoutUrl(null);
    setRevalidationError(null);
    onUpdateQuantity(lineId, qty);
  };

  const handleItemRemove = (lineId: string) => {
    setVerifiedCheckoutUrl(null);
    setRevalidationError(null);
    onRemoveItem(lineId);
  };

  const handleProceedToCheckout = async () => {
    if (!cart?.checkoutUrl) return;
    setIsRevalidating(true);
    setRevalidationError(null);

    try {
      // 1. Preserve cart revalidation with Shopify before navigating or presenting link
      let freshCart: ShopifyCart | null = null;
      if (onRevalidateCart) {
        freshCart = await onRevalidateCart();
      } else if (cart.id) {
        freshCart = await getShopifyCart(cart.id);
      } else {
        freshCart = await getOrCreateShopifyCart();
      }

      const activeCart = freshCart || cart;
      const targetCheckoutUrl = activeCart?.checkoutUrl;

      if (!targetCheckoutUrl) {
        setRevalidationError('Unable to verify Shopify checkout URL. Please try again.');
        setIsRevalidating(false);
        return;
      }

      // 2. Embedded preview vs standalone storefront handling
      if (isEmbeddedPreview()) {
        // Embedded preview (iframe):
        // Shopify checkout prohibits iframe embedding (X-Frame-Options: DENY).
        // Provide user-clickable link to open checkout in a new tab.
        setVerifiedCheckoutUrl(targetCheckoutUrl);
        setIsRevalidating(false);
      } else {
        // Normal standalone storefront:
        // Preserve standard top-level checkout navigation.
        window.location.href = targetCheckoutUrl;
      }
    } catch {
      if (isEmbeddedPreview()) {
        setVerifiedCheckoutUrl(cart.checkoutUrl);
      } else {
        window.location.href = cart.checkoutUrl;
      }
      setIsRevalidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-hidden">
      <div
        id="cart-drawer-container"
        className="w-full max-w-full sm:max-w-md h-full max-h-screen bg-white border-l border-[#e2e8f0] text-[#0f172a] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 font-sans min-h-0"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-heading font-extrabold text-[#0f172a] uppercase tracking-wider">
              Merch Bag ({totalQuantity})
            </h2>
            {isLoading && <Loader2 className="w-3.5 h-3.5 text-[#64748b] animate-spin" />}
          </div>
          <button
            id="close-cart-drawer-btn"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 touch-manipulation"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real Shopify Order Context Notice */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs font-mono text-[#64748b] flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5 text-[#0f172a]">
            <Truck className="w-3.5 h-3.5 text-red-600" />
            <span>Official Shopify Storefront Cart</span>
          </span>
          <span className="text-[11px] font-bold text-red-600 uppercase">
            {currencyCode} Context
          </span>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#64748b] shadow-xs">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-heading font-extrabold text-[#0f172a]">Your bag is empty</h3>
                <p className="text-xs text-[#64748b] mt-1 max-w-xs leading-relaxed">
                  Browse our live collection of custom-milled apparel and exclusive streetwear drops.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBrowseProducts();
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
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
                  className="p-3 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] hover:border-red-600 transition-colors flex gap-3.5 relative group shadow-xs"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-24 rounded-xl overflow-hidden bg-white shrink-0 border border-[#e2e8f0]">
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
                        <h4 className="text-xs font-heading font-bold text-[#0f172a] line-clamp-1">
                          {product.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => handleItemRemove(line.id)}
                          className="text-[#64748b] hover:text-red-600 p-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
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
                            className="px-1.5 py-0.5 rounded bg-white border border-[#e2e8f0] text-[#0f172a] text-[10px] font-mono font-medium shadow-xs"
                          >
                            {opt.name}: <strong>{opt.value}</strong>
                          </span>
                        ))}
                        {merchandise.sku && (
                          <span className="px-1.5 py-0.5 rounded bg-white border border-[#e2e8f0] text-[#64748b] text-[10px] font-mono truncate max-w-full">
                            {merchandise.sku}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity + Real Shopify Line Total */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e2e8f0]">
                      <div className="flex items-center rounded-lg bg-white border border-[#e2e8f0] overflow-hidden shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(line.id, Math.max(0, line.quantity - 1))}
                          className="px-2 py-0.5 text-xs text-[#64748b] hover:text-[#0f172a] cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          disabled={isLoading}
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-[#0f172a]">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleItemQuantityChange(line.id, line.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-[#64748b] hover:text-[#0f172a] cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          disabled={isLoading}
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-red-600">
                          {formatPrice(lineTotal, currencyCode)}
                        </div>
                        {line.quantity > 1 && (
                          <div className="text-[10px] font-mono text-[#64748b]">
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
          <div className="p-4 sm:p-5 border-t border-[#e2e8f0] bg-white space-y-3 shrink-0 overflow-y-auto max-h-[50vh] sm:max-h-none">
            {/* Promo Code Input (Validated by Shopify) */}
            <form onSubmit={handleApplyPromo} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748b]" />
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Shopify discount code"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#0f172a] placeholder-[#64748b] focus:outline-none focus:border-red-600 uppercase font-mono shadow-xs focus-visible:ring-2 focus-visible:ring-red-600"
                    disabled={isApplyingPromo}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isApplyingPromo || !promoInput.trim()}
                  className="px-3 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold font-mono uppercase transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
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
            <div className="space-y-1.5 text-xs font-mono text-[#64748b] pt-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-[#0f172a] font-semibold">
                  {formatPrice(subtotalAmount, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-[#64748b]">
                <span>Shipping & Taxes</span>
                <span className="italic">Calculated at Shopify checkout</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#0f172a] pt-2 border-t border-[#e2e8f0]">
                <span>Estimated Total</span>
                <span className="text-base font-mono font-bold text-red-600">
                  {formatPrice(totalAmount, currencyCode)}
                </span>
              </div>
            </div>

            {/* Direct Redirect or Embedded Preview Link to Shopify Checkout */}
            {verifiedCheckoutUrl ? (
              <div className="space-y-2">
                <a
                  id="open-secure-checkout-btn"
                  href={verifiedCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation text-center"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Open secure checkout in a new tab</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </a>
                <div className="flex items-center justify-between px-1 text-[11px] text-[#64748b]">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> Bag revalidated with Shopify
                  </span>
                  <button
                    type="button"
                    onClick={() => setVerifiedCheckoutUrl(null)}
                    className="text-[#64748b] hover:text-[#0f172a] underline cursor-pointer"
                  >
                    Re-check bag
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="proceed-to-checkout-btn"
                type="button"
                onClick={handleProceedToCheckout}
                disabled={isRevalidating || !cart?.checkoutUrl}
                className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation"
              >
                {isRevalidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Bag with Shopify...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Proceed to Secure Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {revalidationError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{revalidationError}</span>
              </div>
            )}

            {/* Trust Seals */}
            <div className="flex items-center justify-center gap-3 pt-1 text-[11px] font-mono text-[#64748b]">
              <span className="flex items-center gap-1 text-[#64748b]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Shopify PCI-Compliant Checkout
              </span>
              <span>•</span>
              <span className="text-[#64748b]">South Africa Delivery</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
