import React, { useState, useMemo, useEffect } from 'react';
import {
  Heart,
  ShoppingBag,
  ArrowLeft,
  Check,
  ShieldCheck,
  Truck,
  AlertCircle,
} from 'lucide-react';
import { Product, ShopifyVariant, ProductColor } from '../types';
import { formatPrice } from '../lib/shopify';

interface ProductPageProps {
  product: Product;
  currency: string;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, variant: ShopifyVariant, quantity: number) => void;
  onBackToCatalogue: () => void;
  onRetryVariants?: () => void;
}

export const ProductPage: React.FC<ProductPageProps> = ({
  product,
  currency,
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onBackToCatalogue,
  onRetryVariants,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [userSelectedImage, setUserSelectedImage] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes.length > 0 ? product.sizes[0] : ''
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [isAddedRecently, setIsAddedRecently] = useState(false);

  // Scroll to top-left on page mount to prevent any retained horizontal scroll offset
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [product.handle]);

  // Map chosen options to exact Shopify variant
  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;

    const exactMatch = product.variants.find((v) => {
      const matchSize = selectedSize
        ? v.selectedOptions.some(
            (so) => ['size', 'sizes'].includes(so.name.toLowerCase()) && so.value === selectedSize
          )
        : true;
      const matchColor = selectedColor
        ? v.selectedOptions.some(
            (so) =>
              ['color', 'colour'].includes(so.name.toLowerCase()) && so.value === selectedColor.name
          )
        : true;
      return matchSize && matchColor;
    });

    return exactMatch || product.variants[0];
  }, [product.variants, selectedSize, selectedColor]);

  // Synchronize variant image with gallery when colour/variant changes
  useEffect(() => {
    setUserSelectedImage(null);
    if (selectedVariant?.image?.url) {
      const raw = product.images && product.images.length > 0 ? product.images : [];
      const idx = raw.indexOf(selectedVariant.image.url);
      if (idx !== -1) {
        setSelectedImageIndex(idx);
      }
    }
  }, [selectedVariant?.id, selectedVariant?.image?.url, product.images]);

  const isVariantAvailable = selectedVariant ? selectedVariant.availableForSale : product.availableForSale;

  const currentPriceAmount = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : product.priceAmount;

  const currentCurrency = selectedVariant?.price?.currencyCode || product.currencyCode || currency;

  const comparePriceAmount = selectedVariant?.compareAtPrice?.amount
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : product.compareAtPriceAmount;

  const hasDiscount = Boolean(comparePriceAmount && comparePriceAmount > currentPriceAmount);
  const discountPercent = hasDiscount
    ? Math.round(((comparePriceAmount! - currentPriceAmount) / comparePriceAmount!) * 100)
    : 0;

  const handleAdd = () => {
    if (!selectedVariant || !isVariantAvailable) return;
    onAddToCart(product, selectedVariant, quantity);
    setIsAddedRecently(true);
    setTimeout(() => setIsAddedRecently(false), 2000);
  };

  // Deduplicate gallery images so identical URLs never cause repeat thumbnails
  const images = useMemo(() => {
    const raw = product.images && product.images.length > 0 ? product.images : [];
    const unique = Array.from(new Set(raw.filter(Boolean)));
    return unique.length > 0
      ? unique
      : ['https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80'];
  }, [product.images]);

  // Parse description into well-spaced, highly readable paragraphs and bullet sections
  const descriptionSections = useMemo(() => {
    if (product.descriptionHtml && product.descriptionHtml.trim()) {
      const clean = product.descriptionHtml
        .replace(/<\/(p|div|ul|ol|li)>/gi, '\n\n')
        .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      const parts = clean
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 0) return parts;
    }

    if (!product.description) return [];

    const spaced = product.description
      .replace(/\r\n/g, '\n')
      .replace(/([a-z0-9])\.([A-Z])/g, '$1.\n\n$2')
      .replace(/(fit|label|standards|needed|dryclean)(Product|Care|EU representative|Product information)/g, '$1\n\n$2')
      .replace(/(Product features|Care instructions|Product information):?/g, '\n\n$1');

    return spaced
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [product.description, product.descriptionHtml]);

  return (
    <article className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12 w-full min-w-0 font-sans text-[#0f172a]">
      {/* Crawlable Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 sm:mb-6 text-xs font-mono text-[#64748b]">
        <ol className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <li>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onBackToCatalogue();
              }}
              className="hover:text-[#0f172a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
            >
              Home
            </a>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <a
              href="/#catalog"
              onClick={(e) => {
                e.preventDefault();
                onBackToCatalogue();
              }}
              className="hover:text-[#0f172a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
            >
              Merch
            </a>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-[#0f172a] font-bold truncate max-w-[170px] sm:max-w-xs" aria-current="page">
            {product.title}
          </li>
        </ol>
      </nav>

      {/* Back button */}
      <div className="mb-6 sm:mb-8">
        <button
          type="button"
          onClick={onBackToCatalogue}
          className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform motion-reduce:transform-none" />
          <span>Back to All Pieces</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 w-full min-w-0">
        {/* Left: Gallery */}
        <div className="lg:col-span-7 min-w-0 w-full space-y-4">
          <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-[#f8fafc] border border-[#e2e8f0] shadow-xs">
            <img
              src={userSelectedImage || selectedVariant?.image?.url || images[selectedImageIndex] || images[0]}
              alt={`${product.title} - ${selectedVariant?.title || `view ${selectedImageIndex + 1}`}`}
              className="w-full h-full object-cover object-center"
              width="900"
              height="1125"
            />

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
              {product.badge && (
                <span
                  className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider shadow-xs ${
                    product.badge === 'PRE-ORDER'
                      ? 'bg-[#0f172a] text-white'
                      : product.badge === 'LIMITED DROP'
                      ? 'bg-red-600 text-white'
                      : 'bg-[#0f172a] text-white'
                  }`}
                >
                  {product.badge}
                </span>
              )}
              {hasDiscount && (
                <span className="px-2.5 py-1 rounded-md bg-white/95 border border-[#e2e8f0] text-red-600 text-xs font-mono font-bold shadow-xs">
                  SAVE {discountPercent}%
                </span>
              )}
            </div>

            {/* Wishlist toggle */}
            <button
              type="button"
              onClick={() => onToggleWishlist(product)}
              className={`absolute top-4 right-4 p-3 rounded-xl transition-all z-10 backdrop-blur-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                isWishlisted
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white/90 text-[#64748b] hover:text-[#0f172a] hover:bg-white shadow-xs'
              }`}
              aria-label="Save to Wishlist"
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current text-white' : ''}`} />
            </button>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-2 scrollbar-none w-full max-w-full">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedImageIndex(idx);
                    setUserSelectedImage(images[idx]);
                  }}
                  className={`relative w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                    (userSelectedImage ? userSelectedImage === img : selectedImageIndex === idx) ? 'border-red-600 shadow-xs' : 'border-[#e2e8f0] opacity-70 hover:opacity-100 hover:border-slate-300'
                  }`}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Info & Actions */}
        <div className="lg:col-span-5 min-w-0 w-full flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-red-600 font-bold uppercase tracking-wider">
                {product.dropCollection}
              </span>
              {(selectedVariant?.sku || product.sku) && (
                <span className="text-[#64748b] font-mono truncate max-w-[160px] sm:max-w-xs">SKU: {selectedVariant?.sku || product.sku}</span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-extrabold text-[#0f172a] tracking-tight leading-tight break-words">
              {product.title}
            </h1>

            {product.tagline && (
              <p className="text-xs sm:text-sm font-medium text-[#64748b]">
                {product.tagline}
              </p>
            )}

            {/* Price section */}
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 pt-2">
              <span className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0f172a]">
                {formatPrice(currentPriceAmount, currentCurrency)}
              </span>
              {hasDiscount && (
                <span className="text-base sm:text-lg font-mono text-[#64748b] line-through">
                  {formatPrice(comparePriceAmount!, currentCurrency)}
                </span>
              )}
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-semibold ${
                  isVariantAvailable
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-[#64748b] border border-[#e2e8f0]'
                }`}
              >
                {isVariantAvailable ? 'In stock' : 'Unavailable'}
              </span>
            </div>

            {/* Incomplete Variants Warning with Retry */}
            {product.variantsIncomplete && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-mono space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Incomplete options loaded ({product.variants.length} retrieved)
                  </span>
                  {onRetryVariants && (
                    <button
                      type="button"
                      onClick={onRetryVariants}
                      className="text-amber-800 underline hover:text-[#0f172a] font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded px-1"
                    >
                      Retry
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-700 leading-normal">
                  {product.incompleteVariantsReason || 'Unable to retrieve all product options from Shopify. Preserving available loaded options.'}
                </p>
              </div>
            )}

            {/* Size Options */}
            {product.sizes.length > 0 && product.sizes[0] !== 'One Size' && (
              <div className="pt-4 border-t border-[#e2e8f0] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#0f172a] uppercase">Selected Option:</span>
                  <span className="text-red-600 font-bold">{selectedSize}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`min-h-[44px] min-w-[44px] px-3.5 py-2.5 sm:px-4 sm:py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none touch-manipulation ${
                        selectedSize === sz
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-[#0f172a] border-[#e2e8f0] hover:border-red-600'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Options */}
            {product.colors && product.colors.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#0f172a] uppercase">Color Option:</span>
                  <span className="text-red-600 font-bold">{selectedColor?.name || 'Selected'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {product.colors.map((c) => {
                    const isSelected = selectedColor?.name === c.name;
                    if (c.hex) {
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setSelectedColor(c)}
                          aria-label={`Select colour ${c.name}`}
                          aria-pressed={isSelected}
                          title={c.name}
                          className={`relative w-8 h-8 sm:w-7 sm:h-7 rounded-full border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation ${
                            isSelected
                              ? 'ring-2 ring-red-600 ring-offset-2 scale-110 shadow-xs border-transparent'
                              : 'border-[#cbd5e1] hover:scale-105 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        >
                          <span className="sr-only">{c.name}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        aria-label={`Select colour ${c.name}`}
                        aria-pressed={isSelected}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none touch-manipulation ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-[#0f172a] border-[#e2e8f0] hover:border-red-600'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity and Add to Bag */}
            <div className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center justify-between sm:justify-center border border-[#e2e8f0] rounded-xl bg-[#f8fafc] sm:bg-white px-3 py-2 sm:px-2 sm:py-1 shadow-xs h-11 sm:h-auto min-h-[44px]">
                  <span className="sm:hidden text-xs font-mono font-semibold text-[#64748b]">Quantity</span>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1 || !isVariantAvailable}
                      className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-bold text-[#64748b] hover:text-[#0f172a] disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded touch-manipulation"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="w-10 sm:w-8 text-center text-xs font-mono font-bold text-[#0f172a]">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                      disabled={!isVariantAvailable}
                      className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-bold text-[#64748b] hover:text-[#0f172a] disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded touch-manipulation"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!isVariantAvailable}
                  className={`flex-1 min-h-[44px] py-3.5 px-4 sm:px-6 rounded-xl font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none touch-manipulation ${
                    !isVariantAvailable
                      ? 'bg-slate-100 text-[#64748b] border border-[#e2e8f0] cursor-not-allowed shadow-none'
                      : isAddedRecently
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 hover:bg-[#b91c1c] text-white'
                  }`}
                >
                  {isAddedRecently ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Added to Bag</span>
                    </>
                  ) : !isVariantAvailable ? (
                    <span>Unavailable</span>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <span className="truncate">Add to Bag • {formatPrice(currentPriceAmount * quantity, currentCurrency)}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verified Specifications / Features (Only from real data) */}
            {Boolean(product.features && product.features.length > 0) && (
              <div className="pt-4 border-t border-[#e2e8f0] space-y-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748b]">
                  Verified Fabric & Craft
                </span>
                <ul className="space-y-1.5 text-xs text-[#0f172a]">
                  {product.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Description */}
            <div className="pt-6 border-t border-[#e2e8f0] space-y-3">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748b]">
                Piece Description
              </span>
              <div className="space-y-4 max-w-prose text-sm text-[#334155] leading-relaxed">
                {descriptionSections.map((section, sIdx) => {
                  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
                  const isList = lines.length > 1 && lines.slice(1).every((l) => l.startsWith('-') || l.startsWith('•'));

                  if (isList) {
                    return (
                      <div key={sIdx} className="space-y-2">
                        <p className="font-semibold text-[#0f172a]">{lines[0]}</p>
                        <ul className="space-y-1.5 pl-4 list-disc marker:text-red-600 text-xs sm:text-sm text-[#475569]">
                          {lines.slice(1).map((item, iIdx) => (
                            <li key={iIdx}>
                              {item.replace(/^[-•]\s*/, '')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }

                  return (
                    <p key={sIdx}>
                      {section}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>

          {/* South Africa Dispatch & Genuine Checkout Guarantee */}
          <div className="pt-6 border-t border-[#e2e8f0] grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs text-[#64748b] font-mono">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-red-600 shrink-0" />
              <span>South Africa Dispatch</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Shopify Certified Checkout</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
