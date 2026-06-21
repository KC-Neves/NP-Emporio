import { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import WhatsAppButton from '@/components/feature/WhatsAppButton';
import ProductCard from '@/components/feature/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { Link } from 'react-router-dom';

export default function CardapioPage() {
  const { products, categories, loading } = useProducts();
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const hasAutoSelected = useRef(false);

  const effectiveCategory = useMemo(() => {
    if (activeCategory) return activeCategory;
    if (categories.length === 0 || products.length === 0) return '';
    const firstWithProducts = categories.find((cat) =>
      products.some((p) => p.category === cat.id && p.active)
    );
    return firstWithProducts?.id || categories[0]?.id || '';
  }, [activeCategory, categories, products]);

  useEffect(() => {
    if (!loading && categories.length > 0 && !hasAutoSelected.current) {
      hasAutoSelected.current = true;
      const validCategoryIds = new Set(categories.map((c) => c.id));
      if (!activeCategory || !validCategoryIds.has(activeCategory)) {
        const torresCat = categories.find(
          (cat) => cat.id === 'torres' && products.some((p) => p.category === 'torres' && p.active)
        );
        if (torresCat) {
          setActiveCategory(torresCat.id);
        } else {
          const firstWithProducts = categories.find((cat) =>
            products.some((p) => p.category === cat.id && p.active)
          );
          if (firstWithProducts) {
            setActiveCategory(firstWithProducts.id);
          } else {
            setActiveCategory(categories[0].id);
          }
        }
      }
    }
  }, [loading, categories, products]);

  const filteredItems = products.filter((item) => {
    const matchesCategory = effectiveCategory ? item.category === effectiveCategory : true;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-np-wood-50">
      <Navbar />

      <div className="bg-np-purple-900 text-white pt-24 pb-12 md:pt-28 md:pb-16">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="text-white/70 hover:text-white transition-colors text-sm">
              <i className="ri-arrow-left-line mr-1"></i>
              Voltar
            </Link>
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-np-gold-400 mb-3">
            Nosso Cardápio
          </h1>
          <p className="text-white/80 text-sm md:text-base max-w-xl">
            Descubra nossas delícias artesanais, desde massas feitas ao vivo até cafés especiais selecionados
          </p>

          <div className="mt-6 max-w-md">
            <div className="relative">
              <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-np-purple-400"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar no cardápio..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-np-gold-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        {loading ? (
          <div className="text-center py-16">
            <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
            <p className="text-np-purple-500 mt-2">Carregando cardápio...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-8 justify-center">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    effectiveCategory === cat.id
                      ? 'bg-np-purple-700 text-white shadow-md'
                      : 'bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400'
                  }`}
                >
                  <i className={`${cat.icon} mr-1.5`}></i>
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto">
              <Link
                to="/pedidos"
                className="bg-np-purple-700 hover:bg-np-purple-800 text-white rounded-xl p-5 flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-restaurant-line text-xl"></i>
                </div>
                <div>
                  <h3 className="font-display font-bold">Pedir na Mesa</h3>
                  <p className="text-white/70 text-xs mt-0.5">Escolha sua mesa e peça pelo celular</p>
                </div>
                <i className="ri-arrow-right-line ml-auto"></i>
              </Link>
              <Link
                to="/delivery"
                className="bg-np-green-600 hover:bg-np-green-700 text-white rounded-xl p-5 flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-truck-line text-xl"></i>
                </div>
                <div>
                  <h3 className="font-display font-bold">Delivery</h3>
                  <p className="text-white/70 text-xs mt-0.5">Receba em casa com conforto</p>
                </div>
                <i className="ri-arrow-right-line ml-auto"></i>
              </Link>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-np-purple-400">
                <i className="ri-search-line text-4xl mb-3 block"></i>
                <p className="text-sm">
                  {products.length === 0
                    ? "Nenhum produto cadastrado no cardápio"
                    : searchQuery
                    ? "Nenhum item encontrado para esta busca"
                    : "Nenhum item encontrado nesta categoria"}
                </p>
                {(searchQuery || activeCategory) && products.length > 0 && (
                  <button
                    onClick={() => { setSearchQuery(''); setActiveCategory(''); hasAutoSelected.current = false; }}
                    className="text-np-purple-600 hover:underline text-sm mt-2"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                  <ProductCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}