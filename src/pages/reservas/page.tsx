import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useReservations } from "@/hooks/useReservations";
import { useLoyalty } from "@/hooks/useLoyalty";
import { useGlobalToast } from "@/hooks/useToast";
import Footer from "@/components/feature/Footer";
import Navbar from "@/components/feature/Navbar";

const RESERVATION_TYPES = [
  { id: "brunch", label: "Brunch", icon: "ri-sun-line", description: "Experiência gastronômica completa aos fins de semana" },
  { id: "cafe_com_prosa", label: "Café com Prosa", icon: "ri-chat-smile-line", description: "Encontro especial para amantes de café" },
  { id: "aniversario", label: "Aniversário Pequeno", icon: "ri-cake-3-line", description: "Celebração íntima para até 10 pessoas" },
  { id: "mesa_comum", label: "Mesa Comum", icon: "ri-armchair-line", description: "Reserva de mesa para almoço ou jantar" },
];

const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
  "20:00", "21:00", "22:00", "23:00",
];

export default function ReservasPage() {
  const [selectedType, setSelectedType] = useState("brunch");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    date: "",
    time: "",
    guests: 2,
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const { user } = useAuth();
  const { addReservation } = useReservations();
  const { addPoints } = useLoyalty(user?.id);
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000) => {
    const id = `reservas-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration });
  };

  // Pre-fill from user profile or localStorage
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: user.full_name || prev.name,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
    } else {
      try {
        const savedName = localStorage.getItem("np_customer_name");
        const savedPhone = localStorage.getItem("np_customer_phone");
        setFormData((prev) => ({
          ...prev,
          name: savedName || prev.name,
          phone: savedPhone || prev.phone,
        }));
      } catch {
        // localStorage indisponível
      }
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.date || !formData.time) {
      addToast("Preencha todos os campos obrigatórios", "warning", 3000);
      return;
    }

    try {
      await addReservation({
        userId: user?.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        reservationType: selectedType as "brunch" | "cafe_com_prosa" | "aniversario" | "mesa_comum",
        date: formData.date,
        time: formData.time,
        guests: formData.guests,
        notes: formData.notes,
      });

      // Salva nome e telefone no localStorage para próximos pedidos
      try {
        const n = formData.name.trim();
        const p = formData.phone.trim();
        if (n) localStorage.setItem("np_customer_name", n);
        if (p) localStorage.setItem("np_customer_phone", p);
      } catch {
        // localStorage indisponível
      }

      if (user) {
        await addPoints(20, `Reserva: ${RESERVATION_TYPES.find((t) => t.id === selectedType)?.label}`);
      }

      addToast("Reserva enviada com sucesso! Entraremos em contato para confirmar.", "success", 5000);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setFormData({
          name: user?.full_name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          date: "",
          time: "",
          guests: 2,
          notes: "",
        });
      }, 4000);
    } catch {
      addToast("Erro ao enviar reserva. Tente novamente.", "error", 4000);
    }
  };

  const currentType = RESERVATION_TYPES.find((t) => t.id === selectedType);

  return (
    <div className="min-h-screen bg-np-wood-50">
      <Navbar />

      {/* Header */}
      <div className="bg-np-purple-900 text-white py-12 md:py-16 mt-16">
        <div className="w-full px-4 sm:px-6 lg:px-12 text-center">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400 mb-3">
            Faça sua Reserva
          </h1>
          <p className="text-white/80 text-sm md:text-base max-w-xl mx-auto">
            Escolha o tipo de experiência e reserve seu lugar na NP Empório
          </p>
        </div>
      </div>

      {/* Reservation Types */}
      <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {RESERVATION_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`text-left rounded-xl border-2 p-5 transition-all ${
                  selectedType === type.id
                    ? "border-np-purple-500 bg-np-purple-50 shadow-md"
                    : "border-np-wood-200 bg-white hover:border-np-purple-300"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      selectedType === type.id
                        ? "bg-np-purple-100 text-np-purple-600"
                        : "bg-np-wood-100 text-np-wood-600"
                    }`}
                  >
                    <i className={`${type.icon} text-lg`}></i>
                  </div>
                  <div>
                    <p
                      className={`font-display font-semibold text-sm md:text-base ${
                        selectedType === type.id ? "text-np-purple-900" : "text-np-purple-800"
                      }`}
                    >
                      {type.label}
                    </p>
                    <p className="text-xs text-np-purple-500">{type.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected Type Info */}
          {currentType && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-6 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <i className={`${currentType.icon} text-2xl text-np-purple-600`}></i>
                <div>
                  <h2 className="font-display text-xl text-np-purple-900">{currentType.label}</h2>
                  <p className="text-sm text-np-purple-500">{currentType.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          {!submitted ? (
            <div className="bg-white rounded-xl border border-np-wood-200 p-6 md:p-8">
              <h3 className="font-display text-lg text-np-purple-900 mb-6">
                <i className="ri-calendar-check-line mr-2 text-np-green-600"></i>
                Detalhes da Reserva
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Seu nome"
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Telefone/WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(71) 99999-9999"
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Data *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Horário *
                  </label>
                  <select
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="">Selecione...</option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-2">
                    Quantidade de Pessoas
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, guests: Math.max(1, prev.guests - 1) }))
                      }
                      className="w-10 h-10 rounded-lg bg-np-wood-100 hover:bg-np-wood-200 text-np-purple-700 flex items-center justify-center text-lg"
                    >
                      <i className="ri-subtract-line"></i>
                    </button>
                    <span className="text-lg font-bold text-np-purple-900 w-8 text-center">
                      {formData.guests}
                    </span>
                    <button
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, guests: Math.min(20, prev.guests + 1) }))
                      }
                      className="w-10 h-10 rounded-lg bg-np-purple-100 hover:bg-np-purple-200 text-np-purple-700 flex items-center justify-center text-lg"
                    >
                      <i className="ri-add-line"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-np-purple-800 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ex: Mesa perto da janela, alergia a glúten, comemoração de aniversário..."
                  maxLength={300}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm resize-none"
                />
                <p className="text-xs text-np-purple-400 mt-1">
                  {formData.notes.length}/300 caracteres
                </p>
              </div>

              {user && (
                <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-np-green-700">
                    <i className="ri-coins-line mr-1 text-np-green-500"></i>
                    Você vai ganhar <strong>20 pontos</strong> por fazer esta reserva!
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
              >
                <i className="ri-calendar-check-line mr-2"></i>
                Confirmar Reserva
              </button>

              <p className="text-xs text-center text-np-purple-500 mt-3">
                Entraremos em contato pelo WhatsApp para confirmar sua reserva.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-np-green-200 p-8 text-center">
              <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-check-double-line text-3xl text-np-green-600"></i>
              </div>
              <h3 className="font-display text-xl text-np-purple-900 mb-2">
                Reserva Enviada!
              </h3>
              <p className="text-np-purple-600 text-sm mb-2">
                {formData.name}, sua reserva para{" "}
                <strong>{RESERVATION_TYPES.find((t) => t.id === selectedType)?.label}</strong>{" "}
                foi enviada.
              </p>
              <p className="text-np-purple-500 text-sm">
                Data: {formData.date} às {formData.time} — {formData.guests} pessoa(s)
              </p>
              {user && (
                <p className="text-np-green-600 text-sm font-medium mt-2">
                  +20 pontos acumulados!
                </p>
              )}
              <p className="text-np-purple-400 text-xs mt-4">
                Entraremos em contato pelo WhatsApp para confirmar.
              </p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}