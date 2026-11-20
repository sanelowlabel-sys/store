import React from 'react';
import { ArrowRight, Truck, Lock, User, Package, Layers, ShoppingBag, Mail } from 'lucide-react';
import { SHOPIFY_CUSTOMER_ACCOUNT_URL, STORE_CONTACT_EMAIL } from '../lib/shopify';

interface FooterProps {
  onOpenFaq?: () => void;
  onOpenTrackOrder: () => void;
  onOpenCustomerPortal?: () => void;
  onShopAllMerch?: () => void;
  customerAccountUrl?: string;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenTrackOrder,
  onOpenCustomerPortal,
  onShopAllMerch,
  customerAccountUrl: _customerAccountUrl = SHOPIFY_CUSTOMER_ACCOUNT_URL,
}) => {
  return (
    <footer className="bg-white border-t border-[#e2e8f0] text-[#64748b]">
      {/* Storefront CTA container */}
      <div className="border-b border-[#e2e8f0] py-12 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-10 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] flex flex-col lg:flex-row items-center justify-between gap-8 shadow-xs">
            <div className="space-y-2 text-center lg:text-left max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#e2e8f0] text-[#DC2626] text-xs font-mono font-bold uppercase shadow-xs">
                <span>SANELOW MUSIC GROUP MERCH</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0f172a] tracking-tight">
                Explore the latest merch.
              </h3>
              <p className="text-xs sm:text-sm text-[#64748b]">
                Browse the collection and find your next favourite.
              </p>
            </div>

            <div className="w-full lg:w-auto flex justify-center lg:justify-end">
              <a
                href="/"
                onClick={(e) => {
                  if (onShopAllMerch && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    onShopAllMerch();
                  }
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#DC2626] hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <span>Shop all merch</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Col 1 & 2: Brand Info - Logo ONLY without text */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-[#e2e8f0] flex items-center justify-center shadow-xs shrink-0">
                <img
                  src="/sanelow-logo.jpg"
                  alt="Sanelow Store Logo"
                  className="w-full h-full object-contain p-0.5"
                />
              </div>
            </div>
            <p className="text-xs text-[#64748b] leading-relaxed max-w-sm">
              Explore Sanelow Music Group merch. Browse the collection and check individual product pages for available options and details.
            </p>
            <div className="pt-1 text-xs font-mono text-[#64748b]">
              <span>Explore the latest merch</span>
            </div>
          </div>

          {/* Col 3: Customer Care & Tracking */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase font-bold text-[#0f172a] tracking-wider">
              Order Assistance
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={onOpenTrackOrder}
                  className="hover:text-red-600 transition-colors text-left flex items-center gap-1.5 cursor-pointer text-[#0f172a] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                >
                  <Truck className="w-3.5 h-3.5 text-red-600" />
                  <span>Track Your Shipment & Orders</span>
                </button>
              </li>
              {onOpenCustomerPortal && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenCustomerPortal}
                    className="hover:text-red-600 transition-colors text-left flex items-center gap-1.5 cursor-pointer text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                  >
                    <User className="w-3.5 h-3.5 text-red-600" />
                    <span>Sign in / Create account</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Col 4: Shopping information */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase font-bold text-[#0f172a] tracking-wider">
              Shopping information
            </div>
            <ul className="space-y-2.5 text-xs text-[#64748b]">
              <li className="flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600 shrink-0" />
                <span>Product details on each item page</span>
              </li>
              <li className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-600 shrink-0" />
                <span>Available options shown per product</span>
              </li>
              <li className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-red-600 shrink-0" />
                <span>Order history in your account</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-600 shrink-0" />
                <span>Questions? Contact our merch team</span>
              </li>
            </ul>
          </div>

          {/* Col 5: Helpdesk & Contact */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase font-bold text-[#0f172a] tracking-wider">
              Merch support
            </div>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Questions about a product or an existing order? Email our merch team.
            </p>
            <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-[11px] font-mono text-[#0f172a] space-y-1 shadow-xs">
              <span className="text-red-600 font-bold block">DIRECT EMAIL:</span>
              <a
                href={`mailto:${STORE_CONTACT_EMAIL}`}
                className="text-[#0f172a] font-semibold hover:underline block break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
              >
                {STORE_CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>

        {/* Bottom copyright & accepted payments */}
        <div className="mt-12 pt-6 border-t border-[#e2e8f0] flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#64748b]">
          <div>
            © {new Date().getFullYear()} Sanelow Merch Store. All rights reserved.
          </div>

          <div className="flex items-center gap-2 text-[#64748b] text-xs">
            <Lock className="w-3.5 h-3.5 text-[#64748b]" />
            <span>Payment options & gateways provided securely at Shopify checkout</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
