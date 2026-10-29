import React from 'react';
import {
  X,
  Truck,
  Mail,
  ExternalLink,
  ShieldCheck,
  Package,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { SHOPIFY_CUSTOMER_ACCOUNT_URL } from '../lib/shopify';

interface TrackOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerAccountUrl?: string;
  onOpenCustomerPortal?: () => void;
}

export const TrackOrderModal: React.FC<TrackOrderModalProps> = ({
  isOpen,
  onClose,
  customerAccountUrl = SHOPIFY_CUSTOMER_ACCOUNT_URL,
  onOpenCustomerPortal,
}) => {
  if (!isOpen) return null;

  const isConfigured = Boolean(customerAccountUrl && customerAccountUrl.trim().length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="track-order-dialog"
        className="relative w-full max-w-lg rounded-2xl sm:rounded-3xl bg-white border border-[#e2e8f0] text-[#0f172a] p-6 sm:p-8 shadow-2xl space-y-6 my-auto font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 id="track-order-title" className="text-base font-heading font-extrabold text-[#0f172a] uppercase tracking-wider">
                Order Tracking & History
              </h3>
              <p className="text-xs text-[#64748b] font-mono">
                Official Shopify Fulfillment Tracking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Method 1: Email Confirmation Order Status Link */}
        <div className="p-4 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2.5 text-xs text-[#64748b] shadow-xs">
          <div className="font-bold text-[#0f172a] flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-red-600 shrink-0" />
            <span>Method 1: Your Order Confirmation Email (Fastest)</span>
          </div>
          <p className="leading-relaxed">
            Every order completed through Shopify checkout generates an instant confirmation email with a private, unique <strong>Order Status</strong> link.
          </p>
          <div className="p-3 rounded-xl bg-white border border-[#e2e8f0] space-y-1.5 text-[11px] font-mono text-[#64748b] shadow-xs">
            <div className="flex items-center gap-2 text-[#0f172a] font-bold">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <span>How your tracking updates:</span>
            </div>
            <div>1. Open your email from Sanelow Music / Shopify.</div>
            <div>2. Click the <strong>&ldquo;View your order&rdquo;</strong> button.</div>
            <div>3. As soon as the carrier registers dispatch, live courier tracking numbers and waybill links appear on that page.</div>
          </div>
        </div>

        {/* Method 2: Shopify-Hosted Customer Account */}
        <div className="p-4 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2.5 text-xs text-[#64748b] shadow-xs">
          <div className="font-bold text-[#0f172a] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Method 2: Shopify-Hosted Customer Account</span>
          </div>
          <p className="leading-relaxed">
            Sign in to view all your past orders, delivery addresses, and shipment milestones in one place using passwordless 6-digit email codes.
          </p>

          {isConfigured ? (
            <div className="pt-1">
              <a
                id="track-order-open-account-btn"
                href={customerAccountUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <span>Open Shopify Account & Orders</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <div className="text-[10px] font-mono text-[#64748b] mt-1.5 text-center truncate">
                {customerAccountUrl}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Account URL Not Yet Configured</span>
              </div>
              <p className="text-[#64748b]">
                <code className="font-semibold text-[#0f172a]">SHOPIFY_CUSTOMER_ACCOUNT_URL</code> has not been configured in the storefront environment yet. Please use the direct tracking link in your Shopify confirmation email.
              </p>
              {onOpenCustomerPortal && (
                <button
                  type="button"
                  onClick={onOpenCustomerPortal}
                  className="text-red-600 font-bold underline hover:text-red-700 pt-0.5 inline-block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                >
                  View Setup Instructions
                </button>
              )}
            </div>
          )}
        </div>

        {/* Truth in Logistics Notice */}
        <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-[11px] text-[#64748b] space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-[#0f172a]">
            <Clock className="w-3.5 h-3.5 text-[#64748b]" />
            <span>Authentic Tracking Policy</span>
          </div>
          <p className="leading-relaxed">
            Tracking numbers and carrier updates become available once physical fulfillment is registered by the dispatch facility in Shopify. Carrier milestone sync depends on carrier API availability. Printify and apparel manufacturing updates sync when official fulfillment events are posted. We do not invent simulated tracking data.
          </p>
        </div>

        {/* Support Footer */}
        <div className="pt-2 border-t border-[#e2e8f0] flex flex-col sm:flex-row gap-2">
          {isConfigured && (
            <a
              href={customerAccountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 px-4 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold uppercase tracking-wider text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
            >
              <span>Go to Account Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <a
            href="mailto:meandmusicdistributors@gmail.com"
            className="flex-1 py-3 px-4 rounded-xl border border-[#e2e8f0] hover:border-red-600 text-[#0f172a] text-xs font-mono font-semibold uppercase text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
          >
            <Mail className="w-3.5 h-3.5 text-red-600" />
            <span>Email Support</span>
          </a>
        </div>
      </div>
    </div>
  );
};
