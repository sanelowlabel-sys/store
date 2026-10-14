import React, { useState } from 'react';
import { X, Search, Truck, Mail, ExternalLink, ShieldCheck, HelpCircle, CheckCircle2 } from 'lucide-react';

interface TrackOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeDomain?: string;
}

export const TrackOrderModal: React.FC<TrackOrderModalProps> = ({
  isOpen,
  onClose,
  storeDomain = 'sx71id-uy.myshopify.com',
}) => {
  const [orderQuery, setOrderQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderQuery.trim()) return;
    setHasSearched(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div
        id="track-order-dialog"
        className="relative w-full max-w-lg rounded-3xl bg-white border border-zinc-200 text-black p-6 sm:p-8 shadow-2xl space-y-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-black uppercase tracking-wider">
                Official Order Tracking
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                Powered by Shopify Fulfillment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Guidance */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2.5 text-xs text-zinc-600">
          <div className="font-bold text-black flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>How Live Tracking Works for Sanelow Orders</span>
          </div>
          <p className="leading-relaxed">
            When you complete checkout on Shopify, all fulfillment milestones and carrier waybill tracking numbers are generated directly by Shopify's logistics system.
          </p>
          <ul className="space-y-1.5 pt-1 text-[11px] font-mono text-zinc-500">
            <li className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              <span>Step 1: Order confirmation sent to your email immediately</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              <span>Step 2: Dispatch notice emailed with direct courier tracking link</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              <span>Step 3: Real-time SMS and email updates upon out-for-delivery</span>
            </li>
          </ul>
        </div>

        {/* Order Lookup Helper */}
        <form onSubmit={handleSearch} className="space-y-2">
          <label className="text-xs font-mono font-bold uppercase text-black block">
            Enter Your Shopify Order Number (e.g. #1001):
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={orderQuery}
                onChange={(e) => {
                  setOrderQuery(e.target.value);
                  setHasSearched(false);
                }}
                placeholder="#1001 or email address"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-black font-mono focus:outline-none focus:border-red-600"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold font-mono uppercase transition-colors cursor-pointer"
            >
              Lookup
            </button>
          </div>
        </form>

        {hasSearched && (
          <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 text-xs space-y-2 animate-in fade-in">
            <div className="font-bold text-red-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Checking Order {orderQuery}</span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              For security, live order information is accessed via the tracking link sent to the buyer's email, or directly inside your Shopify customer account.
            </p>
            <a
              href={`https://${storeDomain}/account`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline pt-1"
            >
              <span>View In Shopify Customer Account</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Direct Action Links */}
        <div className="pt-2 border-t border-zinc-200 flex flex-col sm:flex-row gap-2">
          <a
            href={`https://${storeDomain}/account`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <span>Open Shopify Account</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <a
            href="mailto:meandmusicdistributors@gmail.com"
            className="py-3 px-4 rounded-xl border border-zinc-300 hover:border-black text-black text-xs font-mono font-bold uppercase text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-red-600" />
            <span>Email Support</span>
          </a>
        </div>
      </div>
    </div>
  );
};
