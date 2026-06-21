import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/supabase";

interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  avatar_url?: string;
}

interface EmployeesTabProps {
  addToast: (message: string, type?: "success" | "error" | "warning" | "info", duration?: number) => void;
}

const ROLE_LABELS: Record<string, { label: string; color: string; textColor: string }> = {
  admin: { label: "Admin", color: "bg-purple-100", textColor: "text-purple-800" },
  caixa: { label: "Caixa", color: "bg-green-100", textColor: "text-green-800" },
  cozinha: { label: "Cozinha", color: "bg-blue-100", textColor: "text-blue-800" },
  atendente: { label: "Atendente", color: "bg-orange-100", textColor: "text-orange-800" },
  entregador: { label: "Entregador", color: "bg-teal-100", textColor: "text-teal-800" },
  cliente: { label: "Cliente", color: "bg-gray-100", textColor: "text-gray-800" },
};

const ROLE_ACCESS: Record<string, string> = {
  admin: "Acesso total: Dashboard, Produtos, Pedidos, Clientes, Funcionários, Configurações",
  caixa: "Caixa, Pedidos, Clientes, Reservas, QR Mesas",
  cozinha: "Apenas Cozinha",
  atendente: "Pedidos, Reservas",
  entregador: "Entregas, Status de entrega",
  cliente: "Cardápio, Pedidos, Delivery, Minha conta",
};

function generateTempPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let pwd = "";
  for (let i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export default function EmployeesTab({ addToast }: EmployeesTabProps) {
  const { user: currentUser, getAllProfiles, createEmployee, adminManageUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "atendente" as UserRole,
    avatar_url: "",
  });
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "atendente" as UserRole,
    status: "ativo",
    avatar_url: "",
  });
  const [resetPassword, setResetPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ email: string; password: string } | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    const data = await getAllProfiles();
    const mapped = (data || []).map((p: Record<string, unknown>) => ({
      id: String(p.id || ""),
      full_name: String(p.full_name || ""),
      email: String(p.email || ""),
      phone: String(p.phone || ""),
      role: String(p.role || "cliente"),
      status: String(p.status || "ativo"),
      created_at: String(p.created_at || ""),
      avatar_url: String(p.avatar_url || ""),
    }));
    setEmployees(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const filtered = employees.filter((emp) => {
    const matchSearch =
      emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.phone.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole ? emp.role === filterRole : true;
    return matchSearch && matchRole;
  });

  const handleCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      addToast("Preencha nome e email", "warning", 3000);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createForm.email)) {
      addToast("Digite um email válido", "warning", 3000);
      return;
    }

    setIsCreating(true);
    const tempPassword = generateTempPassword();
    const { data, error } = await createEmployee({
      email: createForm.email.trim(),
      password: tempPassword,
      full_name: createForm.full_name.trim(),
      phone: createForm.phone.trim(),
      role: createForm.role,
      avatar_url: createForm.avatar_url.trim(),
    });
    setIsCreating(false);

    if (error || !data?.success) {
      addToast(error?.message || "Erro ao criar funcionário", "error", 4000);
      return;
    }

    setCreatedResult({ email: createForm.email, password: tempPassword });
    setCreateForm({ full_name: "", email: "", phone: "", role: "atendente", avatar_url: "" });
    loadEmployees();
    addToast("Funcionário criado com sucesso!", "success", 4000);
  };

  const openEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditForm({
      full_name: emp.full_name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role as UserRole,
      status: emp.status,
      avatar_url: emp.avatar_url || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmployee) return;
    setIsSaving(true);
    const { error } = await adminManageUser({
      action: "update_profile",
      userId: selectedEmployee.id,
      full_name: editForm.full_name,
      email: editForm.email,
      phone: editForm.phone,
      role: editForm.role,
      status: editForm.status,
      avatar_url: editForm.avatar_url,
    });
    setIsSaving(false);
    if (error) {
      addToast(error.message || "Erro ao salvar", "error", 3000);
      return;
    }
    setShowEditModal(false);
    loadEmployees();
    addToast("Funcionário atualizado com sucesso!", "success", 3000);
  };

  const openReset = (emp: Employee) => {
    setSelectedEmployee(emp);
    setResetPassword(generateTempPassword());
    setShowResetModal(true);
  };

  const handleReset = async () => {
    if (!selectedEmployee) return;
    setIsResetting(true);
    const { error } = await adminManageUser({
      action: "reset_password",
      userId: selectedEmployee.id,
      newPassword: resetPassword,
    });
    setIsResetting(false);
    if (error) {
      addToast(error.message || "Erro ao redefinir senha", "error", 3000);
      return;
    }
    addToast("Senha redefinida com sucesso!", "success", 3000);
  };

  const handleToggleStatus = async (emp: Employee) => {
    const newStatus = emp.status === "ativo" ? "inativo" : "ativo";
    const { error } = await adminManageUser({
      action: "update_profile",
      userId: emp.id,
      status: newStatus,
    });
    if (error) {
      addToast(error.message || "Erro ao alterar status", "error", 3000);
      return;
    }
    loadEmployees();
    addToast(`Funcionário ${newStatus === "ativo" ? "ativado" : "desativado"}`, "success", 3000);
  };

  const openDelete = (emp: Employee) => {
    setSelectedEmployee(emp);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);
    const { error } = await adminManageUser({
      action: "delete",
      userId: selectedEmployee.id,
    });
    setIsDeleting(false);
    if (error) {
      addToast(error.message || "Erro ao excluir", "error", 3000);
      return;
    }
    setShowDeleteModal(false);
    loadEmployees();
    addToast("Funcionário excluído com sucesso", "success", 3000);
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl text-purple-900">
            <i className="ri-team-line mr-2 text-purple-500"></i>
            Gestão de Funcionários
          </h2>
          <p className="text-sm text-purple-600 mt-1">
            {employees.length} usuários cadastrados no sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEmployees}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 hover:bg-gray-50 text-purple-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-1"></i>
            Atualizar
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreatedResult(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
          >
            <i className="ri-user-add-line mr-1"></i>
            Novo Funcionário
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou telefone..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="">Todas as funções</option>
            <option value="admin">Admin</option>
            <option value="caixa">Caixa</option>
            <option value="cozinha">Cozinha</option>
            <option value="atendente">Atendente</option>
            <option value="entregador">Entregador</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>
      </div>

      {/* Role legend */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-purple-900 mb-2">
          <i className="ri-information-line mr-1"></i>
          Controle de Acesso por Função
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-purple-700">
          {Object.entries(ROLE_ACCESS).map(([role, access]) => {
            const info = ROLE_LABELS[role];
            return (
              <div key={role} className="flex items-start gap-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${info?.color} ${info?.textColor} flex-shrink-0 mt-0.5`}>
                  {info?.label || role}
                </span>
                <span className="text-gray-600">{access}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16">
          <i className="ri-loader-4-line animate-spin text-3xl text-purple-400"></i>
          <p className="text-sm text-purple-500 mt-2">Carregando...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <i className="ri-user-search-line text-4xl text-gray-300 mb-3 block"></i>
          <p className="text-sm text-gray-600">Nenhum funcionário encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-purple-50 text-purple-800">
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium">Função</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((emp) => {
                  const roleInfo = ROLE_LABELS[emp.role] || ROLE_LABELS.cliente;
                  const isCurrent = emp.id === currentUser?.id;
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-200">
                            {emp.avatar_url ? (
                              <img src={emp.avatar_url} alt={emp.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <i className="ri-user-line text-sm text-gray-500"></i>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.full_name || "Sem nome"}
                              {isCurrent && (
                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Você</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(emp.created_at).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{emp.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{emp.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${roleInfo.color} ${roleInfo.textColor}`}>
                          {roleInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            emp.status === "ativo"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {emp.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            title="Editar"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          <button
                            onClick={() => openReset(emp)}
                            className="p-1.5 rounded-md bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                            title="Redefinir senha"
                          >
                            <i className="ri-lock-password-line"></i>
                          </button>
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            className={`p-1.5 rounded-md transition-colors ${
                              emp.status === "ativo"
                                ? "bg-red-50 text-red-500 hover:bg-red-100"
                                : "bg-green-50 text-green-600 hover:bg-green-100"
                            }`}
                            title={emp.status === "ativo" ? "Desativar" : "Ativar"}
                          >
                            <i className={emp.status === "ativo" ? "ri-user-unfollow-line" : "ri-user-follow-line"}></i>
                          </button>
                          {!isCurrent && (
                            <button
                              onClick={() => openDelete(emp)}
                              className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Excluir"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          )}
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-purple-900 mb-4">
              <i className="ri-user-add-line mr-2 text-green-600"></i>
              Novo Funcionário
            </h3>

            {createdResult ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="ri-check-line text-2xl text-green-600"></i>
                </div>
                <p className="text-center text-green-900 font-medium mb-2">Funcionário criado com sucesso!</p>
                <div className="space-y-2 bg-white rounded-lg p-3 border border-green-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium text-gray-900">{createdResult.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Senha temporária:</span>
                    <span className="font-mono font-bold text-purple-700">{createdResult.password}</span>
                  </div>
                </div>
                <p className="text-xs text-green-700 mt-3 text-center">
                  Copie a senha e envie ao funcionário. Ele poderá alterar depois.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${createdResult.email}\nSenha: ${createdResult.password}`);
                      addToast("Copiado para a área de transferência!", "success", 2000);
                    }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  >
                    <i className="ri-file-copy-line mr-1"></i>
                    Copiar Dados
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedResult(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      value={createForm.full_name}
                      onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                      placeholder="Ex: João Silva"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Email *</label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="joao@email.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Foto de Perfil (URL)</label>
                    <input
                      type="text"
                      value={createForm.avatar_url}
                      onChange={(e) => setCreateForm({ ...createForm, avatar_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    {createForm.avatar_url && (
                      <div className="mt-2 w-12 h-12 rounded-full overflow-hidden bg-gray-100">
                        <img src={createForm.avatar_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Função *</label>
                    <select
                      value={createForm.role}
                      onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white"
                    >
                      <option value="admin">Admin</option>
                      <option value="caixa">Caixa</option>
                      <option value="cozinha">Cozinha</option>
                      <option value="atendente">Atendente</option>
                      <option value="entregador">Entregador</option>
                      <option value="cliente">Cliente</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {ROLE_ACCESS[createForm.role]}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreateForm({ full_name: "", email: "", phone: "", role: "atendente", avatar_url: "" });
                    }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {isCreating ? (
                      <i className="ri-loader-4-line animate-spin"></i>
                    ) : (
                      <>
                        <i className="ri-add-line mr-1"></i>
                        Criar Funcionário
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
            <h3 className="font-display text-lg text-purple-900 mb-4">
              <i className="ri-edit-line mr-2 text-purple-500"></i>
              Editar Funcionário
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Nome</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Telefone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Foto de Perfil (URL)</label>
                <input
                  type="text"
                  value={editForm.avatar_url}
                  onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
                {editForm.avatar_url && (
                  <div className="mt-2 w-12 h-12 rounded-full overflow-hidden bg-gray-100">
                    <img src={editForm.avatar_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Função</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white"
                >
                  <option value="admin">Admin</option>
                  <option value="caixa">Caixa</option>
                  <option value="cozinha">Cozinha</option>
                  <option value="atendente">Atendente</option>
                  <option value="entregador">Entregador</option>
                  <option value="cliente">Cliente</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">{ROLE_ACCESS[editForm.role]}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isSaving ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  "Salvar Alterações"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-lock-password-line text-2xl text-yellow-600"></i>
            </div>
            <h3 className="font-display text-lg text-purple-900 mb-2 text-center">
              Redefinir Senha
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              Você está redefinindo a senha de <strong>{selectedEmployee.full_name}</strong>
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nova senha temporária</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => setResetPassword(generateTempPassword())}
                  className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                  title="Gerar nova senha"
                >
                  <i className="ri-refresh-line"></i>
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting || resetPassword.length < 6}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isResetting ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  "Redefinir Senha"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-alert-line text-2xl text-red-600"></i>
            </div>
            <h3 className="font-display text-lg text-purple-900 mb-2 text-center">
              Excluir Funcionário
            </h3>
            <p className="text-sm text-gray-600 text-center mb-1">
              Tem certeza que deseja excluir <strong>{selectedEmployee.full_name}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 mb-4">
              <p className="text-xs text-red-700 flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 mt-0.5 flex-shrink-0"></i>
                <span>
                  Esta ação é <strong>irreversível</strong>. O usuário será removido permanentemente do sistema e não poderá mais fazer login.
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isDeleting ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  "Excluir"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}