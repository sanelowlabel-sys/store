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
  AlertTriangle,
  Mail,
  KeyRound,
  FileText,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import { Product } from '../types';
import { formatPrice, SHOPIFY_CUSTOMER_ACCOUNT_URL } from '../lib/shopify';

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedProducts?: Product[];
  currency?: string;
  onAddToCart?: (product: Product) => void;
  onRemoveFromWishlist?: (product: Product) => void;
  customerAccountUrl?: string;
  initialTab?: 'account' | 'wishlist';
}

export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  isOpen,
  onClose,
  savedProducts = [],
  currency = 'ZAR',
  onAddToCart,
  onRemoveFromWishlist,
  customerAccountUrl = SHOPIFY_CUSTOMER_ACCOUNT_URL,
  initialTab = 'account',
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'account' | 'wishlist'>(initialTab);
  const isConfigured = Boolean(customerAccountUrl && customerAccountUrl.trim().length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-portal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
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
              <h2 id="customer-portal-title" className="text-base font-black text-black uppercase tracking-wider">
                Customer Account
              </h2>
              <p className="text-xs text-zinc-500 font-mono">
                Shopify-Hosted Authentication & Orders
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
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
              {/* If NOT configured, display truthful configuration message */}
              {!isConfigured ? (
                <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-900 uppercase">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Configuration Notice — Hosted Customer Accounts</span>
                  </div>
                  <p className="text-xs text-amber-900/90 leading-relaxed font-sans">
                    The official Shopify customer-account URL has not been configured in the storefront environment variables.
                  </p>
                  <p className="text-xs text-zinc-700 leading-relaxed font-sans">
                    To preserve buyer security, this storefront delegates sign-in, account creation, and passwordless authentication exclusively to Shopify-hosted customer accounts. We do not invent an account URL or infer it from the storefront domain.
                  </p>

                  <div className="p-3.5 rounded-xl bg-white/80 border border-amber-200 space-y-2 text-xs font-mono text-zinc-700">
                    <div className="font-bold text-zinc-900 uppercase text-[11px]">
                      How to configure SHOPIFY_CUSTOMER_ACCOUNT_URL:
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-600">
                      <li>Log in to your Shopify Admin for this store.</li>
                      <li>Navigate to <strong>Settings</strong> &rarr; <strong>Customer accounts</strong>.</li>
                      <li>Ensure <strong>New customer accounts</strong> is enabled.</li>
                      <li>Copy the generated Customer Account URL (e.g. <code className="bg-zinc-100 px-1 py-0.5 rounded text-black font-semibold">https://shopify.com/&lt;store-id&gt;/account</code> or custom subdomain).</li>
                      <li>Set <code className="bg-zinc-100 px-1 py-0.5 rounded text-black font-semibold">SHOPIFY_CUSTOMER_ACCOUNT_URL</code> in your Vercel or development environment variables.</li>
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 text-xs text-zinc-600 space-y-1">
                    <p className="font-medium text-black">
                      Already placed an order?
                    </p>
                    <p>
                      You do not need an account to track recent orders. Use the secure <strong>Order Status</strong> link sent directly in your Shopify order confirmation email.
                    </p>
                  </div>
                </div>
              ) : (
                /* Configured state: Direct Access & Real Authentication Explanation */
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-black uppercase">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Official Shopify-Hosted Customer Accounts</span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Sanelow Music uses official Shopify customer accounts. All authentication, orders, shipping addresses, and sign-out sessions are securely hosted by Shopify.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-black">
                          <Mail className="w-3.5 h-3.5 text-red-600" />
                          <span>Emailed One-Time Codes</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-normal">
                          No passwords required. Enter the email used at checkout to receive a secure 6-digit verification code.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-black">
                          <FileText className="w-3.5 h-3.5 text-red-600" />
                          <span>Verified Order History</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-normal">
                          Access full order history, printable receipts, and live courier tracking links once recorded by the carrier.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-black">
                          <LogOut className="w-3.5 h-3.5 text-red-600" />
                          <span>Sign Out Inside Shopify</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-normal">
                          For this hosted-only release, sign out directly within your hosted Shopify account pages.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-black">
                          <HelpCircle className="w-3.5 h-3.5 text-red-600" />
                          <span>Storefront Session Note</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-normal">
                          Hosted authentication does not create a signed-in state inside this custom React storefront.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Primary CTA button */}
                  <div className="p-5 rounded-2xl bg-red-50/70 border border-red-200 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0">
                    <div>
                      <h4 className="text-sm font-black text-black">
                        Sign In or Create Account
                      </h4>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Delegated to your store's verified Shopify customer-account portal.
                      </p>
                      <div className="text-[11px] font-mono text-zinc-500 mt-1 truncate max-w-sm">
                        {customerAccountUrl}
                      </div>
                    </div>
                    <a
                      id="customer-portal-open-link"
                      href={customerAccountUrl}
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
              )}
            </div>
          ) : (
            /* Saved Wishlist Tab */
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
                        {onAddToCart && (
                          <button
                            type="button"
                            onClick={() => onAddToCart(prod)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        )}
                        {onRemoveFromWishlist && (
                          <button
                            type="button"
                            onClick={() => onRemoveFromWishlist(prod)}
                            className="p-2 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                            aria-label="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
