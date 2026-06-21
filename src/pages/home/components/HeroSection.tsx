import { Link } from 'react-router-dom';

const HeroSection = () => {
  return (
    <section className="relative min-h-[600px] md:h-[700px] w-full overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/84e3b7e478a175cb882a10eab3a36b7e.png"
          alt="NP Empório - Ambiente acolhedor"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[600px] md:h-[700px] px-4 text-center">
        <div className="animate-fade-in-up">
          <span className="inline-block bg-np-gold-500/20 backdrop-blur-sm text-np-gold-300 px-4 py-1.5 rounded-full text-sm font-body font-medium mb-6 border border-np-gold-500/30">
            Massas Artesanais & Cafés Especiais
          </span>
        </div>

        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-white font-bold mb-4 tracking-tight leading-tight">
          <span className="font-['Pacifico']">NP</span> Empório
        </h1>

        <p className="font-display text-xl md:text-2xl text-white/90 mb-2 font-medium italic">
          Massas & Variedades
        </p>

        <p className="font-body text-base md:text-lg text-white/70 max-w-xl mb-10 leading-relaxed">
          Uma experiência gastronômica única em Salvador. Massas frescas preparadas
          na hora, cafés selecionados e um ambiente acolhedor que te faz sentir em casa.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 flex-wrap justify-center">
          <Link
            to="/pedidos"
            className="bg-np-purple-600 hover:bg-np-purple-700 text-white px-6 py-3 rounded-md font-body font-semibold text-sm transition-all hover:scale-105 whitespace-nowrap"
          >
            <i className="ri-restaurant-line mr-2"></i>
            Pedir na Mesa
          </Link>
          <Link
            to="/delivery"
            className="bg-np-green-600 hover:bg-np-green-700 text-white px-6 py-3 rounded-md font-body font-semibold text-sm transition-all hover:scale-105 whitespace-nowrap"
          >
            <i className="ri-truck-line mr-2"></i>
            Delivery
          </Link>
          <Link
            to="/reservas"
            className="bg-np-gold-500 hover:bg-np-gold-600 text-white px-6 py-3 rounded-md font-body font-semibold text-sm transition-all hover:scale-105 whitespace-nowrap"
          >
            Reservar
          </Link>
          <Link
            to="/cardapio"
            className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white border border-white/30 px-6 py-3 rounded-md font-body font-semibold text-sm transition-all hover:scale-105 whitespace-nowrap"
          >
            Cardápio
          </Link>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
};

export default HeroSection;