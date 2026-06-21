import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import ProductCard from "@/components/feature/ProductCard";

const MenuSection = () => {
  const { products, categories, loading } = useProducts();
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      const torresCat = categories.find(
        (cat) => cat.id === 'torres' && products.some((p) => p.category === 'torres')
      );
      if (torresCat) {
        setActiveCategory(torresCat.id);
        return;
      }
      const firstWithProducts = categories.find((cat) =>
        products.some((p) => p.category === cat.id)
      );
      if (firstWithProducts) {
        setActiveCategory(firstWithProducts.id);
      } else {
        setActiveCategory(categories[0]?.id || "");
      }
    }
  }, [categories, products, activeCategory]);

  const filteredItems = products.filter(
    (item) => item.category === activeCategory
  );

  if (loading) {
    return (
      <section className="py-16 md:py-24 bg-white">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
          <p className="text-np-purple-500 mt-2">Carregando cardápio...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="text-np-purple-600 font-body text-sm font-semibold tracking-wider uppercase">
            Nossos Produtos
          </span>
          <h2 className="font-display text-3xl md:text-5xl text-np-purple-900 font-bold mt-3 mb-4">
            Cardápio
          </h2>
          <p className="font-body text-gray-600 max-w-2xl mx-auto text-base">
            Ingredientes frescos, preparo artesanal e muito amor em cada prato.
            Descubra o sabor único da NP Empório.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <Link
            to="/pedidos"
            className="inline-flex items-center gap-2 bg-np-purple-700 hover:bg-np-purple-800 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            <i className="ri-restaurant-line"></i>
            Pedir na Mesa
          </Link>
          <Link
            to="/delivery"
            className="inline-flex items-center gap-2 bg-np-green-600 hover:bg-np-green-700 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            <i className="ri-truck-line"></i>
            Delivery
          </Link>
          <Link
            to="/cardapio"
            className="inline-flex items-center gap-2 bg-np-wood-100 hover:bg-np-wood-200 text-np-purple-700 px-5 py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            <i className="ri-book-open-line"></i>
            Ver Cardápio Completo
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-12">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat.id
                  ? "bg-np-purple-600 text-white shadow-md"
                  : "bg-np-purple-50 text-np-purple-700 hover:bg-np-purple-100"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center">
                <i className={`${cat.icon}`} />
              </span>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {filteredItems.map((item) => {
            const isTorres = item.category === 'torres';
            const isDoces = item.category === 'doces';
            const isCompact = isTorres || isDoces;
            return (
              <ProductCard key={item.id} item={item} variant={isCompact ? 'compact' : 'full'} />
            );
          })}
        </div>

        {filteredItems.length === 0 && activeCategory && (
          <div className="text-center py-12 text-np-purple-400">
            <i className="ri-restaurant-line text-4xl mb-3 block"></i>
            <p className="text-sm text-np-purple-600">
              Nenhum produto nesta categoria no momento
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default MenuSection;