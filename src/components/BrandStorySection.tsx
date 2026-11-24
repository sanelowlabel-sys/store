import React from 'react';
import { Truck, ShieldCheck, Zap, Scissors, CheckCircle2 } from 'lucide-react';
import { STORE_CONTACT_EMAIL } from '../lib/shopify';
import merchCraftsmanshipImg from '../assets/images/sanelow_merch_one_1792052950533.jpg';
import merchDropsImg from '../assets/images/sanelow_merch_two_1792052967801.jpg';

export const BrandStorySection: React.FC = () => {
  return (
    <section className="py-16 sm:py-20 border-t border-[#e2e8f0] bg-white text-[#0f172a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Visual Grid */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-[#f8fafc] border border-[#e2e8f0] shadow-xs group hover:border-red-600 transition-colors motion-reduce:transition-none">
                <img
                  src={merchCraftsmanshipImg}
                  alt="AI-generated styling preview - Sanelow graphic sweatshirt"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 z-10 pointer-events-none">
                  <span className="px-2 py-0.5 rounded-md bg-[#0f172a]/90 text-white/90 text-[10px] font-mono uppercase tracking-wider shadow-xs">
                    AI-generated styling preview
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // STYLING PREVIEW
                </div>
              </div>
              <div className="p-4 sm:p-5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 shadow-xs hover:border-red-600 transition-colors">
                <div className="flex items-center gap-2 text-red-600">
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-mono font-bold uppercase">Everyday Merch Styling</span>
                </div>
                <p className="text-xs text-[#64748b] leading-relaxed">
                  Styling previews showcase casual ways to pair graphic tops, layers, and accessories across the collection.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-0 sm:pt-8">
              <div className="p-4 sm:p-5 rounded-2xl bg-red-50 border border-red-200 space-y-2 shadow-xs hover:border-red-600 transition-colors">
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-mono font-bold uppercase">Visual Look Previews</span>
                </div>
                <p className="text-xs text-[#64748b] leading-relaxed">
                  These AI-generated styling previews offer visual inspiration; see individual product pages for item photos and details.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-[#f8fafc] border border-[#e2e8f0] shadow-xs group hover:border-red-600 transition-colors motion-reduce:transition-none">
                <img
                  src={merchDropsImg}
                  alt="AI-generated styling preview - Sanelow graphic hoodie"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 z-10 pointer-events-none">
                  <span className="px-2 py-0.5 rounded-md bg-[#0f172a]/90 text-white/90 text-[10px] font-mono uppercase tracking-wider shadow-xs">
                    AI-generated styling preview
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // STYLING PREVIEW
                </div>
              </div>
            </div>
          </div>

          {/* Right Text */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f8fafc] border border-[#e2e8f0] text-xs font-mono font-bold text-red-600 shadow-xs">
              <Zap className="w-3.5 h-3.5" />
              <span>SANELOW MERCH COLLECTION</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl sm:text-4xl font-heading font-extrabold text-[#0f172a] leading-tight tracking-tight">
                Music-inspired style. Explore the collection.
              </h2>
              <p className="text-sm text-[#64748b] leading-relaxed">
                Explore Sanelow apparel and accessories. Check each product page for available colours, sizes, materials, and product details.
              </p>
            </div>

            {/* Value checklist */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0f172a] font-mono uppercase tracking-wider">
                    Explore the range
                  </h4>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Browse apparel and accessories across the store.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0f172a] font-mono uppercase tracking-wider">
                    Choose your style
                  </h4>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    View available sizes and colours on each product page.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#0f172a] font-mono uppercase tracking-wider">
                    Need a hand?
                  </h4>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    For merchandise questions, contact{' '}
                    <a
                      href={`mailto:${STORE_CONTACT_EMAIL}`}
                      className="text-[#0f172a] font-semibold underline hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                    >
                      {STORE_CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>

            {/* Pillars */}
            <div className="pt-4 border-t border-[#e2e8f0] grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
              <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
                <div className="text-base sm:text-lg font-bold font-mono text-[#0f172a]">Apparel</div>
                <div className="text-[11px] text-[#64748b] font-sans">Collection styles</div>
              </div>
              <div className="p-3 rounded-xl bg-red-50/50 border border-red-100">
                <div className="text-base sm:text-lg font-bold font-mono text-red-600">Accessories</div>
                <div className="text-[11px] text-[#64748b] font-sans">Collection details</div>
              </div>
              <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
                <div className="text-base sm:text-lg font-bold font-mono text-[#0f172a]">Music-inspired</div>
                <div className="text-[11px] text-[#64748b] font-sans">Sanelow aesthetic</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
