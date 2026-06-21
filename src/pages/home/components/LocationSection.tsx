import { useState } from "react";
import { businessHours, contactInfo } from "../../../mocks/menuData";

const LocationSection = () => {
  const [showStreetView, setShowStreetView] = useState(false);

  return (
    <section className="py-16 md:py-24 bg-np-purple-50">
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="text-np-purple-600 font-body text-sm font-semibold tracking-wider uppercase">
            Onde Estamos
          </span>
          <h2 className="font-display text-3xl md:text-5xl text-np-purple-900 font-bold mt-3 mb-4">
            Localização e Horários
          </h2>
          <p className="font-body text-gray-600 max-w-2xl mx-auto text-base">
            Venha nos visitar! Estamos esperando por você com o melhor da
            gastronomia artesanal.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-np-purple-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-map-pin-line text-np-purple-600 text-xl" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-np-purple-900 mb-1">
                  Endereço
                </h3>
                <p className="font-body text-gray-600 text-sm leading-relaxed">
                  {contactInfo.address}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-np-green-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-phone-line text-np-green-600 text-xl" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-np-purple-900 mb-1">
                  Telefone
                </h3>
                <p className="font-body text-gray-600 text-sm">
                  (71) 99385-5732
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="font-display text-lg font-bold text-np-purple-900 mb-4 flex items-center gap-2">
                <i className="ri-time-line text-np-gold-500" />
                Horários de Funcionamento
              </h3>
              <div className="space-y-3">
                {businessHours.map((item) => (
                  <div
                    key={item.day}
                    className={`flex items-center justify-between py-2.5 px-4 rounded-lg ${
                      item.hours === "Fechado"
                        ? "bg-gray-50"
                        : "bg-np-purple-50/50"
                    }`}
                  >
                    <span
                      className={`font-body text-sm font-medium ${
                        item.hours === "Fechado"
                          ? "text-gray-400"
                          : "text-np-purple-900"
                      }`}
                    >
                      {item.day}
                    </span>
                    <span
                      className={`font-body text-sm ${
                        item.hours === "Fechado"
                          ? "text-gray-400 font-medium"
                          : "text-np-gold-600 font-semibold"
                      }`}
                    >
                      {item.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden shadow-sm h-full min-h-[400px] relative">
            {!showStreetView ? (
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.5236355406228!2d-38.445089524102484!3d-12.928697387387567!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x7161126c39e19c7%3A0xb191aa26a46d3054!2sIgreja%20Cat%C3%B3lica%20S%C3%A3o%20Miguel%20-%20Sim%C3%B5es%20Filho!5e0!3m2!1spt-BR!2sbr!4v1782060000000"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: "400px" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Como chegar no NP Empório"
                className="rounded-2xl"
              />
            ) : (
              <iframe
                src="https://www.google.com/maps/embed?pb=!4v1782052680413!6m8!1m7!1s4DamSjDqvdFdy3ErsFGajA!2m2!1d-12.93116557281875!2d-38.4425145634597!3f69.67743718245616!4f-10.78652571977804!5f0.7820865974627469"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: "400px" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Street View NP Empório"
                className="rounded-2xl"
              />
            )}

            {/* Botão de alternar */}
            <button
              onClick={() => setShowStreetView(!showStreetView)}
              className="absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur-sm text-np-purple-900 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg border border-np-purple-100 hover:bg-np-purple-50 hover:border-np-purple-200 transition-all duration-200 cursor-pointer flex items-center gap-2 whitespace-nowrap"
            >
              {showStreetView ? (
                <>
                  <i className="ri-arrow-go-back-line text-sm" />
                  Ver trajeto
                </>
              ) : (
                <>
                  <i className="ri-eye-line text-sm" />
                  Ver fachada
                </>
              )}
            </button>

            {/* Indicador do estabelecimento - só aparece no Street View */}
            {showStreetView && (
              <div className="absolute bottom-[28%] right-[35%] z-10 pointer-events-none">
                <div className="relative flex flex-col items-center">
                  <div className="absolute -inset-4 animate-ping rounded-full bg-np-green-500/30"></div>
                  <div className="w-6 h-6 rounded-full bg-np-green-500 border-2 border-white shadow-lg flex items-center justify-center relative z-10">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                  <div className="mt-2 bg-np-purple-900/90 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg border border-white/20">
                    NP Empório
                  </div>
                  <div className="w-0.5 h-3 bg-np-purple-900/90"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LocationSection;