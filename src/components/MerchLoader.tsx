import React from 'react';

interface MerchLoaderProps {
  message?: string;
  submessage?: string;
  fullscreen?: boolean;
}

export const MerchLoader: React.FC<MerchLoaderProps> = ({
  message = 'SANELOW MERCHANDISE ARCHIVE',
  submessage = 'Curating Drop Inventory & Fabric Specs...',
  fullscreen = true,
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center p-8 text-center select-none">
      {/* Brand Monogram / Loading Emblem */}
      <div className="relative mb-6 flex items-center justify-center">
        {/* Outer pulsating red ring */}
        <div className="w-16 h-16 rounded-full border-2 border-red-600/30 border-t-red-600 animate-spin" />
        
        {/* Inner static brand mark */}
        <div className="absolute inset-0 m-auto w-10 h-10 rounded-lg bg-black flex items-center justify-center shadow-lg">
          <span className="text-white font-black text-sm tracking-tighter">S</span>
        </div>

        {/* Small Red Accent Pulse Dot */}
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
        </span>
      </div>

      {/* Typography */}
      <div className="space-y-1.5 max-w-xs">
        <div className="text-xs font-mono font-bold tracking-[0.25em] text-black uppercase">
          {message}
        </div>
        <p className="text-xs text-zinc-500 font-medium tracking-wide">
          {submessage}
        </p>
      </div>

      {/* Minimalist Red Micro-Progress Bar */}
      <div className="w-36 h-0.5 bg-zinc-100 rounded-full mt-5 overflow-hidden">
        <div className="h-full bg-red-600 rounded-full animate-[shimmer_1.5s_infinite] w-2/3" />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        id="global-merch-loader"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 backdrop-blur-md transition-opacity duration-300"
      >
        {content}
      </div>
    );
  }

  return content;
};

export const MerchProductSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 space-y-3 animate-pulse">
      <div className="w-full aspect-[4/5] rounded-xl bg-zinc-100" />
      <div className="space-y-2 pt-1">
        <div className="flex justify-between items-center">
          <div className="h-3 w-20 bg-zinc-200 rounded" />
          <div className="h-3 w-12 bg-red-100 rounded" />
        </div>
        <div className="h-4 w-4/5 bg-zinc-200 rounded" />
        <div className="h-3 w-1/2 bg-zinc-100 rounded" />
        <div className="flex gap-1 pt-1">
          <div className="h-5 w-6 bg-zinc-100 rounded" />
          <div className="h-5 w-6 bg-zinc-100 rounded" />
          <div className="h-5 w-6 bg-zinc-100 rounded" />
          <div className="h-5 w-6 bg-zinc-100 rounded" />
        </div>
      </div>
    </div>
  );
};
