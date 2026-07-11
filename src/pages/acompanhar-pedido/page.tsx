import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import DeliveryMap from "@/components/feature/DeliveryMap";
import Footer from "@/components/feature/Footer";
import { getFeedbackUrl } from "@/pages/admin/components/OrderNotifications";

// ─── Audio do Cliente v1 — Notificação leve de atualização ────────────────────
let clienteAudioCtx: AudioContext | null = null;

function getClienteCtx(): AudioContext | null {
  if (!clienteAudioCtx || clienteAudioCtx.state === "closed") {
    try { clienteAudioCtx = new AudioContext(); } catch { return null; }
  }
  return clienteAudioCtx;
}

function clienteIsUnlocked(): boolean {
  try { return localStorage.getItem("np_cliente_audio_unlocked") === "true"; } catch { return false; }
}
function clienteSetUnlocked(v: boolean) {
  try { localStorage.setItem("np_cliente_audio_unlocked", v ? "true" : "false"); } catch { /* noop */ }
}

function clienteIsFirstTime(): boolean {
  try { return localStorage.getItem("np_cliente_audio_first_time") !== "true"; } catch { return true; }
}
function clienteMarkFirstTimeDone() {
  try { localStorage.setItem("np_cliente_audio_first_time", "true"); } catch { /* noop */ }
}

async function clienteUnlock(): Promise<boolean> {
  const ctx = getClienteCtx();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { return false; }
  }
  if (ctx.state === "running") {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
    clienteSetUnlocked(true);
    return true;
  }
  return false;
}

// Notificação leve: um tom único e suave (tipo "pop" de notificação)
function playClienteNotification(): boolean {
  if (!clienteIsUnlocked()) return false;
  const ctx = getClienteCtx();
  if (!ctx || ctx.state !== "running") return false;
  try {
    const now = ctx.currentTime;
    // Tom principal suave
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
    return true;
  } catch { return false; }
}

// ─── Status config base ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
  icon: string;
  description: string;
  deliveryDescription?: string;
}> = {
  pending: {
    label: "Pedido Recebido",
    badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: "ri-time-line",
    description: "Seu pedido foi recebido com sucesso! Estamos organizando tudo para voce.",
  },
  preparing: {
    label: "Em Preparo",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    icon: "ri-restaurant-line",
    description: "Seu pedido esta sendo preparado com carinho.",
    deliveryDescription: "Seu pedido esta sendo preparado com carinho.",
  },
  ready: {
    label: "Pronto",
    badgeClass: "bg-np-green-100 text-np-green-700 border-np-green-200",
    icon: "ri-check-double-line",
    description: "Seu pedido esta pronto! Dirija-se ao balcao para retirada.",
    deliveryDescription: "Seu pedido esta pronto e ja vai sair para entrega!",
  },
  out_for_delivery: {
    label: "Saiu para Entrega",
    badgeClass: "bg-np-purple-100 text-np-purple-700 border-np-purple-200",
    icon: "ri-truck-line",
    description: "Seu pedido saiu para entrega e esta a caminho.",
    deliveryDescription: "Seu pedido saiu para entrega e esta a caminho.",
  },
  delivered: {
    label: "Entregue",
    badgeClass: "bg-np-wood-100 text-np-wood-700 border-np-wood-200",
    icon: "ri-hand-heart-line",
    description: "Seu pedido foi entregue. Bom apetite!",
  },
  cancelled: {
    label: "Cancelado",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    icon: "ri-close-circle-line",
    description: "Este pedido foi cancelado.",
  },
};

// Status sequences by order type
const STATUS_ORDER_MESA = ["pending", "preparing", "ready", "delivered"];
const STATUS_ORDER_DELIVERY = ["pending", "preparing", "ready", "out_for_delivery", "delivered"];

// ─── Geocode destination address ──────────────────────────────────────────────
interface DestCoords {
  lat: number | null;
  lng: number | null;
}

interface OrderData {
  valid: boolean;
  orderId: string;
  customerName: string;
  tableNumber?: number;
  orderType: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  deliveryFee?: number;
  address?: string;
  neighborhood?: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  items: Array<{ name: string; price: number; quantity: number }>;
  createdAt: string;
}

interface QueueInfo {
  participatesInQueue: boolean;
  ordersAhead: number;
  estimatedMinutes: number;
  stations: {
    pasta: number;
    fryer: number;
  };
}

function useDestinationCoords(orderData: OrderData | null): DestCoords {
  const [coords, setCoords] = useState<DestCoords>({ lat: null, lng: null });
  const cachedRef = useRef<Map<string, DestCoords>>(new Map());

  useEffect(() => {
    if (!orderData || !orderData.address) {
      setCoords({ lat: null, lng: null });
      return;
    }

    const cacheKey = `${orderData.address}|${orderData.neighborhood || ""}`;
    const cached = cachedRef.current.get(cacheKey);
    if (cached) {
      setCoords(cached);
      return;
    }

    let cancelled = false;
    const query = encodeURIComponent(`${orderData.address}, ${orderData.neighborhood || ""}`);

    // Try Nominatim (no API key needed)
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data) && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          cachedRef.current.set(cacheKey, result);
          setCoords(result);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [orderData?.address, orderData?.neighborhood]);

  return coords;
}

export default function AcompanharPedidoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState<boolean | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const { getZoneByNeighborhood } = useDeliveryZones();

  // ── Estado do áudio ──
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioReady, setAudioReady] = useState(clienteIsUnlocked());
  const [audioLoading, setAudioLoading] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const audioReadyRef = useRef(clienteIsUnlocked());
  const unlockingRef = useRef(false);
  const hasEverUnlockedRef = useRef(clienteIsUnlocked());
  const prevClienteStatusRef = useRef<string>("");
  const lastClienteSoundRef = useRef(0);

  // ── doUnlock ──
  const doUnlock = useCallback(async (source: string): Promise<boolean> => {
    if (unlockingRef.current) {
      for (let i = 0; i < 50; i++) {
        if (!unlockingRef.current) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      return audioReadyRef.current;
    }
    unlockingRef.current = true;
    setAudioLoading(true);
    try {
      const ok = await clienteUnlock();
      if (ok) {
        audioReadyRef.current = true;
        setAudioReady(true);
        clienteMarkFirstTimeDone();
        return true;
      }
      return false;
    } finally {
      unlockingRef.current = false;
      setAudioLoading(false);
    }
  }, []);

  // ── Auto-unlock ──
  useEffect(() => {
    const handler = () => {
      if (audioReadyRef.current) return;
      if (!unlockingRef.current) doUnlock("auto-click");
    };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [doUnlock]);

  // ── Modal primeira utilização ──
  useEffect(() => {
    if (clienteIsFirstTime() && !audioReadyRef.current && !hasEverUnlockedRef.current) {
      const timer = setTimeout(() => setShowFirstTimeModal(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── Detectar mudanças de status e tocar som ──
  useEffect(() => {
    if (!orderData?.status) return;
    const prev = prevClienteStatusRef.current;

    // Som apenas quando o pedido é entregue
    const notifiableStatuses = ["delivered"];
    if (prev && prev !== orderData.status && notifiableStatuses.includes(orderData.status)) {
      if (soundEnabled && audioReadyRef.current) {
        const now = Date.now();
        if (now - lastClienteSoundRef.current >= 500) {
          lastClienteSoundRef.current = now;
          playClienteNotification();
        }
      }
    }

    prevClienteStatusRef.current = orderData.status;
  }, [orderData?.status, soundEnabled]);

  // ── Sound toggle ──
  const handleClienteSoundToggle = useCallback(async () => {
    if (!audioReadyRef.current && !unlockingRef.current) {
      setAudioLoading(true);
      const ok = await doUnlock("header-icon");
      setAudioLoading(false);
      if (ok) {
        setSoundEnabled(true);
        return;
      }
      return;
    }
    setSoundEnabled((prev) => !prev);
  }, [doUnlock]);

  const handleFirstTimeAccept = useCallback(async () => {
    setShowFirstTimeModal(false);
    clienteMarkFirstTimeDone();
    setAudioLoading(true);
    const ok = await doUnlock("first-time-modal");
    setAudioLoading(false);
    if (ok) setSoundEnabled(true);
  }, [doUnlock]);

  const handleFirstTimeDecline = useCallback(() => {
    setShowFirstTimeModal(false);
    clienteMarkFirstTimeDone();
  }, []);

  // Geocode destination for map
  const destCoords = useDestinationCoords(orderData);

  const fetchQueueInfo = useCallback(async (orderId: string) => {
    try {
      setQueueLoading(true);

      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/get-order-queue?orderId=${encodeURIComponent(orderId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!response.ok) {
        console.error("[QUEUE] Falha ao consultar fila:", response.status);
        return;
      }

      const result = await response.json();

      setQueueInfo({
        participatesInQueue: result.participatesInQueue === true,
        ordersAhead: Number(result.ordersAhead || 0),
        estimatedMinutes: Number(result.estimatedMinutes || 35),
        stations: {
          pasta: Number(result.stations?.pasta || 0),
          fryer: Number(result.stations?.fryer || 0),
        },
      });
    } catch (queueError) {
      console.error("[QUEUE] Erro ao consultar fila:", queueError);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const validateOrder = async () => {
    if (!codigo) {
      setValid(false);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/validate-tracking?code=${encodeURIComponent(codigo)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!response.ok) {
        setValid(false);
      } else {
        const result = await response.json();
        if (result.valid) {
          setValid(true);
          setOrderData({
            valid: true,
            orderId: result.orderId,
            customerName: result.customerName,
            tableNumber: result.tableNumber,
            orderType: result.orderType,
            status: result.status,
            paymentStatus: result.paymentStatus,
            totalAmount: result.totalAmount,
            deliveryFee: result.deliveryFee,
            address: result.address,
            neighborhood: result.neighborhood,
            deliveryLatitude: result.deliveryLatitude,
            deliveryLongitude: result.deliveryLongitude,
            items: result.items || [],
            createdAt: result.createdAt,
          });

          await fetchQueueInfo(result.orderId);
        } else {
          setValid(false);
        }
      }
    } catch {
      setValid(false);
      setError("Erro ao verificar pedido.");
    } finally {
      setLoading(false);
    }
  };

  // Initial validation
  useEffect(() => {
    validateOrder();
  }, [codigo]);

  // Supabase Realtime subscription for live status updates
  useEffect(() => {
    if (!orderData?.orderId) return;

    const channel = supabase
      .channel(`acompanhar-pedido-${orderData.orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderData.orderId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (updated.status || updated.delivery_latitude || updated.delivery_longitude) {
            setOrderData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                status: updated.status ? String(updated.status) : prev.status,
                paymentStatus: String(updated.payment_status || updated.paymentStatus || prev.paymentStatus),
                deliveryLatitude: updated.delivery_latitude !== undefined
                  ? updated.delivery_latitude === null ? null : Number(updated.delivery_latitude)
                  : prev.deliveryLatitude,
                deliveryLongitude: updated.delivery_longitude !== undefined
                  ? updated.delivery_longitude === null ? null : Number(updated.delivery_longitude)
                  : prev.deliveryLongitude,
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderData?.orderId]);

  // Real-time delivery_tracking subscription for faster GPS updates
  useEffect(() => {
    if (!orderData?.orderId) return;

    const trackChannel = supabase
      .channel(`tracking-${orderData.orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "delivery_tracking",
          filter: `order_id=eq.${orderData.orderId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newLat = row.latitude != null ? Number(row.latitude) : null;
          const newLng = row.longitude != null ? Number(row.longitude) : null;
          if (newLat != null && newLng != null) {
            setOrderData((prev) => {
              if (!prev) return prev;
              return { ...prev, deliveryLatitude: newLat, deliveryLongitude: newLng };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(trackChannel);
    };
  }, [orderData?.orderId]);

  // Poll for status updates every 10 seconds as fallback
  useEffect(() => {
    if (!codigo || !valid || !orderData) return;
    const interval = setInterval(() => {
      validateOrder();
    }, 10000);
    return () => clearInterval(interval);
  }, [codigo, valid, orderData]);

  // Atualiza a posição na fila a cada 10 segundos
  useEffect(() => {
    if (!orderData?.orderId) return;

    fetchQueueInfo(orderData.orderId);

    const interval = setInterval(() => {
      fetchQueueInfo(orderData.orderId);
    }, 10000);

    return () => clearInterval(interval);
  }, [orderData?.orderId, fetchQueueInfo]);

  // Timeline logic
  const isDelivery = orderData?.orderType === "delivery";
  const statusOrder = isDelivery ? STATUS_ORDER_DELIVERY : STATUS_ORDER_MESA;
  const currentStatusIdx = statusOrder.indexOf(orderData?.status || "");

  // Real-time delivery zone data
  const zoneData = orderData?.neighborhood
    ? getZoneByNeighborhood(orderData.neighborhood)
    : undefined;
  const realAvgTime = zoneData?.avg_time || "30–50 min";
  const preparingTime = orderData
    ? (() => {
        const itemCount = orderData.items.reduce((sum, i) => sum + i.quantity, 0);
        if (itemCount <= 2) return "15-20 minutos";
        if (itemCount <= 5) return "20-30 minutos";
        return "30-40 minutos";
      })()
    : "15-30 minutos";

  // Helper to get contextual description
  const getStatusDescription = (status: string, orderType: string) => {
    const config = STATUS_CONFIG[status];
    if (!config) return "";
    if (orderType === "delivery" && config.deliveryDescription) {
      return config.deliveryDescription;
    }
    return config.description;
  };

  // Driver coordinates
  const driverLat = orderData?.deliveryLatitude ?? null;
  const driverLng = orderData?.deliveryLongitude ?? null;

  return (
    <div className="min-h-screen bg-np-wood-50 flex flex-col">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm mb-4 cursor-pointer"
          >
            <i className="ri-arrow-left-line"></i>
            Voltar para o site
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
                Acompanhar Pedido
              </h1>
              <p className="text-white/80 mt-2 text-sm md:text-base">
                NP Emporio Cafeteria &amp; Massas
              </p>
            </div>
            {/* Ícone de som discreto */}
            <button
              onClick={handleClienteSoundToggle}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                audioLoading
                  ? "bg-white/10"
                  : soundEnabled
                    ? "bg-green-600/20 hover:bg-green-600/30"
                    : "bg-red-600/20 hover:bg-red-600/30"
              }`}
              title={
                audioLoading
                  ? "Verificando áudio..."
                  : soundEnabled
                    ? "Som ativo — clique para desativar"
                    : "Som desativado — clique para ativar"
              }
            >
              <i className={`${
                audioLoading
                  ? "ri-loader-4-line animate-spin text-white/40"
                  : soundEnabled
                    ? "ri-volume-up-line text-green-400"
                    : "ri-volume-mute-line text-red-400"
              } text-lg`}></i>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        <div className="max-w-xl mx-auto">
          {/* Loading */}
          {loading && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 md:p-10 text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400 mb-4 block"></i>
              <p className="text-sm text-np-purple-600">Verificando seu pedido...</p>
            </div>
          )}

          {/* Invalid */}
          {!loading && valid === false && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 md:p-10 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-error-warning-line text-3xl text-red-500"></i>
              </div>
              <h2 className="font-display text-xl text-np-purple-900 mb-2">
                Pedido Nao Encontrado
              </h2>
              <p className="text-np-purple-600 text-sm mb-2">
                Este link de acompanhamento nao e valido ou ja expirou.
              </p>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="/"
                  className="px-6 py-2.5 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1"
                >
                  <i className="ri-home-line mr-1"></i>
                  Pagina Inicial
                </a>
                <a
                  href="/cardapio"
                  className="px-6 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1"
                >
                  <i className="ri-restaurant-line mr-1"></i>
                  Ver Cardapio
                </a>
              </div>
            </div>
          )}

          {/* Valid Order */}
          {!loading && valid === true && orderData && (
            <div className="space-y-6">
              {/* Status Card */}
              <div className="bg-white rounded-xl border border-np-wood-200 p-6 md:p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-np-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className={`${STATUS_CONFIG[orderData.status]?.icon || "ri-time-line"} text-3xl text-np-purple-600`}></i>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium border ${STATUS_CONFIG[orderData.status]?.badgeClass || "bg-np-wood-100 text-np-wood-700"}`}
                  >
                    <i className={STATUS_CONFIG[orderData.status]?.icon || "ri-time-line"}></i>
                    {STATUS_CONFIG[orderData.status]?.label || orderData.status}
                  </span>
                  <p className="text-sm text-np-purple-600 mt-3">
                    {getStatusDescription(orderData.status, orderData.orderType)}
                  </p>
                </div>

                {/* Dynamic Timeline */}
                <div className="mt-4">
                  <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${statusOrder.length}, 1fr)` }}>
                    {statusOrder.map((s, idx) => {
                      const isCompleted = idx <= currentStatusIdx && orderData.status !== "cancelled";
                      const isCurrent = idx === currentStatusIdx && orderData.status !== "delivered";
                      const sConfig = STATUS_CONFIG[s];
                      return (
                        <div key={s} className="flex flex-col items-center gap-1">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                              isCompleted
                                ? "bg-np-purple-600"
                                : "bg-np-wood-200"
                            } ${isCurrent ? "ring-2 ring-np-purple-400 ring-offset-1" : ""}`}
                          >
                            <i className={`${sConfig?.icon || "ri-time-line"} text-white text-xs`}></i>
                          </div>
                          <span
                            className={`text-[10px] text-center leading-tight ${
                              isCompleted ? "text-np-purple-700 font-medium" : "text-np-wood-400"
                            } ${isCurrent ? "animate-pulse" : ""}`}
                          >
                            {sConfig?.label || s}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-np-wood-200 rounded-full mt-3 overflow-hidden">
                    <div
                      className="h-full bg-np-purple-600 rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          orderData.status === "cancelled"
                            ? 0
                            : currentStatusIdx < 0
                            ? 0
                            : ((currentStatusIdx / (statusOrder.length - 1)) * 100)
                        }%`,
                      }}
                    ></div>
                  </div>
                  {/* Type label */}
                  <p className="text-center text-xs text-np-purple-400 mt-2">
                    {isDelivery ? (
                      <span className="inline-flex items-center gap-1">
                        <i className="ri-truck-line"></i>
                        Pedido Delivery — 5 etapas
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <i className="ri-armchair-line"></i>
                        Pedido na Mesa — 4 etapas
                      </span>
                    )}
                  </p>
                </div>

                {/* Payment Status */}
                <div className="mt-6 flex items-center justify-center gap-2">
                  <span className="text-sm text-np-purple-500">Pagamento:</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      orderData.paymentStatus === "paid"
                        ? "bg-np-green-100 text-np-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    <i className={orderData.paymentStatus === "paid" ? "ri-check-line" : "ri-time-line"}></i>
                    {orderData.paymentStatus === "paid" ? "Pago" : "Pendente"}
                  </span>
                </div>
              </div>

              {/* Fila inteligente da cozinha */}
              {queueInfo?.participatesInQueue &&
                ["pending", "preparing"].includes(orderData.status) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i className="ri-timer-flash-line text-2xl text-amber-700"></i>
                      </div>

                      <div className="flex-1">
                        <p className="text-base font-bold text-amber-900">
                          {queueLoading
                            ? "Atualizando sua posição na fila..."
                            : queueInfo.ordersAhead > 0
                            ? `Há ${queueInfo.ordersAhead} ${
                                queueInfo.ordersAhead === 1
                                  ? "pedido"
                                  : "pedidos"
                              } à sua frente`
                            : "Seu pedido é o próximo da fila"}
                        </p>

                        <p className="text-sm text-amber-800 mt-1">
                          O tempo médio estimado para ficar pronto é de aproximadamente{" "}
                          <strong>{queueInfo.estimatedMinutes} minutos</strong>.
                        </p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {queueInfo.stations.pasta > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-200 text-xs font-medium text-amber-800">
                              <i className="ri-restaurant-2-line"></i>
                              Fila de massas: {queueInfo.stations.pasta}
                            </span>
                          )}

                          {queueInfo.stations.fryer > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-200 text-xs font-medium text-amber-800">
                              <i className="ri-fire-line"></i>
                              Fila da fritadeira: {queueInfo.stations.fryer}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-amber-700 mt-3">
                          A posição considera pedidos de mesa e delivery com macarrão,
                          batatas e salgados fritos.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              {/* Feedback CTA — só após entrega */}
              {orderData.status === "delivered" && (
                <div className="bg-gradient-to-r from-np-purple-50 to-np-gold-50 rounded-xl border border-np-purple-200 p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-star-fill text-xl text-np-gold-500"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-np-purple-900">
                        Como foi sua experiencia?
                      </p>
                      <p className="text-xs text-np-purple-600 mt-0.5">
                        Sua avaliacao nos ajuda a melhorar sempre!
                      </p>
                    </div>
                    <a
                      href={getFeedbackUrl(orderData.orderId)}
                      className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
                    >
                      <i className="ri-star-line mr-1"></i>
                      Avaliar
                    </a>
                  </div>
                </div>
              )}

              {/* Order Details */}
              <div className="bg-white rounded-xl border border-np-wood-200 p-6">
                <h3 className="font-display text-lg text-np-purple-900 mb-4">
                  <i className="ri-file-list-3-line mr-2 text-np-purple-500"></i>
                  Detalhes do Pedido
                </h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                    <span className="text-sm text-np-purple-600">Cliente</span>
                    <span className="text-sm font-medium text-np-purple-900">{orderData.customerName}</span>
                  </div>
                  {orderData.tableNumber && (
                    <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                      <span className="text-sm text-np-purple-600">Mesa</span>
                      <span className="text-sm font-medium text-np-purple-900">{orderData.tableNumber}</span>
                    </div>
                  )}
                  {orderData.orderType === "delivery" && (
                    <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                      <span className="text-sm text-np-purple-600">Tipo</span>
                      <span className="text-sm font-medium text-np-purple-900">
                        <i className="ri-truck-line mr-1 text-np-green-500"></i>
                        Delivery
                      </span>
                    </div>
                  )}
                  {orderData.address && (
                    <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                      <span className="text-sm text-np-purple-600">Endereco</span>
                      <span className="text-sm font-medium text-np-purple-900 text-right max-w-[200px]">
                        {orderData.address}
                      </span>
                    </div>
                  )}
                  {orderData.deliveryFee != null && orderData.deliveryFee > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                      <span className="text-sm text-np-purple-600">Taxa de entrega</span>
                      <span className="text-sm font-medium text-np-green-700">
                        R$ {Number(orderData.deliveryFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                    <span className="text-sm text-np-purple-600">Data</span>
                    <span className="text-sm font-medium text-np-purple-900">
                      {new Date(orderData.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-np-wood-100">
                    <span className="text-sm text-np-purple-600">Pedido</span>
                    <span className="text-sm font-medium text-np-purple-900 font-mono">
                      #{orderData.orderId.slice(-8)}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-np-purple-800 mb-2">Itens</h4>
                  <div className="space-y-2">
                    {(orderData.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-np-wood-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-np-purple-100 text-np-purple-700 text-xs font-medium flex items-center justify-center">
                            {item.quantity}
                          </span>
                          <span className="text-sm text-np-purple-800">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium text-np-purple-700">
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-np-wood-200 mt-2">
                    <span className="text-sm font-medium text-np-purple-800">Subtotal</span>
                    <span className="text-sm font-medium text-np-purple-900">
                      R$ {orderData.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}
                    </span>
                  </div>
                  {orderData.deliveryFee != null && orderData.deliveryFee > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-medium text-np-purple-800">Taxa de entrega</span>
                      <span className="text-sm font-medium text-np-green-700">
                        R$ {Number(orderData.deliveryFee).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-np-wood-200 mt-2">
                    <span className="text-sm font-medium text-np-purple-800">Total</span>
                    <span className="font-display text-xl font-bold text-np-purple-900">
                      R$ {Number(orderData.totalAmount).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live tracking — percurso ao vivo para clientes de delivery */}
              {(orderData.status === "ready" || orderData.status === "out_for_delivery") && orderData.orderType === "delivery" && (
                <div className="space-y-4">
                  {/* Live Map with route */}
                  <DeliveryMap
                    lat={driverLat}
                    lng={driverLng}
                    destLat={destCoords.lat}
                    destLng={destCoords.lng}
                    address={orderData.address}
                    neighborhood={orderData.neighborhood}
                    height={340}
                  />

                  <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-time-line text-np-purple-600"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-np-purple-800">
                        Tempo estimado de chegada: {realAvgTime}
                      </p>
                      <p className="text-xs text-np-purple-600">
                        O entregador esta a caminho. A localizacao e atualizada em tempo real.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preparing time estimate banner */}
              {orderData.status === "preparing" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-restaurant-line text-amber-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      Tempo estimado: {preparingTime}
                    </p>
                    <p className="text-xs text-amber-700">
                      Estamos preparando seu pedido com todo carinho.
                    </p>
                  </div>
                </div>
              )}

              {/* Ready banner */}
              {orderData.status === "ready" && (
                <div className="bg-np-green-50 border border-np-green-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-np-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-check-double-line text-np-green-600"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-np-green-800">
                      {orderData.orderType === "mesa"
                        ? "Seu pedido esta pronto! Dirija-se ao balcao para retirada."
                        : "Seu pedido esta pronto e ja vai sair para entrega!"}
                    </p>
                  </div>
                </div>
              )}

              {/* Auto-refresh notice */}
              <div className="bg-np-purple-50 border border-np-purple-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-refresh-line text-np-purple-600"></i>
                </div>
                <div>
                  <p className="text-sm text-np-purple-800">
                    Status e localizacao atualizam automaticamente em tempo real.
                  </p>
                  <p className="text-xs text-np-purple-600">
                    Nao precisa recarregar — tudo se atualiza sozinho.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />

      {/* ── Modal Primeira Utilização ── */}
      {showFirstTimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-6 mx-4 max-w-sm w-full animate-in fade-in zoom-in">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-np-purple-100 text-np-purple-600 flex items-center justify-center mx-auto mb-3">
                <i className="ri-notification-3-line text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-np-purple-900">Notificações</h3>
              <p className="text-sm text-np-purple-600 mt-2">
                Deseja receber notificações sonoras quando seu pedido mudar de status?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleFirstTimeDecline}
                className="flex-1 py-2.5 rounded-lg border border-np-wood-300 text-np-purple-600 text-sm font-medium hover:bg-np-wood-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Agora não
              </button>
              <button
                onClick={handleFirstTimeAccept}
                className="flex-1 py-2.5 rounded-lg bg-np-purple-700 text-white text-sm font-bold hover:bg-np-purple-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                Ativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}