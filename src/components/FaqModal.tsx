import React from 'react';
import { X, HelpCircle, Truck, ShieldCheck, RefreshCw, Shirt, CreditCard } from 'lucide-react';
import { STORE_CONTACT_EMAIL } from '../lib/shopify';

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTrackOrder?: () => void;
}

export const FaqModal: React.FC<FaqModalProps> = ({ isOpen, onClose, onOpenTrackOrder }) => {
  if (!isOpen) return null;

  const faqs = [
    {
      q: 'How do I choose a size?',
      a: `Check the individual product page for available sizes and any sizing information provided. If you need help before ordering, contact ${STORE_CONTACT_EMAIL}.`,
      icon: Shirt,
    },
    {
      q: 'Where can I check delivery options?',
      a: 'Enter your delivery address at checkout to review the available delivery options, charges, and any displayed estimates before paying.',
      icon: Truck,
    },
    {
      q: 'Where can I find care instructions?',
      a: `Follow the care label supplied with your item and any product-specific care instructions. For questions about a particular item, contact ${STORE_CONTACT_EMAIL}.`,
      icon: RefreshCw,
    },
    {
      q: 'Who can I contact about an order issue?',
      a: `For questions about your order or an item you received, contact ${STORE_CONTACT_EMAIL}. Include your order number, but do not send payment-card details or passwords.`,
      icon: ShieldCheck,
    },
    {
      q: 'Which payment methods can I use?',
      a: 'Review the payment methods offered at checkout before placing your order.',
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
              Help with product information, sizing questions, and your order.
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
          <span>Need to check an order?</span>
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
