import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Truck, RefreshCw, Flame } from 'lucide-react';

interface HeroBannerProps {
  onShopNow: () => void;
  onOpenAiAssistant: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ onShopNow, onOpenAiAssistant }) => {
  return (
    <div className="relative overflow-hidden bg-stone-900 text-stone-100 dark:bg-stone-950 rounded-3xl mx-4 sm:mx-6 lg:mx-8 my-6 shadow-2xl border border-stone-800">
      
      {/* Background Hero Image with Subtle Dark Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=2000&q=80"
          alt="Sanelow Label Official Merchandise"
          className="w-full h-full object-cover opacity-35 scale-105 transform hover:scale-100 transition duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/85 to-stone-950/40"></div>
      </div>

      <div className="relative z-10 max-w-4xl px-6 sm:px-12 py-16 sm:py-24">
        
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-800/80 backdrop-blur-sm text-red-400 text-xs font-bold uppercase tracking-widest mb-6">
          <Flame className="w-3.5 h-3.5" />
          <span>Official Sanelow Label Drop 2026</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-stone-100 leading-tight tracking-tight mb-6 font-sans">
          Wear the Sound with <span className="text-red-500 font-extrabold">Sanelow Label</span> Merch
        </h1>

        <p className="text-stone-300 text-sm sm:text-base max-w-xl font-sans font-normal leading-relaxed mb-8">
          Heavyweight 480GSM embroidered hoodies, vintage tour tees, ribbed headwear, limited 180g vinyl pressings, and tour canvas accessories crafted for artists and listeners.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-4 mb-12">
          <button
            onClick={onShopNow}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-red-600 text-white font-bold text-sm hover:bg-red-500 transition shadow-lg shadow-red-600/30 hover:shadow-xl transform hover:-translate-y-0.5 cursor-pointer"
          >
            <span>Browse Merch Drop</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenAiAssistant}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-stone-900/90 hover:bg-stone-800 text-stone-200 border border-red-500/30 text-sm font-semibold transition backdrop-blur-sm cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-red-500" />
            <span>Ask Merch Concierge</span>
          </button>
        </div>

        {/* Trust Value Props */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-stone-800/80 text-xs text-stone-400">
          <div className="flex items-center gap-2.5">
            <Truck className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>Express Worldwide Shipping</span>
          </div>
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>30-Day Easy Size Exchanges</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>100% Authentic Label Merch</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Flame className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>Limited Run Collector Drops</span>
          </div>
        </div>

      </div>

    </div>
  );
};


