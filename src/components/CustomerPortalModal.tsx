import React, { useState } from 'react';
import {
  X,
  User,
  Heart,
  ExternalLink,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Info,
  Lock,
} from 'lucide-react';
import { Product } from '../types';
import { formatPrice } from '../lib/shopify';

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedProducts: Product[];
  currency?: string;
  onAddToCart: (product: Product) => void;
  onRemoveFromWishlist: (product: Product) => void;
  storeDomain?: string;
}

export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  isOpen,
  onClose,
  savedProducts,
  currency = 'ZAR',
  onAddToCart,
  onRemoveFromWishlist,
  storeDomain = 'sx71id-uy.myshopify.com',
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'account' | 'wishlist'>('account');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div
        id="customer-portal-dialog"
        className="relative w-full max-w-2xl rounded-3xl bg-white border border-zinc-200 text-black shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-800 border border-zinc-200">
              <User className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-black uppercase tracking-wider">
                Customer Account & Wishlist
              </h2>
              <p className="text-xs text-zinc-500 font-mono">
                Storefront ID: {storeDomain}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-zinc-200 px-6 pt-2 gap-4 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`pb-3 font-bold uppercase transition-colors relative cursor-pointer ${
              activeTab === 'account'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            Shopify Account & Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wishlist')}
            className={`pb-3 font-bold uppercase transition-colors relative cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'wishlist'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Saved Merch ({savedProducts.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'account' ? (
            <div className="space-y-6">
              {/* Honest Explanation Box */}
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-black uppercase">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Secure Shopify Customer Portal</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  For your security and privacy, customer account authentication, password management, and verified order history are hosted directly on Shopify's secure servers.
                </p>
                <div className="pt-2 border-t border-zinc-200 text-xs text-zinc-500 space-y-1 font-mono">
                  <div>• View past fulfilled orders and printable invoices</div>
                  <div>• Manage delivery addresses and contact information</div>
                  <div>• Check real-time fulfillment milestones</div>
                </div>
              </div>

              {/* Direct Access CTA */}
              <div className="p-5 rounded-2xl bg-red-50/60 border border-red-200 space-y-3 text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:space-y-0">
                <div>
                  <h4 className="text-sm font-black text-black">
                    Log in to Your Shopify Account
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Enter the email address you used during checkout to receive your secure sign-in code.
                  </p>
                </div>
                <a
                  href={`https://${storeDomain}/account`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm inline-flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <span>Open Shopify Account</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-400">
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
                <span>Protected by Shopify TLS 1.3 encryption</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-500 font-mono">
                <Info className="w-4 h-4 text-zinc-600 shrink-0" />
                <span>
                  Wishlist items are saved locally in your browser on this device.
                </span>
              </div>

              {savedProducts.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                    <Heart className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-black text-black">No saved merch yet</h4>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                    Click the heart icon on any product in our drop catalogue to save it here for later.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200">
                  {savedProducts.map((prod) => (
                    <div key={prod.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={prod.images[0]}
                          alt={prod.title}
                          className="w-12 h-14 rounded-lg object-cover bg-zinc-100 border border-zinc-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <h5 className="text-xs font-black text-black truncate">{prod.title}</h5>
                          <div className="text-xs font-mono font-bold text-red-600 mt-0.5">
                            {formatPrice(prod.priceAmount, prod.currencyCode || currency)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onAddToCart(prod)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveFromWishlist(prod)}
                          className="p-2 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                          aria-label="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
