import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera,
  ArrowRight,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  SlidersHorizontal,
  Layers,
  ArrowLeft
} from 'lucide-react';
import { LOOKBOOK_ITEMS, LookbookItem } from '../data/lookbook-data';

interface LookbookPageProps {
  onNavigateHome: () => void;
  onNavigateProduct: (handle: string) => void;
}

export const LookbookPage: React.FC<LookbookPageProps> = ({
  onNavigateHome,
  onNavigateProduct,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Local development view restricted strictly to import.meta.env.DEV
  // (Query parameters are never used as access controls, and deployed builds never expose dev briefs)
  const isLocalDevMode = Boolean(import.meta.env.DEV);

  // Filter items
  const filteredItems = LOOKBOOK_ITEMS.filter((item) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'hoodies-fleece') return item.category === 'hoodies-fleece';
    if (selectedCategory === 'graphic-tees') return item.category === 'graphic-tees';
    if (selectedCategory === 'outerwear') return item.category === 'outerwear';
    if (selectedCategory === 'headwear-accessories') {
      return item.category === 'headwear' || item.category === 'accessories' || item.category === 'bottoms';
    }
    return true;
  });

  // Approved photographs with valid images
  const approvedItems = filteredItems.filter(
    (item) => item.verificationStatus === 'approved' && Boolean(item.imageUrl)
  );
  const hasApprovedPhotos = approvedItems.length > 0;

  // Editorial snippet cards
  const editorialCards = LOOKBOOK_ITEMS.filter(
    (item) => item.isEditorialCard && Boolean(item.editorialSnippet)
  );

  // Open lightbox only for approved photos
  const openLightbox = (item: LookbookItem, e?: React.MouseEvent) => {
    if (item.verificationStatus !== 'approved' || !item.imageUrl) {
      return;
    }
    const idx = approvedItems.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      triggerRef.current = (e?.currentTarget as HTMLElement) || null;
      setActiveItemIndex(idx);
    }
  };

  const closeLightbox = useCallback(() => {
    setActiveItemIndex(null);
    if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, []);

  const showNextItem = useCallback(() => {
    if (activeItemIndex === null || approvedItems.length === 0) return;
    setActiveItemIndex((prev) => (prev! + 1) % approvedItems.length);
  }, [activeItemIndex, approvedItems.length]);

  const showPrevItem = useCallback(() => {
    if (activeItemIndex === null || approvedItems.length === 0) return;
    setActiveItemIndex((prev) => (prev! - 1 + approvedItems.length) % approvedItems.length);
  }, [activeItemIndex, approvedItems.length]);

  // Keyboard navigation & accessibility for lightbox
  useEffect(() => {
    if (activeItemIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNextItem();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrevItem();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      lightboxRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      clearTimeout(timer);
    };
  }, [activeItemIndex, closeLightbox, showNextItem, showPrevItem]);

  const activeApprovedItem =
    activeItemIndex !== null && approvedItems[activeItemIndex]
      ? approvedItems[activeItemIndex]
      : null;

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#0f172a]">
      {/* Header Section */}
      <section className="bg-white border-b border-[#e2e8f0] py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-[#64748b] mb-6">
            <button
              type="button"
              onClick={onNavigateHome}
              className="hover:text-red-600 transition-colors cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Sanelow Store</span>
            </button>
            <span>/</span>
            <span className="text-[#0f172a] font-semibold">Lookbook</span>
          </nav>

          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[11px] font-mono font-bold uppercase tracking-wider shadow-xs">
              <span>SANELOW LOOKBOOK • VISUAL ARCHIVE</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-heading font-extrabold text-[#0f172a] tracking-tight leading-tight">
              The Sanelow Lookbook.
            </h1>

            <p className="text-sm sm:text-base text-[#64748b] leading-relaxed font-sans">
              A curated visual archive documenting the Sanelow apparel and merchandise collection.
            </p>
          </div>
        </div>
      </section>

      {/* When there are NO approved photographs on the public storefront, show ONE polished section */}
      {!hasApprovedPhotos && !isLocalDevMode ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="rounded-3xl bg-white border border-[#e2e8f0] p-8 sm:p-14 text-center max-w-3xl mx-auto shadow-xs space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center mx-auto text-[#64748b] shadow-xs">
              <Camera className="w-8 h-8 stroke-[1.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[11px] font-mono font-bold uppercase tracking-wider">
                EDITORIAL ARCHIVE
              </span>
              <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0f172a] tracking-tight">
                Photography Coming Soon
              </h2>
              <p className="text-xs sm:text-sm text-[#64748b] leading-relaxed max-w-xl mx-auto font-sans">
                Our editorial lookbook will showcase genuine pieces from the Sanelow merchandise archive. Approved community and editorial photography will be featured here as authentic lookbook imagery becomes available.
              </p>
            </div>

            {/* Editorial Context Cards */}
            {editorialCards.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-4">
                {editorialCards.map((card) => (
                  <div
                    key={card.id}
                    className="p-6 rounded-2xl bg-[#0f172a] text-white border border-slate-800 flex flex-col justify-between space-y-3 shadow-xs"
                  >
                    <div className="text-[10px] font-mono text-red-500 font-bold uppercase tracking-wider">
                      {card.editorialSnippet?.eyebrow}
                    </div>
                    <div className="text-base font-heading font-bold">
                      {card.editorialSnippet?.headline}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {card.editorialSnippet?.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onNavigateHome}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Browse Storefront Collection
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* Rendered when approved photos exist, or when in local development mode (import.meta.env.DEV) */
        <>
          {/* Filter Tabs Bar */}
          <section className="sticky top-18 sm:top-20 z-20 bg-white/95 backdrop-blur-md border-b border-[#e2e8f0] py-3.5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                <span className="text-[11px] font-mono uppercase font-bold text-[#64748b] mr-2 flex items-center gap-1 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filter:</span>
                </span>
                {[
                  { id: 'all', label: 'All Looks' },
                  { id: 'hoodies-fleece', label: 'Hoodies & Fleece' },
                  { id: 'graphic-tees', label: 'Graphic Tees' },
                  { id: 'outerwear', label: 'Outerwear' },
                  { id: 'headwear-accessories', label: 'Headwear & Accessories' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedCategory(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-normal transition-all whitespace-nowrap cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                      selectedCategory === tab.id
                        ? 'bg-red-600 text-white font-bold'
                        : 'bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a] hover:bg-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-xs font-mono text-[#64748b] shrink-0 hidden sm:block">
                <span>
                  {hasApprovedPhotos
                    ? `Showing ${approvedItems.length} approved looks`
                    : `[Local Dev] ${filteredItems.length} curated slots`}
                </span>
              </div>
            </div>
          </section>

          {/* Gallery Grid */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8 items-start">
              {filteredItems.map((item) => {
                // Editorial Cards
                if (item.isEditorialCard && item.editorialSnippet) {
                  return (
                    <div
                      key={item.id}
                      className="rounded-3xl bg-[#0f172a] text-white p-6 sm:p-8 flex flex-col justify-between border border-slate-800 shadow-md relative overflow-hidden min-h-[280px] sm:min-h-[340px]"
                    >
                      <div className="space-y-3">
                        <div className="inline-flex items-center gap-1.5 text-red-500 font-mono text-[11px] font-bold tracking-wider uppercase">
                          <Layers className="w-3.5 h-3.5" />
                          <span>{item.editorialSnippet.eyebrow}</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-heading font-extrabold tracking-tight leading-snug">
                          {item.editorialSnippet.headline}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans pt-1">
                          {item.editorialSnippet.body}
                        </p>
                      </div>

                      <div className="pt-6 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Sanelow Archive</span>
                        <span className="text-slate-300">Lookbook</span>
                      </div>
                    </div>
                  );
                }

                const aspectClass =
                  item.aspectRatio === 'portrait'
                    ? 'aspect-[3/4]'
                    : item.aspectRatio === 'landscape'
                    ? 'aspect-[4/3]'
                    : 'aspect-square';

                const isApprovedPhoto =
                  item.verificationStatus === 'approved' && Boolean(item.imageUrl);

                return (
                  <div
                    key={item.id}
                    className="group flex flex-col bg-white rounded-3xl border border-[#e2e8f0] overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 motion-reduce:transition-none"
                  >
                    {isApprovedPhoto ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => openLightbox(item, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openLightbox(item);
                          }
                        }}
                        className={`relative w-full ${aspectClass} overflow-hidden bg-[#f1f5f9] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-inset`}
                        aria-label={`View look: ${item.title}`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.altText}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300 motion-reduce:transition-none"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-white motion-reduce:transition-none">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs text-[#0f172a] text-xs font-semibold shadow-md">
                            <span>Inspect Look</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Rendered ONLY in local dev mode (import.meta.env.DEV) */
                      <div
                        className={`relative w-full ${aspectClass} overflow-hidden bg-[#f8fafc] border-b border-[#e2e8f0] flex flex-col justify-between p-6 select-none`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#0f172a] text-[10px] font-mono font-bold uppercase">
                            DEV SLOT
                          </span>
                          <span className="text-[10px] font-mono text-[#64748b]">
                            {item.category}
                          </span>
                        </div>
                        <div className="my-auto text-center space-y-1.5">
                          <Camera className="w-6 h-6 text-[#94a3b8] mx-auto stroke-[1.5]" />
                          <div className="text-xs font-mono font-bold text-[#0f172a]">
                            Photography Pending
                          </div>
                          {item.devBrief && (
                            <p className="text-[11px] text-[#64748b] leading-tight max-w-[200px] mx-auto">
                              {item.devBrief}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-4 sm:p-5 flex flex-col justify-between flex-1 gap-3">
                      <div className="space-y-1">
                        <h3 className="font-heading font-extrabold text-[#0f172a] text-sm sm:text-base leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#64748b] line-clamp-2 leading-relaxed pt-1">
                          {item.caption}
                        </p>
                      </div>

                      {item.productHandle && item.productTitle && (
                        <div className="pt-2 border-t border-[#f1f5f9] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onNavigateProduct(item.productHandle!)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-[#b91c1c] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1 -mx-1"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Shop this look</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        </>
      )}

      {/* Accessible Editorial Lightbox Modal (triggers only for approved photos) */}
      {activeApprovedItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Look details: ${activeApprovedItem.title}`}
          tabIndex={-1}
          ref={lightboxRef}
          onClick={closeLightbox}
          className="fixed inset-0 z-50 bg-[#0f172a]/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in motion-reduce:animate-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-700 my-auto flex flex-col md:flex-row max-h-[90vh]"
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close lookbook modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>

            {approvedItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPrevItem}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Previous look (Left Arrow)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  type="button"
                  onClick={showNextItem}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-[380px]"
                  aria-label="Next look (Right Arrow)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <div className="w-full md:w-3/5 bg-[#0f172a] flex items-center justify-center min-h-[300px] sm:min-h-[460px] relative">
              <img
                src={activeApprovedItem.imageUrl}
                alt={activeApprovedItem.altText}
                className="max-h-[80vh] w-auto max-w-full object-contain"
              />
            </div>

            <div className="w-full md:w-2/5 p-6 sm:p-8 flex flex-col justify-between bg-white overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-[#64748b]">
                  <span className="text-red-600 font-bold uppercase">SANELOW LOOKBOOK</span>
                  <span>
                    Look {activeItemIndex! + 1} of {approvedItems.length}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-heading font-extrabold text-[#0f172a] tracking-tight">
                    {activeApprovedItem.title}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm text-[#64748b] leading-relaxed">
                  {activeApprovedItem.caption}
                </p>
              </div>

              <div className="pt-6 border-t border-[#e2e8f0] space-y-2 mt-4">
                {activeApprovedItem.productHandle && activeApprovedItem.productTitle ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeLightbox();
                      onNavigateProduct(activeApprovedItem.productHandle!);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-[#b91c1c] text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Shop This Piece</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeLightbox();
                      onNavigateHome();
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    <span>Browse Storefront</span>
                  </button>
                )}

                <div className="text-[11px] font-mono text-center text-[#64748b] pt-1">
                  Use Left / Right arrow keys to navigate • Esc to close
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
