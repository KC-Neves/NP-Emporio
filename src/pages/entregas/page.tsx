import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useOrderHistory, type Order } from "@/hooks/useOrderHistory";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalToast } from "@/hooks/useToast";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { useFeedbacks } from "@/hooks/useFeedbacks";
import { useNavigate } from "react-router-dom";
import DeliveryMap from "@/components/feature/DeliveryMap";

type TabType = "preparando" | "pronto" | "rota" | "entregues" | "ganhos" | "avaliacoes";

// ─── Audio do Entregador — Simples, AudioContext criado apenas no clique ──────
function playEntregaAlert(ctx: AudioContext, type: 'nova' | 'retirada' | 'entregue'): boolean {
  if (ctx.state !== 'running') return false;
  try {
    const now = ctx.currentTime;
    let notas: Array<{ f: number; t: number; d: number; v: number }> = [];
    if (type === 'nova') {
      notas = [
        { f: 660, t: 0, d: 0.12, v: 0.22 },
        { f: 880, t: 0.15, d: 0.15, v: 0.22 },
      ];
    } else if (type === 'retirada') {
      notas = [
        { f: 660, t: 0, d: 0.10, v: 0.22 },
        { f: 880, t: 0.12, d: 0.10, v: 0.22 },
        { f: 1100, t: 0.24, d: 0.12, v: 0.22 },
      ];
    } else {
      notas = [
        { f: 880, t: 0, d: 0.15, v: 0.22 },
        { f: 660, t: 0.17, d: 0.12, v: 0.18 },
      ];
    }
    notas.forEach(({ f, t, d, v }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(v, now + t);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + d);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });
    return true;
  } catch { return false; }
}

// ─── Helper para extrair coordenadas de destino (fixas, do endereço do pedido) ───
interface DestCoords {
  lat: number | null;
  lng: number | null;
}

function useDestinationCoords(order: Order | null): DestCoords {
  const [coords, setCoords] = useState<DestCoords>({ lat: null, lng: null });
  const cachedRef = useRef<Map<string, DestCoords>>(new Map());

  useEffect(() => {
    if (!order || !order.address) {
      setCoords({ lat: null, lng: null });
      return;
    }

    const cacheKey = `${order.address}|${order.neighborhood || ""}`;
    const cached = cachedRef.current.get(cacheKey);
    if (cached) {
      setCoords(cached);
      return;
    }

    let cancelled = false;
    const query = encodeURIComponent(`${order.address}, ${order.neighborhood || ""}`);

    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_KEY || ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.status === "OK" && data.results?.length > 0) {
          const loc = data.results[0].geometry.location;
          const result = { lat: loc.lat, lng: loc.lng };
          cachedRef.current.set(cacheKey, result);
          setCoords(result);
        } else {
          // Fallback: use Nominatim sem chave
          return fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${order.address}, ${order.neighborhood || ""}`)}&limit=1`
          );
        }
      })
      .then((r) => {
        if (!r || cancelled) return;
        return r.json();
      })
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data) || data.length === 0) return;
        const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        cachedRef.current.set(cacheKey, result);
        setCoords(result);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [order?.address, order?.neighborhood]);

  return coords;
}

export default function EntregasPage() {
  const { orders, updateStatus, loading } = useOrderHistory();
  const { feedbacks, loading: feedbacksLoading } = useFeedbacks();
  const { user } = useAuth();
  const { showToast } = useGlobalToast();
  const navigate = useNavigate();
  const { tracking, startTracking, stopTracking } = useDeliveryTracking();
  const [activeTab, setActiveTab] = useState<TabType>("preparando");
  const [selectedDelivery, setSelectedDelivery] = useState<Order | null>(null);
  const trackingStartedRef = useRef<Set<string>>(new Set());
  const [earningsDate, setEarningsDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevStatusRef = useRef<Map<string, Order["status"]>>(new Map());
  const notifiedDeliveryRef = useRef<Set<string>>(new Set());
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());

  const preparingOrders = useMemo(() =>
    orders.filter((o) => o.orderType === "delivery" && o.status === "preparing")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const readyOrders = useMemo(() =>
    orders.filter((o) => o.orderType === "delivery" && o.status === "ready")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const activeDeliveries = useMemo(() =>
    orders.filter((o) => o.orderType === "delivery" && o.status === "out_for_delivery")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const completedDeliveries = useMemo(() =>
    orders.filter((o) => o.orderType === "delivery" && o.status === "delivered")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  // ─── Status helpers (must be before useEffects) ────────────────────────────
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendente",
      preparing: "Preparando",
      ready: "Pronto",
      out_for_delivery: "Saiu para Entrega",
      delivered: "Entregue",
      cancelled: "Cancelado",
      aguardando_pagamento_pix: "Aguardando PIX",
      aguardando_pagamento: "Aguardando Pagamento",
    };
    return labels[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700",
      preparing: "bg-blue-100 text-blue-700",
      ready: "bg-green-100 text-green-700",
      out_for_delivery: "bg-purple-100 text-purple-700",
      delivered: "bg-gray-100 text-gray-700",
      cancelled: "bg-red-100 text-red-700",
      aguardando_pagamento_pix: "bg-amber-100 text-amber-700",
      aguardando_pagamento: "bg-amber-100 text-amber-700",
    };
    return classes[status] || "bg-gray-100 text-gray-700";
  };

  // ─── Sound toggle — AudioContext criado apenas no clique ──────────────────
  const handleSoundToggle = useCallback(() => {
    if (soundEnabled) {
      audioCtxRef.current = null;
      setSoundEnabled(false);
      showToast({
        id: `entregador-audio-off-${Date.now()}`,
        message: 'Notificações sonoras desativadas',
        type: 'info',
        duration: 2500,
        skipBroadcast: true,
      });
      return;
    }
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      playEntregaAlert(ctx, 'nova');
      setSoundEnabled(true);
      showToast({
        id: `entregador-audio-on-${Date.now()}`,
        message: 'Notificações sonoras ativadas! Som de teste tocado.',
        type: 'success',
        duration: 3000,
        skipBroadcast: true,
      });
    } catch {
      showToast({
        id: `entregador-audio-err-${Date.now()}`,
        message: 'Não foi possível ativar o som. Verifique as permissões do navegador.',
        type: 'error',
        duration: 4000,
        skipBroadcast: true,
      });
    }
  }, [soundEnabled, showToast]);

  // ─── Unified delivery notification system ──────────────────────────────────
  // Detecta TODAS as transições de status delivery (novos pedidos + mudanças)
  // Dedup via delivery-alert-{orderId}-{newStatus}
  useEffect(() => {
    const currentMap = new Map<string, Order["status"]>();
    orders.forEach((o) => {
      if (o.orderType === "delivery") currentMap.set(o.id, o.status);
    });

    const prevMap = prevStatusRef.current;

    // First load: just store state, no notifications
    if (prevMap.size === 0) {
      prevStatusRef.current = currentMap;
      return;
    }

    // Check all delivery orders for transitions
    orders.forEach((order) => {
      if (order.orderType !== "delivery") return;
      const prevStatus = prevMap.get(order.id);
      const currStatus = order.status;
      if (prevStatus === currStatus) return;

      // Dedup key prevents repeated alerts for same transition
      const dedupKey = `delivery-alert-${order.id}-${currStatus}`;
      if (notifiedDeliveryRef.current.has(dedupKey)) return;
      notifiedDeliveryRef.current.add(dedupKey);

      // ── TOCAR SOM conforme o tipo de transição ──
      if (soundEnabled && audioCtxRef.current) {
        if (currStatus === 'preparing' || currStatus === 'ready') {
          playEntregaAlert(audioCtxRef.current, 'nova');
        } else if (currStatus === 'out_for_delivery') {
          playEntregaAlert(audioCtxRef.current, 'retirada');
        } else if (currStatus === 'delivered') {
          playEntregaAlert(audioCtxRef.current, 'entregue');
        }
      }

      // Show toast — skip for "delivered" status since handleDeliver shows its own
      if (currStatus !== 'delivered') {
        const isNewInQueue = currStatus === "preparing" || currStatus === "ready";
        showToast({
          id: `delivery-${order.id}-${currStatus}`,
          message: isNewInQueue
            ? `Nova entrega disponível — ${order.customerName}`
            : `${order.customerName}: ${getStatusLabel(currStatus)}`,
          type: isNewInQueue ? "success" : "info",
          duration: 5000,
          skipBroadcast: true,
        });
      }
    });

    prevStatusRef.current = currentMap;
  }, [orders, soundEnabled, showToast]);

  // Geocode destination
  const destCoords = useDestinationCoords(selectedDelivery);

  // Daily earnings — ONLY delivery fees
  const dailyDeliveries = useMemo(() => {
    const startOfDay = new Date(earningsDate + "T00:00:00");
    const endOfDay = new Date(earningsDate + "T23:59:59");
    return completedDeliveries.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= startOfDay && d <= endOfDay;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [completedDeliveries, earningsDate]);

  const dailyEarnings = useMemo(() => {
    const totalFee = dailyDeliveries.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    return {
      totalDeliveries: dailyDeliveries.length,
      totalFee,
    };
  }, [dailyDeliveries]);

  // Delivery ratings from feedbacks
  const deliveryFeedbacks = useMemo(() =>
    feedbacks.filter((f) => f.deliveryRating !== null),
    [feedbacks]
  );

  const deliveryRatingAvg = useMemo(() => {
    if (deliveryFeedbacks.length === 0) return 0;
    const sum = deliveryFeedbacks.reduce((s, f) => s + (f.deliveryRating || 0), 0);
    return Math.round((sum / deliveryFeedbacks.length) * 10) / 10;
  }, [deliveryFeedbacks]);

  // Actions
  const handlePickUp = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      const { success, error } = await updateStatus(orderId, "out_for_delivery");
      if (success) {
        showToast({ id: `pickup-${orderId}`, message: "Pedido retirado! Saiu para entrega.", type: "success", duration: 3000 });
      } else {
        showToast({ id: `pickup-err-${orderId}`, message: `Erro ao retirar pedido: ${error || "erro desconhecido"}`, type: "error", duration: 6000 });
      }
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleDeliver = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    console.log("[ENTREGAS] handleDeliver chamado para:", orderId);
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      const { success, insufficient, error } = await updateStatus(orderId, "delivered");
      console.log("[ENTREGAS] handleDeliver resultado:", { success, insufficient, error });

      if (trackingStartedRef.current.has(orderId)) {
        trackingStartedRef.current.delete(orderId);
        stopTracking();
        setSelectedDelivery(null);
      }

      if (success) {
        if (insufficient && insufficient.length > 0) {
          showToast({ id: `deliver-${orderId}`, message: `⚠️ Estoque insuficiente: ${insufficient.join(", ")}`, type: "warning", duration: 6000 });
        } else {
          showToast({ id: `deliver-${orderId}`, message: "Pedido entregue com sucesso.", type: "success", duration: 4000 });
        }
      } else {
        const errMsg = error || "erro desconhecido";
        console.error("[ENTREGAS] handleDeliver FALHOU:", errMsg);
        showToast({ id: `deliver-err-${orderId}`, message: `Erro ao confirmar entrega: ${errMsg}`, type: "error", duration: 8000 });
      }
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleStartTracking = (order: Order) => {
    if (!navigator.geolocation) {
      showToast({ id: `gps-${order.id}`, message: "Geolocalização não suportada neste dispositivo", type: "error", duration: 4000 });
      return;
    }
    trackingStartedRef.current.add(order.id);
    setSelectedDelivery(order);
    startTracking(order.id);
    showToast({ id: `gps-start-${order.id}`, message: "Rastreamento GPS iniciado! Cliente pode acompanhar.", type: "success", duration: 4000 });
  };

  // ── WhatsApp: formata telefone e abre com window.open ────────────────────
  const handleWhatsApp = useCallback((order: Order) => {
    if (!order.customerPhone || order.customerPhone.trim() === '') {
      showToast({
        id: `whatsapp-nophone-${order.id}`,
        message: 'Cliente sem telefone cadastrado.',
        type: 'warning',
        duration: 4000,
        skipBroadcast: true,
      });
      return;
    }

    const clean = order.customerPhone.replace(/\D/g, '');
    // Adiciona DDI 55 se não tiver (ex: 71988603566 → 5571988603566)
    const national = clean.startsWith('55') ? clean : `55${clean}`;

    if (national.length < 12) {
      showToast({
        id: `whatsapp-invalid-${order.id}`,
        message: 'Número de telefone inválido.',
        type: 'error',
        duration: 4000,
        skipBroadcast: true,
      });
      return;
    }

    const message = 'Olá! Seu pedido da NP Empório está a caminho. O entregador já saiu para realizar a entrega.';
    const url = `https://wa.me/${national}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [showToast]);

  const getPaymentLabel = (method: string) => {
    const labels: Record<string, string> = {
      pix: "PIX",
      cartao: "Cartão",
      caixa: "Dinheiro / Caixa",
    };
    return labels[method] || method;
  };

  // Delivery card — oculta total do pedido, mostra apenas taxa de entrega
  const DeliveryCard = ({ order, showActions }: { order: Order; showActions: boolean }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header tags */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
              #{order.id.slice(-6)}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ${getStatusBadge(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {new Date(order.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>

          {/* Customer info */}
          <h3 className="font-medium text-gray-900 text-lg">{order.customerName}</h3>
          <p className="text-sm text-gray-600 mt-1">
            <i className="ri-phone-line mr-1 text-gray-400"></i>
            {order.customerPhone || "Sem telefone"}
          </p>

          {/* Address */}
          <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-sm text-gray-700 font-medium">
              <i className="ri-map-pin-line mr-1 text-gray-400"></i>
              Endereço de entrega
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {order.address || "Endereço não informado"}
            </p>
            {order.neighborhood && (
              <p className="text-xs text-gray-500 mt-0.5">Bairro: {order.neighborhood}</p>
            )}
            {order.addressReference && (
              <p className="text-xs text-gray-500 mt-0.5">
                <i className="ri-information-line mr-1 text-gray-400"></i>
                Ref: {order.addressReference}
              </p>
            )}
          </div>

          {/* Delivery instructions */}
          {order.deliveryInstructions && (
            <p className="text-sm text-yellow-700 mt-2 bg-yellow-50 rounded-lg p-2 border border-yellow-200">
              <i className="ri-alert-line mr-1 text-yellow-500"></i>
              <strong>Instruções:</strong> {order.deliveryInstructions}
            </p>
          )}

          {/* Items — sem preços individuais */}
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Itens do pedido:</p>
            <div className="space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="bg-gray-100 text-gray-700 text-xs font-bold w-5 h-5 rounded flex items-center justify-center flex-shrink-0">
                    {item.quantity}x
                  </span>
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Taxa de entrega + pagamento — sem total do pedido */}
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            {order.deliveryFee ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Taxa de entrega</span>
                <span className="text-sm font-bold text-gray-900">R$ {order.deliveryFee.toFixed(2)}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Taxa de entrega</span>
                <span className="text-sm text-gray-400">—</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Pagamento</span>
              <span>
                {getPaymentLabel(order.paymentMethod)}
                {order.paymentStatus === "paid" ? " (pago)" : " (pendente)"}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {showActions && (
          <div className="flex flex-col gap-2 ml-4 flex-shrink-0">
            {order.customerPhone && (
              <button
                onClick={() => handleWhatsApp(order)}
                className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors inline-flex items-center justify-center cursor-pointer"
                title="Avisar cliente pelo WhatsApp"
              >
                <i className="ri-whatsapp-line text-lg"></i>
              </button>
            )}
            <button
              onClick={() => setSelectedDelivery(order)}
              className={`p-2 rounded-lg transition-colors ${
                selectedDelivery?.id === order.id
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-600 hover:bg-purple-100"
              }`}
              title="Ver rota no mapa"
            >
              <i className="ri-road-map-line text-lg"></i>
            </button>
            {order.status === "ready" && (
              <button
                onClick={() => handlePickUp(order.id)}
                disabled={processingOrderIds.has(order.id)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              >
                {processingOrderIds.has(order.id) ? (
                  <><i className="ri-loader-4-line animate-spin"></i>Retirando...</>
                ) : (
                  <><i className="ri-riding-line"></i>Retirar pedido</>
                )}
              </button>
            )}
            {order.status === "out_for_delivery" && (
              <>
                {!trackingStartedRef.current.has(order.id) && !tracking.active && (
                  <button
                    onClick={() => handleStartTracking(order)}
                    className="p-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                    title="Iniciar rastreamento GPS"
                  >
                    <i className="ri-map-pin-line text-lg"></i>
                  </button>
                )}
                {trackingStartedRef.current.has(order.id) && tracking.active && (
                  <button
                    onClick={() => { stopTracking(); setSelectedDelivery(null); }}
                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="Parar rastreamento GPS"
                  >
                    <i className="ri-stop-circle-line text-lg"></i>
                  </button>
                )}
                <button
                  onClick={() => handleDeliver(order.id)}
                  disabled={processingOrderIds.has(order.id)}
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  {processingOrderIds.has(order.id) ? (
                    <><i className="ri-loader-4-line animate-spin"></i>Confirmando...</>
                  ) : (
                    <><i className="ri-check-double-line"></i>Confirmar Entrega</>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Empty state
  const EmptyState = ({ icon, title, description }: { icon: string; title: string; description: string }) => (
    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
      <i className={`${icon} text-5xl text-gray-300 mb-4 block`}></i>
      <p className="text-lg font-medium text-gray-700">{title}</p>
      <p className="text-sm text-gray-500 mt-2">{description}</p>
    </div>
  );

  // Tab definitions
  const tabs: { key: TabType; label: string; icon: string; count: number; color: string }[] = [
    { key: "preparando", label: "Preparando", icon: "ri-fire-line", count: preparingOrders.length, color: "bg-blue-600" },
    { key: "pronto", label: "Pronto p/ Retirada", icon: "ri-check-double-line", count: readyOrders.length, color: "bg-green-600" },
    { key: "rota", label: "Em Rota", icon: "ri-truck-line", count: activeDeliveries.length, color: "bg-purple-600" },
    { key: "entregues", label: "Entregues", icon: "ri-check-line", count: completedDeliveries.length, color: "bg-gray-600" },
    { key: "ganhos", label: "Ganhos do Dia", icon: "ri-money-dollar-circle-line", count: dailyDeliveries.length, color: "bg-amber-600" },
    { key: "avaliacoes", label: "Avaliações", icon: "ri-star-line", count: deliveryFeedbacks.length, color: "bg-pink-600" },
  ];

  // Live tracking coordinates from selected order
  const driverLat = selectedDelivery?.deliveryLatitude ?? null;
  const driverLng = selectedDelivery?.deliveryLongitude ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                <i className="ri-truck-line mr-2 text-purple-600"></i>
                Entregas
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {user?.full_name || user?.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Ícone de som */}
              <button
                onClick={handleSoundToggle}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'bg-green-100 hover:bg-green-200'
                    : 'bg-red-50 hover:bg-red-100'
                }`}
                title={
                  soundEnabled
                    ? 'Som ativo — clique para desativar'
                    : 'Som desativado — clique para ativar'
                }
              >
                <i className={`${
                  soundEnabled
                    ? 'ri-volume-up-line text-green-500'
                    : 'ri-volume-mute-line text-red-400'
                } text-lg`}></i>
              </button>
              <button
                onClick={() => navigate("/minha-conta")}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                title="Minha conta"
              >
                <i className="ri-user-line text-lg"></i>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? `${tab.color} text-white`
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <i className={tab.icon}></i>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${
                    activeTab === tab.key ? "bg-white/30" : "bg-gray-200 text-gray-600"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-16">
            <i className="ri-loader-4-line animate-spin text-3xl text-purple-400"></i>
            <p className="text-sm text-gray-500 mt-2">Carregando entregas...</p>
          </div>
        ) : (
          <>
            {/* GPS Tracking Status Banner */}
            {tracking.active && (
              <div className="mb-4 bg-purple-50 border border-purple-300 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                  <i className="ri-map-pin-line text-purple-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-purple-800">Rastreamento de GPS ativo</p>
                  <p className="text-xs text-purple-600 truncate">
                    Sua localização está sendo compartilhada em tempo real
                    {tracking.lastUpdate && ` • ${tracking.lastUpdate.toLocaleTimeString("pt-BR")}`}
                  </p>
                </div>
                <button
                  onClick={() => { stopTracking(); setSelectedDelivery(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <i className="ri-stop-circle-line mr-1"></i>Parar
                </button>
              </div>
            )}

            {/* GPS Error Banner with guidance */}
            {tracking.error && (
              <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <i className="ri-error-warning-line text-amber-500 flex-shrink-0 mt-0.5"></i>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800 mb-1">Problema no GPS</p>
                    <p className="text-sm text-amber-700">{tracking.error}</p>
                    <div className="mt-2 flex flex-col gap-1 text-xs text-amber-600">
                      <p><strong>Android:</strong> Configurações &gt; Localização &gt; Ativar + Permitir para o navegador</p>
                      <p><strong>iPhone:</strong> Ajustes &gt; Privacidade &gt; Serviços de Localização &gt; Ativar + Permitir para o Safari/Chrome</p>
                    </div>
                    <button
                      onClick={() => {
                        stopTracking();
                        setSelectedDelivery(null);
                      }}
                      className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-close-line mr-1"></i>Fechar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* GPS Map with live route — shows with or without GPS active */}
            {selectedDelivery && (selectedDelivery.status === "ready" || selectedDelivery.status === "out_for_delivery") && (
              <div className="mb-4">
                <DeliveryMap
                  lat={driverLat}
                  lng={driverLng}
                  destLat={destCoords.lat}
                  destLng={destCoords.lng}
                  address={selectedDelivery.address}
                  neighborhood={selectedDelivery.neighborhood}
                  height={360}
                />
                {!tracking.active && selectedDelivery.status === "out_for_delivery" && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                    <i className="ri-information-line text-amber-500"></i>
                    <p className="text-xs text-amber-700">
                      GPS não iniciado. A moto aparece na NP Empório. Inicie o rastreamento para ver o movimento em tempo real.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Preparando */}
            {activeTab === "preparando" && (
              <div>
                {preparingOrders.length === 0 ? (
                  <EmptyState icon="ri-fire-line" title="Nenhum pedido em preparo" description="Pedidos delivery que entrarem em preparo aparecerão aqui" />
                ) : (
                  <div className="grid gap-4">
                    {preparingOrders.map((order) => (
                      <DeliveryCard key={order.id} order={order} showActions={false} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Pronto para Retirada */}
            {activeTab === "pronto" && (
              <div>
                {readyOrders.length === 0 ? (
                  <EmptyState icon="ri-check-double-line" title="Nenhum pedido pronto" description="Pedidos delivery prontos para retirada aparecerão aqui" />
                ) : (
                  <div className="grid gap-4">
                    {readyOrders.map((order) => (
                      <DeliveryCard key={order.id} order={order} showActions={true} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Em Rota */}
            {activeTab === "rota" && (
              <div>
                {activeDeliveries.length === 0 ? (
                  <EmptyState icon="ri-truck-line" title="Nenhuma entrega em rota" description="As entregas em andamento aparecerão aqui" />
                ) : (
                  <div className="grid gap-4">
                    {activeDeliveries.map((order) => (
                      <DeliveryCard key={order.id} order={order} showActions={true} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Entregues — sem coluna Total */}
            {activeTab === "entregues" && (
              <div>
                {completedDeliveries.length === 0 ? (
                  <EmptyState icon="ri-check-line" title="Nenhuma entrega concluída" description="Entregas finalizadas aparecerão aqui" />
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-700">
                            <th className="text-left px-4 py-3 font-medium">ID</th>
                            <th className="text-left px-4 py-3 font-medium">Cliente</th>
                            <th className="text-left px-4 py-3 font-medium">Endereço</th>
                            <th className="text-right px-4 py-3 font-medium">Taxa</th>
                            <th className="text-left px-4 py-3 font-medium">Data</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {completedDeliveries.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">#{order.id.slice(-6)}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{order.customerName}</div>
                                <div className="text-xs text-gray-500">{order.customerPhone}</div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">
                                <div className="truncate">{order.address}</div>
                                {order.neighborhood && <span className="text-gray-400 block truncate">{order.neighborhood}</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-amber-600 whitespace-nowrap">
                                {order.deliveryFee ? `R$ ${order.deliveryFee.toFixed(2)}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(order.createdAt).toLocaleString("pt-BR")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Ganhos do Dia — apenas taxas de entrega */}
            {activeTab === "ganhos" && (
              <div>
                {/* Date filter */}
                <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <i className="ri-calendar-line text-gray-400"></i>
                    Data:
                  </label>
                  <input
                    type="date"
                    value={earningsDate}
                    onChange={(e) => setEarningsDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => setEarningsDate(new Date().toISOString().slice(0, 10))}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    Hoje
                  </button>
                </div>

                {/* Summary cards — apenas entregas + taxas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm text-gray-500 mb-1">Entregas concluídas</p>
                    <p className="text-3xl font-bold text-gray-900">{dailyEarnings.totalDeliveries}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm text-gray-500 mb-1">Total em taxas</p>
                    <p className="text-3xl font-bold text-amber-600">R$ {dailyEarnings.totalFee.toFixed(2)}</p>
                  </div>
                </div>

                {/* Daily history — sem coluna Total do pedido */}
                {dailyDeliveries.length === 0 ? (
                  <EmptyState icon="ri-money-dollar-circle-line" title="Nenhuma entrega nesta data" description="Selecione outra data para ver os ganhos" />
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-700">
                            <th className="text-left px-4 py-3 font-medium">Pedido</th>
                            <th className="text-left px-4 py-3 font-medium">Cliente</th>
                            <th className="text-right px-4 py-3 font-medium">Taxa</th>
                            <th className="text-left px-4 py-3 font-medium">Horário</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dailyDeliveries.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">#{order.id.slice(-6)}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{order.customerName}</td>
                              <td className="px-4 py-3 text-right font-medium text-amber-600 whitespace-nowrap">
                                {order.deliveryFee ? `R$ ${order.deliveryFee.toFixed(2)}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(order.createdAt).toLocaleTimeString("pt-BR")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Avaliações */}
            {activeTab === "avaliacoes" && (
              <div>
                {/* Summary */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-4xl font-bold text-gray-900">{deliveryRatingAvg || "—"}</span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i
                              key={star}
                              className={`ri-star-fill text-lg ${
                                star <= Math.round(deliveryRatingAvg) ? "text-amber-400" : "text-gray-200"
                              }`}
                            ></i>
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">{deliveryFeedbacks.length} avaliações</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rating history */}
                {feedbacksLoading ? (
                  <div className="text-center py-8">
                    <i className="ri-loader-4-line animate-spin text-2xl text-purple-400"></i>
                  </div>
                ) : deliveryFeedbacks.length === 0 ? (
                  <EmptyState icon="ri-star-line" title="Nenhuma avaliação de entrega" description="Avaliações de clientes sobre suas entregas aparecerão aqui" />
                ) : (
                  <div className="grid gap-4">
                    {deliveryFeedbacks.map((fb) => (
                      <div key={fb.id} className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">{fb.customerName}</span>
                              {fb.orderId && (
                                <span className="text-xs text-gray-400 font-mono">#{fb.orderId.slice(-6)}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 mb-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <i
                                  key={star}
                                  className={`ri-star-fill text-sm ${
                                    star <= (fb.deliveryRating || 0) ? "text-purple-500" : "text-gray-200"
                                  }`}
                                ></i>
                              ))}
                              <span className="text-xs text-gray-400 ml-1">{fb.deliveryRating}/5</span>
                            </div>
                            {fb.deliveryComment && (
                              <p className="text-sm text-gray-700 italic">"{fb.deliveryComment}"</p>
                            )}
                            {!fb.deliveryComment && (
                              <p className="text-sm text-gray-400 italic">Sem comentário</p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">
                              {new Date(fb.createdAt).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}