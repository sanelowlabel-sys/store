import React from 'react';
import { Truck, ShieldCheck, Zap, Scissors, CheckCircle2, Award, Sparkles } from 'lucide-react';

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
                  src="https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=800&q=80"
                  alt="Garment loom craftsmanship and heavyweight cotton weaving"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // 480 GSM CUSTOM-MILLED FRENCH TERRY
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center gap-2 text-red-600">
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-mono font-black uppercase">Tailored Boxy Silhouette</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Every pattern cut features reinforced ribbing, dropped shoulder contours, and shrink-resistant pre-shrunk organic cotton yarns.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-8">
              <div className="p-5 rounded-2xl bg-red-50 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-mono font-black uppercase">Pigment & Acid Wash Lab</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Each drop piece undergoes individual garment enzyme distressing for unique patina and butter-soft hand feel that ages with wear.
                </p>
              </div>
              <div className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-zinc-100 border border-zinc-200 shadow-sm">
                <img
                  src="https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80"
                  alt="Apparel streetwear styling and merchandise archive"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  // LIMITED MERCH DROP ARCHIVE
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
                Crafted Without Compromise. Shipped Straight From The Milling Facility.
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Luxury streetwear retail inflates prices with massive showroom rent, middleman agents, and distributor licensing fees. Sanelow Merch operates directly from spinning looms to your doorstep with expedited international air tracking.
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    Custom 450–500 GSM Heavyweight Weaves
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    We mill dense French Terry cotton and combed ring-spun jerseys for structured drape and all-day thermal breathability.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    30-Day Authentic Fit Guarantee
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Try your merch at home. If the drape or sizing isn't 100% ideal, swap sizes with instant prepaid courier returns.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-black font-mono uppercase tracking-wider">
                    Real-Time GPS Dispatch Tracking
                  </h4>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Every drop order includes an encrypted tracking code and automated milestones from factory inspection to final delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Customer stats counter */}
            <div className="pt-4 border-t border-zinc-200 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black font-mono text-black">48,000+</div>
                <div className="text-[11px] text-zinc-500 font-sans">Garments Delivered</div>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-red-600">4.9 / 5.0</div>
                <div className="text-[11px] text-zinc-500 font-sans">Verified Fabric Rating</div>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-black">24/7</div>
                <div className="text-[11px] text-zinc-500 font-sans">Merch Concierge</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
