import { useState, useEffect } from "react";
import { menuItems, menuCategories, businessHours, contactInfo } from "@/mocks/menuData";
import Navbar from "@/components/feature/Navbar";
import Footer from "@/components/feature/Footer";

export default function SobrePage() {
  const [activeTab, setActiveTab] = useState("historia");
  const [happyClients, setHappyClients] = useState(0);

  useEffect(() => {
    const startDate = new Date("2026-06-01");
    const now = new Date();
    const daysSinceOpen = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const baseClients = daysSinceOpen * 18 + 42;
    setHappyClients(baseClients);

    const interval = setInterval(() => {
      setHappyClients((prev) => prev + 1);
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: "historia", label: "Nossa História", icon: "ri-book-open-line" },
    // Desabilitado por enquanto — { id: "ambiente", label: "O Ambiente", icon: "ri-store-3-line" },
    { id: "equipe", label: "Equipe", icon: "ri-team-line" },
    { id: "diferenciais", label: "Diferenciais", icon: "ri-star-line" },
  ];

  return (
    <div className="min-h-screen bg-np-wood-50">
      <Navbar />

      {/* Hero */}
      <div className="relative bg-np-purple-900 text-white py-20 md:py-28">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://readdy.ai/api/search-image?query=Elegant%20cozy%20bistro%20interior%20warm%20ambient%20lighting%20wooden%20furniture%20artisanal%20coffee%20bar%20with%20exposed%20brick%20walls%20vintage%20decor%20warm%20tones%20sophisticated%20atmosphere%20professional%20photography&width=1400&height=600&seq=sobre-hero&orientation=landscape"
            alt="NP Empório"
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-np-purple-900/60 via-np-purple-900/40 to-np-purple-900/80"></div>
        </div>
        <div className="relative w-full px-4 sm:px-6 lg:px-12 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-np-gold-400 mb-4">
            Sobre a NP Empório
          </h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto">
            Muito mais que uma cafeteria. Um espaço de encontro, sabor e experiências memoráveis no coração de Salvador.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="w-full px-4 sm:px-6 lg:px-12 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 overflow-x-auto mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-np-purple-700 text-white"
                    : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
                }`}
              >
                <i className={`${tab.icon} mr-1`}></i>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-np-wood-200 p-6 md:p-8">
            {activeTab === "historia" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div>
                    <h2 className="font-display text-2xl text-np-purple-900 mb-4">
                      Uma História de Sabor Feito na Hora
                    </h2>
                    <p className="text-np-purple-700 text-sm leading-relaxed mb-4">
                      A NP Empório nasceu da paixão por transformar ingredientes simples em experiências memoráveis. Mais do que servir refeições, queremos proporcionar momentos especiais através de sabores preparados com cuidado, qualidade e dedicação.
                    </p>
                    <p className="text-np-purple-700 text-sm leading-relaxed mb-4">
                      Nosso grande diferencial está na experiência ao vivo. Aqui, as massas são preparadas na hora, garantindo frescor, aroma e sabor em cada prato. Cada receita é finalizada com atenção aos detalhes, valorizando o preparo artesanal e a autenticidade da boa gastronomia.
                    </p>
                    <p className="text-np-purple-700 text-sm leading-relaxed mb-4">
                      Além das massas, nossas famosas torres de batata frita conquistam quem busca uma refeição saborosa para compartilhar entre amigos, familiares ou simplesmente aproveitar um momento especial.
                    </p>
                    <p className="text-np-purple-700 text-sm leading-relaxed mb-4">
                      Localizada em Sussuarana Velha, Salvador, a NP Empório foi criada para ser um espaço acolhedor, onde boa comida, cafés selecionados e um ambiente agradável se encontram para tornar cada visita única.
                    </p>
                    <p className="text-np-purple-700 text-sm leading-relaxed mb-4">
                      Mais do que um restaurante, somos um ponto de encontro para quem aprecia sabor, convivência e experiências que ficam na memória.
                    </p>
                    <p className="text-np-purple-700 text-sm leading-relaxed">
                      E essa história está apenas começando. Em breve, a NP Empório trará novas experiências gastronômicas e uma seleção especial de cafés, ampliando ainda mais as possibilidades para quem deseja descobrir novos sabores e viver momentos inesquecíveis conosco.
                    </p>
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <img
                      src="https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/9adfc951beb88e185213e2ab60954b10.png"
                      alt="Interior NP Empório"
                      className="w-full h-64 md:h-80 object-cover"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-np-wood-200">
                  <div className="text-center p-4 bg-np-wood-50 rounded-lg">
                    <i className="ri-calendar-line text-3xl text-np-purple-500 mb-2 block"></i>
                    <p className="font-bold text-np-purple-900">Desde 2026</p>
                    <p className="text-xs text-np-purple-500">Servindo Salvador</p>
                  </div>
                  <div className="text-center p-4 bg-np-wood-50 rounded-lg">
                    <i className="ri-heart-line text-3xl text-np-red mb-2 block"></i>
                    <p className="font-bold text-np-purple-900">{happyClients.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-np-purple-500">Clientes felizes</p>
                  </div>
                  <div className="text-center p-4 bg-np-wood-50 rounded-lg">
                    <i className="ri-restaurant-line text-3xl text-np-green-600 mb-2 block"></i>
                    <p className="font-bold text-np-purple-900">100% Artesanal</p>
                    <p className="text-xs text-np-purple-500">Massas feitas na hora</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ambiente" && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl text-np-purple-900 mb-4">
                  Um Espaço Pensado em Cada Detalhe
                </h2>
                <p className="text-np-purple-700 text-sm leading-relaxed mb-6">
                  O ambiente da NP Empório foi cuidadosamente projetado para transmitir aconchego e sofisticação. Com elementos de madeira, iluminação acolhedora e um toque de rusticidade moderna, criamos o cenário perfeito para qualquer ocasião.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl overflow-hidden">
                    <img
                      src="https://readdy.ai/api/search-image?query=Cozy%20cafe%20interior%20warm%20ambient%20lighting%20comfortable%20seating%20wooden%20furniture%20plants%20exposed%20brick%20elegant%20minimalist%20design%20professional%20interior%20photography&width=800&height=600&seq=sobre-amb1&orientation=landscape"
                      alt="Ambiente interno"
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-3 bg-white">
                      <p className="text-sm font-medium text-np-purple-800">Sala Principal</p>
                      <p className="text-xs text-np-purple-500">Aconchegante e sofisticada</p>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <img
                      src="https://readdy.ai/api/search-image?query=Elegant%20outdoor%20cafe%20terrace%20with%20warm%20lighting%20string%20lights%20wooden%20furniture%20green%20plants%20cozy%20evening%20atmosphere%20professional%20photography&width=800&height=600&seq=sobre-amb2&orientation=landscape"
                      alt="Área externa"
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-3 bg-white">
                      <p className="text-sm font-medium text-np-purple-800">Área Externa</p>
                      <p className="text-xs text-np-purple-500">Perfeita para tardes ensolaradas</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "equipe" && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl text-np-purple-900 mb-4">
                  Quem Faz Acontecer
                </h2>
                <p className="text-np-purple-700 text-sm leading-relaxed mb-6">
                  Atrás de cada prato, cada café e cada sorriso, existe uma equipe dedicada e apaixonada pelo que faz. Cada pessoa aqui é peça essencial pra tornar sua experiência na NP Empório inesquecível.
                </p>
                <div className="rounded-xl overflow-hidden border border-np-wood-200 -mx-2 md:mx-0"
                >
                  <img
                    src="https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/b880ce470f5cfd1c60b49dc1e7651011.png"
                    alt="Equipe NP Empório"
                    className="w-full h-[320px] sm:h-[420px] md:h-[520px] lg:h-[600px] object-cover object-top"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                  {[
                    {
                      name: "Isabel",
                      role: "Fundador & Chef",
                      desc: "Alma da NP Empório. É ele quem criou cada receita do cardápio e garante que as massas saiam sempre no ponto perfeito, com aquele toque artesanal que só quem ama cozinhar consegue entregar.",
                      img: "https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/41009960411d495c602c72cdd4ba237c.png"
                    },
                    {
                      name: "JN",
                      role: "Fundador",
                      desc: "Visão estratégica e paixão por hospitalidade. Cuida de cada detalhe da operação pra que o negócio funcione como uma orquestra afinada e cada cliente se sinta em casa.",
                      img: "https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/ee11a9f78638c214092c21f2be8486cf.png"
                    },
                    {
                      name: "Bárbara",
                      role: "Atendimento & Salão",
                      desc: "O sorriso que recebe você na porta. Cuida de cada detalhe do salão pra que sua visita seja sempre especial e você saia com vontade de voltar no dia seguinte.",
                      img: "https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/027f3669967e3d8f0c6d5246d5c7f1df.png"
                    },
                    {
                      name: "KC",
                      role: "Tecnologia & Sistemas",
                      desc: "Faz a mágica dos bastidores. Cuida de toda a parte digital — do app de pedidos ao sistema de delivery — pra tecnologia nunca atrapalhar sua experiência.",
                      img: "https://static.readdy.ai/image/b5331a6e446c7fc2f1e94a6602373682/5ff6327fcff49f7f8e61f60620920f1e.png"
                    },
                  ].map((member, idx) => (
                    <div key={idx} className="bg-np-wood-50 rounded-xl p-5 text-center hover:bg-np-wood-100 transition-colors cursor-default">
                      <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden border-2 border-np-wood-200">
                        <img
                          src={member.img}
                          alt={member.name}
                          className="w-full h-full object-cover object-top"
                        />
                      </div>
                      <p className="font-semibold text-np-purple-900 text-sm">{member.name}</p>
                      <p className="text-xs font-medium text-np-green-700 mt-0.5">{member.role}</p>
                      <p className="text-xs text-np-purple-500 mt-2 leading-relaxed">{member.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "diferenciais" && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl text-np-purple-900 mb-4">
                  O que nos Torna Especiais
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      title: "Macarrão ao Vivo",
                      desc: "Massa artesanal preparada na hora com máquina italiana tradicional.",
                      icon: "ri-bowl-line",
                    },
                    {
                      title: "Cafés Especiais",
                      desc: "Blend exclusivo da casa com grãos selecionados e preparo artesanal.",
                      icon: "ri-cup-line",
                      comingSoon: true,
                    },
                    {
                      title: "Brunch Completo",
                      desc: "Em breve: experiência gastronômica única aos finais de semana com variedade de quitutes.",
                      icon: "ri-sun-line",
                      comingSoon: true,
                    },
                    {
                      title: "Café com Prosa",
                      desc: "Em breve: encontro para amantes de café com degustação e bate-papo acolhedor.",
                      icon: "ri-chat-smile-line",
                      comingSoon: true,
                    },
                    {
                      title: "Sistema de Fidelidade",
                      desc: "NP Lovers: acumule pontos e troque por recompensas exclusivas.",
                      icon: "ri-vip-crown-line",
                    },
                    {
                      title: "Delivery Premium",
                      desc: "Seus pratos favoritos entregues com qualidade e rapidez em Salvador.",
                      icon: "ri-truck-line",
                    },
                  ].map((diff, idx) => (
                    <div key={idx} className="flex gap-4 bg-np-wood-50 rounded-lg p-4 relative">
                      <div className="w-12 h-12 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i className={`${diff.icon} text-xl text-np-purple-600`}></i>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-np-purple-900 text-sm">{diff.title}</p>
                          {diff.comingSoon && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-np-gold-400/20 text-np-gold-600 border border-np-gold-400/30 whitespace-nowrap">
                              Em breve
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-np-purple-500 mt-1">{diff.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact & Hours */}
      <div className="w-full px-4 sm:px-6 lg:px-12 py-12 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-lg text-np-purple-900 mb-4">
                <i className="ri-map-pin-line mr-2 text-np-green-600"></i>
                Localização
              </h3>
              <p className="text-sm text-np-purple-700 mb-2">{contactInfo.address}</p>
              <p className="text-sm text-np-purple-600">
                <i className="ri-whatsapp-line mr-1 text-np-green-500"></i>
                WhatsApp: {contactInfo.phone}
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg text-np-purple-900 mb-4">
                <i className="ri-time-line mr-2 text-np-green-600"></i>
                Horário de Funcionamento
              </h3>
              <div className="space-y-1">
                {businessHours.map((bh, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-np-purple-700">{bh.day}</span>
                    <span className={`font-medium ${bh.hours === 'Fechado' ? 'text-red-500' : 'text-np-purple-900'}`}>
                      {bh.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}