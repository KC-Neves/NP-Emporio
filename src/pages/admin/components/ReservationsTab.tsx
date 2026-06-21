import { useState, useRef } from "react";
import { useReservations } from "@/hooks/useReservations";
import type { Reservation } from "@/hooks/useReservations";
import { useGlobalToast } from "@/hooks/useToast";

const TYPE_LABELS: Record<string, string> = {
  brunch: "Brunch",
  cafe_com_prosa: "Café com Prosa",
  aniversario: "Aniversário",
  mesa_comum: "Mesa Comum",
};

const TYPE_ICONS: Record<string, string> = {
  brunch: "ri-sun-line",
  cafe_com_prosa: "ri-chat-smile-line",
  aniversario: "ri-cake-3-line",
  mesa_comum: "ri-armchair-line",
};

export default function ReservationsTab() {
  const { reservations, loading, addReservation, confirmReservation, cancelReservation, updateReservation, deleteReservation, deleteTestReservations } = useReservations();
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000) => {
    const id = `reservations-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration });
  };
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [editingReservation, setEditingReservation] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    date: "",
    time: "",
    guests: 2,
    notes: "",
  });
  const [detailReservationId, setDetailReservationId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    email: "",
    reservationType: "mesa_comum" as Reservation["reservationType"],
    date: "",
    time: "20:00",
    guests: 2,
    notes: "",
  });

  const filtered = statusFilter === "all"
    ? reservations
    : reservations.filter((r) => r.status === statusFilter);

  const pendingCount = reservations.filter((r) => r.status === "pending").length;
  const confirmedCount = reservations.filter((r) => r.status === "confirmed").length;
  const cancelledCount = reservations.filter((r) => r.status === "cancelled").length;

  const openEdit = (res: Reservation) => {
    setEditingReservation(res.id);
    setEditForm({
      name: res.name,
      phone: res.phone,
      email: res.email,
      date: res.date,
      time: res.time,
      guests: res.guests,
      notes: res.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingReservation) return;
    const { error } = await updateReservation(editingReservation, {
      name: editForm.name,
      phone: editForm.phone,
      email: editForm.email,
      date: editForm.date,
      time: editForm.time,
      guests: editForm.guests,
      notes: editForm.notes,
    });
    if (!error) {
      addToast("Reserva atualizada com sucesso!", "success", 3000);
      setEditingReservation(null);
    } else {
      addToast("Erro ao atualizar reserva", "error", 3000);
    }
  };

  const handleConfirm = async (id: string) => {
    await confirmReservation(id);
    addToast("Reserva confirmada!", "success", 3000);
  };

  const handleCancel = async (id: string) => {
    if (window.confirm("Tem certeza que deseja cancelar esta reserva?")) {
      await cancelReservation(id);
      addToast("Reserva cancelada", "warning", 3000);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE a reserva de ${name}?\n\nEsta ação NÃO pode ser desfeita.`)) {
      const { error } = await deleteReservation(id);
      if (error) {
        addToast(`Erro ao excluir: ${error.message}`, "error", 4000);
      } else {
        addToast("Reserva excluída permanentemente", "success", 3000);
        if (detailReservationId === id) setDetailReservationId(null);
      }
    }
  };

  const handleClearTestReservations = async () => {
    if (window.confirm("Tem certeza que deseja excluir TODAS as reservas de teste (nome contém 'teste')?\n\nEsta ação NÃO pode ser desfeita.")) {
      const { error, deletedCount } = await deleteTestReservations();
      if (error) {
        addToast(`Erro ao limpar testes: ${error.message}`, "error", 4000);
      } else {
        addToast(`${deletedCount} reservas de teste removidas`, "success", 3000);
      }
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      addToast("Preencha o nome do cliente", "warning", 3000);
      return;
    }
    if (!createForm.date) {
      addToast("Selecione a data da reserva", "warning", 3000);
      return;
    }
    try {
      await addReservation({
        name: createForm.name,
        email: createForm.email,
        phone: createForm.phone,
        reservationType: createForm.reservationType,
        date: createForm.date,
        time: createForm.time,
        guests: createForm.guests,
        notes: createForm.notes || undefined,
      });
      addToast("Reserva criada com sucesso!", "success", 3000);
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        phone: "",
        email: "",
        reservationType: "mesa_comum",
        date: "",
        time: "20:00",
        guests: 2,
        notes: "",
      });
    } catch (err: any) {
      addToast(`Erro ao criar reserva: ${err?.message || "Erro desconhecido"}`, "error", 4000);
    }
  };

  const handleWhatsAppNotify = (res: Reservation) => {
    const message = `Olá ${res.name}! Sua reserva para ${TYPE_LABELS[res.reservationType]} na NP Empório foi confirmada. Data: ${res.date} às ${res.time}. Aguardamos você! 🍽️`;
    const phone = res.phone.replace(/\D/g, "");
    const encoded = encodeURIComponent(message);
    const decoded = decodeURIComponent(encoded);
    console.log('[WHATSAPP RESERVA] encode test:', decoded.includes('🍽️') ? '🍽️ OK' : '🍽️ FAIL');
    const url = `https://wa.me/${phone}?text=${encoded}`;
    console.log('[WHATSAPP RESERVA] URL gerada:', url);
    window.open(url, "_blank");
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl text-np-purple-900">
          <i className="ri-calendar-check-line mr-2 text-np-purple-500"></i>
          Gerenciamento de Reservas
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearTestReservations}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-test-tube-line"></i>
            Limpar Testes
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line"></i>
            Criar Reserva
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
          <p className="text-xs text-yellow-600">Pendentes</p>
        </div>
        <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-np-green-700">{confirmedCount}</p>
          <p className="text-xs text-np-green-600">Confirmadas</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{cancelledCount}</p>
          <p className="text-xs text-red-600">Canceladas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto mb-4">
        {[
          { id: "all" as const, label: "Todas", count: reservations.length },
          { id: "pending" as const, label: "Pendentes", count: pendingCount },
          { id: "confirmed" as const, label: "Confirmadas", count: confirmedCount },
          { id: "cancelled" as const, label: "Canceladas", count: cancelledCount },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              statusFilter === f.id
                ? "bg-np-purple-700 text-white"
                : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusFilter === f.id ? "bg-white text-np-purple-700" : "bg-np-purple-100 text-np-purple-700"}`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
          <p className="text-sm text-np-purple-500 mt-2">Carregando reservas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-np-purple-400 bg-white rounded-xl border border-np-wood-200">
          <i className="ri-calendar-line text-4xl mb-3 block"></i>
          <p className="text-sm">Nenhuma reserva encontrada</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-np-purple-50 text-np-purple-800">
                  <th className="text-left px-4 py-3 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-medium">Pessoas</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-np-wood-100">
                {filtered.map((res) => {
                  const isPending = res.status === "pending";
                  return (
                    <tr key={res.id} className={`hover:bg-np-wood-50 ${isPending ? "bg-yellow-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-np-purple-100 rounded-full flex items-center justify-center">
                            <i className={`${TYPE_ICONS[res.reservationType]} text-np-purple-600 text-sm`}></i>
                          </div>
                          <span className="text-sm text-np-purple-800">
                            {TYPE_LABELS[res.reservationType] || res.reservationType}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-np-purple-900">{res.name}</span>
                          <span className="text-xs text-np-purple-500">{res.phone}</span>
                          <span className="text-xs text-np-purple-400">{res.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-np-purple-700">
                        <span className="text-sm">{res.date}</span>
                        <span className="text-xs text-np-purple-500 ml-2">{res.time}</span>
                      </td>
                      <td className="px-4 py-3 text-np-purple-700">
                        <span className="bg-np-wood-100 text-np-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          {res.guests}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            res.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : res.status === "confirmed"
                              ? "bg-np-green-100 text-np-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {res.status === "pending" && "Pendente"}
                          {res.status === "confirmed" && "Confirmada"}
                          {res.status === "cancelled" && "Cancelada"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailReservationId(res.id)}
                            className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                            title="Ver detalhes"
                          >
                            <i className="ri-eye-line"></i>
                          </button>
                          <button
                            onClick={() => openEdit(res)}
                            className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                            title="Editar"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          {res.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleConfirm(res.id)}
                                className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                                title="Confirmar reserva"
                              >
                                <i className="ri-check-line"></i>
                              </button>
                              <button
                                onClick={() => handleCancel(res.id)}
                                className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                title="Cancelar"
                              >
                                <i className="ri-close-line"></i>
                              </button>
                              <button
                                onClick={() => handleWhatsAppNotify(res)}
                                className="p-1.5 rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                title="Notificar por WhatsApp"
                              >
                                <i className="ri-whatsapp-line"></i>
                              </button>
                            </>
                          )}
                          {res.status === "confirmed" && res.phone && (
                            <button
                              onClick={() => handleWhatsAppNotify(res)}
                              className="p-1.5 rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                              title="Notificar por WhatsApp"
                            >
                              <i className="ri-whatsapp-line"></i>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(res.id, res.name)}
                            className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                            title="Excluir reserva permanentemente"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailReservationId && (() => {
        const res = reservations.find((r) => r.id === detailReservationId);
        if (!res) return null;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <h3 className="font-display text-lg text-np-purple-900 mb-1">
                <i className="ri-calendar-check-line mr-2 text-np-purple-500"></i>
                Reserva de {res.name}
              </h3>
              <p className="text-xs text-np-purple-500 mb-4">
                Criada em {new Date(res.createdAt).toLocaleString("pt-BR")}
              </p>

              <div className="space-y-3">
                <div className="bg-np-wood-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Tipo</span>
                    <span className="text-sm font-medium text-np-purple-900 flex items-center gap-1">
                      <i className={`${TYPE_ICONS[res.reservationType]} text-np-purple-500`}></i>
                      {TYPE_LABELS[res.reservationType] || res.reservationType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Data</span>
                    <span className="text-sm font-medium text-np-purple-900">{res.date}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Horário</span>
                    <span className="text-sm font-medium text-np-purple-900">{res.time}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Pessoas</span>
                    <span className="text-sm font-medium text-np-purple-900">{res.guests}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      res.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : res.status === "confirmed"
                        ? "bg-np-green-100 text-np-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {res.status === "pending" && "Pendente"}
                      {res.status === "confirmed" && "Confirmada"}
                      {res.status === "cancelled" && "Cancelada"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-np-purple-700">Contato</span>
                    <div className="text-right">
                      <span className="text-sm font-medium text-np-purple-900 block">{res.phone}</span>
                      <span className="text-xs text-np-purple-500">{res.email}</span>
                    </div>
                  </div>
                </div>
                {res.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-700 font-medium mb-1">
                      <i className="ri-alert-line mr-1"></i>
                      Observações
                    </p>
                    <p className="text-sm text-yellow-800">{res.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDetailReservationId(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
                >
                  Fechar
                </button>
                {res.status === "pending" && (
                  <>
                    <button
                      onClick={() => { setDetailReservationId(null); handleConfirm(res.id); }}
                      className="flex-1 bg-np-green-600 hover:bg-np-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-check-line mr-1"></i>
                      Confirmar
                    </button>
                    <button
                      onClick={() => { setDetailReservationId(null); handleCancel(res.id); }}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="ri-close-line mr-1"></i>
                      Cancelar
                    </button>
                  </>
                )}
                {res.phone && (
                  <button
                    onClick={() => handleWhatsAppNotify(res)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <i className="ri-whatsapp-line"></i>
                    WhatsApp
                  </button>
                )}
                <button
                  onClick={() => { setDetailReservationId(null); handleDelete(res.id, res.name); }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <i className="ri-delete-bin-line mr-1"></i>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Reservation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-add-line mr-2 text-np-green-600"></i>
              Nova Reserva
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Nome do Cliente *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Ex: Maria Silva"
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="cliente@email.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Tipo de Reserva</label>
                <select
                  value={createForm.reservationType}
                  onChange={(e) => setCreateForm({ ...createForm, reservationType: e.target.value as Reservation["reservationType"] })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                >
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Data *</label>
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Horário</label>
                  <input
                    type="time"
                    value={createForm.time}
                    onChange={(e) => setCreateForm({ ...createForm, time: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Quantidade de Pessoas</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={createForm.guests}
                  onChange={(e) => setCreateForm({ ...createForm, guests: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Observações</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Alergias, preferências, ocasião especial..."
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 bg-np-green-600 hover:bg-np-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
              >
                <i className="ri-add-line"></i>
                Criar Reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-edit-line mr-2 text-np-purple-500"></i>
              Editar Reserva
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Nome</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Data</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Horário</label>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Quantidade de Pessoas</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={editForm.guests}
                  onChange={(e) => setEditForm({ ...editForm, guests: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Observações</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingReservation(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}