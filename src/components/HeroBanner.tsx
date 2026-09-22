import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Truck, Clock, Flame, CheckCircle2, Star, Eye, Layers } from 'lucide-react';
import { Product, CurrencyCode } from '../types';
import { formatPrice } from '../data/products';

interface HeroBannerProps {
  featuredProduct: Product;
  currency: CurrencyCode;
  onQuickView: (product: Product) => void;
  onScrollToCatalog: () => void;
  onOpenTrackOrder: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  featuredProduct,
  currency,
  onQuickView,
  onScrollToCatalog,
  onOpenTrackOrder,
}) => {
  // Limited Drop countdown timer
  const [timeLeft, setTimeLeft] = useState({ hours: 6, minutes: 42, seconds: 18 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 6, minutes: 59, seconds: 59 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
                SUMMER '26 COLLECTION
              </span>
              <span className="text-zinc-400">|</span>
              <span className="text-zinc-600 font-medium">CUSTOM MILLED 450 GSM</span>
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
                Premium streetwear essentials engineered with custom-milled heavyweight French Terry, hand-applied acid mineral washes, and structural relaxed silhouettes. Built for daily rotation and verified worldwide delivery.
              </p>
            </div>

            {/* Flash Sale / Drop Urgency Ticker */}
            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 max-w-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-600 animate-pulse" />
                <span className="text-xs font-black font-mono text-black uppercase tracking-wider">
                  Drop Batch 01 Allocation Closes In:
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-red-600">
                <span className="px-2 py-1 rounded-lg bg-white border border-zinc-200 text-black shadow-xs">
                  {String(timeLeft.hours).padStart(2, '0')}h
                </span>
                <span>:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-zinc-200 text-black shadow-xs">
                  {String(timeLeft.minutes).padStart(2, '0')}m
                </span>
                <span>:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-zinc-200 text-red-600 shadow-xs">
                  {String(timeLeft.seconds).padStart(2, '0')}s
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                id="hero-shop-catalog-btn"
                onClick={onScrollToCatalog}
                className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-md hover:shadow-red-600/20 flex items-center gap-2 group cursor-pointer"
              >
                <span>Explore The Merch Drop</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                id="hero-track-order-btn"
                onClick={onOpenTrackOrder}
                className="px-5 py-3.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-black text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Truck className="w-4 h-4 text-red-600" />
                <span>Track An Order</span>
              </button>
            </div>

            {/* Social Proof Badges */}
            <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-zinc-600">
              <div className="flex items-center gap-2">
                <div className="flex text-amber-500">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <span className="font-bold text-black">4.9 / 5.0</span>
                <span className="text-zinc-500">(18,400+ reviews)</span>
              </div>
              <div className="flex items-center gap-1.5 text-black font-semibold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-red-600" />
                <span>30-Day Fit Guarantee</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-zinc-500 text-xs font-mono">
                <Layers className="w-3.5 h-3.5 text-red-600" />
                <span>Sizes XS – 3XL Supported</span>
              </div>
            </div>
          </div>

          {/* Right Column: Featured Merch Spotlight */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl bg-white border border-zinc-200 p-5 shadow-xl overflow-hidden group hover:border-black transition-all">
              {/* Drop Ribbon */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-red-600 text-white text-xs font-bold uppercase tracking-wider shadow-sm">
                  {featuredProduct.badge || 'SPOTLIGHT DROP'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-black/80 text-white text-[10px] font-mono font-bold">
                  SKU: {featuredProduct.sku}
                </span>
              </div>

              {/* Product Visual */}
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-zinc-100 mb-4 cursor-pointer" onClick={() => onQuickView(featuredProduct)}>
                <img
                  src={featuredProduct.images[0]}
                  alt={featuredProduct.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                {/* Quick View Button */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickView(featuredProduct);
                    }}
                    className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs shadow-lg flex items-center gap-2 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Inspect Fabric Specs & Sizing</span>
                  </button>
                </div>
              </div>

              {/* Product Quick Info */}
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-zinc-500 font-bold block">
                      {featuredProduct.dropCollection}
                    </span>
                    <h3 className="text-base font-black text-black line-clamp-1">
                      {featuredProduct.title}
                    </h3>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-lg font-black text-red-600 block">
                      {formatPrice(featuredProduct.priceUSD, currency)}
                    </span>
                    <span className="text-xs text-zinc-400 line-through">
                      {formatPrice(featuredProduct.compareAtPriceUSD, currency)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 line-clamp-2">
                  {featuredProduct.tagline}
                </p>

                {/* Sizing Pills preview */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <div className="flex gap-1">
                    {featuredProduct.sizes.slice(0, 5).map((sz) => (
                      <span key={sz} className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[10px] font-mono font-bold">
                        {sz}
                      </span>
                    ))}
                    {featuredProduct.sizes.length > 5 && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 text-[10px] font-mono">
                        +{featuredProduct.sizes.length - 5}
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-emerald-600 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {featuredProduct.stockCount} Left in Drop
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
