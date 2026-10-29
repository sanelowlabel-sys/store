import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Check,
  Star,
  ShoppingBag,
  Heart,
  ShieldCheck,
  Truck,
  AlertCircle,
} from 'lucide-react';
import { Product, ShopifyVariant, ProductColor } from '../types';
import { formatPrice } from '../lib/shopify';

interface ProductModalProps {
  product: Product | null;
  currency?: string;
  isWishlisted: boolean;
  onToggleWishlist: (product: Product) => void;
  onAddToCart: (product: Product, variant: ShopifyVariant, quantity: number) => void;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  currency = 'USD',
  isWishlisted,
  onToggleWishlist,
  onAddToCart,
  onClose,
}) => {
  if (!product) return null;

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [userSelectedImage, setUserSelectedImage] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes.length > 0 ? product.sizes[0] : ''
  );
  const [selectedColor, setSelectedColor] = useState<ProductColor | undefined>(
    product.colors && product.colors.length > 0 ? product.colors[0] : undefined
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [isAdded, setIsAdded] = useState(false);

  // Map chosen options to the exact Shopify variant
  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;

    const match = product.variants.find((v) => {
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

    return match || product.variants[0];
  }, [product.variants, selectedSize, selectedColor]);

  // Synchronize variant image with modal gallery when colour/variant changes
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

  const isAvailable = selectedVariant ? selectedVariant.availableForSale : product.availableForSale;

  const unitPrice = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : product.priceAmount;

  const currentCurrency = selectedVariant?.price?.currencyCode || product.currencyCode || currency;

  const comparePrice = selectedVariant?.compareAtPrice?.amount
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : product.compareAtPriceAmount;

  const hasDiscount = Boolean(comparePrice && comparePrice > unitPrice);
  const discountPercent = hasDiscount
    ? Math.round(((comparePrice! - unitPrice) / comparePrice!) * 100)
    : 0;

  const totalAmount = unitPrice * quantity;

  const handleAdd = () => {
    if (!selectedVariant || !isAvailable) return;
    onAddToCart(product, selectedVariant, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const images = useMemo(() => {
    const raw = product.images && product.images.length > 0 ? product.images : [];
    const unique = Array.from(new Set(raw.filter(Boolean)));
    return unique.length > 0
      ? unique
      : ['https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=800&q=80'];
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-md overflow-y-auto">
      <div
        id="product-modal-container"
        className="relative w-full max-w-4xl rounded-2xl sm:rounded-3xl bg-white border border-[#e2e8f0] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-[#0f172a] font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-product-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-white/90 text-[#64748b] hover:text-[#0f172a] border border-[#e2e8f0] hover:border-red-600 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto flex-1 p-5 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full min-w-0">
            {/* Gallery Column */}
            <div className="lg:col-span-6 min-w-0 w-full space-y-4">
              {/* Main Image Stage */}
              <div className="relative aspect-[4/5] w-full rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden">
                <img
                  src={userSelectedImage || selectedVariant?.image?.url || images[selectedImageIndex] || images[0]}
                  alt={`${product.title} - ${selectedVariant?.title || `view ${selectedImageIndex + 1}`}`}
                  className="w-full h-full object-cover object-center"
                />

                {/* Badges (Only shown when genuine supporting data exists) */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
                  {product.badge && (
                    <span className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
                      {product.badge}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="px-2.5 py-0.5 rounded-md bg-white border border-[#e2e8f0] text-red-600 text-[10px] font-mono font-bold shadow-xs">
                      SAVE {discountPercent}% OFF
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedImageIndex(idx);
                        setUserSelectedImage(images[idx]);
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                        (userSelectedImage ? userSelectedImage === img : selectedImageIndex === idx)
                          ? 'border-red-600 ring-2 ring-red-600/30 shadow-xs'
                          : 'border-[#e2e8f0] opacity-60 hover:opacity-100 hover:border-slate-300'
                      }`}
                    >
                      <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Delivery info card */}
              <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 text-xs text-[#64748b]">
                <div className="flex items-center gap-2 font-mono text-[#0f172a] font-bold">
                  <Truck className="w-4 h-4 text-red-600" />
                  <span>Shopify Fulfilled & Shipped</span>
                </div>
                <p className="text-[11px] text-[#64748b] leading-relaxed">
                  Real-time shipping rates and courier options for your delivery address are calculated securely at Shopify checkout.
                </p>
              </div>
            </div>

            {/* Product Details & Purchase Form Column */}
            <div className="lg:col-span-6 min-w-0 w-full space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-mono uppercase text-[#64748b] font-bold tracking-wider">
                    {product.dropCollection}
                  </span>
                  {Boolean(product.rating && product.rating > 0) && (
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                      <span className="text-xs font-bold text-[#0f172a]">{product.rating}</span>
                      {Boolean(product.reviewsCount && product.reviewsCount > 0) && (
                        <span className="text-xs text-[#64748b]">
                          ({product.reviewsCount} reviews)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-[#0f172a] leading-tight tracking-tight">
                  {product.title}
                </h1>
                <p className="text-xs text-[#64748b] mt-1">{product.tagline}</p>

                {/* Availability status badge */}
                <div className="mt-3 p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono bg-[#f8fafc] border-[#e2e8f0]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {isAvailable ? (
                      <span className="text-emerald-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        In stock
                      </span>
                    ) : (
                      <span className="text-red-700 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        Unavailable
                      </span>
                    )}
                  </span>
                  {(selectedVariant?.sku || product.sku) && (
                    <span className="text-[11px] text-[#64748b]">SKU: {selectedVariant?.sku || product.sku}</span>
                  )}
                </div>

                {/* Pricing Box */}
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-3xl font-heading font-extrabold font-mono text-red-600">
                    {formatPrice(totalAmount, currentCurrency)}
                  </span>
                  {hasDiscount && (
                    <span className="text-sm font-mono text-[#64748b] line-through">
                      {formatPrice(comparePrice! * quantity, currentCurrency)}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-red-50 text-red-700 text-xs font-mono font-bold border border-red-200">
                      Save {discountPercent}% OFF
                    </span>
                  )}
                </div>
              </div>

              {/* Sizing / Variant Options Picker */}
              {product.sizes.length > 1 && (
                <div className="space-y-2 pt-2 border-t border-[#e2e8f0]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#0f172a] flex items-center gap-1.5">
                      <span>Select Option:</span>
                      <span className="text-red-600 font-mono font-bold">{selectedSize}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {product.sizes.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedSize(sz)}
                        className={`py-2 px-3 rounded-xl border text-xs font-mono font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                          selectedSize === sz
                            ? 'bg-red-600 border-red-600 text-white shadow-xs'
                            : 'bg-white border-[#e2e8f0] text-[#0f172a] hover:border-red-600'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Colorway Choice */}
              {product.colors && product.colors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#0f172a] font-bold uppercase">Colorway:</span>
                    <span className="text-red-600 font-bold">{selectedColor?.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                            className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                              isSelected
                                ? 'bg-[#f8fafc] border-red-600 ring-1 ring-red-600 text-[#0f172a] font-bold shadow-xs'
                                : 'bg-white border-[#e2e8f0] text-[#64748b] hover:border-red-600'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-[#cbd5e1] shadow-xs"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="text-xs font-sans">{c.name}</span>
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
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
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

              {/* Quantity Selector */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-mono font-bold uppercase text-[#0f172a]">
                  Quantity:
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-xl bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-3 py-1.5 text-sm text-[#64748b] hover:text-[#0f172a] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      disabled={quantity <= 1}
                    >
                      -
                    </button>
                    <span className="px-4 text-xs font-mono font-bold text-[#0f172a]">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-3 py-1.5 text-sm text-[#64748b] hover:text-[#0f172a] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs font-mono text-[#64748b]">
                    {formatPrice(unitPrice, currentCurrency)} each
                  </span>
                </div>
              </div>

              {/* Action Buttons: Add to Bag + Wishlist */}
              <div className="pt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    id="modal-add-to-cart-btn"
                    type="button"
                    onClick={handleAdd}
                    disabled={!isAvailable}
                    className={`flex-1 py-4 px-6 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                      !isAvailable
                        ? 'bg-slate-100 text-[#64748b] border border-[#e2e8f0] cursor-not-allowed'
                        : isAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 hover:bg-[#b91c1c] text-white'
                    }`}
                  >
                    {!isAvailable ? (
                      <span>Unavailable</span>
                    ) : isAdded ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Added To Your Bag!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        <span>
                          Add to Bag • {formatPrice(totalAmount, currentCurrency)}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleWishlist(product)}
                    className={`p-4 rounded-xl border transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-reduce:transition-none ${
                      isWishlisted
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a] hover:border-red-600'
                    }`}
                    aria-label="Wishlist item"
                  >
                    <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current text-white' : ''}`} />
                  </button>
                </div>

                {/* Trust Seal */}
                <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center gap-2 text-xs text-[#64748b] font-mono shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>South Africa Dispatch • Authentic Sanelow Merch</span>
                </div>
              </div>

              {/* Description & Features */}
              <div className="pt-4 border-t border-[#e2e8f0] space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase text-[#0f172a]">
                  Product Description
                </h4>
                <div className="space-y-3 text-xs text-[#334155] leading-relaxed max-w-prose">
                  {descriptionSections.map((section, sIdx) => {
                    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
                    const isList = lines.length > 1 && lines.slice(1).every((l) => l.startsWith('-') || l.startsWith('•'));

                    if (isList) {
                      return (
                        <div key={sIdx} className="space-y-1.5">
                          <p className="font-semibold text-[#0f172a]">{lines[0]}</p>
                          <ul className="space-y-1 pl-4 list-disc marker:text-red-600 text-[11px] text-[#475569]">
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

                {Boolean(product.features && product.features.length > 0) && (
                  <ul className="space-y-1 pt-2">
                    {product.features.map((feat, idx) => (
                      <li key={idx} className="text-xs text-[#64748b] flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
