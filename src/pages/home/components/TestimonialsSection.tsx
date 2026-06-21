import { testimonials } from "@/mocks/menuData";

const TestimonialsSection = () => {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="text-np-purple-600 font-body text-sm font-semibold tracking-wider uppercase">
            Depoimentos
          </span>
          <h2 className="font-display text-3xl md:text-5xl text-np-purple-900 font-bold mt-3 mb-4">
            O que dizem nossos clientes
          </h2>
          <p className="font-body text-gray-600 max-w-2xl mx-auto text-base">
            A opinião de quem já viveu a experiência NP Empório.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="bg-np-purple-50 rounded-2xl p-6 md:p-8 relative"
            >
              <div className="absolute top-6 right-6 text-np-gold-400 text-4xl font-display leading-none">
                "
              </div>
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <i
                    key={i}
                    className={`ri-star-fill text-sm ${i < t.rating ? "text-np-gold-400" : "text-np-wood-200"}`}
                  />
                ))}
              </div>
              <p className="font-body text-gray-700 text-sm leading-relaxed mb-6">
                {t.text}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-np-purple-200 flex items-center justify-center">
                  <span className="font-body text-np-purple-700 text-sm font-bold">
                    {t.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <span className="font-body text-sm font-semibold text-np-purple-900">
                    {t.name}
                  </span>
                  <p className="text-xs text-np-green-600 flex items-center gap-1">
                    <i className="ri-heart-3-line"></i>
                    Recomenda a NP Empório
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;