import React, { useMemo } from 'react';
import { ChevronRight, Layers, ArrowLeft } from 'lucide-react';
import { Product, ShopifyCollection, ShopifyVariant } from '../types';
import { ProductCard } from './ProductCard';

export interface CollectionPageProps {
  collection: ShopifyCollection;
  currency: string;
  isWishlisted: (id: string) => boolean;
  onToggleWishlist: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onAddToCart?: (product: Product, variant: ShopifyVariant) => void;
  onBackToHome: () => void;
}

export const CollectionPage: React.FC<CollectionPageProps> = ({
  collection,
  currency,
  isWishlisted,
  onToggleWishlist,
  onQuickView,
  onAddToCart,
  onBackToHome,
}) => {
  const collectionProducts = useMemo(() => {
    return collection.products || [];
  }, [collection]);

  return (
    <div className="min-h-screen bg-zinc-50 text-black pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation with crawlable links */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 font-mono">
            <li>
              <a
                href="/"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onBackToHome();
                  }
                }}
                className="hover:text-red-600 transition-colors"
              >
                HOME
              </a>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </li>
            <li>
              <a
                href="/#catalogue"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onBackToHome();
                  }
                }}
                className="hover:text-red-600 transition-colors"
              >
                CATALOGUE
              </a>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </li>
            <li className="text-black font-bold uppercase truncate" aria-current="page">
              {collection.title}
            </li>
          </ol>
        </nav>

        {/* Back Link */}
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-xs uppercase font-mono font-bold tracking-wider text-zinc-600 hover:text-black mb-6 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogue</span>
        </button>

        {/* Header */}
        <div className="mb-10 border-b border-zinc-200 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-zinc-800 text-xs font-mono mb-4">
            <Layers className="w-3.5 h-3.5 text-red-600" />
            <span>COLLECTION • {collectionProducts.length} PIECES</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-black mb-4">
            {collection.title}
          </h1>
          {collection.description && (
            <p className="text-zinc-600 max-w-2xl text-sm sm:text-base leading-relaxed">
              {collection.description}
            </p>
          )}
        </div>

        {/* Products Grid */}
        {collectionProducts.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 font-mono text-sm">
            No pieces found in this collection.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {collectionProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                onSelect={(p) => onQuickView(p)}
                onQuickView={onQuickView}
                onAddToCart={onAddToCart ? (prod, variant) => onAddToCart(prod, variant) : undefined}
                onToggleWishlist={onToggleWishlist}
                isWishlisted={isWishlisted(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionPage;
