import { useState, useEffect, useRef, useCallback } from "react";
import { useKitchenOrders } from "@/hooks/useOrderHistory";
import { useGlobalToast } from "@/hooks/useToast";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import { openWhatsApp, getWhatsAppMessage, getManualFeedbackMessage } from "@/pages/admin/components/OrderNotifications";
import type { Order } from "@/hooks/useOrderHistory";

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE ÁUDIO — AudioContext criado SOMENTE no clique do usuário
// ═══════════════════════════════════════════════════════════════════════════════

function playTone(ctx: AudioContext, freq: number, dur: number, delay: number) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function playKitchenAlert(ctx: AudioContext) {
  console.log("Som chamado para novo pedido");
  playTone(ctx, 1175, 0.15, 0);
  playTone(ctx, 880, 0.28, 0.18);
}

function playReadyAlert(ctx: AudioContext) {
  console.log("Som de pedido PRONTO");
  // Três notas ascendentes — inconfundível com o som de novo pedido
  playTone(ctx, 660, 0.12, 0);
  playTone(ctx, 880, 0.12, 0.14);
  playTone(ctx, 1100, 0.25, 0.28);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type OrderStatus = Order["status"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Recebido", preparing: "Preparando", ready: "Pronto",
  out_for_delivery: "Saiu para Entrega", delivered: "Entregue", cancelled: "Cancelado",
  aguardando_pagamento_pix: "Aguardando Pagamento PIX",
  aguardando_pagamento: "Aguardando Pagamento",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  preparing: "bg-amber-100 text-amber-800 border-amber-300",
  ready: "bg-np-green-100 text-np-green-800 border-np-green-300",
  out_for_delivery: "bg-np-purple-100 text-np-purple-800 border-np-purple-300",
  delivered: "bg-np-wood-100 text-np-wood-800 border-np-wood-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  aguardando_pagamento_pix: "bg-amber-100 text-amber-800 border-amber-300",
  aguardando_pagamento: "bg-amber-100 text-amber-800 border-amber-300",
};

function getNextStatus(order: Order): { next: OrderStatus | null; label: string; color: string } {
  const isDelivery = order.orderType === "delivery";
  const flowMap: Partial<Record<OrderStatus, { next: OrderStatus; label: string; color: string }>> = {
    pending: { next: "preparing", label: "Iniciar Preparo", color: "bg-amber-500 hover:bg-amber-600" },
    preparing: { next: "ready", label: "Marcar Pronto", color: "bg-np-green-600 hover:bg-np-green-700" },
    ready: isDelivery
      ? { next: "out_for_delivery", label: "Saiu para Entrega", color: "bg-np-purple-600 hover:bg-np-purple-700" }
      : { next: "delivered", label: "Marcar Entregue", color: "bg-np-purple-600 hover:bg-np-purple-700" },
    out_for_delivery: { next: "delivered", label: "Confirmar Entrega", color: "bg-np-wood-600 hover:bg-np-wood-700" },
  };
  return flowMap[order.status] || { next: null, label: "", color: "bg-gray-400" };
}

function getPaymentBadge(method: string) {
  if (method === "pix") {
    return { label: "PIX", className: "bg-np-green-100 text-np-green-700 border-np-green-300" };
  }
  if (method === "cartao") {
    return { label: "Cartão", className: "bg-blue-100 text-blue-700 border-blue-300" };
  }
  return { label: "Caixa", className: "bg-np-wood-100 text-np-wood-700 border-np-wood-300" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════════

export default function CozinhaPage() {
  const { orders, newOrderIds, clearNewOrderIds, updateOrderStatus } = useKitchenOrders();
  const { showToast } = useGlobalToast();
  const { getZoneByNeighborhood } = useDeliveryZones();
  const [activeFilter, setActiveFilter] = useState<OrderStatus | "all">("all");
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const prevOrdersRef = useRef<Map<string, OrderStatus>>(new Map());
  const toastIdCounter = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const nextToastId = (prefix: string, suffix: string | number) =>
    `${prefix}-${suffix}-${++toastIdCounter.current}-${Date.now()}`;

  // ── Efeito: notificar novos pedidos ──

  useEffect(() => {
    if (newOrderIds.length === 0) return;
    const trulyNew = newOrderIds.filter((id) => !notifiedIdsRef.current.has(id));
    if (trulyNew.length === 0) { clearNewOrderIds(); return; }

    if (soundEnabled && audioCtxRef.current) {
      try {
        playKitchenAlert(audioCtxRef.current);
      } catch { /* ignora erro de áudio no alerta */ }
    }

    trulyNew.forEach((id) => {
      notifiedIdsRef.current.add(id);
      const order = orders.find((o) => o.id === id);
      if (order) {
        showToast({
          id: nextToastId("new-order", order.id),
          message: `Novo pedido ${order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery"}: ${order.customerName}`,
          type: "info",
          duration: 8000,
          skipBroadcast: true,
        });
      }
    });
    clearNewOrderIds();
  }, [newOrderIds, soundEnabled, orders, showToast, clearNewOrderIds]);

  // ── Efeito: detectar mudanças de status ──

  useEffect(() => {
    const currentMap = new Map<string, OrderStatus>();
    orders.forEach((o) => currentMap.set(o.id, o.status));
    const prevMap = prevOrdersRef.current;
    orders.forEach((order) => {
      const prevStatus = prevMap.get(order.id);
      // Pedido ficou PRONTO → som + toast para o atendente
      if (prevStatus !== undefined && prevStatus !== "ready" && order.status === "ready") {
        if (soundEnabled && audioCtxRef.current) {
          try { playReadyAlert(audioCtxRef.current); } catch { /* ignora */ }
        }
        showToast({
          id: nextToastId("order-ready", order.id),
          message: `${order.customerName} — ${order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery"} PRONTO! Pode chamar o cliente.`,
          type: "success", duration: 6000, skipBroadcast: true,
        });
      }
      if (prevStatus !== undefined && prevStatus !== "out_for_delivery" && order.status === "out_for_delivery") {
        showToast({
          id: nextToastId("out-for-delivery", order.id),
          message: `Delivery de ${order.customerName} saiu para entrega! Entregador deve iniciar o GPS.`,
          type: "info", duration: 5000, skipBroadcast: true,
        });
      }
      if (prevStatus === "out_for_delivery" && (order.status === "delivered" || order.status === "cancelled")) {
        showToast({
          id: nextToastId("delivery-done", order.id),
          message: `Entrega de ${order.customerName} finalizada.`,
          type: "info", duration: 3000, skipBroadcast: true,
        });
      }
    });
    prevOrdersRef.current = currentMap;
  }, [orders, showToast, soundEnabled]);

  // ── Handlers ──

  const filteredOrders = activeFilter === "all"
    ? orders
    : orders.filter((o) => o.status === activeFilter);

  const handleSoundToggle = useCallback(() => {
    if (soundEnabled) {
      setSoundEnabled(false);
      audioCtxRef.current = null;
      return;
    }
    // Criar AudioContext DIRETO no clique — única forma garantida de funcionar
    try {
      const ctx = new AudioContext();
      const tryPlay = () => {
        try {
          playKitchenAlert(ctx);
          audioCtxRef.current = ctx;
          setSoundEnabled(true);
        } catch {
          showToast({
            id: `audio-blocked-${Date.now()}`,
            message: "O navegador bloqueou o áudio. Clique novamente ou verifique o volume.",
            type: "error",
            duration: 4000,
          });
        }
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(tryPlay).catch(() => {
          showToast({
            id: `audio-blocked-${Date.now()}`,
            message: "O navegador bloqueou o áudio. Clique novamente ou verifique o volume.",
            type: "error",
            duration: 4000,
          });
        });
      } else {
        tryPlay();
      }
    } catch {
      showToast({
        id: `audio-blocked-${Date.now()}`,
        message: "O navegador bloqueou o áudio. Clique novamente ou verifique o volume.",
        type: "error",
        duration: 4000,
      });
    }
  }, [soundEnabled, showToast]);

  const handleStatusChange = useCallback(async (order: Order) => {
    const btn = getNextStatus(order);
    if (!btn.next) return;
    if (updatingIds.has(order.id)) return;
    setUpdatingIds((prev) => new Set(prev).add(order.id));
    const result = await updateOrderStatus(order.id, btn.next);
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(order.id);
      return next;
    });
    if (result.error) {
      showToast({ id: nextToastId("status-error", order.id), message: "Erro ao atualizar status: " + result.error, type: "error", duration: 3000 });
    } else {
      showToast({ id: nextToastId("status-ok", order.id), message: `Status: ${STATUS_LABELS[btn.next]}`, type: "success", duration: 3000 });
    }
  }, [updatingIds, updateOrderStatus, showToast, nextToastId]);

  const handleManualFeedback = useCallback((order: Order) => {
    const msg = getManualFeedbackMessage(order.id);
    openWhatsApp(order.customerPhone!, msg);
  }, []);

  const handleManualWhatsApp = useCallback((order: Order) => {
    const avgTime = order.neighborhood
      ? getZoneByNeighborhood(order.neighborhood)?.avg_time
      : undefined;
    const msg = getWhatsAppMessage(order, order.status, avgTime);
    openWhatsApp(order.customerPhone!, msg);
  }, [getZoneByNeighborhood]);

  const handleCancel = useCallback(async (orderId: string) => {
    if (window.confirm("Tem certeza que deseja cancelar este pedido?")) {
      const result = await updateOrderStatus(orderId, "cancelled");
      if (result.error) {
        showToast({ id: nextToastId("cancel-error", orderId), message: "Erro ao cancelar pedido", type: "error", duration: 3000 });
      } else {
        showToast({ id: nextToastId("cancel-ok", orderId), message: "Pedido cancelado", type: "warning", duration: 3000 });
      }
    }
  }, [updateOrderStatus, showToast, nextToastId]);

  // ── Contadores ──

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const preparingCount = orders.filter((o) => o.status === "preparing").length;
  const readyCount = orders.filter((o) => o.status === "ready").length;
  const outForDeliveryCount = orders.filter((o) => o.status === "out_for_delivery").length;

  const filterOptions: { id: OrderStatus | "all"; label: string }[] = [
    { id: "all", label: "Todos Ativos" },
    { id: "pending", label: `Recebidos (${pendingCount})` },
    { id: "preparing", label: `Preparando (${preparingCount})` },
    { id: "ready", label: `Prontos (${readyCount})` },
    ...(outForDeliveryCount > 0 ? [{ id: "out_for_delivery" as OrderStatus, label: `Saiu p/ Entrega (${outForDeliveryCount})` }] : []),
  ];

  const soundIconColor = soundEnabled ? "text-green-400" : "text-red-400";
  const soundIconBg = soundEnabled ? "bg-green-600/20 hover:bg-green-600/30" : "bg-red-600/20 hover:bg-red-600/30";
  const soundIcon = soundEnabled ? "ri-volume-up-line" : "ri-volume-mute-line";
  const soundTooltip = soundEnabled ? "Som ativo — clique para desativar" : "Som desativado — clique para testar";

  // ── Render ──

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-6 md:py-8 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-np-gold-400">
                <i className="ri-restaurant-line mr-2"></i>
                Cozinha NP
              </h1>
              <p className="text-white/70 text-sm mt-1">Gerenciamento de pedidos em tempo real</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Ícone de som */}
              <button
                onClick={handleSoundToggle}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${soundIconBg}`}
                title={soundTooltip}
              >
                <i className={`${soundIcon} text-lg ${soundIconColor}`}></i>
              </button>
              <a href="/" className="text-white/70 hover:text-white text-sm transition-colors">
                <i className="ri-home-line mr-1"></i>Site
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="w-full px-4 sm:px-6 lg:px-12 py-4">
        <div className="grid grid-cols-4 gap-3 max-w-6xl">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
            <p className="text-xs text-yellow-600">Recebidos</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{preparingCount}</p>
            <p className="text-xs text-amber-600">Preparando</p>
          </div>
          <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-np-green-700">{readyCount}</p>
            <p className="text-xs text-np-green-600">Prontos</p>
          </div>
          <div className="bg-np-purple-50 border border-np-purple-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-np-purple-700">{outForDeliveryCount}</p>
            <p className="text-xs text-np-purple-600">Em Entrega</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="w-full px-4 sm:px-6 lg:px-12 pb-4">
        <div className="flex gap-2 overflow-x-auto">
          {filterOptions.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === f.id
                  ? "bg-np-purple-700 text-white"
                  : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="w-full px-4 sm:px-6 lg:px-12 pb-12">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-np-purple-400">
            <i className="ri-check-double-line text-6xl mb-4 block"></i>
            <p className="text-lg font-medium text-np-purple-600">
              {activeFilter === "all" ? "Nenhum pedido ativo" : `Nenhum pedido ${STATUS_LABELS[activeFilter as OrderStatus]?.toLowerCase()}`}
            </p>
            <p className="text-sm mt-2">Aguardando novos pedidos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {filteredOrders.map((order) => {
              const btn = getNextStatus(order);
              const isNew = Date.now() - new Date(order.createdAt).getTime() < 30000;
              const isDelivery = order.orderType === "delivery";
              const payBadge = getPaymentBadge(order.paymentMethod);

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border-2 ${
                    isNew ? "border-np-gold-400 animate-pulse-slow" : "border-np-wood-200"
                  } p-5 transition-all`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                        {isNew && (
                          <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                            <i className="ri-notification-3-line"></i>NOVO!
                          </span>
                        )}
                        {isDelivery ? (
                          <span className="text-xs font-bold text-np-green-700 flex items-center gap-1">
                            <i className="ri-truck-line text-np-green-500"></i>Delivery
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-np-purple-800">
                            <i className="ri-armchair-line mr-1 text-np-purple-500"></i>Mesa {order.tableNumber}
                          </span>
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${payBadge.className}`}>
                          {payBadge.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-np-purple-900">{order.customerName}</p>
                      {order.customerPhone && (
                        <p className="text-xs text-np-purple-500">{order.customerPhone}</p>
                      )}
                      {isDelivery && order.address && (
                        <p className="text-xs text-np-purple-400 mt-0.5 flex items-center gap-1">
                          <i className="ri-map-pin-line"></i>
                          <span className="truncate max-w-[160px]">{order.address}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-np-purple-400 flex-shrink-0">
                      {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-2 mb-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="bg-np-wood-100 text-np-purple-700 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="text-np-purple-800">{item.name}</span>
                        </div>
                        <span className="text-np-purple-600 text-xs">R$ {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Delivery Instructions */}
                  {order.deliveryInstructions && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-yellow-700 font-medium">
                        <i className="ri-alert-line mr-1"></i>Instruções de Entrega:
                      </p>
                      <p className="text-xs text-yellow-800 mt-0.5">{order.deliveryInstructions}</p>
                    </div>
                  )}

                  {/* Observations */}
                  {order.items.some((i) => i.observation) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-yellow-700 font-medium">
                        <i className="ri-alert-line mr-1"></i>Observações:
                      </p>
                      {order.items.filter((i) => i.observation).map((i, idx) => (
                        <p key={idx} className="text-xs text-yellow-800 mt-1">
                          {i.quantity}x {i.name}: {i.observation}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Delivery flow hint */}
                  {isDelivery && order.status === "ready" && (
                    <div className="bg-np-purple-50 border border-np-purple-200 rounded-lg p-2 mb-3 flex items-center gap-2">
                      <i className="ri-truck-line text-np-purple-600 text-sm"></i>
                      <p className="text-xs text-np-purple-700">
                        Próximo: <strong>Saiu para Entrega</strong> — o entregador deve iniciar o GPS em /entregas
                      </p>
                    </div>
                  )}

                  {/* Tracking hint for out_for_delivery */}
                  {isDelivery && order.status === "out_for_delivery" && (
                    <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-2 mb-3 flex items-center gap-2">
                      <i className="ri-map-pin-line text-np-green-600 text-sm"></i>
                      <p className="text-xs text-np-green-700">
                        Aguardando entregador iniciar o rastreamento GPS
                      </p>
                    </div>
                  )}

                  {/* Total & Actions */}
                  <div className="border-t border-np-wood-200 pt-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-np-purple-600">
                        {order.items.reduce((s, i) => s + i.quantity, 0)} itens
                      </span>
                      <span className="font-bold text-np-purple-900">R$ {order.totalAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex gap-2">
                      {btn.next && (
                        <button
                          onClick={() => handleStatusChange(order)}
                          disabled={updatingIds.has(order.id)}
                          className={`flex-1 ${btn.color} text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
                        >
                          {updatingIds.has(order.id) ? (
                            <span className="flex items-center justify-center gap-1">
                              <i className="ri-loader-4-line animate-spin"></i>
                              Processando...
                            </span>
                          ) : (
                            btn.label
                          )}
                        </button>
                      )}
                      {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                        <button
                          onClick={() => handleManualWhatsApp(order)}
                          className="px-3 py-2 rounded-lg text-sm bg-green-50 text-green-600 hover:bg-green-100 transition-colors cursor-pointer"
                          title="Enviar status pelo WhatsApp"
                        >
                          <i className="ri-whatsapp-line"></i>
                        </button>
                      )}
                      {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                        <button
                          onClick={() => handleManualFeedback(order)}
                          className="px-3 py-2 rounded-lg text-sm bg-np-gold-50 text-np-gold-600 hover:bg-np-gold-100 transition-colors cursor-pointer"
                          title="Enviar feedback pelo WhatsApp"
                        >
                          <i className="ri-star-line"></i>
                        </button>
                      )}
                      {order.status !== "cancelled" && order.status !== "delivered" && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          className="px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Cancelar pedido"
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}