import { Link } from 'react-router-dom';
import type { Product } from '@/hooks/useProducts';

interface ProductCardProps {
  item: Product;
  variant?: 'full' | 'compact';
}

export default function ProductCard({ item, variant = 'full' }: ProductCardProps) {
  const isBeverage = item.category === 'bebidas';
  const isTorres = item.category === 'torres';
  const isDoces = item.category === 'doces';
  const isCompact = isTorres || isDoces;
  const hasRating = item.rating && item.rating > 0;
  const isCompactVariant = variant === 'compact';

  const fullStars = Math.floor(item.rating || 0);
  const fraction = (item.rating || 0) - fullStars;
  const starWidths = Array.from({ length: 5 }, (_, i) => {
    if (i < fullStars) return '100%';
    if (i === fullStars && fraction > 0) return `${Math.round(fraction * 100)}%`;
    return '0%';
  });

  const imageContainerClasses = isBeverage
    ? 'relative overflow-hidden h-[260px] bg-white'
    : 'relative overflow-hidden h-[200px] bg-white';

  const imageClasses = 'w-full h-full object-cover object-center';

  return (
    <div className="group bg-white rounded-xl border border-np-wood-200 overflow-hidden hover:shadow-lg transition-all duration-300">
      <div className={imageContainerClasses}>
        <img
          src={item.image}
          alt={item.name}
          className={`transition-transform duration-500 group-hover:scale-105 ${imageClasses}`}
        />
        {item.featured && (
          <span className="absolute top-3 left-3 bg-np-gold-500 text-np-purple-900 text-xs font-bold px-3 py-1 rounded-full">
            <i className="ri-star-line mr-1"></i>
            Destaque
          </span>
        )}
      </div>

      <div className={isCompactVariant ? 'p-4' : 'p-5'}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-display text-lg font-bold text-np-purple-900 group-hover:text-np-purple-700 transition-colors">
            {item.name}
          </h3>
          <span className="font-display font-bold text-lg whitespace-nowrap ml-2 text-np-purple-700">
            {item.priceFormatted}
          </span>
        </div>
        <p className="text-sm text-np-purple-600 leading-relaxed mb-2">
          {item.description}
        </p>

        {hasRating && (
          <div className="flex items-center gap-1.5 mb-3">
            <div className="flex items-center gap-0.5">
              {starWidths.map((w, i) => (
                <div key={i} className="relative w-4 h-4 flex items-center justify-center">
                  <i className="ri-star-fill text-np-wood-300 text-sm absolute inset-0 flex items-center justify-center"></i>
                  <div className="overflow-hidden absolute inset-0" style={{ width: w }}>
                    <i className="ri-star-fill text-np-gold-500 text-sm absolute inset-0 flex items-center justify-center"></i>
                  </div>
                </div>
              ))}
            </div>
            <span className="text-xs font-medium text-np-purple-600">
              {item.rating?.toFixed(1)}
            </span>
            <span className="text-xs text-np-purple-400">
              ({item.ratingCount})
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            to="/pedidos"
            className={`flex-1 text-center transition-colors whitespace-nowrap rounded-lg border border-np-purple-300 text-np-purple-700 hover:bg-np-purple-50 font-medium ${
              isCompactVariant ? 'text-xs py-1.5' : 'text-sm py-2.5'
            }`}
          >
            <i className="ri-restaurant-line mr-1"></i>
            Mesa
          </Link>
          <Link
            to="/delivery"
            className={`flex-1 text-center transition-colors whitespace-nowrap rounded-lg border border-np-green-300 text-np-green-700 hover:bg-np-green-50 font-medium ${
              isCompactVariant ? 'text-xs py-1.5' : 'text-sm py-2.5'
            }`}
          >
            <i className="ri-truck-line mr-1"></i>
            Delivery
          </Link>
        </div>
      </div>
    </div>
  );
}