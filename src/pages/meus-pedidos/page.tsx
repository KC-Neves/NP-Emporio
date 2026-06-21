import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrderHistory } from '@/hooks/useOrderHistory';
import { useGlobalToast } from '@/hooks/useToast';

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  observation?: string;
}

interface Order {
  id: string;
  tableNumber?: number;
  orderType: 'mesa' | 'delivery';
  customerName: string;
  customerPhone: string;
  address?: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  paymentMethod: 'caixa' | 'cartao' | 'pix';
  paymentStatus: 'pending' | 'paid';
  stockDeducted: boolean;
  createdAt: string;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pendente',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: 'ri-time-line',
    timelineClass: 'bg-amber-500',
    description: 'Pedido enviado, aguardando confirmação da cozinha',
  },
  preparing: {
    label: 'Preparando',
    badgeClass: 'bg-sky-100 text-sky-700 border-sky-200',
    icon: 'ri-restaurant-line',
    timelineClass: 'bg-sky-500',
    description: 'Cozinha está preparando seu pedido',
  },
  ready: {
    label: 'Pronto',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: 'ri-check-double-line',
    timelineClass: 'bg-emerald-500',
    description: 'Pedido pronto, aguardando entrega',
  },
  out_for_delivery: {
    label: 'Saiu para Entrega',
    badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: 'ri-truck-line',
    timelineClass: 'bg-purple-500',
    description: 'Seu pedido está a caminho da sua casa',
  },
  delivered: {
    label: 'Entregue',
    badgeClass: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: 'ri-user-received-line',
    timelineClass: 'bg-violet-500',
    description: 'Pedido entregue com sucesso',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
    icon: 'ri-close-circle-line',
    timelineClass: 'bg-red-500',
    description: 'Pedido foi cancelado',
  },
};

const PAYMENT_LABELS: Record<string, string> = {
  caixa: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'PIX',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  mesa: 'Pedido em Mesa',
  delivery: 'Delivery',
};

const STATUS_ORDER = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

function getStatusProgress(status: string): number {
  const idx = STATUS_ORDER.indexOf(status);
  if (idx === -1) return 0;
  return (idx / (STATUS_ORDER.length - 1)) * 100;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

export default function MeusPedidosPage() {
  const { user, loading: authLoading } = useAuth();
  const { orders, loading: ordersLoading } = useOrderHistory();
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = `meus-pedidos-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration: 4000 });
  };
  const navigate = useNavigate();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setShowTimeoutMessage(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowTimeoutMessage(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Pedidos do usuário logado
  const userOrders = useMemo(() => {
    return orders.filter((o) => {
      // Only show orders that belong to the current user (by userId match)
      const belongsToUser = !user || o.userId === user.id;
      const matchesSearch =
        !searchTerm ||
        o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.id.slice(0, 8).toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.items.some((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
      const matchesType = filterType === 'all' || o.orderType === filterType;

      return belongsToUser && matchesSearch && matchesStatus && matchesType;
    });
  }, [orders, searchTerm, filterStatus, filterType, user]);

  const stats = useMemo(() => {
    const total = userOrders.length;
    const entregues = userOrders.filter((o) => o.status === 'delivered').length;
    const pendentes = userOrders.filter((o) => ['pending', 'preparing', 'ready'].includes(o.status)).length;
    const totalGasto = userOrders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    return { total, entregues, pendentes, totalGasto };
  }, [userOrders]);

  const handleReorder = (order: Order) => {
    addToast('Itens adicionados ao carrinho!', 'success');
    navigate('/pedidos');
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-np-wood-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-np-purple-400 animate-spin block mb-4"></i>
          <p className="text-np-purple-600">Carregando sua conta...</p>
          {showTimeoutMessage && (
            <div className="mt-6">
              <p className="text-np-purple-600 text-sm mb-3">
                Estamos tendo problemas para carregar sua conta.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1"></i>
                Recarregar página
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-np-wood-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <i className="ri-lock-line text-4xl text-np-purple-400 block mb-4"></i>
          <p className="text-np-purple-600 mb-4">Faça login para ver seu histórico de pedidos</p>
          <Link
            to="/login"
            className="inline-block bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
          >
            Ir para Login
          </Link>
        </div>
      </div>
    );
  }

  const selectedOrder = showDetailModal ? userOrders.find((o) => o.id === showDetailModal) : null;

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/minha-conta" className="text-white/70 hover:text-white transition-colors text-sm">
              <i className="ri-arrow-left-line mr-1"></i>
              Minha Conta
            </Link>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
            Meus Pedidos
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Acompanhe e revise todos os seus pedidos no NP Empório
          </p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        <div className="max-w-5xl mx-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
              <i className="ri-shopping-bag-3-line text-2xl text-np-purple-600 mb-2 block"></i>
              <p className="font-display text-2xl font-bold text-np-purple-900">{stats.total}</p>
              <p className="text-xs text-np-purple-600">Total de Pedidos</p>
            </div>
            <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
              <i className="ri-check-double-line text-2xl text-emerald-600 mb-2 block"></i>
              <p className="font-display text-2xl font-bold text-np-purple-900">{stats.entregues}</p>
              <p className="text-xs text-np-purple-600">Entregues</p>
            </div>
            <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
              <i className="ri-time-line text-2xl text-amber-500 mb-2 block"></i>
              <p className="font-display text-2xl font-bold text-np-purple-900">{stats.pendentes}</p>
              <p className="text-xs text-np-purple-600">Em Andamento</p>
            </div>
            <div className="bg-white rounded-xl border border-np-wood-200 p-4 text-center">
              <i className="ri-coins-line text-2xl text-np-gold-500 mb-2 block"></i>
              <p className="font-display text-2xl font-bold text-np-purple-900">
                R$ {stats.totalGasto.toFixed(2)}
              </p>
              <p className="text-xs text-np-purple-600">Total Gasto</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-np-wood-200 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-np-purple-400"></i>
                <input
                  type="text"
                  placeholder="Buscar por nome, produto ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:border-np-purple-500 focus:ring-1 focus:ring-np-purple-500"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2.5 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:border-np-purple-500 bg-white"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">Pendente</option>
                  <option value="preparing">Preparando</option>
                  <option value="ready">Pronto</option>
                  <option value="delivered">Entregue</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2.5 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:border-np-purple-500 bg-white"
                >
                  <option value="all">Todos os Tipos</option>
                  <option value="mesa">Mesa</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
            </div>
          </div>

          {/* Orders List */}
          {ordersLoading ? (
            <div className="text-center py-16">
              <i className="ri-loader-4-line text-4xl text-np-purple-400 animate-spin block mb-4"></i>
              <p className="text-np-purple-600">Carregando pedidos...</p>
            </div>
          ) : userOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-np-wood-200 p-12 text-center">
              <i className="ri-shopping-basket-line text-5xl text-np-wood-300 mb-4 block"></i>
              <p className="text-lg text-np-purple-800 mb-2">Nenhum pedido encontrado</p>
              <p className="text-sm text-np-purple-500 mb-6">
                {(searchTerm || filterStatus !== 'all' || filterType !== 'all')
                  ? 'Tente ajustar os filtros de busca'
                  : 'Você ainda não fez nenhum pedido. Que tal começar agora?'}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link
                  to="/pedidos"
                  className="inline-flex items-center gap-2 bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-2.5 px-5 rounded-lg transition-colors whitespace-nowrap"
                >
                  <i className="ri-armchair-line"></i>
                  Pedir em Mesa
                </Link>
                <Link
                  to="/delivery"
                  className="inline-flex items-center gap-2 bg-np-gold-500 hover:bg-np-gold-600 text-white font-medium py-2.5 px-5 rounded-lg transition-colors whitespace-nowrap"
                >
                  <i className="ri-truck-line"></i>
                  Delivery
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {userOrders.map((order) => {
                const status = STATUS_CONFIG[order.status];
                const isExpanded = expandedOrder === order.id;
                const progress = getStatusProgress(order.status);

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-np-wood-200 overflow-hidden transition-all hover:border-np-purple-300"
                  >
                    {/* Card Header */}
                    <div
                      className="p-4 md:p-6 cursor-pointer"
                      onClick={() => toggleExpand(order.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${status.badgeClass}`}>
                            <i className={status.icon}></i>
                            {status.label}
                          </span>
                          <span className="text-xs text-np-purple-400">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-np-purple-500">
                            <i className="ri-calendar-line mr-1"></i>
                            {formatDate(order.createdAt)} às {formatTime(order.createdAt)}
                          </span>
                          <i className={`ri-arrow-down-s-line text-np-purple-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}></i>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-np-purple-800">
                            {ORDER_TYPE_LABELS[order.orderType]}
                          </span>
                          {order.tableNumber && (
                            <span className="text-sm text-np-purple-600">
                              <i className="ri-armchair-line mr-1"></i>
                              Mesa {order.tableNumber}
                            </span>
                          )}
                          {order.address && (
                            <span className="text-sm text-np-purple-600">
                              <i className="ri-map-pin-line mr-1"></i>
                              {order.address}
                            </span>
                          )}
                        </div>
                        <span className="font-display text-lg font-bold text-np-purple-900">
                          {formatCurrency(order.totalAmount)}
                        </span>
                      </div>

                      {/* Progress bar for active orders */}
                      {order.status !== 'cancelled' && order.status !== 'delivered' && (
                        <div className="mt-3">
                          <div className="w-full h-2 bg-np-wood-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${status.timelineClass}`}
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between mt-1">
                            {STATUS_ORDER.map((s, idx) => (
                              <span
                                key={s}
                                className={`text-xs ${
                                  STATUS_ORDER.indexOf(order.status) >= idx
                                    ? 'text-np-purple-700 font-medium'
                                    : 'text-np-wood-400'
                                }`}
                              >
                                {STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 md:px-6 pb-6 border-t border-np-wood-100">
                        {/* Items */}
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-np-purple-800 mb-3">
                            <i className="ri-restaurant-line mr-1 text-np-purple-400"></i>
                            Itens do Pedido
                          </h4>
                          <div className="space-y-2">
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-2 border-b border-np-wood-100 last:border-0"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="w-6 h-6 rounded-full bg-np-purple-100 text-np-purple-700 text-xs font-medium flex items-center justify-center flex-shrink-0">
                                    {item.quantity}
                                  </span>
                                  <div>
                                    <p className="text-sm text-np-purple-800">{item.name}</p>
                                    {item.observation && (
                                      <p className="text-xs text-np-purple-400">
                                        Obs: {item.observation}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm font-medium text-np-purple-700">
                                  {formatCurrency(item.price * item.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-3 border-t border-np-wood-200 mt-2">
                            <span className="text-sm text-np-purple-600">Total</span>
                            <span className="font-display text-lg font-bold text-np-purple-900">
                              {formatCurrency(order.totalAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Payment Info */}
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-np-wood-50 rounded-lg p-3">
                            <p className="text-xs text-np-purple-500 mb-1">Forma de Pagamento</p>
                            <p className="text-sm font-medium text-np-purple-800">
                              <i className="ri-wallet-3-line mr-1 text-np-purple-400"></i>
                              {PAYMENT_LABELS[order.paymentMethod]}
                            </p>
                          </div>
                          <div className="bg-np-wood-50 rounded-lg p-3">
                            <p className="text-xs text-np-purple-500 mb-1">Status do Pagamento</p>
                            <p className={`text-sm font-medium ${
                              order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              <i className={`mr-1 ${order.paymentStatus === 'paid' ? 'ri-check-line' : 'ri-time-line'}`}></i>
                              {order.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                            </p>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-np-purple-800 mb-3">
                            <i className="ri-route-line mr-1 text-np-purple-400"></i>
                            Acompanhar Pedido
                          </h4>
                          <div className="flex items-center gap-2">
                            {STATUS_ORDER.map((s, idx) => {
                              const currentIdx = STATUS_ORDER.indexOf(order.status);
                              const isCompleted = idx <= currentIdx;
                              const isCurrent = idx === currentIdx && order.status !== 'delivered';
                              const sConfig = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];

                              return (
                                <div key={s} className="flex items-center gap-2 flex-1">
                                  <div className={`flex flex-col items-center gap-1 ${isCurrent ? 'animate-pulse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                      isCompleted ? sConfig.timelineClass : 'bg-np-wood-200'
                                    }`}>
                                      <i className={`${sConfig.icon} text-white text-sm`}></i>
                                    </div>
                                    <span className={`text-xs text-center ${isCompleted ? 'text-np-purple-700 font-medium' : 'text-np-wood-400'}`}>
                                      {sConfig.label}
                                    </span>
                                  </div>
                                  {idx < STATUS_ORDER.length - 1 && (
                                    <div className={`h-0.5 flex-1 ${
                                      idx < currentIdx ? sConfig.timelineClass : 'bg-np-wood-200'
                                    }`}></div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex gap-2 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDetailModal(order.id);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-np-purple-300 text-np-purple-700 text-sm font-medium hover:bg-np-purple-50 transition-colors whitespace-nowrap"
                          >
                            <i className="ri-file-list-3-line"></i>
                            Ver Detalhes
                          </button>
                          {order.status === 'delivered' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReorder(order);
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-np-purple-700 text-white text-sm font-medium hover:bg-np-purple-800 transition-colors whitespace-nowrap"
                            >
                              <i className="ri-refresh-line"></i>
                              Pedir Novamente
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowDetailModal(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-np-wood-200 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-np-purple-900">
                  Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-xs text-np-purple-500">
                  {formatDate(selectedOrder.createdAt)} às {formatTime(selectedOrder.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-np-wood-100 transition-colors"
              >
                <i className="ri-close-line text-np-purple-600"></i>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${STATUS_CONFIG[selectedOrder.status].badgeClass}`}>
                  <i className={STATUS_CONFIG[selectedOrder.status].icon}></i>
                  {STATUS_CONFIG[selectedOrder.status].label}
                </span>
                <span className="text-xs text-np-purple-500">
                  {ORDER_TYPE_LABELS[selectedOrder.orderType]}
                </span>
              </div>

              <div className="bg-np-wood-50 rounded-lg p-4">
                <p className="text-sm font-medium text-np-purple-800 mb-2">
                  <i className="ri-user-line mr-1 text-np-purple-400"></i>
                  {selectedOrder.customerName}
                </p>
                {selectedOrder.tableNumber && (
                  <p className="text-sm text-np-purple-600">
                    <i className="ri-armchair-line mr-1 text-np-purple-400"></i>
                    Mesa {selectedOrder.tableNumber}
                  </p>
                )}
                {selectedOrder.address && (
                  <p className="text-sm text-np-purple-600">
                    <i className="ri-map-pin-line mr-1 text-np-purple-400"></i>
                    {selectedOrder.address}
                  </p>
                )}
                {selectedOrder.customerPhone && (
                  <p className="text-sm text-np-purple-600">
                    <i className="ri-phone-line mr-1 text-np-purple-400"></i>
                    {selectedOrder.customerPhone}
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-np-purple-800 mb-2">Itens</h4>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-np-wood-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-np-purple-100 text-np-purple-700 text-xs font-medium flex items-center justify-center">
                          {item.quantity}
                        </span>
                        <span className="text-sm text-np-purple-800">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-np-purple-700">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-np-wood-200">
                  <span className="text-sm font-medium text-np-purple-800">Total</span>
                  <span className="font-display text-xl font-bold text-np-purple-900">
                    {formatCurrency(selectedOrder.totalAmount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-np-wood-50 rounded-lg p-3">
                  <p className="text-xs text-np-purple-500 mb-1">Pagamento</p>
                  <p className="text-sm font-medium text-np-purple-800">
                    {PAYMENT_LABELS[selectedOrder.paymentMethod]}
                  </p>
                </div>
                <div className="bg-np-wood-50 rounded-lg p-3">
                  <p className="text-xs text-np-purple-500 mb-1">Status</p>
                  <p className={`text-sm font-medium ${selectedOrder.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedOrder.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-np-wood-200 p-4">
              <button
                onClick={() => setShowDetailModal(null)}
                className="w-full py-2.5 rounded-lg bg-np-purple-700 text-white font-medium text-sm hover:bg-np-purple-800 transition-colors whitespace-nowrap"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}