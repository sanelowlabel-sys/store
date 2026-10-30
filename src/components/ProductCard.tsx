import React, { useState, useMemo } from 'react';
import { Heart, ShoppingBag, Eye, Star, Check } from 'lucide-react';
import { Product, ShopifyVariant, ProductColor } from '../types';
import { formatPrice } from '../lib/shopify';

interface ProductCardProps {
  product: Product;
  currency?: string;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart?: (product: Product, variant: ShopifyVariant) => void;
  onSelect?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  currency = 'USD',
  isWishlisted,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes.length > 0 ? product.sizes[0] : ''
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [isAddedRecently, setIsAddedRecently] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Map chosen options to the exact Shopify variant
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

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedVariant || !isVariantAvailable) return;

    if (onAddToCart) {
      onAddToCart(product, selectedVariant);
    }
    setIsAddedRecently(true);
    setTimeout(() => setIsAddedRecently(false), 1600);
  };

  const primaryImage = product.images[0] || 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=800&q=80';
  const hoverImage = product.images[1] || primaryImage;
  const displayedCardImage = (selectedColor && selectedVariant?.image?.url)
    ? selectedVariant.image.url
    : (isHovered ? hoverImage : primaryImage);

  return (
    <div
      id={`product-card-${product.id}`}
      className="group relative flex flex-col rounded-2xl bg-white border border-[#e2e8f0] hover:border-red-600 transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md motion-reduce:transition-none min-w-0 w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Product Image Stage */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f8fafc]">
        <a
          href={`/products/${product.handle}`}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              onQuickView(product);
            }
          }}
          className="block h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-inset"
          aria-label={`View details for ${product.title}`}
        >
          <img
            src={displayedCardImage}
            alt={product.title}
            className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out motion-reduce:transition-none"
            loading="lazy"
            width="600"
            height="750"
          />
        </a>

        {/* Top Badges (Only shown when genuine supporting data exists) */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {product.badge && (
            <span
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-xs ${
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
            <span className="px-2 py-0.5 rounded-md bg-white/95 border border-[#e2e8f0] text-red-600 text-[10px] font-mono font-bold shadow-xs">
              SAVE {discountPercent}%
            </span>
          )}
        </div>

        {/* Wishlist Button (Local browser storage) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product);
          }}
          className={`absolute top-3 right-3 p-2 rounded-xl transition-all duration-200 z-10 backdrop-blur-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
            isWishlisted
              ? 'bg-red-600 text-white shadow-xs'
              : 'bg-white/90 text-[#64748b] hover:text-[#0f172a] hover:bg-white shadow-xs'
          }`}
          aria-label="Toggle Wishlist"
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current text-white' : ''}`} />
        </button>

        {/* Quick View Button Hover Overlay */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2 z-20 motion-reduce:transition-none">
          <a
            href={`/products/${product.handle}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onQuickView(product);
              }
            }}
            className="flex-1 py-2 rounded-xl bg-white/95 hover:bg-[#0f172a] hover:text-white border border-[#e2e8f0] text-xs font-semibold text-[#0f172a] flex items-center justify-center gap-1.5 backdrop-blur-md transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none"
          >
            <Eye className="w-3.5 h-3.5 text-red-600" />
            <span>Product Details & Options</span>
          </a>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 p-4 flex flex-col justify-between space-y-3">
        <div>
          {/* Collection / Drop Tag */}
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-[10px] font-mono uppercase text-[#64748b] font-bold tracking-wider line-clamp-1">
              {product.dropCollection}
            </span>
            {/* Show reviews/rating ONLY if genuine data exists */}
            {Boolean(product.rating && product.rating > 0) && (
              <div className="flex items-center gap-1 text-amber-500 shrink-0">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="font-bold text-[#0f172a] text-xs">{product.rating}</span>
                {Boolean(product.reviewsCount && product.reviewsCount > 0) && (
                  <span className="text-[10px] text-[#64748b]">({product.reviewsCount})</span>
                )}
              </div>
            )}
          </div>

          {/* Title in bold */}
          <h3 className="text-sm font-heading font-bold text-[#0f172a] hover:text-red-600 transition-colors line-clamp-1 leading-snug">
            <a
              href={`/products/${product.handle}`}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onQuickView(product);
                }
              }}
              className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
            >
              {product.title}
            </a>
          </h3>

          <p className="text-xs text-[#64748b] line-clamp-1 mt-0.5">
            {product.tagline}
          </p>

          {/* Size Pills Selector (Options mapped from Shopify) */}
          {product.sizes.length > 1 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#64748b] mb-1">
                <span>SELECT OPTION:</span>
                <span className="text-[#0f172a] font-bold">{selectedSize}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {product.sizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSize(sz);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                      selectedSize === sz
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-[#f8fafc] text-[#0f172a] border-[#e2e8f0] hover:border-slate-400'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color swatches preview if colors exist */}
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center justify-between gap-1.5 mt-2.5">
              <span className="text-[10px] font-mono text-[#64748b] uppercase">
                COLOR: <span className="text-[#0f172a] font-bold">{selectedColor?.name || ''}</span>
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {product.colors.map((c) => {
                  const isSelected = selectedColor?.name === c.name;
                  if (c.hex) {
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedColor(c);
                        }}
                        aria-label={`Select colour ${c.name}`}
                        aria-pressed={isSelected}
                        title={c.name}
                        className={`w-4 h-4 rounded-full border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                          isSelected
                            ? 'ring-2 ring-red-600 ring-offset-1 ring-offset-white scale-110 shadow-xs border-transparent'
                            : 'border-[#cbd5e1] hover:scale-105 hover:border-slate-400'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  }
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedColor(c);
                      }}
                      aria-label={`Select colour ${c.name}`}
                      aria-pressed={isSelected}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                        isSelected
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-[#f8fafc] text-[#0f172a] border-[#e2e8f0] hover:border-slate-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Pricing & Add To Bag */}
        <div className="pt-2 border-t border-[#e2e8f0]">
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold font-mono text-red-600">
                {formatPrice(currentPriceAmount, currentCurrency)}
              </span>
              {hasDiscount && (
                <span className="text-xs font-mono text-[#64748b] line-through">
                  {formatPrice(comparePriceAmount!, currentCurrency)}
                </span>
              )}
            </div>

            {/* Truthful Variant Stock Indicator */}
            {isVariantAvailable ? (
              <span className="text-[10px] font-mono text-emerald-600 font-semibold">
                In stock
              </span>
            ) : (
              <span className="text-[10px] font-mono text-[#64748b] font-semibold">
                Unavailable
              </span>
            )}
          </div>

          {/* Add to Bag CTA */}
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!isVariantAvailable}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none ${
              !isVariantAvailable
                ? 'bg-slate-100 text-[#64748b] cursor-not-allowed border border-[#e2e8f0]'
                : isAddedRecently
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 hover:bg-[#b91c1c] text-white'
            }`}
          >
            {!isVariantAvailable ? (
              <span>Unavailable</span>
            ) : isAddedRecently ? (
              <>
                <Check className="w-4 h-4" />
                <span>Added to Bag</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add to Bag</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
