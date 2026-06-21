import { Link } from "react-router-dom";
import { featuredReservations } from "../../../mocks/menuData";

const CTAReservas = () => {
  return (
    <section className="pt-10 md:pt-12 pb-16 md:pb-20 bg-np-purple-900">
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="text-np-gold-400 font-body text-sm font-semibold tracking-wider uppercase">
            Experiências Especiais
          </span>
          <h2 className="font-display text-3xl md:text-5xl text-white font-bold mt-3 mb-4">
            Reserve sua Experiência
          </h2>
          <p className="font-body text-white/70 max-w-2xl mx-auto text-base">
            Brunch e Café com Prosa — momentos especiais que preparamos com
            carinho para você.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
          {featuredReservations.map((item) => (
            <div
              key={item.id}
              className="relative bg-np-purple-800/50 backdrop-blur-sm rounded-2xl overflow-hidden border border-np-purple-700/50 hover:border-np-gold-500/50 transition-all duration-300"
            >
              {item.comingSoon && (
                <div className="absolute top-4 left-4 z-10">
                  <span className="px-3 py-1 text-xs font-bold rounded-full bg-np-gold-400/90 text-np-purple-900 border border-np-gold-500 whitespace-nowrap">
                    Em breve
                  </span>
                </div>
              )}
              <div className="h-56 overflow-hidden">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-6 md:p-8">
                <h3 className="font-display text-2xl font-bold text-white mb-3">
                  {item.title}
                </h3>
                <p className="font-body text-white/70 text-sm leading-relaxed mb-6">
                  {item.description}
                </p>
                {item.comingSoon ? (
                  <span className="inline-flex items-center gap-2 bg-np-purple-700/60 text-white/50 px-6 py-3 rounded-md font-body font-semibold text-sm cursor-default">
                    Em breve
                    <i className="ri-time-line" />
                  </span>
                ) : (
                  <Link
                    to="/reservas"
                    className="inline-flex items-center gap-2 bg-np-gold-500 hover:bg-np-gold-600 text-white px-6 py-3 rounded-md font-body font-semibold text-sm transition-colors"
                  >
                    Reservar Agora
                    <i className="ri-arrow-right-line" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CTAReservas;