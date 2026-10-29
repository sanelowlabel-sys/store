import React from 'react';

interface MerchLoaderProps {
  message?: string;
  submessage?: string;
  fullscreen?: boolean;
}

export const MerchLoader: React.FC<MerchLoaderProps> = ({
  fullscreen = true,
}) => {
  const content = (
    <div
      className="flex flex-col items-center justify-center p-6 text-center select-none"
      role="status"
      aria-label="Loading"
    >
      {/* Minimal Brand Monogram Spinner - Zero Text */}
      <div className="relative flex items-center justify-center">
        {/* Outer subtle rotating red accent ring */}
        <div className="w-12 h-12 rounded-full border-2 border-[#e2e8f0] border-t-red-600 animate-spin motion-reduce:animate-none" />
        
        {/* Inner static brand mark */}
        <div className="absolute inset-0 m-auto w-7 h-7 rounded-lg bg-[#0f172a] flex items-center justify-center shadow-xs">
          <span className="text-white font-heading font-extrabold text-xs tracking-tighter">S</span>
        </div>

        {/* Small Red Accent Pulse Dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
        </span>
      </div>

      {/* Minimal indeterminate micro-bar */}
      <div className="w-20 h-0.5 bg-[#f8fafc] rounded-full mt-4 overflow-hidden border border-[#e2e8f0]/40">
        <div className="h-full bg-red-600 rounded-full animate-pulse w-full motion-reduce:animate-none" />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        id="global-merch-loader"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-xs transition-opacity duration-200"
      >
        {content}
      </div>
    );
  }

  return content;
};

export const MerchProductSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-3 space-y-3 animate-pulse shadow-xs motion-reduce:animate-none">
      <div className="w-full aspect-[4/5] rounded-xl bg-[#f8fafc]" />
      <div className="space-y-2 pt-1">
        <div className="flex justify-between items-center">
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-12 bg-red-50 rounded" />
        </div>
        <div className="h-4 w-4/5 bg-slate-200 rounded" />
        <div className="h-3 w-1/2 bg-[#f8fafc] rounded" />
        <div className="flex gap-1 pt-1">
          <div className="h-5 w-6 bg-[#f8fafc] rounded" />
          <div className="h-5 w-6 bg-[#f8fafc] rounded" />
          <div className="h-5 w-6 bg-[#f8fafc] rounded" />
          <div className="h-5 w-6 bg-[#f8fafc] rounded" />
        </div>
      </div>
    </div>
  );
};
