import React from 'react';
import { ArrowRight, ShieldCheck, Truck, Eye } from 'lucide-react';
import { Product } from '../types';
import { formatPrice } from '../lib/shopify';

interface HeroBannerProps {
  featuredProduct?: Product | null;
  currency?: string;
  onQuickView: (product: Product) => void;
  onScrollToCatalog: () => void;
  onOpenTrackOrder: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  featuredProduct,
  currency = 'USD',
  onQuickView,
  onScrollToCatalog,
  onOpenTrackOrder,
}) => {
  return (
    <div className="relative overflow-hidden bg-white border-b border-[#e2e8f0] pt-8 pb-14 lg:pt-12 lg:pb-20 bg-grid-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Headline & Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live Drop Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono text-[#0f172a] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              <span className="text-red-600 font-bold uppercase tracking-wider">
                OFFICIAL SANELOW STOREFRONT
              </span>
              <span className="text-[#64748b]">|</span>
              <span className="text-[#64748b] font-medium">SOUTH AFRICA</span>
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-extrabold tracking-tight text-[#0f172a] leading-[1.08]">
                Heavyweight Boxy Fits & <br />
                <span className="text-red-600">
                  Exclusive Merch Drops.
                </span>
              </h1>
              <p className="text-sm sm:text-base text-[#64748b] max-w-xl leading-relaxed">
                Premium streetwear essentials engineered with custom-milled heavyweight fabrics, vintage washes, and structural relaxed silhouettes. Connected directly to our official Shopify store with verified nationwide and global delivery.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                id="hero-shop-catalog-btn"
                onClick={onScrollToCatalog}
                className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold tracking-wider uppercase transition-all shadow-xs hover:shadow-md flex items-center gap-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <span>Explore The Merch Drop</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform motion-reduce:transform-none" />
              </button>

              <button
                id="hero-track-order-btn"
                onClick={onOpenTrackOrder}
                className="px-5 py-3.5 rounded-xl border border-[#e2e8f0] hover:border-red-600 text-[#0f172a] text-xs font-mono font-semibold tracking-wider uppercase transition-colors flex items-center gap-2 cursor-pointer bg-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <Truck className="w-4 h-4 text-red-600" />
                <span>Track An Order</span>
              </button>
            </div>

            {/* Value Pillars */}
            <div className="pt-4 border-t border-[#e2e8f0] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono text-[#64748b]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Shopify Verified Checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-red-600 shrink-0" />
                <span>South Africa Delivery</span>
              </div>
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <span className="w-2 h-2 rounded-full bg-[#0f172a] shrink-0" />
                <span>PCI-DSS Level 1 Security</span>
              </div>
            </div>
          </div>

          {/* Right Column: Featured Live Product Card */}
          <div className="lg:col-span-5">
            {featuredProduct ? (
              <div
                className="relative rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 sm:p-5 shadow-xs hover:shadow-md group hover:border-red-600 transition-all cursor-pointer motion-reduce:transition-none"
                onClick={() => onQuickView(featuredProduct)}
              >
                <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-white border border-[#e2e8f0]">
                  <img
                    src={featuredProduct.images[0]}
                    alt={featuredProduct.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                  />
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
                      FEATURED PIECE
                    </span>
                    {featuredProduct.discountPercent > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-white border border-[#e2e8f0] text-red-600 text-[10px] font-mono font-bold shadow-xs">
                        SAVE {featuredProduct.discountPercent}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#64748b] uppercase font-bold tracking-wider">
                      {featuredProduct.dropCollection}
                    </span>
                    {featuredProduct.availableForSale ? (
                      <span className="text-emerald-600 font-semibold">In Stock</span>
                    ) : (
                      <span className="text-[#64748b] font-bold">Sold Out</span>
                    )}
                  </div>

                  <h3 className="text-base font-heading font-bold text-[#0f172a] group-hover:text-red-600 transition-colors line-clamp-1">
                    <a
                      href={`/products/${featuredProduct.handle}`}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          onQuickView(featuredProduct);
                        }
                      }}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                    >
                      {featuredProduct.title}
                    </a>
                  </h3>

                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-xl font-bold font-mono text-red-600">
                      {formatPrice(featuredProduct.priceAmount, featuredProduct.currencyCode || currency)}
                    </span>
                    <a
                      href={`/products/${featuredProduct.handle}`}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          onQuickView(featuredProduct);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0f172a] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1 hover:bg-slate-800 transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                    >
                      <Eye className="w-3.5 h-3.5 text-red-500" />
                      <span>View Options</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-8 shadow-xs text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-white border border-[#e2e8f0] flex items-center justify-center mx-auto text-[#64748b] shadow-xs">
                  <Truck className="w-8 h-8 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-heading font-bold text-[#0f172a] uppercase tracking-wider">
                    Sanelow Merch Storefront
                  </h3>
                  <p className="text-xs text-[#64748b] mt-1 max-w-xs mx-auto leading-relaxed">
                    Live catalogue syncing with Shopify Storefront API. Products update automatically as inventory changes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onScrollToCatalog}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
                >
                  Browse Catalogue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
