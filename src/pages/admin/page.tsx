import { useState, useEffect, useRef, useCallback } from "react";
import { useOrderHistory } from "@/hooks/useOrderHistory";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useGlobalToast } from "@/hooks/useToast";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import { getWhatsAppMessage, openWhatsApp, getEmailSubject, getEmailBody, openEmail, getManualFeedbackMessage } from "./components/OrderNotifications";
import { getBaseUrl, getFeedbackUrl } from "@/lib/getBaseUrl";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/hooks/useOrderHistory";
import type { Product } from "@/hooks/useProducts";
import type { UserRole } from "@/hooks/useAuth";

import ReservationsTab from "./components/ReservationsTab";
import FeedbacksTab from "./components/FeedbacksTab";
import AdminTestsPage from "./components/AdminTestsPage";
import StockTab from "./components/StockTab";
import DeliveryZonesTab from "./components/DeliveryZonesTab";
import EmployeesTab from "./components/EmployeesTab";
import HomologationTab from "./components/HomologationTab";

function getAdminFeedbackUrl(orderId: string): string {
  const url = getFeedbackUrl(orderId);
  console.log("[FEEDBACK URL] Admin getFeedbackUrl:", url);
  return url;
}

function getStatusWhatsAppMessage(order: Order): string {
  const base = getBaseUrl();
  const statusLabels: Record<string, string> = {
    pending: "Pedido Recebido",
    preparing: "Em Preparo",
    ready: "Pronto",
    out_for_delivery: "Saiu para Entrega",
    delivered: "Entregue",
    cancelled: "Cancelado",
  };
  const statusLabel = statusLabels[order.status] || order.status;
  const trackingCode = order.publicTrackingCode || order.id;
  return `Olá ${order.customerName}! Seu pedido na NP Empório Massas & Variedades está: ${statusLabel}. Acompanhe aqui: ${base}/acompanhar-pedido/${trackingCode}`;
}

// Audio for notifications
let globalAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (!globalAudioContext) {
    try {
      globalAudioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (globalAudioContext.state === "suspended") {
    globalAudioContext.resume().catch(() => {});
  }
  return globalAudioContext;
}

function playAdminBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(600, 0, 0.15);
    playTone(900, 0.2, 0.15);
    playTone(1200, 0.4, 0.3);
  } catch {
    /* ignore audio errors */
  }
}

export default function AdminPage() {
  const { orders, loading, error: ordersError, updateOrder, updateStatus, updatePaymentStatus, deleteOrder, deleteOldOrders, deleteTestOrders, retry: retryOrders } = useOrderHistory();
  const { showToast } = useGlobalToast();
  const { getZoneByNeighborhood } = useDeliveryZones();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000, options?: { actions?: Array<{ label: string; onClick: () => void; icon?: string; className?: string }>; skipBroadcast?: boolean }) => {
    const id = `admin-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration, actions: options?.actions, skipBroadcast: options?.skipBroadcast });
  };
  const { user: currentUser } = useAuth();
  const userRole = currentUser?.role || 'cliente';
  const { products: dbProducts, categories: dbCategories, updateProduct, deleteProduct, createProduct, refresh: refreshProducts } = useProducts(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports" | "products" | "stock" | "orders" | "customers" | "employees" | "accesses" | "settings" | "reservations" | "feedbacks" | "tests" | "delivery_zones" | "homologation">("orders");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  // Define visible tabs based on role
  const allTabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: "ri-dashboard-line" },
    { id: "reports" as const, label: "Relatórios", icon: "ri-bar-chart-box-line" },
    { id: "products" as const, label: "Produtos", icon: "ri-restaurant-line" },
    { id: "stock" as const, label: "Estoque", icon: "ri-box-3-line" },
    { id: "delivery_zones" as const, label: "Bairros e Taxas", icon: "ri-map-pin-line" },
    { id: "orders" as const, label: "Pedidos", icon: "ri-shopping-bag-line" },
    { id: "reservations" as const, label: "Reservas", icon: "ri-calendar-check-line" },
    { id: "feedbacks" as const, label: "Avaliações", icon: "ri-star-line" },
    { id: "customers" as const, label: "Clientes", icon: "ri-user-line" },
    { id: "employees" as const, label: "Funcionários", icon: "ri-team-line" },
    { id: "accesses" as const, label: "Acessos do Sistema", icon: "ri-link-m" },
    { id: "settings" as const, label: "Configurações", icon: "ri-settings-3-line" },
    { id: "tests" as const, label: "Testes", icon: "ri-test-tube-line" },
    { id: "homologation" as const, label: "Homologação Final", icon: "ri-task-line" },
  ];

  const roleTabAccess: Record<string, string[]> = {
    admin: allTabs.map(t => t.id),
    caixa: ["orders", "customers", "reservations", "accesses"],
    atendente: ["orders", "reservations"],
  };

  const visibleTabs = allTabs.filter(tab => {
    const allowed = roleTabAccess[userRole] || roleTabAccess.atendente;
    return allowed.includes(tab.id);
  });

  // Set default active tab based on role
  useEffect(() => {
    if (userRole === 'caixa' && activeTab === 'dashboard') setActiveTab('orders');
    if (userRole === 'atendente' && activeTab === 'dashboard') setActiveTab('orders');
  }, [userRole]);

  // Date filter state
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Edit product state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: 0, category: "", image_url: "", stock_quantity: 0, min_stock: 0 });

  // Create product state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", price: 0, category: "torres", image_url: "", stock_quantity: 0, min_stock: 0 });

  // QR Code modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrTableNumber, setQrTableNumber] = useState<number | null>(null);

  // Edit order state
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editOrderForm, setEditOrderForm] = useState({
    customerName: "",
    customerPhone: "",
    tableNumber: "",
    status: "pending" as Order["status"],
    paymentStatus: "pending" as "pending" | "paid",
    paymentMethod: "caixa" as "caixa" | "cartao" | "pix",
  });

  // Order detail modal
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  // Mark existing orders as seen on initial load (without notification)
  useEffect(() => {
    if (!loading && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      orders.forEach((o) => seenOrderIdsRef.current.add(o.id));
      console.log("[ADMIN] initial load done, marked", orders.length, "orders as seen — no notifications");
    }
  }, [loading, orders]);

  // Single notification effect for NEW orders only (after initial load)
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const newOrders = orders.filter((o) => !seenOrderIdsRef.current.has(o.id) && o.status === "pending");
    if (newOrders.length > 0 && soundEnabled) {
      playAdminBeep();
      newOrders.forEach((o) => {
        addToast(
          `Novo pedido ${o.orderType === "mesa" ? `Mesa ${o.tableNumber}` : "Delivery"}: ${o.customerName} — R$ ${o.totalAmount.toFixed(2)}`,
          "info",
          8000,
          { skipBroadcast: true }
        );
      });
    }
    orders.forEach((o) => seenOrderIdsRef.current.add(o.id));
  }, [orders, soundEnabled, addToast]);

  // Filter orders by date
  const filteredOrders = orders.filter((o) => {
    if (!dateStart && !dateEnd) return true;
    const orderDate = new Date(o.createdAt);
    if (dateStart && orderDate < new Date(dateStart)) return false;
    if (dateEnd && orderDate > new Date(dateEnd + "T23:59:59")) return false;
    return true;
  });

  const totalRevenue = filteredOrders
    .filter((o) => o.paymentStatus === "paid" || o.status === "delivered")
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrders = filteredOrders.length;
  const totalCustomers = new Set(filteredOrders.map((o) => o.customerPhone || o.customerName)).size;
  const pendingOrders = filteredOrders.filter((o) => o.status === "pending").length;

  const today = new Date().toDateString();
  const todayOrders = filteredOrders.filter(
    (o) => new Date(o.createdAt).toDateString() === today
  );
  const todayRevenue = todayOrders
    .filter((o) => o.paymentStatus === "paid" || o.status === "delivered")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  // Product handlers
  const handleDeleteProduct = async (id: number) => {
    if (window.confirm("Tem certeza que deseja desativar este produto?")) {
      const { error } = await deleteProduct(id);
      if (!error) {
        addToast("Produto desativado", "warning", 3000);
      } else {
        addToast("Erro ao desativar produto", "error", 3000);
      }
    }
  };

  const handleToggleFeatured = async (id: number, currentFeatured: boolean) => {
    const { error } = await updateProduct(id, { featured: !currentFeatured });
    if (!error) {
      addToast("Destaque atualizado", "success", 2000);
    } else {
      addToast("Erro ao atualizar", "error", 2000);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    const { error } = await updateProduct(id, { active: !currentActive });
    if (!error) {
      addToast(currentActive ? "Produto desativado" : "Produto reativado", "success", 2000);
    } else {
      addToast("Erro ao atualizar", "error", 2000);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      image_url: product.image || "",
      stock_quantity: product.stockQuantity,
      min_stock: product.minStock,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    const { error } = await updateProduct(editingProduct.id, {
      ...editForm,
      image_url: editForm.image_url,
      stockQuantity: editForm.stock_quantity,
      minStock: editForm.min_stock,
    });
    if (!error) {
      addToast("Produto atualizado com sucesso!", "success", 3000);
      setEditingProduct(null);
    } else {
      addToast("Erro ao atualizar produto", "error", 3000);
    }
  };

  const handleCreateProduct = async () => {
    if (!createForm.name.trim() || createForm.price <= 0) {
      addToast("Preencha nome e preço do produto", "warning", 3000);
      return;
    }
    const { error } = await createProduct({
      name: createForm.name,
      description: createForm.description,
      price: createForm.price,
      category: createForm.category,
      image_url: createForm.image_url || undefined,
      stock_quantity: createForm.stock_quantity,
      min_stock: createForm.min_stock,
    });
    if (!error) {
      addToast("Produto cadastrado com sucesso!", "success", 3000);
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "", price: 0, category: "torres", image_url: "", stock_quantity: 0, min_stock: 0 });
    } else {
      addToast("Erro ao cadastrar produto", "error", 3000);
    }
  };

  // Refrescar produtos quando aba Produtos é ativada
  useEffect(() => {
    if (activeTab === "products") {
      console.log("[ADMIN] Aba Produtos ativada, chamando refresh");
      refreshProducts();
    }
  }, [activeTab, refreshProducts]);

  const handleRoleChange = async (_userId: string, _newRole: UserRole, _userName: string) => {
    // Role changes are now handled by EmployeesTab
  };

  // Order edit handlers
  const openEditOrder = (order: Order) => {
    setEditingOrder(order.id);
    setEditOrderForm({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      tableNumber: order.tableNumber?.toString() || "",
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
    });
  };

  const handleSaveOrderEdit = async () => {
    if (!editingOrder) return;
    const { error } = await updateOrder(editingOrder, {
      customerName: editOrderForm.customerName,
      customerPhone: editOrderForm.customerPhone,
      tableNumber: editOrderForm.tableNumber ? parseInt(editOrderForm.tableNumber) : undefined,
      status: editOrderForm.status,
      paymentStatus: editOrderForm.paymentStatus,
      paymentMethod: editOrderForm.paymentMethod,
    });
    if (!error) {
      addToast("Pedido atualizado com sucesso!", "success", 3000);
      setEditingOrder(null);
    } else {
      addToast("Erro ao atualizar pedido", "error", 3000);
    }
  };

  const handleOpenWhatsApp = (order: Order) => {
    const hasPhone = order.customerPhone?.replace(/\D/g, "").length > 0;
    if (!hasPhone) return;
    const avgTime = order.neighborhood
      ? getZoneByNeighborhood(order.neighborhood)?.avg_time
      : undefined;
    const msg = getWhatsAppMessage(order, order.status, avgTime);
    openWhatsApp(order.customerPhone!, msg);
  };

  const handleQuickStatusChange = async (orderId: string, newStatus: Order["status"]) => {
    const { insufficient, success } = await updateStatus(orderId, newStatus);
    if (insufficient.length > 0) {
      addToast(`⚠️ Estoque insuficiente: ${insufficient.join(", ")}`, "warning", 6000);
    } else if (success) {
      addToast("✅ Status atualizado e estoque baixado!", "success", 3000);
    } else {
      addToast("Status atualizado", "success", 2000);
    }
  };

  const handleQuickPay = async (orderId: string) => {
    const { insufficient, success } = await updatePaymentStatus(orderId, "paid");
    if (insufficient.length > 0) {
      addToast(`⚠️ Estoque insuficiente: ${insufficient.join(", ")}`, "warning", 6000);
    } else if (success) {
      addToast("✅ Pagamento confirmado e estoque baixado!", "success", 3000);
    } else {
      addToast("Pagamento confirmado", "success", 2000);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (window.confirm("Tem certeza que deseja cancelar este pedido?")) {
      await updateStatus(orderId, "cancelled");
      addToast("Pedido cancelado", "warning", 3000);
    }
  };

  const handleDeleteOrder = async (orderId: string, customerName: string) => {
    if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o pedido de ${customerName}?\n\nEsta ação NÃO pode ser desfeita.`)) {
      const { error } = await deleteOrder(orderId);
      if (error) {
        addToast(`Erro ao excluir: ${error.message}`, "error", 4000);
      } else {
        addToast("Pedido excluído permanentemente", "success", 3000);
      }
    }
  };

  const handleClearTestOrders = async () => {
    if (window.confirm("Tem certeza que deseja excluir TODOS os pedidos de teste (nome 'Teste')?\n\nEsta ação NÃO pode ser desfeita.")) {
      const { error, deletedCount } = await deleteTestOrders();
      if (error) {
        addToast(`Erro ao limpar testes: ${error.message}`, "error", 4000);
      } else {
        addToast(`${deletedCount} pedidos de teste removidos`, "success", 3000);
      }
    }
  };

  // Feedback WhatsApp button handler
  const handleSendFeedback = (orderId: string, customerName: string, customerPhone: string) => {
    const msg = getManualFeedbackMessage(orderId);
    console.log("[FEEDBACK MSG] Admin handleSendFeedback — URL in message:", msg);
    openWhatsApp(customerPhone, msg);
  };

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-6 md:py-8 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-np-gold-400">
                <i className="ri-dashboard-line mr-2"></i>
                {userRole === 'admin' ? 'Painel Administrativo NP' : userRole === 'caixa' ? 'Painel do Caixa' : 'Painel do Atendente'}
              </h1>
              <p className="text-white/70 text-sm mt-1">
                {userRole === 'admin' ? 'Gerencie produtos, pedidos, clientes e configurações' : userRole === 'caixa' ? 'Gerencie pedidos, clientes e reservas' : 'Gerencie pedidos e reservas'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {userRole === 'admin' && (
                <button
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    getAudioContext();
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    soundEnabled ? "bg-np-green-600 text-white" : "bg-white/10 text-white/50"
                  }`}
                  title={soundEnabled ? "Som ligado" : "Som desligado"}
                >
                  <i className={soundEnabled ? "ri-volume-up-line" : "ri-volume-mute-line"}></i>
                </button>
              )}
              <span className="text-white/50 text-xs hidden sm:inline-block">
                <i className="ri-user-line mr-1"></i>
                {currentUser?.full_name || currentUser?.email}
              </span>
              <a href="/" className="text-white/70 hover:text-white text-sm transition-colors">
                <i className="ri-home-line mr-1"></i>
                Site
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full px-4 sm:px-6 lg:px-12 py-4 bg-white border-b border-np-wood-200">
        <div className="flex gap-2 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-np-purple-700 text-white"
                  : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
              }`}
            >
              <i className={`${tab.icon} mr-1`}></i>
              {tab.label}
              {tab.id === "orders" && pendingOrders > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingOrders}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-6">
        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="max-w-5xl">
            {/* Date Filters */}
            <div className="flex flex-wrap items-end gap-3 mb-6 bg-white rounded-xl border border-np-wood-200 p-4">
              <div>
                <label className="block text-xs font-medium text-np-purple-600 mb-1">De</label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-np-purple-600 mb-1">Até</label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
                />
              </div>
              {(dateStart || dateEnd) && (
                <button
                  onClick={() => { setDateStart(""); setDateEnd(""); }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-np-purple-600 hover:bg-np-wood-50 border border-np-wood-200 transition-colors whitespace-nowrap"
                >
                  <i className="ri-close-line mr-1"></i>
                  Limpar filtro
                </button>
              )}
              <span className="text-xs text-np-purple-400 ml-auto">
                {filteredOrders.length} de {orders.length} pedidos
                {(dateStart || dateEnd) && " filtrados"}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                <i className="ri-money-cny-circle-line text-3xl text-np-green-600 mb-2 block"></i>
                <p className="font-display text-2xl font-bold text-np-purple-900">
                  R$ {totalRevenue.toFixed(2)}
                </p>
                <p className="text-xs text-np-purple-500">Faturamento Total</p>
              </div>
              <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                <i className="ri-shopping-bag-3-line text-3xl text-np-purple-600 mb-2 block"></i>
                <p className="font-display text-2xl font-bold text-np-purple-900">
                  {totalOrders}
                </p>
                <p className="text-xs text-np-purple-500">Total de Pedidos</p>
              </div>
              <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                <i className="ri-user-line text-3xl text-np-gold-500 mb-2 block"></i>
                <p className="font-display text-2xl font-bold text-np-purple-900">
                  {totalCustomers}
                </p>
                <p className="text-xs text-np-purple-500">Clientes Únicos</p>
              </div>
              <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                <i className="ri-time-line text-3xl text-yellow-600 mb-2 block"></i>
                <p className="font-display text-2xl font-bold text-np-purple-900">
                  {pendingOrders}
                </p>
                <p className="text-xs text-np-purple-500">Pendentes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-display text-lg text-np-purple-900 mb-4">
                  <i className="ri-calendar-check-line mr-2 text-np-green-600"></i>
                  Hoje
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-np-purple-600">Pedidos hoje</span>
                    <span className="font-bold text-np-purple-900">{todayOrders.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-np-purple-600">Faturamento hoje</span>
                    <span className="font-bold text-np-green-600">
                      R$ {todayRevenue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-display text-lg text-np-purple-900 mb-4">
                  <i className="ri-bar-chart-box-line mr-2 text-np-purple-600"></i>
                  Pedidos por Tipo
                </h3>
                <div className="space-y-3">
                  {["mesa", "delivery"].map((type) => {
                    const count = filteredOrders.filter((o) => o.orderType === type).length;
                    const total = filteredOrders.length || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-np-purple-700 capitalize">
                            {type === "mesa" ? "Pedidos na Mesa" : "Delivery"}
                          </span>
                          <span className="font-bold text-np-purple-900">{count}</span>
                        </div>
                        <div className="w-full h-2 bg-np-wood-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              type === "mesa" ? "bg-np-purple-600" : "bg-np-green-600"
                            }`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a
                href="/cozinha"
                className="bg-white rounded-xl border border-np-wood-200 p-5 hover:border-np-purple-400 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-np-purple-100 rounded-full flex items-center justify-center group-hover:bg-np-purple-200 transition-colors">
                    <i className="ri-restaurant-line text-xl text-np-purple-600"></i>
                  </div>
                  <div>
                    <p className="font-medium text-np-purple-900">Cozinha</p>
                    <p className="text-xs text-np-purple-500">Gerenciar pedidos ativos</p>
                  </div>
                </div>
              </a>
              <a
                href="/caixa"
                className="bg-white rounded-xl border border-np-wood-200 p-5 hover:border-np-purple-400 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-np-green-100 rounded-full flex items-center justify-center group-hover:bg-np-green-200 transition-colors">
                    <i className="ri-coins-line text-xl text-np-green-600"></i>
                  </div>
                  <div>
                    <p className="font-medium text-np-purple-900">Caixa</p>
                    <p className="text-xs text-np-purple-500">Fechar contas e pagamentos</p>
                  </div>
                </div>
              </a>
              <a
                href="/qrcode-mesas"
                className="bg-white rounded-xl border border-np-wood-200 p-5 hover:border-np-purple-400 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-np-gold-100 rounded-full flex items-center justify-center group-hover:bg-np-gold-200 transition-colors">
                    <i className="ri-qr-code-line text-xl text-np-gold-600"></i>
                  </div>
                  <div>
                    <p className="font-medium text-np-purple-900">QR Codes</p>
                    <p className="text-xs text-np-purple-500">Gerar códigos das mesas</p>
                  </div>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* REPORTS */}
        {activeTab === "reports" && (
          <div className="max-w-5xl">
            <h2 className="font-display text-xl text-np-purple-900 mb-4">
              <i className="ri-bar-chart-box-line mr-2 text-np-purple-500"></i>
              Relatórios de Vendas
            </h2>

            {/* Date Filters */}
            <div className="flex flex-wrap items-end gap-3 mb-6 bg-white rounded-xl border border-np-wood-200 p-4">
              <div>
                <label className="block text-xs font-medium text-np-purple-600 mb-1">De</label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-np-purple-600 mb-1">Até</label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500"
                />
              </div>
              {(dateStart || dateEnd) && (
                <button
                  onClick={() => { setDateStart(""); setDateEnd(""); }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-np-purple-600 hover:bg-np-wood-50 border border-np-wood-200 transition-colors whitespace-nowrap"
                >
                  <i className="ri-close-line mr-1"></i>
                  Limpar filtro
                </button>
              )}
              <span className="text-xs text-np-purple-400 ml-auto">
                {filteredOrders.length} pedidos no período
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 text-np-purple-400 bg-white rounded-xl border border-np-wood-200">
                <i className="ri-bar-chart-line text-5xl mb-4 block"></i>
                <p className="text-lg font-medium text-np-purple-600">
                  Nenhum pedido no período selecionado
                </p>
                <p className="text-sm mt-2">Selecione um intervalo de datas para ver os relatórios</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    const paidOrders = filteredOrders.filter((o) => o.paymentStatus === "paid" || o.status === "delivered");
                    const revenue = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
                    const itemsSold = paidOrders.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0);
                    const avgTicket = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
                    return (
                      <>
                        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                          <i className="ri-money-cny-circle-line text-3xl text-np-green-600 mb-2 block"></i>
                          <p className="font-display text-2xl font-bold text-np-purple-900">R$ {revenue.toFixed(2)}</p>
                          <p className="text-xs text-np-purple-500">Faturamento no Período</p>
                        </div>
                        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                          <i className="ri-shopping-bag-3-line text-3xl text-np-purple-600 mb-2 block"></i>
                          <p className="font-display text-2xl font-bold text-np-purple-900">{filteredOrders.length}</p>
                          <p className="text-xs text-np-purple-500">Total Pedidos</p>
                        </div>
                        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                          <i className="ri-receipt-line text-3xl text-np-gold-500 mb-2 block"></i>
                          <p className="font-display text-2xl font-bold text-np-purple-900">R$ {avgTicket.toFixed(2)}</p>
                          <p className="text-xs text-np-purple-500">Ticket Médio</p>
                        </div>
                        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
                          <i className="ri-restaurant-line text-3xl text-np-wood-600 mb-2 block"></i>
                          <p className="font-display text-2xl font-bold text-np-purple-900">{itemsSold}</p>
                          <p className="text-xs text-np-purple-500">Itens Vendidos</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Sales by Day Bar Chart */}
                <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                  <h3 className="font-display text-lg text-np-purple-900 mb-1">
                    <i className="ri-calendar-line mr-2 text-np-purple-500"></i>
                    Vendas por Dia
                  </h3>
                  <p className="text-xs text-np-purple-400 mb-4">Faturamento total por dia no período</p>
                  {(() => {
                    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
                    filteredOrders.forEach((o) => {
                      const d = new Date(o.createdAt);
                      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                      if (!byDay[key]) byDay[key] = { date: key, revenue: 0, orders: 0 };
                      byDay[key].revenue += o.totalAmount;
                      byDay[key].orders += 1;
                    });
                    const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
                    const maxRev = Math.max(...days.map((d) => d.revenue), 1);
                    return (
                      <div className="flex items-end gap-3 h-48 overflow-x-auto pb-2">
                        {days.map((d) => (
                          <div key={d.date} className="flex flex-col items-center gap-1 min-w-[60px] flex-1">
                            <span className="text-[10px] text-np-purple-600 font-medium">
                              R$ {d.revenue.toFixed(0)}
                            </span>
                            <div className="w-full bg-np-wood-100 rounded-t-md relative overflow-hidden" style={{ height: `${(d.revenue / maxRev) * 120}px`, minHeight: "8px" }}>
                              <div className="absolute inset-0 bg-gradient-to-t from-np-purple-700 to-np-purple-500 rounded-t-md"></div>
                            </div>
                            <span className="text-[10px] text-np-purple-400">{d.date}</span>
                            <span className="text-[9px] text-np-purple-300">{d.orders} ped</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Products */}
                  <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                    <h3 className="font-display text-lg text-np-purple-900 mb-4">
                      <i className="ri-trophy-line mr-2 text-np-gold-500"></i>
                      Produtos Mais Vendidos
                    </h3>
                    {(() => {
                      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
                      filteredOrders.forEach((o) => {
                        o.items.forEach((i) => {
                          if (!productMap[i.name]) productMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
                          productMap[i.name].qty += i.quantity;
                          productMap[i.name].revenue += i.price * i.quantity;
                        });
                      });
                      const top = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 8);
                      const maxQty = Math.max(...top.map((t) => t.qty), 1);
                      return (
                        <div className="space-y-3">
                          {top.map((p, idx) => (
                            <div key={p.name}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-np-purple-700 flex items-center gap-1">
                                  <span className="w-5 h-5 bg-np-purple-100 rounded text-[10px] font-bold flex items-center justify-center text-np-purple-700">{idx + 1}</span>
                                  {p.name}
                                </span>
                                <span className="font-bold text-np-purple-900">{p.qty}x</span>
                              </div>
                              <div className="w-full h-2 bg-np-wood-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-np-gold-500 transition-all"
                                  style={{ width: `${(p.qty / maxQty) * 100}%` }}
                                ></div>
                              </div>
                              <p className="text-[10px] text-np-purple-400 mt-0.5">R$ {p.revenue.toFixed(2)} em vendas</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Peak Hours */}
                  <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                    <h3 className="font-display text-lg text-np-purple-900 mb-4">
                      <i className="ri-time-line mr-2 text-np-green-500"></i>
                      Horário de Pico
                    </h3>
                    {(() => {
                      const hourMap: Record<number, { hour: number; orders: number; revenue: number }> = {};
                      filteredOrders.forEach((o) => {
                        const h = new Date(o.createdAt).getHours();
                        if (!hourMap[h]) hourMap[h] = { hour: h, orders: 0, revenue: 0 };
                        hourMap[h].orders += 1;
                        hourMap[h].revenue += o.totalAmount;
                      });
                      const hours = Object.values(hourMap).sort((a, b) => b.orders - a.orders);
                      const maxOrders = Math.max(...hours.map((h) => h.orders), 1);
                      return (
                        <div className="space-y-3">
                          {hours.slice(0, 8).map((h) => (
                            <div key={h.hour}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-np-purple-700">
                                  {String(h.hour).padStart(2, "0")}:00 – {String(h.hour).padStart(2, "0")}:59
                                </span>
                                <span className="font-bold text-np-purple-900">{h.orders} ped</span>
                              </div>
                              <div className="w-full h-2 bg-np-wood-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-np-green-500 transition-all"
                                  style={{ width: `${(h.orders / maxOrders) * 100}%` }}
                                ></div>
                              </div>
                              <p className="text-[10px] text-np-purple-400 mt-0.5">R$ {h.revenue.toFixed(2)}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Mesa vs Delivery + Payment Methods */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                    <h3 className="font-display text-lg text-np-purple-900 mb-4">
                      <i className="ri-pie-chart-line mr-2 text-np-purple-500"></i>
                      Canal de Venda
                    </h3>
                    {(() => {
                      const mesa = filteredOrders.filter((o) => o.orderType === "mesa").length;
                      const delivery = filteredOrders.filter((o) => o.orderType === "delivery").length;
                      const total = mesa + delivery || 1;
                      return (
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-np-purple-700">Pedidos na Mesa</span>
                              <span className="font-bold text-np-purple-900">{mesa} ({Math.round((mesa / total) * 100)}%)</span>
                            </div>
                            <div className="w-full h-3 bg-np-wood-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-np-purple-600 transition-all" style={{ width: `${(mesa / total) * 100}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-np-purple-700">Delivery</span>
                              <span className="font-bold text-np-purple-900">{delivery} ({Math.round((delivery / total) * 100)}%)</span>
                            </div>
                            <div className="w-full h-3 bg-np-wood-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-np-green-600 transition-all" style={{ width: `${(delivery / total) * 100}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                    <h3 className="font-display text-lg text-np-purple-900 mb-4">
                      <i className="ri-bank-card-line mr-2 text-np-gold-500"></i>
                      Formas de Pagamento
                    </h3>
                    {(() => {
                      const methodMap: Record<string, { label: string; count: number; revenue: number; color: string }> = {};
                      filteredOrders.forEach((o) => {
                        const key = o.paymentMethod;
                        const label = key === "pix" ? "PIX" : key === "cartao" ? "Cartão" : "Dinheiro/Caixa";
                        const color = key === "pix" ? "bg-np-green-500" : key === "cartao" ? "bg-np-purple-500" : "bg-np-gold-500";
                        if (!methodMap[key]) methodMap[key] = { label, count: 0, revenue: 0, color };
                        methodMap[key].count += 1;
                        methodMap[key].revenue += o.totalAmount;
                      });
                      const methods = Object.values(methodMap).sort((a, b) => b.count - a.count);
                      const maxCount = Math.max(...methods.map((m) => m.count), 1);
                      return (
                        <div className="space-y-3">
                          {methods.map((m) => (
                            <div key={m.label}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-np-purple-700">{m.label}</span>
                                <span className="font-bold text-np-purple-900">{m.count} ({m.revenue.toFixed(2)})</span>
                              </div>
                              <div className="w-full h-2 bg-np-wood-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${m.color} transition-all`} style={{ width: `${(m.count / maxCount) * 100}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PRODUCTS */}
        {activeTab === "products" && (
          <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-np-purple-900">
                <i className="ri-restaurant-line mr-2 text-np-purple-500"></i>
                Produtos do Cardápio
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshProducts()}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-np-wood-300 hover:bg-np-wood-50 text-np-purple-700 transition-colors whitespace-nowrap"
                  title="Recarregar dados do banco"
                >
                  <i className="ri-refresh-line"></i>
                  Atualizar
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>
                  Novo Produto
                </button>
              </div>
            </div>

            {/* Stock Alert Banner */}
            {(() => {
              const lowStock = dbProducts.filter((p) => p.minStock > 0 && p.stockQuantity <= p.minStock);
              if (lowStock.length === 0) return null;
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-error-warning-line text-red-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-900">Atenção: {lowStock.length} produto{lowStock.length > 1 ? 's' : ''} com estoque baixo</p>
                    <p className="text-xs text-red-700 mt-1">
                      {lowStock.map((p) => `${p.name} (${p.stockQuantity} unid.)`).join(', ')}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3">
              {dbCategories.map((cat) => {
                const catProducts = dbProducts.filter((p) => p.category === cat.id);
                if (catProducts.length === 0) return null;
                return (
                  <div key={cat.id} className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
                    <div className="bg-np-purple-50 px-4 py-3 flex items-center gap-2">
                      <i className={`${cat.icon} text-np-purple-600`}></i>
                      <span className="font-medium text-np-purple-800 text-sm">{cat.name}</span>
                      <span className="text-xs text-np-purple-400 ml-auto">
                        {catProducts.length} itens
                      </span>
                    </div>
                    <div className="divide-y divide-np-wood-100">
                      {catProducts.map((product) => (
                        <div
                          key={product.id}
                          className={`flex items-center gap-4 px-4 py-3 hover:bg-np-wood-50 transition-colors ${
                            !product.active ? "opacity-50" : ""
                          }`}
                        >
                          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-np-wood-100">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-np-wood-400">
                                <i className="ri-image-line"></i>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-np-purple-900 truncate">
                                {product.name}
                              </p>
                              {product.featured && (
                                <span className="bg-np-gold-100 text-np-gold-700 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                  Destaque
                                </span>
                              )}
                              {!product.active && (
                                <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                  Inativo
                                </span>
                              )}
                              {product.minStock > 0 && product.stockQuantity <= product.minStock && (
                                <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-1">
                                  <i className="ri-error-warning-line"></i>
                                  Estoque baixo ({product.stockQuantity})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-np-purple-500 truncate">
                              {(product.description || "").slice(0, 60)}...
                            </p>
                            <p className="text-[10px] text-np-purple-400 mt-0.5">
                              Estoque: <span className={product.minStock > 0 && product.stockQuantity <= product.minStock ? "text-red-600 font-bold" : "text-np-purple-600 font-medium"}>{product.stockQuantity}</span>
                              {product.minStock > 0 && (
                                <span className="text-np-purple-300"> / mín: {product.minStock}</span>
                              )}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-np-purple-900 flex-shrink-0">
                            {product.priceFormatted}
                          </span>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => openEditModal(product)}
                              className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                              title="Editar"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                            <button
                              onClick={() => handleToggleFeatured(product.id, product.featured)}
                              className={`p-1.5 rounded-md transition-colors ${
                                product.featured
                                  ? "bg-np-gold-100 text-np-gold-600 hover:bg-np-gold-200"
                                  : "bg-np-wood-100 text-np-wood-500 hover:bg-np-wood-200"
                              }`}
                              title={product.featured ? "Remover destaque" : "Destacar"}
                            >
                              <i className="ri-star-line"></i>
                            </button>
                            <button
                              onClick={() => handleToggleActive(product.id, product.active)}
                              className={`p-1.5 rounded-md transition-colors ${
                                product.active
                                  ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                                  : "bg-green-50 text-green-600 hover:bg-green-100"
                              }`}
                              title={product.active ? "Desativar" : "Reativar"}
                            >
                              <i className={product.active ? "ri-eye-off-line" : "ri-eye-line"}></i>
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Remover"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STOCK */}
        {activeTab === "stock" && (
          <StockTab addToast={(msg, type) => addToast(msg, type || 'info', 3000)} />
        )}

        {/* DELIVERY ZONES */}
        {activeTab === "delivery_zones" && (
          <DeliveryZonesTab addToast={(msg, type) => addToast(msg, type || 'info', 3000)} />
        )}

        {/* ORDERS */}
        {activeTab === "orders" && (
          <div className="max-w-5xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-np-purple-900">
                <i className="ri-shopping-bag-line mr-2 text-np-purple-500"></i>
                Todos os Pedidos
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => retryOrders()}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-np-purple-300 hover:bg-np-purple-50 text-np-purple-700 transition-colors whitespace-nowrap cursor-pointer"
                  title="Tentar carregar novamente"
                >
                  <i className="ri-refresh-line"></i>
                  Recarregar
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Tem certeza que deseja limpar pedidos de teste/finalizados?\n\nIsso removerá pedidos com status 'Entregue' ou 'Cancelado' com mais de 1 dia.")) {
                      deleteOldOrders(1).then(({ deletedCount, error }) => {
                        if (error) {
                          addToast(`Erro ao limpar: ${error.message}`, "error", 4000);
                        } else {
                          addToast(`${deletedCount} pedidos finalizados removidos`, "success", 3000);
                        }
                      });
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                  Limpar Finalizados
                </button>
                <button
                  onClick={handleClearTestOrders}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-test-tube-line"></i>
                  Limpar Testes
                </button>
                <span className="text-sm text-np-purple-600">
                  {orders.filter((o) => o.status === "pending").length} pendentes
                </span>
              </div>
            </div>

            {ordersError && orders.length === 0 && !loading && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-error-warning-line text-red-600"></i>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900">Erro ao carregar pedidos</p>
                  <p className="text-xs text-red-700 mt-1">{ordersError}</p>
                </div>
                <button
                  onClick={() => retryOrders()}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-refresh-line mr-1"></i>
                  Tentar novamente
                </button>
              </div>
            )}

            {orders.length === 0 ? (
              <div className="text-center py-16 text-np-purple-400 bg-white rounded-xl border border-np-wood-200">
                <i className="ri-shopping-basket-line text-4xl mb-3 block"></i>
                <p className="text-sm">Nenhum pedido registrado</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-np-purple-50 text-np-purple-800">
                        <th className="text-left px-4 py-3 font-medium">ID</th>
                        <th className="text-left px-4 py-3 font-medium">Tipo</th>
                        <th className="text-left px-4 py-3 font-medium">Cliente</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                        <th className="text-right px-4 py-3 font-medium">Total</th>
                        <th className="text-left px-4 py-3 font-medium">Data</th>
                        <th className="text-center px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-np-wood-100">
                      {orders.map((order) => {
                        const isNew = order.status === "pending" && Date.now() - new Date(order.createdAt).getTime() < 300000;
                        return (
                          <tr key={order.id} className={`hover:bg-np-wood-50 ${isNew ? "bg-yellow-50/50" : ""}`}>
                            <td className="px-4 py-3 text-np-purple-500 font-mono text-xs">
                              <button
                                onClick={() => setDetailOrderId(order.id)}
                                className="hover:text-np-purple-700 hover:underline"
                              >
                                {order.id.slice(-8)}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              {order.orderType === "mesa" ? (
                                <span className="inline-flex items-center gap-1 text-np-purple-700">
                                  <i className="ri-armchair-line text-np-purple-400"></i>
                                  Mesa {order.tableNumber}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-np-green-700">
                                  <i className="ri-truck-line text-np-green-400"></i>
                                  Delivery
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-np-purple-800">
                              <div className="flex flex-col">
                                <span>{order.customerName}</span>
                                {order.customerPhone && (
                                  <span className="text-xs text-np-purple-400">{order.customerPhone}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                  order.status === "pending"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : order.status === "preparing"
                                    ? "bg-blue-100 text-blue-700"
                                    : order.status === "ready"
                                    ? "bg-np-green-100 text-np-green-700"
                                    : order.status === "out_for_delivery"
                                    ? "bg-np-purple-100 text-np-purple-700"
                                    : order.status === "delivered"
                                    ? "bg-np-wood-100 text-np-wood-700"
                                    : order.status === "aguardando_pagamento_pix" || order.status === "aguardando_pagamento"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {order.status === "pending" && "Pendente"}
                                {order.status === "preparing" && "Preparando"}
                                {order.status === "ready" && "Pronto"}
                                {order.status === "out_for_delivery" && "Saiu para Entrega"}
                                {order.status === "delivered" && "Entregue"}
                                {order.status === "cancelled" && "Cancelado"}
                                {order.status === "aguardando_pagamento_pix" && "Ag. PIX"}
                                {order.status === "aguardando_pagamento" && "Ag. Pag"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium w-fit ${
                                    order.paymentStatus === "paid"
                                      ? "bg-np-green-100 text-np-green-700"
                                      : "bg-yellow-100 text-yellow-700"
                                  }`}
                                >
                                  {order.paymentStatus === "paid" ? "Pago" : "Pendente"}
                                </span>
                                <span className="text-[10px] text-np-purple-400">
                                  {order.paymentMethod === "caixa" ? "Caixa" : order.paymentMethod === "cartao" ? "Cartão" : "PIX"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-np-purple-900">
                              R$ {order.totalAmount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-np-purple-500 text-xs">
                              {new Date(order.createdAt).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setDetailOrderId(order.id)}
                                  className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                                  title="Ver detalhes"
                                >
                                  <i className="ri-eye-line"></i>
                                </button>
                                <button
                                  onClick={() => openEditOrder(order)}
                                  className="p-1.5 rounded-md bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors"
                                  title="Editar pedido"
                                >
                                  <i className="ri-edit-line"></i>
                                </button>
                                {order.status !== "cancelled" && order.status !== "delivered" && (
                                  <>
                                    {order.status === "pending" && (
                                      <button
                                        onClick={() => handleQuickStatusChange(order.id, "preparing")}
                                        className="p-1.5 rounded-md bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                                        title="Iniciar preparo"
                                      >
                                        <i className="ri-fire-line"></i>
                                      </button>
                                    )}
                                    {order.status === "preparing" && (
                                      <button
                                        onClick={() => handleQuickStatusChange(order.id, "ready")}
                                        className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                                        title="Marcar pronto"
                                      >
                                        <i className="ri-check-double-line"></i>
                                      </button>
                                    )}
                                    {order.status === "ready" && order.orderType === "delivery" && (
                                      <button
                                        onClick={() => handleQuickStatusChange(order.id, "out_for_delivery")}
                                        className="p-1.5 rounded-md bg-np-purple-100 text-np-purple-600 hover:bg-np-purple-200 transition-colors"
                                        title="Saiu para entrega"
                                      >
                                        <i className="ri-truck-line"></i>
                                      </button>
                                    )}
                                    {order.status === "ready" && order.orderType === "mesa" && (
                                      <button
                                        onClick={() => handleQuickStatusChange(order.id, "delivered")}
                                        className="p-1.5 rounded-md bg-np-purple-100 text-np-purple-600 hover:bg-np-purple-200 transition-colors"
                                        title="Marcar entregue"
                                      >
                                        <i className="ri-hand-heart-line"></i>
                                      </button>
                                    )}
                                    {order.status === "out_for_delivery" && (
                                      <button
                                        onClick={() => handleQuickStatusChange(order.id, "delivered")}
                                        className="p-1.5 rounded-md bg-np-wood-100 text-np-wood-600 hover:bg-np-wood-200 transition-colors"
                                        title="Confirmar entrega"
                                      >
                                        <i className="ri-hand-heart-line"></i>
                                      </button>
                                    )}
                                    {order.paymentStatus === "pending" && (
                                      <button
                                        onClick={() => handleQuickPay(order.id)}
                                        className="p-1.5 rounded-md bg-np-green-100 text-np-green-600 hover:bg-np-green-200 transition-colors"
                                        title="Confirmar pagamento"
                                      >
                                        <i className="ri-cash-line"></i>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleCancelOrder(order.id)}
                                      className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                      title="Cancelar"
                                    >
                                      <i className="ri-close-line"></i>
                                    </button>
                                  </>
                                )}
                                {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                                  <button
                                    onClick={() => handleOpenWhatsApp(order)}
                                    className="p-1.5 rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                    title="Enviar status pelo WhatsApp"
                                  >
                                    <i className="ri-whatsapp-line"></i>
                                  </button>
                                )}
                                {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                                  <button
                                    onClick={() => handleSendFeedback(order.id, order.customerName, order.customerPhone!)}
                                    className="p-1.5 rounded-md bg-np-gold-50 text-np-gold-600 hover:bg-np-gold-100 transition-colors"
                                    title="Enviar feedback pelo WhatsApp"
                                  >
                                    <i className="ri-star-line"></i>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteOrder(order.id, order.customerName)}
                                  className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                  title="Excluir pedido permanentemente"
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
          </div>
        )}

        {/* CUSTOMERS */}
        {activeTab === "customers" && (
          <div className="max-w-5xl">
            <h2 className="font-display text-xl text-np-purple-900 mb-4">
              <i className="ri-user-line mr-2 text-np-purple-500"></i>
              Clientes
            </h2>

            {(() => {
              const customerMap = new Map<string, { name: string; phone: string; orders: number; total: number }>();
              filteredOrders.forEach((o) => {
                const key = o.customerPhone || o.customerName;
                const existing = customerMap.get(key);
                if (existing) {
                  existing.orders += 1;
                  existing.total += o.totalAmount;
                } else {
                  customerMap.set(key, {
                    name: o.customerName,
                    phone: o.customerPhone,
                    orders: 1,
                    total: o.totalAmount,
                  });
                }
              });
              const customers = Array.from(customerMap.values()).sort(
                (a, b) => b.total - a.total
              );

              if (customers.length === 0) {
                return (
                  <div className="text-center py-16 text-np-purple-400 bg-white rounded-xl border border-np-wood-200">
                    <i className="ri-user-line text-4xl mb-3 block"></i>
                    <p className="text-sm">Nenhum cliente registrado ainda</p>
                  </div>
                );
              }

              return (
                <div className="bg-white rounded-xl border border-np-wood-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-np-purple-50 text-np-purple-800">
                          <th className="text-left px-4 py-3 font-medium">Nome</th>
                          <th className="text-left px-4 py-3 font-medium">Telefone</th>
                          <th className="text-left px-4 py-3 font-medium">Pedidos</th>
                          <th className="text-right px-4 py-3 font-medium">Total Gasto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-np-wood-100">
                        {customers.map((c, idx) => (
                          <tr key={idx} className="hover:bg-np-wood-50">
                            <td className="px-4 py-3 font-medium text-np-purple-900">
                              {c.name}
                            </td>
                            <td className="px-4 py-3 text-np-purple-600">{c.phone || "—"}</td>
                            <td className="px-4 py-3 text-np-purple-700">{c.orders}</td>
                            <td className="px-4 py-3 text-right font-bold text-np-purple-900">
                              R$ {c.total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* EMPLOYEES */}
        {activeTab === "employees" && (
          <EmployeesTab addToast={(msg, type) => addToast(msg, type || 'info', 3000)} />
        )}

        {/* ACCESSES */}
        {activeTab === "accesses" && (() => {
          const baseUrl = getBaseUrl();

          const handleCopy = (url: string, label: string) => {
            navigator.clipboard.writeText(url).then(() => {
              setCopyFeedback(label);
              setTimeout(() => setCopyFeedback(null), 2000);
            });
          };

          const accesses = [
            {
              label: "Painel do Dono",
              path: "/admin",
              icon: "ri-shield-star-line",
              role: "Dono / Admin",
              description: "Acesso total: dashboard, produtos, pedidos, clientes, funcionários e configurações.",
              color: "np-purple",
              badge: "bg-np-purple-100 text-np-purple-800 border-np-purple-300",
              iconBg: "bg-np-purple-100",
              iconColor: "text-np-purple-600",
              border: "border-np-purple-200",
            },
            {
              label: "Caixa",
              path: "/caixa",
              icon: "ri-coins-line",
              role: "Funcionário Caixa",
              description: "Visualiza pedidos por mesa, fecha contas, confirma pagamentos e imprime recibos.",
              color: "np-green",
              badge: "bg-np-green-100 text-np-green-800 border-np-green-300",
              iconBg: "bg-np-green-100",
              iconColor: "text-np-green-600",
              border: "border-np-green-200",
            },
            {
              label: "Cozinha",
              path: "/cozinha",
              icon: "ri-restaurant-line",
              role: "Funcionário Cozinha",
              description: "Recebe pedidos em tempo real, atualiza status (recebido, preparando, pronto, entregue).",
              color: "np-gold",
              badge: "bg-np-gold-100 text-np-gold-800 border-np-gold-300",
              iconBg: "bg-np-gold-100",
              iconColor: "text-np-gold-600",
              border: "border-np-gold-200",
            },
            {
              label: "Pedido por Mesa (QR Code)",
              path: "/pedidos",
              icon: "ri-qr-code-line",
              role: "Cliente na mesa",
              description: "Link acessado ao escanear o QR Code da mesa. O cliente faz o pedido direto pelo celular.",
              color: "np-wood",
              badge: "bg-np-wood-100 text-np-wood-800 border-np-wood-300",
              iconBg: "bg-np-wood-100",
              iconColor: "text-np-wood-600",
              border: "border-np-wood-200",
            },
            {
              label: "Cardápio Público",
              path: "/cardapio",
              icon: "ri-book-open-line",
              role: "Público geral",
              description: "Cardápio completo visível por qualquer pessoa. Pode ser compartilhado nas redes sociais.",
              color: "np-wood",
              badge: "bg-np-wood-50 text-np-wood-700 border-np-wood-200",
              iconBg: "bg-np-wood-50",
              iconColor: "text-np-wood-500",
              border: "border-np-wood-200",
            },
          ];

          return (
            <div className="max-w-3xl">
              <h2 className="font-display text-xl text-np-purple-900 mb-2">
                <i className="ri-link-m mr-2 text-np-purple-500"></i>
                Acessos do Sistema
              </h2>
              <p className="text-sm text-np-purple-600 mb-6">
                Compartilhe o link correto com cada pessoa da equipe. Cada função tem seu próprio endereço de acesso.
              </p>

              {/* Aviso explicativo */}
              <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-5 mb-6">
                <div className="flex gap-3">
                  <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-information-line text-np-purple-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-np-purple-900 mb-2">Como funciona o acesso por função?</p>
                    <ul className="text-sm text-np-purple-700 space-y-1">
                      <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> <strong>Você (Dono)</strong> acessa sempre pelo <code className="bg-np-purple-100 px-1 rounded text-xs">/admin</code> — tem controle total do sistema</li>
                      <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> <strong>Caixa</strong> acessa pelo <code className="bg-np-purple-100 px-1 rounded text-xs">/caixa</code> — fecha contas e imprime recibos</li>
                      <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> <strong>Cozinha</strong> acessa pelo <code className="bg-np-purple-100 px-1 rounded text-xs">/cozinha</code> — vê os pedidos chegando em tempo real</li>
                      <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> Cada funcionário precisa ter uma conta criada no site. Após o cadastro, você define a função deles na aba <strong>Funcionários</strong></li>
                      <li><i className="ri-arrow-right-s-line text-np-purple-400"></i> O login redireciona <strong>automaticamente</strong> para a área correta de cada um</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Access cards */}
              <div className="space-y-3">
                {accesses.map((item) => {
                  const fullUrl = `${baseUrl}${item.path}`;
                  const isCopied = copyFeedback === item.label;
                  return (
                    <div key={item.path} className={`bg-white rounded-xl border ${item.border} p-4`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 ${item.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <i className={`${item.icon} text-xl ${item.iconColor}`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-semibold text-np-purple-900 text-sm">{item.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${item.badge}`}>
                              {item.role}
                            </span>
                          </div>
                          <p className="text-xs text-np-purple-500 mb-2">{item.description}</p>
                          <div className="flex items-center gap-2 bg-np-wood-50 rounded-lg px-3 py-1.5 w-fit">
                            <i className="ri-links-line text-xs text-np-purple-400"></i>
                            <code className="text-xs text-np-purple-700 font-mono">{fullUrl}</code>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => window.open(`${baseUrl}${item.path}`, "_blank", "noopener,noreferrer")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
                          >
                            <i className="ri-external-link-line"></i>
                            Abrir
                          </button>
                          <button
                            onClick={() => handleCopy(fullUrl, item.label)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                              isCopied
                                ? "bg-np-green-50 border-np-green-300 text-np-green-700"
                                : "bg-white border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50"
                            }`}
                          >
                            <i className={isCopied ? "ri-check-line" : "ri-file-copy-line"}></i>
                            {isCopied ? "Copiado!" : "Copiar link"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* QR Codes das Mesas */}
              <div className="mt-8">
                <h3 className="font-display text-lg text-np-purple-900 mb-2 flex items-center gap-2">
                  <i className="ri-qr-code-line text-np-gold-500"></i>
                  QR Codes das Mesas
                </h3>
                <p className="text-sm text-np-purple-600 mb-4">
                  Gere links e QR Codes para cada mesa. Imprima e cole na mesa para os clientes pedirem direto pelo celular.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {Array.from({ length: 10 }, (_, i) => {
                    const num = i + 1;
                    const tableUrl = `${baseUrl}/pedidos?mesa=${num}`;
                    return (
                      <div key={num} className="bg-white rounded-xl border border-np-wood-200 p-3 text-center hover:border-np-purple-300 transition-colors">
                        <div className="w-10 h-10 bg-np-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <span className="font-display font-bold text-np-purple-700 text-sm">{num}</span>
                        </div>
                        <p className="text-xs font-medium text-np-purple-800 mb-2">Mesa {num}</p>
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => window.open(`${baseUrl}/pedidos?mesa=${num}`, "_blank", "noopener,noreferrer")}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
                          >
                            <i className="ri-external-link-line"></i>
                            Abrir
                          </button>
                          <button
                            onClick={() => handleCopy(tableUrl, `mesa-${num}`)}
                            className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                              copyFeedback === `mesa-${num}`
                                ? "bg-np-green-50 border-np-green-300 text-np-green-700"
                                : "bg-white border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50"
                            }`}
                          >
                            <i className={copyFeedback === `mesa-${num}` ? "ri-check-line" : "ri-file-copy-line"}></i>
                            {copyFeedback === `mesa-${num}` ? "Copiado!" : "Copiar"}
                          </button>
                          <button
                            onClick={() => { setQrTableNumber(num); setShowQrModal(true); }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900 transition-colors whitespace-nowrap"
                          >
                            <i className="ri-qr-code-line"></i>
                            QR Code
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* QR Codes tip */}
              <div className="mt-6 bg-np-gold-50 border border-np-gold-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-np-gold-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-qr-code-line text-np-gold-600"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-np-gold-900 mb-1">Dica: QR Codes das mesas</p>
                  <p className="text-sm text-np-gold-700">
                    Cada mesa tem seu próprio QR Code que já identifica o número da mesa automaticamente (ex: <code className="bg-np-gold-100 px-1 rounded text-xs">/pedidos?mesa=3</code>).
                    Imprima e cole em cada mesa!
                  </p>
                  <a
                    href="/qrcode-mesas"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-np-gold-700 hover:text-np-gold-900 underline"
                  >
                    <i className="ri-qr-code-line"></i>
                    Ir para QR Codes das Mesas
                  </a>
                </div>
              </div>
            </div>
          );
        })()}

        {/* RESERVATIONS */}
        {activeTab === "reservations" && (
          <ReservationsTab />
        )}

        {/* FEEDBACKS */}
        {activeTab === "feedbacks" && (
          <FeedbacksTab />
        )}

        {/* TESTS */}
        {activeTab === "tests" && (
          <AdminTestsPage />
        )}

        {/* HOMOLOGATION */}
        {activeTab === "homologation" && (
          <HomologationTab />
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <div className="max-w-2xl">
            <h2 className="font-display text-xl text-np-purple-900 mb-4">
              <i className="ri-settings-3-line mr-2 text-np-purple-500"></i>
              Configurações
            </h2>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-medium text-np-purple-900 mb-3">Horários de Funcionamento</h3>
                <div className="space-y-2">
                  {[
                    { day: "Segunda", hours: "Fechado" },
                    { day: "Terça", hours: "17:00 - 23:30" },
                    { day: "Quarta", hours: "17:00 - 23:30" },
                    { day: "Quinta", hours: "17:00 - 23:30" },
                    { day: "Sexta", hours: "17:00 - 03:00" },
                    { day: "Sábado", hours: "17:00 - 03:00" },
                    { day: "Domingo", hours: "17:00 - 01:30" },
                  ].map((h) => (
                    <div key={h.day} className="flex items-center justify-between py-2 border-b border-np-wood-100 last:border-0">
                      <span className="text-sm text-np-purple-700">{h.day}</span>
                      <span className="text-sm font-medium text-np-purple-900">{h.hours}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-medium text-np-purple-900 mb-3">Configurações de Mesas</h3>
                <p className="text-sm text-np-purple-600 mb-2">
                  Total de mesas configuradas: <strong>10</strong>
                </p>
                <p className="text-sm text-np-purple-600 mb-2">
                  QR Codes disponíveis: <a href="/qrcode-mesas" className="text-np-purple-600 underline hover:text-np-purple-900">Gerenciar QR Codes</a>
                </p>
              </div>

              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-medium text-np-purple-900 mb-3">Sistema de Pontos (NP Lovers)</h3>
                <div className="space-y-2 text-sm">
                  <p className="text-np-purple-700">Bronze: 0+ pontos</p>
                  <p className="text-np-purple-700">Prata: 300+ pontos</p>
                  <p className="text-np-purple-700">Ouro: 800+ pontos</p>
                  <p className="text-np-purple-700">Platina: 1500+ pontos</p>
                </div>
                <p className="text-xs text-np-purple-400 mt-3">
                  Recompensas: Café (100pts), Bolo (250pts), Brownie (400pts), Torre Batata (600pts), Café com Prosa VIP (1000pts)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-edit-line mr-2 text-np-purple-500"></i>
              Editar Produto
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
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Descrição</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Categoria</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Estoque Atual</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.stock_quantity}
                    onChange={(e) => setEditForm({ ...editForm, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Estoque Mínimo (alerta)</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.min_stock}
                    onChange={(e) => setEditForm({ ...editForm, min_stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">URL da Imagem</label>
                <input
                  type="text"
                  value={editForm.image_url}
                  onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
                {editForm.image_url && (
                  <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden bg-np-wood-100">
                    <img
                      src={editForm.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingProduct(null)}
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

      {/* QR Code Modal */}
      {showQrModal && qrTableNumber && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
            <h3 className="font-display text-lg text-np-purple-900 mb-1">
              <i className="ri-qr-code-line mr-2 text-np-gold-500"></i>
              Mesa {qrTableNumber}
            </h3>
            <p className="text-xs text-np-purple-500 mb-4">
              Escaneie para fazer o pedido direto pelo celular
            </p>
            <div className="bg-np-wood-50 rounded-xl p-4 mb-4 inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${getBaseUrl()}/pedidos?mesa=${qrTableNumber}`)}`}
                alt={`QR Code Mesa ${qrTableNumber}`}
                className="w-48 h-48"
              />
            </div>
            <div className="bg-np-wood-50 rounded-lg px-3 py-2 mb-4">
              <code className="text-xs text-np-purple-700 font-mono break-all">
                {getBaseUrl()}/pedidos?mesa={qrTableNumber}
              </code>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQrModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Fechar
              </button>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`${getBaseUrl()}/pedidos?mesa=${qrTableNumber}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors flex items-center justify-center gap-1"
              >
                <i className="ri-download-line"></i>
                Baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-add-line mr-2 text-np-green-600"></i>
              Novo Produto
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Nome *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Ex: Pastel de Costela"
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Descrição</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  placeholder="Descreva o produto..."
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={createForm.price || ""}
                    onChange={(e) => setCreateForm({ ...createForm, price: parseFloat(e.target.value) || 0 })}
                    placeholder="29.90"
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Categoria</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Estoque Atual</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.stock_quantity || ""}
                    onChange={(e) => setCreateForm({ ...createForm, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Estoque Mínimo (alerta)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.min_stock || ""}
                    onChange={(e) => setCreateForm({ ...createForm, min_stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">URL da Imagem (opcional)</label>
                <input
                  type="text"
                  value={createForm.image_url}
                  onChange={(e) => setCreateForm({ ...createForm, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setCreateForm({ name: "", description: "", price: 0, category: "torres", image_url: "", stock_quantity: 0, min_stock: 0 }); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProduct}
                className="flex-1 bg-np-green-600 hover:bg-np-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                <i className="ri-add-line mr-1"></i>
                Cadastrar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-edit-line mr-2 text-np-purple-500"></i>
              Editar Pedido
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Cliente</label>
                <input
                  type="text"
                  value={editOrderForm.customerName}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, customerName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Telefone</label>
                <input
                  type="text"
                  value={editOrderForm.customerPhone}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, customerPhone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Mesa (se aplicável)</label>
                <input
                  type="number"
                  value={editOrderForm.tableNumber}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, tableNumber: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Status</label>
                  <select
                    value={editOrderForm.status}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, status: e.target.value as Order["status"] })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                  >
                    <option value="pending">Pendente</option>
                    <option value="aguardando_pagamento_pix">Aguardando PIX</option>
                    <option value="aguardando_pagamento">Aguardando Pagamento</option>
                    <option value="preparing">Preparando</option>
                    <option value="ready">Pronto</option>
                    <option value="out_for_delivery">Saiu para Entrega</option>
                    <option value="delivered">Entregue</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1">Pagamento</label>
                  <select
                    value={editOrderForm.paymentStatus}
                    onChange={(e) => setEditOrderForm({ ...editOrderForm, paymentStatus: e.target.value as "pending" | "paid" })}
                    className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                  >
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1">Método de Pagamento</label>
                <select
                  value={editOrderForm.paymentMethod}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, paymentMethod: e.target.value as "caixa" | "cartao" | "pix" })}
                  className="w-full px-4 py-2.5 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm bg-white"
                >
                  <option value="caixa">Dinheiro/Caixa</option>
                  <option value="cartao">Cartão</option>
                  <option value="pix">PIX</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingOrder(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveOrderEdit}
                className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {detailOrderId && (() => {
        const order = orders.find((o) => o.id === detailOrderId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <h3 className="font-display text-lg text-np-purple-900 mb-1">
                <i className="ri-shopping-bag-line mr-2 text-np-purple-500"></i>
                Pedido #{order.id.slice(-8)}
              </h3>
              <p className="text-xs text-np-purple-500 mb-4">
                {new Date(order.createdAt).toLocaleString("pt-BR")}
              </p>

              <div className="space-y-4">
                <div className="bg-np-wood-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Tipo</span>
                    <span className="text-sm font-medium text-np-purple-900">
                      {order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Cliente</span>
                    <span className="text-sm font-medium text-np-purple-900">{order.customerName}</span>
                  </div>
                  {order.customerPhone && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-np-purple-700">Telefone</span>
                      <span className="text-sm font-medium text-np-purple-900">{order.customerPhone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      order.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : order.status === "preparing"
                        ? "bg-blue-100 text-blue-700"
                        : order.status === "ready"
                        ? "bg-np-green-100 text-np-green-700"
                        : order.status === "out_for_delivery"
                        ? "bg-np-purple-100 text-np-purple-700"
                        : order.status === "delivered"
                        ? "bg-np-wood-100 text-np-wood-700"
                        : order.status === "aguardando_pagamento_pix"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {order.status === "pending" && "Pendente"}
                      {order.status === "preparing" && "Preparando"}
                      {order.status === "ready" && "Pronto"}
                      {order.status === "out_for_delivery" && "Saiu para Entrega"}
                      {order.status === "delivered" && "Entregue"}
                      {order.status === "cancelled" && "Cancelado"}
                      {order.status === "aguardando_pagamento_pix" && "Aguardando PIX"}
                      {order.status === "aguardando_pagamento" && "Aguardando Pagamento"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-np-purple-700">Pagamento</span>
                    <span className="text-sm font-medium text-np-purple-900">
                      {order.paymentStatus === "paid" ? "Pago" : "Pendente"} ({order.paymentMethod === "caixa" ? "Caixa" : order.paymentMethod === "cartao" ? "Cartão" : "PIX"})
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-np-purple-800 mb-2">Itens</h4>
                  <div className="space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="bg-np-wood-100 text-np-purple-700 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="text-np-purple-800">{item.name}</span>
                          {item.observation && (
                            <span className="text-xs text-yellow-600 italic">({item.observation})</span>
                          )}
                        </div>
                        <span className="text-np-purple-600">R$ {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-np-wood-200 mt-3 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-np-purple-700">Subtotal</span>
                      <span className="font-medium text-np-purple-900">
                        R$ {order.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}
                      </span>
                    </div>
                    {order.deliveryFee && order.deliveryFee > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-np-purple-700">Taxa de entrega</span>
                        <span className="font-medium text-np-green-700">
                          R$ {Number(order.deliveryFee).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-np-wood-200 pt-2">
                      <span className="text-sm font-medium text-np-purple-700">Total</span>
                      <span className="font-bold text-np-purple-900 text-lg">R$ {order.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDetailOrderId(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
                >
                  Fechar
                </button>
                {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                  <button
                    onClick={() => handleSendFeedback(order.id, order.customerName, order.customerPhone!)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900 transition-colors flex items-center justify-center gap-1"
                  >
                    <i className="ri-whatsapp-line"></i>
                    Enviar Avaliação
                  </button>
                )}
                <button
                  onClick={() => { setDetailOrderId(null); openEditOrder(order); }}
                  className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <i className="ri-edit-line mr-1"></i>
                  Editar Pedido
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}