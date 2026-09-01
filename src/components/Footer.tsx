import React, { useState } from 'react';
import { Mail, ShieldCheck, Truck, RefreshCw, Flame } from 'lucide-react';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubscribed(true);
      setEmail('');
    }
  };

  return (
    <footer className="bg-stone-900 text-stone-300 dark:bg-stone-950 border-t border-stone-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        
        {/* Newsletter Section */}
        <div className="p-8 rounded-3xl bg-stone-800/60 border border-stone-700/80 mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-red-500" />
              Sanelow Label VIP Circle
            </span>
            <h3 className="text-2xl font-bold text-white mt-1">First Access to Limited Drops</h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md">
              Get notified first on new heavyweight hoodie releases, tour tee restocks, and limited 180g vinyl pressings.
            </p>
          </div>

          <div className="w-full md:w-auto">
            {isSubscribed ? (
              <div className="px-5 py-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                ✓ Welcome to Sanelow VIP! Check your email for your $10 discount code.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex gap-2 w-full max-w-md">
                <input
                  type="email"
                  required
                  placeholder="SanelowLabel@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl text-xs bg-stone-900 text-white placeholder-stone-500 border border-stone-700 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition cursor-pointer"
                >
                  Subscribe
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-xs pb-12 border-b border-stone-800">
          
          <div className="col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-lg font-sans">
                S
              </span>
              <span className="text-lg font-black tracking-wider text-white uppercase">SANELOW LABEL MERCH</span>
            </div>
            <p className="text-stone-400 max-w-sm leading-relaxed">
              Official store for Sanelow Label apparel, heavyweight embroidered hoodies, tour graphic tees, limited 180g physical vinyl releases, and record label accessories.
            </p>
            <div className="flex items-center gap-2 text-stone-400 pt-1 text-[11px]">
              <Mail className="w-3.5 h-3.5 text-red-500" />
              <span>SanelowLabel@gmail.com</span>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-3">Merch Categories</h4>
            <ul className="space-y-2 text-stone-400">
              <li><a href="#" className="hover:text-white transition">Hoodies & Sweats</a></li>
              <li><a href="#" className="hover:text-white transition">T-Shirts & Tour Tees</a></li>
              <li><a href="#" className="hover:text-white transition">Hats & Headwear</a></li>
              <li><a href="#" className="hover:text-white transition">Vinyl & Physical Music</a></li>
              <li><a href="#" className="hover:text-white transition">Accessories & Bags</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-3">Customer Service</h4>
            <ul className="space-y-2 text-stone-400">
              <li><a href="#" className="hover:text-white transition">Track Order & Shipping</a></li>
              <li><a href="#" className="hover:text-white transition">Size Guide & Fit Chart</a></li>
              <li><a href="#" className="hover:text-white transition">30-Day Easy Exchanges</a></li>
              <li><a href="#" className="hover:text-white transition">Care Instructions</a></li>
              <li><a href="#" className="hover:text-white transition">Contact Label Team</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-3">Sanelow Standards</h4>
            <ul className="space-y-2 text-stone-400">
              <li><a href="#" className="hover:text-white transition">480GSM Organic Fleece</a></li>
              <li><a href="#" className="hover:text-white transition">Sustainable Eco-Packaging</a></li>
              <li><a href="#" className="hover:text-white transition">Sanelow Label Publishing</a></li>
              <li><a href="#" className="hover:text-white transition">Artist Network</a></li>
            </ul>
          </div>

        </div>

        {/* Bottom Credits */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-500 gap-4">
          <p>© 2026 Sanelow Label Official Merch. All rights reserved. Contact: SanelowLabel@gmail.com</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-stone-300">Privacy Policy</a>
            <a href="#" className="hover:text-stone-300">Terms of Service</a>
            <a href="#" className="hover:text-stone-300">Cookie Settings</a>
          </div>
        </div>

      </div>
    </footer>
  );
};


