import React, { useState } from 'react';
import { ShoppingBag, Key, ExternalLink, Check, AlertCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface ShopifySetupBannerProps {
  storeDomain: string;
  isConfigured: boolean;
  errorMessage?: string;
  onRetry: () => void;
  isRefreshing: boolean;
}

export const ShopifySetupBanner: React.FC<ShopifySetupBannerProps> = ({
  storeDomain,
  isConfigured,
  errorMessage,
  onRetry,
  isRefreshing,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // If already configured and working, show nothing (or small discreet status if needed)
  if (isConfigured && !errorMessage) {
    return null;
  }

  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 text-white py-3 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                <span>Shopify Storefront Setup</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-normal">
                  {storeDomain}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {errorMessage ||
                  'Add your Storefront API Access Token to fetch your live products and enable checkout.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRetry}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {isRefreshing ? 'Checking...' : 'Check Connection'}
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Setup Guide</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-zinc-300">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                <span>Add Headless Channel</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                In <code className="text-red-400">{storeDomain}/admin</code>, click <strong>Sales channels</strong> and add the official <strong>Headless</strong> sales channel.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                <span>Create Storefront & Copy Token</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Click <strong>Create storefront</strong>. Under Storefront API, copy either your <strong>Public access token</strong> or generate a <strong>Private access token</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Add to Vercel (Server-Only)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                In Vercel (Project Settings &rarr; Environment Variables) or <code className="text-zinc-200">.env.local</code>, set:
                <br />
                <code className="text-red-400 select-all block mt-1 bg-zinc-900 p-1 rounded">
                  SHOPIFY_STOREFRONT_ACCESS_TOKEN
                </code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
