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
  currency = 'USD',
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
        className="relative w-full max-w-2xl rounded-2xl sm:rounded-3xl bg-white border border-[#e2e8f0] text-[#0f172a] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh] font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#f8fafc] flex items-center justify-center text-[#0f172a] border border-[#e2e8f0] shadow-xs">
              <User className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 id="customer-portal-title" className="text-base font-heading font-extrabold text-[#0f172a] uppercase tracking-wider">
                Customer Account
              </h2>
              <p className="text-xs text-[#64748b] font-mono">
                Shopify-Hosted Authentication & Orders
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#e2e8f0] px-6 pt-2 gap-4 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`pb-3 font-bold uppercase transition-colors relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded ${
              activeTab === 'account'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Shopify Account & Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wishlist')}
            className={`pb-3 font-bold uppercase transition-colors relative cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded ${
              activeTab === 'wishlist'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-[#64748b] hover:text-[#0f172a]'
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
                  <p className="text-xs text-[#64748b] leading-relaxed font-sans">
                    To preserve buyer security, this storefront delegates sign-in, account creation, and passwordless authentication exclusively to Shopify-hosted customer accounts. We do not invent an account URL or infer it from the storefront domain.
                  </p>

                  <div className="p-3.5 rounded-xl bg-white/80 border border-amber-200 space-y-2 text-xs font-mono text-[#0f172a]">
                    <div className="font-bold text-[#0f172a] uppercase text-[11px]">
                      How to configure SHOPIFY_CUSTOMER_ACCOUNT_URL:
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#64748b]">
                      <li>Log in to your Shopify Admin for this store.</li>
                      <li>Navigate to <strong>Settings</strong> &rarr; <strong>Customer accounts</strong>.</li>
                      <li>Ensure <strong>New customer accounts</strong> is enabled.</li>
                      <li>Copy the generated Customer Account URL (e.g. <code className="bg-[#f8fafc] border border-[#e2e8f0] px-1 py-0.5 rounded text-[#0f172a] font-semibold">https://shopify.com/&lt;store-id&gt;/account</code> or custom subdomain).</li>
                      <li>Set <code className="bg-[#f8fafc] border border-[#e2e8f0] px-1 py-0.5 rounded text-[#0f172a] font-semibold">SHOPIFY_CUSTOMER_ACCOUNT_URL</code> in your Vercel or development environment variables.</li>
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 text-xs text-[#64748b] space-y-1">
                    <p className="font-medium text-[#0f172a]">
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
                  <div className="p-5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#0f172a] uppercase">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Official Shopify-Hosted Customer Accounts</span>
                    </div>
                    <p className="text-xs text-[#64748b] leading-relaxed">
                      Sanelow Music uses official Shopify customer accounts. All authentication, orders, shipping addresses, and sign-out sessions are securely hosted by Shopify.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 rounded-xl bg-white border border-[#e2e8f0] space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                          <Mail className="w-3.5 h-3.5 text-red-600" />
                          <span>Emailed One-Time Codes</span>
                        </div>
                        <p className="text-[11px] text-[#64748b] leading-normal">
                          No passwords required. Enter the email used at checkout to receive a secure 6-digit verification code.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#e2e8f0] space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                          <FileText className="w-3.5 h-3.5 text-red-600" />
                          <span>Verified Order History</span>
                        </div>
                        <p className="text-[11px] text-[#64748b] leading-normal">
                          Access full order history, printable receipts, and live courier tracking links once recorded by the carrier.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#e2e8f0] space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                          <LogOut className="w-3.5 h-3.5 text-red-600" />
                          <span>Sign Out Inside Shopify</span>
                        </div>
                        <p className="text-[11px] text-[#64748b] leading-normal">
                          For this hosted-only release, sign out directly within your hosted Shopify account pages.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#e2e8f0] space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                          <HelpCircle className="w-3.5 h-3.5 text-red-600" />
                          <span>Storefront Session Note</span>
                        </div>
                        <p className="text-[11px] text-[#64748b] leading-normal">
                          Hosted authentication does not create a signed-in state inside this custom React storefront.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Primary CTA button */}
                  <div className="p-5 rounded-2xl bg-red-50/70 border border-red-200 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0 shadow-xs">
                    <div>
                      <h4 className="text-sm font-heading font-extrabold text-[#0f172a]">
                        Sign In or Create Account
                      </h4>
                      <p className="text-xs text-[#64748b] mt-0.5">
                        Delegated to your store's verified Shopify customer-account portal.
                      </p>
                      <div className="text-[11px] font-mono text-[#64748b] mt-1 truncate max-w-sm">
                        {customerAccountUrl}
                      </div>
                    </div>
                    <a
                      id="customer-portal-open-link"
                      href={customerAccountUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-3 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-xs inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      <span>Open Shopify Account</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-[#64748b]">
                    <Lock className="w-3.5 h-3.5 text-[#64748b]" />
                    <span>Protected by Shopify TLS 1.3 encryption</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Saved Wishlist Tab */
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#64748b] font-mono shadow-xs">
                <Info className="w-4 h-4 text-[#64748b] shrink-0" />
                <span>
                  Wishlist items are saved locally in your browser on this device.
                </span>
              </div>

              {savedProducts.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center mx-auto text-[#64748b] shadow-xs">
                    <Heart className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-heading font-extrabold text-[#0f172a]">No saved merch yet</h4>
                  <p className="text-xs text-[#64748b] max-w-xs mx-auto">
                    Click the heart icon on any product in our drop catalogue to save it here for later.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#e2e8f0]">
                  {savedProducts.map((prod) => (
                    <div key={prod.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={prod.images[0]}
                          alt={prod.title}
                          className="w-12 h-14 rounded-lg object-cover bg-white border border-[#e2e8f0] shrink-0"
                        />
                        <div className="min-w-0">
                          <h5 className="text-xs font-heading font-bold text-[#0f172a] truncate">{prod.title}</h5>
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
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        )}
                        {onRemoveFromWishlist && (
                          <button
                            type="button"
                            onClick={() => onRemoveFromWishlist(prod)}
                            className="p-2 text-[#64748b] hover:text-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
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
