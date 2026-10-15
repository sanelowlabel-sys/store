import React from 'react';
import { Truck, ShieldCheck, Zap, Scissors, CheckCircle2, Award, ShoppingBag } from 'lucide-react';
import merchCraftsmanshipImg from '../assets/images/sanelow_merch_one_1792052950533.jpg';
import merchDropsImg from '../assets/images/sanelow_merch_two_1792052967801.jpg';

export const BrandStorySection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 border-t border-zinc-200 bg-white text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Visual Grid */}
          <div className="lg:col-span-6 grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-zinc-100 border border-zinc-200 shadow-sm">
                <img
                  src={merchCraftsmanshipImg}
                  alt="Person wearing official Sanelow Music Merch House Friends Records graphic sweatshirt"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // DIRECT MERCH CRAFTSMANSHIP
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center gap-2 text-red-600">
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-mono font-black uppercase">Tailored Boxy Silhouette</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Every pattern cut features reinforced ribbing, dropped shoulder contours, and shrink-resistant combed cotton yarns.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-8">
              <div className="p-5 rounded-2xl bg-red-50 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-mono font-black uppercase">Pigment & Acid Wash Finishing</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Curated drop pieces undergo individual garment enzyme treatments for unique patina and soft hand feel.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-zinc-100 border border-zinc-200 shadow-sm">
                <img
                  src={merchDropsImg}
                  alt="Person wearing official Sanelow Music Merch Me and Music graphic hoodie"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // OFFICIAL MERCH DROPS
                </div>
              </div>
            </div>
          </div>

          {/* Right Text */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-xs font-mono font-bold text-red-700">
              <Zap className="w-3.5 h-3.5" />
              <span>THE DIRECT MERCH ATELIER</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl sm:text-4xl font-black text-black leading-tight">
                Crafted Without Compromise. Powered By Shopify Checkout.
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Direct-to-consumer streetwear apparel without retail markups or middleman distributor licensing fees. Every piece is catalogued live through our Shopify storefront and dispatched with verified tracking.
              </p>
            </div>

            {/* Value checklist */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    Heavyweight Structured Weaves
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    We source dense loopback French Terry and combed ring-spun jerseys for structured drape and everyday comfort.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    PCI-Compliant Shopify Checkout
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Your transactions are processed directly on Shopify's Level 1 PCI-DSS secure checkout infrastructure.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    Official Shopify Order Tracking
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Receive automated email and SMS dispatch notifications with courier tracking links as your order is fulfilled.
                  </p>
                </div>
              </div>
            </div>

            {/* Pillars */}
            <div className="pt-4 border-t border-zinc-200 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl sm:text-2xl font-black font-mono text-black">ZAR</div>
                <div className="text-[11px] text-zinc-500 font-sans">South Africa Context</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black font-mono text-red-600">100%</div>
                <div className="text-[11px] text-zinc-500 font-sans">Official Storefront</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black font-mono text-black">Direct</div>
                <div className="text-[11px] text-zinc-500 font-sans">Shopify Fulfillment</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
