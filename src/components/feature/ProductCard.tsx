import { Link } from 'react-router-dom';
import type { Product } from '@/hooks/useProducts';

interface ProductCardProps {
  item: Product;
  variant?: 'full' | 'compact';
}

export default function ProductCard({ item, variant = 'full' }: ProductCardProps) {
  const hasRating = item.rating && item.rating > 0;
  const isCompactVariant = variant === 'compact';

  const fullStars = Math.floor(item.rating || 0);
  const fraction = (item.rating || 0) - fullStars;
  const starWidths = Array.from({ length: 5 }, (_, i) => {
    if (i < fullStars) return '100%';
    if (i === fullStars && fraction > 0) return `${Math.round(fraction * 100)}%`;
    return '0%';
  });

  return (
    <div className={`group bg-white rounded-xl border border-np-wood-200 overflow-hidden hover:shadow-lg transition-all duration-300 h-full flex flex-col ${item.soldOut ? 'opacity-75' : ''}`}>
      <div className="relative overflow-hidden h-[220px] bg-white flex-shrink-0">
        <img
          src={item.image}
          alt={item.name}
          className={`w-full h-full object-cover object-center transition-transform duration-500 ${!item.soldOut ? 'group-hover:scale-105' : 'grayscale'}`}
        />

        {item.soldOut && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="bg-white text-red-600 text-sm font-bold px-4 py-2 rounded-full shadow">
              ESGOTADO
            </span>
          </div>
        )}

        {item.featured && !item.soldOut && (
          <span className="absolute top-3 left-3 bg-np-gold-500 text-np-purple-900 text-xs font-bold px-3 py-1 rounded-full">
            <i className="ri-star-line mr-1"></i>
            Destaque
          </span>
        )}
      </div>

      <div className={`${isCompactVariant ? 'p-4' : 'p-5'} flex flex-col flex-1`}>
        <div className="flex items-start justify-between mb-2 gap-3">
          <h3 className="font-display text-lg font-bold text-np-purple-900 group-hover:text-np-purple-700 transition-colors leading-tight">
            {item.name}
          </h3>

          <span className="font-display font-bold text-lg whitespace-nowrap text-np-purple-700">
            {item.priceFormatted}
          </span>
        </div>

        <p className="text-sm text-np-purple-600 leading-relaxed mb-3 line-clamp-3 min-h-[63px]">
          {item.description}
        </p>

        {hasRating ? (
          <div className="flex items-center gap-1.5 mb-4 min-h-[20px]">
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
        ) : (
          <div className="mb-4 min-h-[20px]"></div>
        )}

        <div className="flex gap-2 mt-auto">
          {item.soldOut ? (
            <button
              type="button"
              disabled
              className={`flex-1 text-center rounded-lg border border-gray-300 text-gray-400 bg-gray-100 font-medium cursor-not-allowed ${
                isCompactVariant ? 'text-xs py-1.5' : 'text-sm py-2.5'
              }`}
            >
              <i className="ri-forbid-2-line mr-1"></i>
              Indisponível
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}