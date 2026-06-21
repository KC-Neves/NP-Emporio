import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLoyalty } from '@/hooks/useLoyalty';
import { useReservations } from '@/hooks/useReservations';
import { useOrderHistory } from '@/hooks/useOrderHistory';

const TIERS = [
  { name: 'Bronze', min: 0, color: 'bg-amber-700', textColor: 'text-amber-700', icon: 'ri-medal-line' },
  { name: 'Prata', min: 300, color: 'bg-gray-400', textColor: 'text-gray-500', icon: 'ri-vip-crown-line' },
  { name: 'Ouro', min: 800, color: 'bg-np-gold-500', textColor: 'text-yellow-600', icon: 'ri-vip-diamond-line' },
  { name: 'Platina', min: 1500, color: 'bg-np-purple-600', textColor: 'text-np-purple-600', icon: 'ri-star-smile-line' },
];

const REWARDS = [
  { points: 100, reward: 'Café Espresso grátis' },
  { points: 250, reward: 'Fatia de bolo do dia grátis' },
  { points: 400, reward: 'Brownie artesanal grátis' },
  { points: 600, reward: 'Torre de batata frita grátis' },
  { points: 1000, reward: 'Café com Prosa VIP (2 pessoas)' },
];

export default function MinhaContaPage() {
  const { user, loading: authLoading, error: authError, signOut } = useAuth();
  const { loyalty, history, redeemPoints } = useLoyalty(user?.id);
  const { reservations, cancelReservation } = useReservations();
  const { orders } = useOrderHistory();
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'rewards' | 'reservations'>('overview');
  const [redeemSuccess, setRedeemSuccess] = useState('');
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  // Timeout de segurança para a página não ficar travada em loading
  useEffect(() => {
    if (!authLoading) {
      setShowTimeoutMessage(false);
      return;
    }
    const timer = setTimeout(() => {
      console.error('[MINHA_CONTA] Timeout de 8s atingido. Auth ainda carregando.');
      setShowTimeoutMessage(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // NOTA: não redirecionar para login aqui. O RoleGuard já cuida disso.
  // Se chegamos aqui, o RoleGuard já validou que user existe e tem role correta.

  const currentTier = TIERS.slice().reverse().find((t) => loyalty.points >= t.min) || TIERS[0];
  const nextTier = TIERS.find((t) => t.min > loyalty.points);
  const progress = nextTier ? ((loyalty.points - currentTier.min) / (nextTier.min - currentTier.min)) * 100 : 100;

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  const handleRedeem = (points: number, reward: string) => {
    if (loyalty.points >= points) {
      redeemPoints(points, `Resgate: ${reward}`);
      setRedeemSuccess(`Você resgatou: ${reward}!`);
      setTimeout(() => setRedeemSuccess(''), 4000);
    }
  };

  const userReservations = reservations.filter((r) => user && r.email === user.email);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-np-wood-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-np-purple-400 animate-spin block mb-4"></i>
          <p className="text-np-purple-600">Carregando...</p>
          {showTimeoutMessage && (
            <div className="mt-6 max-w-sm mx-auto">
              <p className="text-np-purple-600 text-sm mb-3">
                Estamos tendo problemas para carregar sua conta.
              </p>
              {authError && (
                <p className="text-red-500 text-xs mb-3">{authError}</p>
              )}
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
        <div className="text-center">
          <i className="ri-lock-line text-4xl text-np-purple-400 block mb-4"></i>
          <p className="text-np-purple-600 mb-4">Faça login para acessar sua conta</p>
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

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="text-white/70 hover:text-white transition-colors text-sm">
              <i className="ri-arrow-left-line mr-1"></i>
              Voltar
            </Link>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
            Minha Conta
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Programa de Fidelidade NP Lovers
          </p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          {/* User Card */}
          <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-np-purple-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-user-line text-2xl text-np-purple-600"></i>
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl text-np-purple-900">{user.full_name || 'Cliente NP'}</h2>
                <p className="text-np-purple-600 text-sm">{user.email}</p>
                {user.phone && <p className="text-np-purple-500 text-sm">{user.phone}</p>}
                {/* Role badge para depuração */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${currentTier.color} text-white`}>
                    <i className={currentTier.icon}></i>
                    {currentTier.name}
                  </span>
                  <span className="text-sm text-np-purple-600">
                    {loyalty.points} pontos
                  </span>
                </div>
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-np-purple-100 text-np-purple-700 border border-np-purple-200">
                    <i className="ri-shield-user-line mr-1"></i>
                    Role: {user.role || 'cliente'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-np-red hover:text-red-600 transition-colors"
              >
                <i className="ri-logout-box-line mr-1"></i>
                Sair
              </button>
            </div>
          </div>

          {redeemSuccess && (
            <div className="bg-np-green-50 border border-np-green-200 text-np-green-700 rounded-lg p-4 mb-6 text-center">
              <i className="ri-check-line mr-2"></i>
              {redeemSuccess}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Visão Geral', icon: 'ri-dashboard-line' },
              { id: 'orders', label: 'Meus Pedidos', icon: 'ri-shopping-bag-line' },
              { id: 'reservations', label: 'Reservas', icon: 'ri-calendar-line' },
              { id: 'rewards', label: 'Recompensas', icon: 'ri-gift-line' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-np-purple-700 text-white'
                    : 'bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400'
                }`}
              >
                <i className={`${tab.icon} mr-1`}></i>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
                <h3 className="font-display text-lg text-np-purple-900 mb-4">
                  <i className="ri-bar-chart-line mr-2 text-np-green-600"></i>
                  Progresso no Programa
                </h3>

                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${currentTier.textColor}`}>
                    {currentTier.name}
                  </span>
                  {nextTier && (
                    <span className="text-sm text-np-purple-500">
                      Falta {nextTier.min - loyalty.points} pts para {nextTier.name}
                    </span>
                  )}
                </div>

                <div className="w-full h-3 bg-np-wood-200 rounded-full overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${currentTier.color}`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TIERS.map((tier) => (
                    <div
                      key={tier.name}
                      className={`text-center p-3 rounded-lg ${
                        loyalty.points >= tier.min
                          ? 'bg-np-purple-50 border border-np-purple-200'
                          : 'bg-np-wood-50 border border-np-wood-200'
                      }`}
                    >
                      <i className={`${tier.icon} text-lg ${loyalty.points >= tier.min ? tier.textColor : 'text-np-wood-400'} block mb-1`}></i>
                      <p className={`text-xs font-bold ${loyalty.points >= tier.min ? tier.textColor : 'text-np-wood-400'}`}>
                        {tier.name}
                      </p>
                      <p className="text-xs text-np-purple-400">{tier.min}+ pts</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-5 text-center">
                  <i className="ri-coins-line text-3xl text-np-gold-500 mb-2 block"></i>
                  <p className="font-display text-2xl font-bold text-np-purple-900">{loyalty.points}</p>
                  <p className="text-sm text-np-purple-600">Pontos Acumulados</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-5 text-center">
                  <i className="ri-shopping-bag-3-line text-3xl text-np-green-600 mb-2 block"></i>
                  <p className="font-display text-2xl font-bold text-np-purple-900">{orders.length}</p>
                  <p className="text-sm text-np-purple-600">Pedidos Realizados</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-5 text-center">
                  <i className="ri-gift-line text-3xl text-np-purple-600 mb-2 block"></i>
                  <p className="font-display text-2xl font-bold text-np-purple-900">
                    {REWARDS.filter((r) => loyalty.points >= r.points).length}
                  </p>
                  <p className="text-sm text-np-purple-600">Recompensas Disponíveis</p>
                </div>
              </div>

              {/* Recent History */}
              {history.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
                  <h3 className="font-display text-lg text-np-purple-900 mb-4">
                    <i className="ri-history-line mr-2 text-np-green-600"></i>
                    Histórico de Pontos
                  </h3>
                  <div className="space-y-2">
                    {history.slice(0, 5).map((h) => (
                      <div key={h.id} className="flex items-center justify-between py-2 border-b border-np-wood-100 last:border-0">
                        <div>
                          <p className="text-sm text-np-purple-800">{h.reason}</p>
                          <p className="text-xs text-np-purple-400">
                            {new Date(h.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${h.points > 0 ? 'text-np-green-600' : 'text-np-red'}`}>
                          {h.points > 0 ? '+' : ''}{h.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg text-np-purple-900">
                  <i className="ri-shopping-bag-line mr-2 text-np-green-600"></i>
                  Histórico de Pedidos
                </h3>
                <Link
                  to="/meus-pedidos"
                  className="inline-flex items-center gap-1 text-sm text-np-purple-600 hover:text-np-purple-800 transition-colors"
                >
                  Ver histórico completo
                  <i className="ri-arrow-right-line"></i>
                </Link>
              </div>

              {orders.length === 0 ? (
                <div className="text-center py-12 text-np-purple-400">
                  <i className="ri-shopping-basket-line text-4xl mb-3 block"></i>
                  <p className="text-sm">Nenhum pedido ainda</p>
                  <p className="text-xs mt-1">
                    Faça seu primeiro pedido por{' '}
                    <Link to="/pedidos" className="text-np-purple-600 hover:underline">
                      mesa
                    </Link>{' '}
                    ou{' '}
                    <Link to="/delivery" className="text-np-purple-600 hover:underline">
                      delivery
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-np-wood-200 rounded-lg p-4 hover:border-np-purple-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                            order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : order.status === 'preparing'
                              ? 'bg-blue-100 text-blue-700'
                              : order.status === 'ready'
                              ? 'bg-np-green-100 text-np-green-700'
                              : order.status === 'out_for_delivery'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-np-wood-100 text-np-wood-700'
                          }`}>
                            {order.status === 'pending' && 'Pendente'}
                            {order.status === 'preparing' && 'Preparando'}
                            {order.status === 'ready' && 'Pronto'}
                            {order.status === 'out_for_delivery' && 'Saiu para Entrega'}
                            {order.status === 'delivered' && 'Entregue'}
                          </span>
                          <span className="text-xs text-np-purple-400 ml-2">
                            {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <span className="font-bold text-np-purple-900">
                          R$ {order.totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-np-purple-800">
                        {order.tableNumber && (
                          <span className="mr-2">
                            <i className="ri-armchair-line mr-1"></i>
                            Mesa {order.tableNumber}
                          </span>
                        )}
                        {order.orderType === 'delivery' && (
                          <span className="mr-2">
                            <i className="ri-truck-line mr-1"></i>
                            Delivery
                          </span>
                        )}
                        <span className="text-np-purple-600">
                          {order.items.reduce((sum, i) => sum + i.quantity, 0)} itens
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reservations Tab */}
          {activeTab === 'reservations' && (
            <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
              <h3 className="font-display text-lg text-np-purple-900 mb-4">
                <i className="ri-calendar-line mr-2 text-np-green-600"></i>
                Minhas Reservas
              </h3>

              {userReservations.length === 0 ? (
                <div className="text-center py-12 text-np-purple-400">
                  <i className="ri-calendar-check-line text-4xl mb-3 block"></i>
                  <p className="text-sm">Nenhuma reserva ainda</p>
                  <p className="text-xs mt-1">
                    <Link to="/reservas" className="text-np-purple-600 hover:underline">
                      Faça sua primeira reserva
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userReservations.map((res) => (
                    <div key={res.id} className="border border-np-wood-200 rounded-lg p-4 hover:border-np-purple-300 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            res.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : res.status === 'confirmed'
                              ? 'bg-np-green-100 text-np-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {res.status === 'pending' && 'Pendente'}
                            {res.status === 'confirmed' && 'Confirmada'}
                            {res.status === 'cancelled' && 'Cancelada'}
                          </span>
                          <span className="text-sm font-medium text-np-purple-800 ml-2">
                            {res.reservationType === 'brunch' ? 'Brunch' : 
                             res.reservationType === 'cafe_com_prosa' ? 'Café com Prosa' :
                             res.reservationType === 'aniversario' ? 'Aniversário' :
                             'Mesa Comum'}
                          </span>
                        </div>
                        {res.status === 'pending' && (
                          <button
                            onClick={() => cancelReservation(res.id)}
                            className="text-xs text-red-500 hover:text-red-700 transition-colors"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-np-purple-700">
                        <i className="ri-calendar-line mr-1 text-np-purple-400"></i>
                        {new Date(res.date).toLocaleDateString('pt-BR')} às {res.time}
                      </p>
                      <p className="text-sm text-np-purple-600">
                        <i className="ri-user-line mr-1 text-np-purple-400"></i>
                        {res.guests} pessoa{res.guests > 1 ? 's' : ''}
                      </p>
                      {res.notes && (
                        <p className="text-xs text-np-purple-400 mt-1">
                          <i className="ri-chat-1-line mr-1"></i>
                          {res.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rewards Tab */}
          {activeTab === 'rewards' && (
            <div className="bg-white rounded-xl shadow-sm border border-np-wood-200 p-6 md:p-8">
              <h3 className="font-display text-lg text-np-purple-900 mb-4">
                <i className="ri-gift-line mr-2 text-np-green-600"></i>
                Recompensas NP Lovers
              </h3>

              <div className="space-y-3">
                {REWARDS.map((reward) => {
                  const canRedeem = loyalty.points >= reward.points;
                  return (
                    <div
                      key={reward.points}
                      className={`border rounded-lg p-4 transition-all ${
                        canRedeem
                          ? 'border-np-green-300 bg-np-green-50'
                          : 'border-np-wood-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            canRedeem ? 'bg-np-green-100' : 'bg-np-wood-100'
                          }`}>
                            <i className={`ri-gift-line ${canRedeem ? 'text-np-green-600' : 'text-np-wood-400'}`}></i>
                          </div>
                          <div>
                            <p className={`font-medium text-sm ${canRedeem ? 'text-np-purple-900' : 'text-np-purple-700'}`}>
                              {reward.reward}
                            </p>
                            <p className="text-xs text-np-purple-500">
                              {reward.points} pontos
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRedeem(reward.points, reward.reward)}
                          disabled={!canRedeem}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                            canRedeem
                              ? 'bg-np-green-600 hover:bg-np-green-700 text-white'
                              : 'bg-np-wood-100 text-np-wood-400 cursor-not-allowed'
                          }`}
                        >
                          {canRedeem ? 'Resgatar' : `${reward.points - loyalty.points} pts faltando`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}