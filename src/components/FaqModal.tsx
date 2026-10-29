import React from 'react';
import { X, HelpCircle, Truck, ShieldCheck, RefreshCw, Shirt, CreditCard } from 'lucide-react';

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTrackOrder?: () => void;
}

export const FaqModal: React.FC<FaqModalProps> = ({ isOpen, onClose, onOpenTrackOrder }) => {
  if (!isOpen) return null;

  const faqs = [
    {
      q: 'How does apparel sizing run across drops?',
      a: 'All our hoodies and crewnecks feature an oversized streetwear silhouette crafted from 450–500 GSM French Terry cotton with dropped shoulders. If you prefer a tailored/standard fit, we recommend ordering one size down. Tees run true to standard US streetwear sizing with a relaxed boxy drape.',
      icon: Shirt,
    },
    {
      q: 'Where do you ship and what are courier timelines?',
      a: 'We ship to over 85 countries worldwide with direct air express freight. Drop orders and pre-orders are processed within 24 hours. Standard Tracked Air takes 5-7 business days, and Priority Air Express arrives in 3-5 business days with full door-to-door tracking checkpoints.',
      icon: Truck,
    },
    {
      q: 'How do I wash and preserve vintage-washed merch?',
      a: 'To maintain the custom pigment wash, high-density screen prints, and heavy hand-feel, machine wash cold inside out with like colors. Hang dry or tumble dry low. Do not iron directly on puff print or chenille embroidery patches.',
      icon: RefreshCw,
    },
    {
      q: 'What is your 30-Day Authentic Fit & Quality Guarantee?',
      a: 'Every apparel piece is backed by our 30-Day Fit Guarantee. If the sizing is not optimal or you want to exchange for another variant, our concierge provides free prepaid exchange shipping labels.',
      icon: ShieldCheck,
    },
    {
      q: 'What payment options are supported?',
      a: 'All available payment options (including credit/debit cards, digital wallets, or local payment methods) are provided securely through Shopify checkout based on the payment gateways configured for sx71id-uy.myshopify.com.',
      icon: CreditCard,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        id="faq-modal-container"
        className="relative w-full max-w-2xl bg-white border border-[#e2e8f0] rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 my-auto text-[#0f172a] font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-[#f8fafc] text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          aria-label="Close FAQ"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shadow-xs">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-heading font-extrabold text-[#0f172a] tracking-tight">
              Merch Sizing & Order FAQ
            </h3>
            <p className="text-xs text-[#64748b]">
              Essential details regarding heavyweight fabrics, drop schedules, sizing & express logistics.
            </p>
          </div>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {faqs.map((faq, i) => {
            const Icon = faq.icon;
            return (
              <div key={i} className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 shadow-xs">
                <div className="flex items-center gap-2.5 text-[#0f172a] font-semibold text-xs sm:text-sm">
                  <Icon className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{faq.q}</span>
                </div>
                <p className="text-xs text-[#64748b] leading-relaxed pl-6.5">{faq.a}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#64748b]">
          <span>Looking for live drop tracking checkpoints?</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenTrackOrder) onOpenTrackOrder();
            }}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            Track Merch Order
          </button>
        </div>
      </div>
    </div>
  );
};
