import React, { useState, useMemo } from 'react';
import { Heart, ShoppingBag, Eye, Star, Check, Flame, AlertCircle } from 'lucide-react';
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
  currency = 'ZAR',
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

  const hasDiscount = comparePriceAmount && comparePriceAmount > currentPriceAmount;
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

  return (
    <div
      id={`product-card-${product.id}`}
      className="group relative flex flex-col rounded-2xl bg-white border border-zinc-200 hover:border-black transition-all duration-300 overflow-hidden shadow-xs hover:shadow-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Product Image Stage */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100">
        <a
          href={`/products/${product.handle}`}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              onQuickView(product);
            }
          }}
          className="block h-full w-full cursor-pointer"
          aria-label={`View details for ${product.title}`}
        >
          <img
            src={isHovered ? hoverImage : primaryImage}
            alt={product.title}
            className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
            width="600"
            height="750"
          />
        </a>

        {/* Top Badges (Only shown when genuine supporting data exists) */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {product.badge && (
            <span
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-sm ${
                product.badge === 'PRE-ORDER'
                  ? 'bg-black text-white'
                  : product.badge === 'LIMITED DROP'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-900 text-white'
              }`}
            >
              {product.badge}
            </span>
          )}
          {hasDiscount && (
            <span className="px-2 py-0.5 rounded-md bg-white/95 border border-zinc-200 text-red-600 text-[10px] font-mono font-bold shadow-xs">
              SAVE {discountPercent}%
            </span>
          )}
        </div>

        {/* SKU tag if present */}
        {product.sku && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
            <span className="px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-xs">
              {product.sku}
            </span>
          </div>
        )}

        {/* Wishlist Button (Local browser storage) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product);
          }}
          className={`absolute top-3 right-3 p-2 rounded-xl transition-all duration-200 z-10 backdrop-blur-md cursor-pointer ${
            isWishlisted
              ? 'bg-red-600 text-white shadow-md'
              : 'bg-white/90 text-zinc-600 hover:text-black hover:bg-white shadow-sm'
          }`}
          aria-label="Toggle Wishlist"
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current text-white' : ''}`} />
        </button>

        {/* Quick View Button Hover Overlay */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2 z-20">
          <a
            href={`/products/${product.handle}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onQuickView(product);
              }
            }}
            className="flex-1 py-2 rounded-xl bg-white/95 hover:bg-black hover:text-white border border-zinc-300 text-xs font-bold text-black flex items-center justify-center gap-1.5 backdrop-blur-md transition-all shadow-md cursor-pointer"
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
            <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider line-clamp-1">
              {product.dropCollection}
            </span>
            {/* Show reviews/rating ONLY if genuine data exists */}
            {product.rating && (
              <div className="flex items-center gap-1 text-amber-500 shrink-0">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="font-bold text-black text-xs">{product.rating}</span>
                {product.reviewsCount ? (
                  <span className="text-[10px] text-zinc-400">({product.reviewsCount})</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Title in bold black */}
          <h3 className="text-sm font-black text-black hover:text-red-600 transition-colors line-clamp-1 leading-snug">
            <a
              href={`/products/${product.handle}`}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onQuickView(product);
                }
              }}
              className="cursor-pointer"
            >
              {product.title}
            </a>
          </h3>

          <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">
            {product.tagline}
          </p>

          {/* Size Pills Selector (Options mapped from Shopify) */}
          {product.sizes.length > 1 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                <span>SELECT OPTION:</span>
                <span className="text-black font-bold">{selectedSize}</span>
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
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                      selectedSize === sz
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
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
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">COLOR:</span>
              <div className="flex items-center gap-1">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedColor(c);
                    }}
                    title={c.name}
                    className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                      selectedColor?.name === c.name
                        ? 'ring-2 ring-red-600 ring-offset-1 ring-offset-white scale-110'
                        : 'border-zinc-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Pricing & Add To Bag */}
        <div className="pt-2 border-t border-zinc-100">
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-black font-mono text-red-600">
                {formatPrice(currentPriceAmount, currentCurrency)}
              </span>
              {hasDiscount && (
                <span className="text-xs font-mono text-zinc-400 line-through">
                  {formatPrice(comparePriceAmount!, currentCurrency)}
                </span>
              )}
            </div>

            {/* Truthful Variant Stock Indicator */}
            {isVariantAvailable ? (
              <span className="text-[10px] font-mono text-emerald-600 font-semibold">
                In Stock
              </span>
            ) : (
              <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">
                Sold Out
              </span>
            )}
          </div>

          {/* Add to Bag CTA */}
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!isVariantAvailable}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
              !isVariantAvailable
                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                : isAddedRecently
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
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
