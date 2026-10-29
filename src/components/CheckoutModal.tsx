import React, { useEffect, useState } from 'react';
import { X, Lock, ExternalLink, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { ShopifyCart } from '../types';
import { formatPrice, isEmbeddedPreview } from '../lib/shopify';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: ShopifyCart | null;
  currency?: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  currency = 'USD',
}) => {
  // All hooks must be called unconditionally at top of component
  const [redirectCount, setRedirectCount] = useState(2);
  const [hasRedirected, setHasRedirected] = useState(false);
  const embedded = isEmbeddedPreview();

  useEffect(() => {
    if (!isOpen || !cart?.checkoutUrl) {
      setRedirectCount(2);
      setHasRedirected(false);
      return;
    }

    // In embedded preview (iframe), do not navigate current frame (prevents "[store].myshopify.com refused to connect")
    if (embedded) {
      return;
    }

    // Countdown and automatic redirect for standalone storefront
    const interval = setInterval(() => {
      setRedirectCount((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!hasRedirected && cart.checkoutUrl) {
            setHasRedirected(true);
            window.location.href = cart.checkoutUrl;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, cart?.checkoutUrl, hasRedirected, embedded]);

  // Safe early return AFTER all hooks have executed
  if (!isOpen) return null;

  const totalAmount = cart?.cost?.totalAmount?.amount
    ? parseFloat(cart.cost.totalAmount.amount)
    : 0;
  const cartCurrency = cart?.cost?.totalAmount?.currencyCode || currency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="checkout-redirect-dialog"
        className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white border border-[#e2e8f0] text-[#0f172a] p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-200 font-sans"
      >
        <div className="flex justify-between items-center pb-2 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-600 uppercase">
            <Lock className="w-3.5 h-3.5" />
            <span>Shopify Secure Checkout</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {cart?.checkoutUrl ? (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600 shadow-xs">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-heading font-extrabold text-[#0f172a] tracking-tight">
                {embedded ? 'Ready for Shopify Checkout' : 'Transferring to Shopify Checkout'}
              </h3>
              <p className="text-xs text-[#64748b] leading-relaxed max-w-sm mx-auto">
                {embedded ? (
                  <>
                    Preview environment detected. Click the button below to complete your order safely in a new browser tab.
                  </>
                ) : (
                  <>
                    You will be redirected in <strong className="text-red-600 font-mono">{redirectCount}s</strong> to complete your order securely on Shopify. Taxes, shipping options, and payment methods are calculated directly by Shopify.
                  </>
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono flex items-center justify-between shadow-xs">
              <span className="text-[#64748b]">Total in Bag:</span>
              <span className="text-sm font-bold text-red-600">
                {formatPrice(totalAmount, cartCurrency)}
              </span>
            </div>

            <a
              id="checkout-modal-action-link"
              href={cart.checkoutUrl}
              target={embedded ? '_blank' : undefined}
              rel={embedded ? 'noopener noreferrer' : undefined}
              className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <span>{embedded ? 'Open secure checkout in a new tab' : 'Continue to Shopify Checkout Now'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-heading font-extrabold text-[#0f172a]">Checkout Unavailable</h3>
              <p className="text-xs text-[#64748b] mt-1 max-w-xs mx-auto">
                Unable to generate a Shopify checkout URL. Please verify your Shopify Storefront API token and ensure your products have active variants.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold uppercase transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
            >
              Back to Store
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-center gap-2 text-[11px] font-mono text-[#64748b]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>PCI-DSS Level 1 Hosted Checkout by Shopify</span>
        </div>
      </div>
    </div>
  );
};
