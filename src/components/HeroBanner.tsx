import React from 'react';
import { ArrowRight, ShieldCheck, Truck, Star, Eye } from 'lucide-react';
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
  currency = 'ZAR',
  onQuickView,
  onScrollToCatalog,
  onOpenTrackOrder,
}) => {
  return (
    <div className="relative overflow-hidden bg-white border-b border-zinc-200 pt-8 pb-14 lg:pt-12 lg:pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Headline & Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live Drop Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-mono text-zinc-700">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              <span className="text-red-600 font-bold uppercase tracking-wider">
                OFFICIAL SANELOW STOREFRONT
              </span>
              <span className="text-zinc-400">|</span>
              <span className="text-zinc-600 font-medium">SOUTH AFRICA</span>
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-black leading-[1.08]">
                Heavyweight Boxy Fits & <br />
                <span className="text-red-600">
                  Exclusive Merch Drops.
                </span>
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 max-w-xl leading-relaxed">
                Premium streetwear essentials engineered with custom-milled heavyweight fabrics, vintage washes, and structural relaxed silhouettes. Connected directly to our official Shopify store with verified nationwide and global delivery.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                id="hero-shop-catalog-btn"
                onClick={onScrollToCatalog}
                className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md hover:shadow-red-600/20 flex items-center gap-2 group cursor-pointer"
              >
                <span>Explore The Merch Drop</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                id="hero-track-order-btn"
                onClick={onOpenTrackOrder}
                className="px-5 py-3.5 rounded-xl border border-zinc-200 hover:border-black text-black text-xs font-mono font-bold tracking-wider uppercase transition-colors flex items-center gap-2 cursor-pointer bg-white"
              >
                <Truck className="w-4 h-4 text-red-600" />
                <span>Track An Order</span>
              </button>
            </div>

            {/* Value Pillars */}
            <div className="pt-4 border-t border-zinc-100 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono text-zinc-600">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Shopify Verified Checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-red-600 shrink-0" />
                <span>South Africa Delivery</span>
              </div>
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <span className="w-2 h-2 rounded-full bg-black shrink-0" />
                <span>PCI-DSS Level 1 Security</span>
              </div>
            </div>
          </div>

          {/* Right Column: Featured Live Product Card */}
          <div className="lg:col-span-5">
            {featuredProduct ? (
              <div
                className="relative rounded-3xl bg-zinc-50 border border-zinc-200 p-4 sm:p-5 shadow-lg group hover:border-black transition-all cursor-pointer"
                onClick={() => onQuickView(featuredProduct)}
              >
                <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200">
                  <img
                    src={featuredProduct.images[0]}
                    alt={featuredProduct.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-black uppercase tracking-wider">
                      FEATURED PIECE
                    </span>
                    {featuredProduct.discountPercent > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-red-600 text-[10px] font-mono font-bold">
                        SAVE {featuredProduct.discountPercent}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-500 uppercase font-bold tracking-wider">
                      {featuredProduct.dropCollection}
                    </span>
                    {featuredProduct.availableForSale ? (
                      <span className="text-emerald-600 font-semibold">In Stock</span>
                    ) : (
                      <span className="text-zinc-400 font-bold">Sold Out</span>
                    )}
                  </div>

                  <h3 className="text-base font-black text-black group-hover:text-red-600 transition-colors line-clamp-1">
                    <a
                      href={`/products/${featuredProduct.handle}`}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          onQuickView(featuredProduct);
                        }
                      }}
                    >
                      {featuredProduct.title}
                    </a>
                  </h3>

                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-xl font-black font-mono text-red-600">
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
                      className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-zinc-800 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-red-500" />
                      <span>View Options</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative rounded-3xl bg-zinc-50 border border-zinc-200 p-8 shadow-sm text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-400">
                  <Truck className="w-8 h-8 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-black uppercase tracking-wider">
                    Sanelow Merch Storefront
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Live catalogue syncing with Shopify Storefront API. Products update automatically as inventory changes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onScrollToCatalog}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase transition-colors"
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
