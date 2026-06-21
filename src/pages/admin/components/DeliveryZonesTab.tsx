import { useState, useMemo } from "react";
import { useDeliveryZones, type ZoneFormData } from "@/hooks/useDeliveryZones";

interface DeliveryZonesTabProps {
  addToast: (message: string, type?: "success" | "error" | "warning" | "info") => void;
}

const ZONE_LABELS = [
  "Zona 1 — Até 3 km",
  "Zona 2 — De 3 a 6 km",
  "Zona 3 — De 6 a 12 km",
  "Zona 4 — Acima de 12 km",
];

export default function DeliveryZonesTab({ addToast }: DeliveryZonesTabProps) {
  const {
    zones,
    loading,
    refresh,
    createZone,
    updateZone,
    deleteZone,
  } = useDeliveryZones();

  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ZoneFormData>({
    neighborhood: "",
    zone_label: ZONE_LABELS[0],
    fee: 6,
    min_order: 0,
    avg_time: "30–50 min",
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = [...zones];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((z) => z.neighborhood.toLowerCase().includes(q));
    }
    if (filterActive === "active") list = list.filter((z) => z.active);
    if (filterActive === "inactive") list = list.filter((z) => !z.active);
    return list;
  }, [zones, search, filterActive]);

  const activeCount = zones.filter((z) => z.active).length;
  const inactiveCount = zones.filter((z) => !z.active).length;

  const openCreate = () => {
    setEditingId(null);
    setForm({
      neighborhood: "",
      zone_label: ZONE_LABELS[0],
      fee: 6,
      min_order: 0,
      avg_time: "30–50 min",
      active: true,
    });
    setShowModal(true);
  };

  const openEdit = (zone: (typeof zones)[0]) => {
    setEditingId(zone.id);
    setForm({
      neighborhood: zone.neighborhood,
      zone_label: zone.zone_label,
      fee: zone.fee,
      min_order: zone.min_order,
      avg_time: zone.avg_time,
      active: zone.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.neighborhood.trim()) {
      addToast("Nome do bairro é obrigatório", "warning");
      return;
    }
    if (form.fee < 0) {
      addToast("Taxa de entrega não pode ser negativa", "warning");
      return;
    }
    setSaving(true);
    if (editingId !== null) {
      const { error } = await updateZone(editingId, form);
      if (error) {
        addToast(error.message || "Erro ao atualizar bairro", "error");
      } else {
        addToast("Bairro atualizado com sucesso!", "success");
        setShowModal(false);
      }
    } else {
      const { error } = await createZone(form);
      if (error) {
        addToast(error.message || "Erro ao cadastrar bairro", "error");
      } else {
        addToast("Bairro cadastrado com sucesso!", "success");
        setShowModal(false);
      }
    }
    setSaving(false);
  };

  const handleToggleActive = async (zone: (typeof zones)[0]) => {
    const { error } = await updateZone(zone.id, { active: !zone.active });
    if (error) {
      addToast(error.message || "Erro ao alterar status", "error");
    } else {
      addToast(
        zone.active ? "Bairro desativado" : "Bairro ativado",
        "success"
      );
    }
  };

  const handleDelete = async (id: number) => {
    const { error } = await deleteZone(id);
    if (error) {
      addToast(error.message || "Erro ao excluir bairro", "error");
    } else {
      addToast("Bairro excluído com sucesso", "success");
    }
    setDeleteConfirmId(null);
  };

  if (loading) {
    return (
      <div className="max-w-5xl">
        <div className="text-center py-16">
          <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
          <p className="text-sm text-np-purple-500 mt-2">Carregando bairros...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl text-np-purple-900">
          <i className="ri-map-pin-line mr-2 text-np-purple-500"></i>
          Bairros e Taxas
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={refresh}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-np-wood-300 hover:bg-np-wood-50 text-np-purple-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Atualizar
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Novo Bairro
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
          <p className="font-display text-2xl font-bold text-np-purple-900">{zones.length}</p>
          <p className="text-xs text-np-purple-500">Total de bairros</p>
        </div>
        <div className="bg-white rounded-xl border border-np-green-200 p-4 text-center">
          <p className="font-display text-2xl font-bold text-np-green-700">{activeCount}</p>
          <p className="text-xs text-np-green-600">Ativos</p>
        </div>
        <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
          <p className="font-display text-2xl font-bold text-np-purple-900">{inactiveCount}</p>
          <p className="text-xs text-np-purple-500">Inativos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 bg-white rounded-xl border border-np-wood-200 p-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar bairro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-np-wood-50 rounded-lg p-1">
          {(
            [
              { id: "all", label: "Todos", icon: "ri-list-check" },
              { id: "active", label: "Ativos", icon: "ri-check-line" },
              { id: "inactive", label: "Inativos", icon: "ri-close-circle-line" },
            ] as { id: typeof filterActive; label: string; icon: string }[]
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterActive(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                filterActive === f.id
                  ? "bg-np-purple-700 text-white"
                  : "text-np-purple-600 hover:bg-np-wood-100"
              }`}
            >
              <i className={`${f.icon} mr-1`}></i>
              {f.label}
            </button>
          ))}
        </div>
        {(search || filterActive !== "all") && (
          <button
            onClick={() => { setSearch(""); setFilterActive("all"); }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-np-purple-600 hover:bg-np-wood-50 border border-np-wood-200 transition-colors whitespace-nowrap"
          >
            <i className="ri-close-line mr-1"></i>
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-np-purple-50 text-np-purple-800">
                <th className="text-left px-4 py-3 font-medium">Bairro</th>
                <th className="text-left px-4 py-3 font-medium">Zona</th>
                <th className="text-center px-4 py-3 font-medium">Taxa</th>
                <th className="text-center px-4 py-3 font-medium">Pedido Mín.</th>
                <th className="text-center px-4 py-3 font-medium">Tempo</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-np-wood-100">
              {filtered.map((zone) => (
                <tr
                  key={zone.id}
                  className={`hover:bg-np-wood-50 ${!zone.active ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-np-purple-900">{zone.neighborhood}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-np-purple-700">{zone.zone_label}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-np-green-700">
                      R$ {Number(zone.fee).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-np-purple-600">
                    {zone.min_order > 0 ? `R$ ${Number(zone.min_order).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-np-purple-600">
                    {zone.avg_time || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
                        zone.active
                          ? "bg-np-green-100 text-np-green-700"
                          : "bg-np-wood-100 text-np-wood-600"
                      }`}
                    >
                      <i className={zone.active ? "ri-check-line" : "ri-close-circle-line"}></i>
                      {zone.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(zone)}
                        className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                        title="Editar"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleToggleActive(zone)}
                        className={`p-1.5 rounded-md transition-colors ${
                          zone.active
                            ? "bg-np-wood-100 text-np-wood-500 hover:bg-np-wood-200"
                            : "bg-np-green-100 text-np-green-600 hover:bg-np-green-200"
                        }`}
                        title={zone.active ? "Desativar" : "Ativar"}
                      >
                        <i className={zone.active ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(zone.id)}
                        className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        title="Excluir"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-np-purple-400">
            <i className="ri-map-pin-line text-3xl mb-2 block"></i>
            <p className="text-sm">Nenhum bairro encontrado</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className={`mr-2 ${editingId ? "ri-edit-line text-np-purple-500" : "ri-add-line text-np-green-600"}`}></i>
              {editingId ? "Editar Bairro" : "Novo Bairro"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Nome do Bairro *</label>
                <input
                  type="text"
                  value={form.neighborhood}
                  onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                  placeholder="Ex: Sussuarana Velha"
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Zona de Entrega *</label>
                <select
                  value={form.zone_label}
                  onChange={(e) => setForm({ ...form, zone_label: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                >
                  {ZONE_LABELS.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Taxa de Entrega (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.fee}
                    onChange={(e) => setForm({ ...form, fee: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Pedido Mínimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.min_order ?? 0}
                    onChange={(e) => setForm({ ...form, min_order: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Tempo Médio</label>
                  <input
                    type="text"
                    value={form.avg_time}
                    onChange={(e) => setForm({ ...form, avg_time: e.target.value })}
                    placeholder="30–50 min"
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="w-4 h-4 rounded border-np-wood-300 text-np-purple-700 focus:ring-np-purple-500"
                    />
                    <span className="text-sm text-np-purple-800">Bairro ativo</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-1 ${
                  editingId
                    ? "bg-np-purple-700 hover:bg-np-purple-800"
                    : "bg-np-green-600 hover:bg-np-green-700"
                }`}
              >
                {saving && <i className="ri-loader-4-line animate-spin"></i>}
                {editingId ? "Salvar Alterações" : "Cadastrar Bairro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-delete-bin-line text-2xl text-red-600"></i>
            </div>
            <h3 className="font-display text-lg text-np-purple-900 mb-2">Excluir Bairro</h3>
            <p className="text-sm text-np-purple-600 mb-4">
              Tem certeza que deseja excluir este bairro? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}