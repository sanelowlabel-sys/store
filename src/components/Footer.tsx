import React, { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, Truck, HelpCircle, Clock, RefreshCw, Lock, User } from 'lucide-react';
import { SHOPIFY_CUSTOMER_ACCOUNT_URL } from '../lib/shopify';

interface FooterProps {
  onOpenFaq: () => void;
  onOpenTrackOrder: () => void;
  onOpenCustomerPortal?: () => void;
  customerAccountUrl?: string;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenFaq,
  onOpenTrackOrder,
  onOpenCustomerPortal,
  customerAccountUrl = SHOPIFY_CUSTOMER_ACCOUNT_URL,
}) => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setIsSubscribed(true);
      setNewsletterEmail('');
    }
  };

  return (
    <footer className="bg-white border-t border-[#e2e8f0] text-[#64748b]">
      {/* Newsletter signup container */}
      <div className="border-b border-[#e2e8f0] py-12 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-10 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] flex flex-col lg:flex-row items-center justify-between gap-8 shadow-xs">
            <div className="space-y-2 text-center lg:text-left max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#e2e8f0] text-red-600 text-xs font-mono font-bold uppercase shadow-xs">
                <span>EXCLUSIVE DROP ACCESS</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0f172a] tracking-tight">
                Get 15% OFF Your First Merch Drop.
              </h3>
              <p className="text-xs sm:text-sm text-[#64748b]">
                Subscribe for private pre-order allocations, archive restock notifications, and early streetwear drop announcements.
              </p>
            </div>

            <div className="w-full lg:w-auto">
              {isSubscribed ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-center gap-3">
                  <Check className="w-5 h-5 shrink-0 text-red-600" />
                  <div>
                    <div className="font-bold uppercase">You are on the VIP Drop list!</div>
                    <div className="text-[11px] text-[#64748b] mt-0.5">
                      Use code <strong className="text-[#0f172a]">MERCH15</strong> at checkout for 15% off your entire bag.
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
                  <input
                    type="email"
                    required
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="Enter your email address..."
                    className="px-4 py-3 rounded-xl bg-white border border-[#e2e8f0] text-xs text-[#0f172a] placeholder-[#64748b] font-mono focus:outline-none focus:border-red-600 focus-visible:ring-2 focus-visible:ring-red-600 flex-1 shadow-xs"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    <span>Join Drop List</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
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
              Your premier direct-to-consumer destination for custom-milled heavyweight French Terry apparel, vintage acid-washed merch archives, and limited streetwear drops with global air freight tracking.
            </p>
            <div className="flex items-center gap-3 pt-1 text-xs font-mono text-[#64748b]">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <span>Worldwide express air cargo active daily</span>
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
              <li>
                <button
                  type="button"
                  onClick={onOpenFaq}
                  className="hover:text-red-600 transition-colors text-left flex items-center gap-1.5 cursor-pointer text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>Frequently Asked Questions</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenFaq}
                  className="hover:text-red-600 transition-colors text-left cursor-pointer text-[#64748b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                >
                  Fabric Sizing & Fit Guide
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenFaq}
                  className="hover:text-red-600 transition-colors text-left cursor-pointer text-[#64748b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                >
                  30-Day Authentic Fit Exchanges
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Guarantees */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase font-bold text-[#0f172a] tracking-wider">
              Brand Guarantee
            </div>
            <ul className="space-y-2.5 text-xs text-[#64748b]">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                <span>Custom-Milled 450 GSM Quality</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-600 shrink-0" />
                <span>24-Hour Express Dispatch</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-600 shrink-0" />
                <span>256-Bit SSL Encrypted Checkout</span>
              </li>
              <li className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-red-600 shrink-0" />
                <span>Hassle-Free Fit Exchanges</span>
              </li>
            </ul>
          </div>

          {/* Col 5: Helpdesk & Contact */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase font-bold text-[#0f172a] tracking-wider">
              Merch Concierge
            </div>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Have questions regarding sizing, custom drop allocations, or an active order? Our concierge is on standby.
            </p>
            <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-[11px] font-mono text-[#0f172a] space-y-1 shadow-xs">
              <span className="text-red-600 font-bold block">DIRECT EMAIL:</span>
              <a
                href="mailto:meandmusicdistributors@gmail.com"
                className="text-[#0f172a] font-semibold hover:underline block break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
              >
                meandmusicdistributors@gmail.com
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
