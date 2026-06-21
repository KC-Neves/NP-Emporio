import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useOrderHistory, type Order } from "@/hooks/useOrderHistory";
import { useGlobalToast } from "@/hooks/useToast";
import { usePrintReceipt } from "@/hooks/usePrintReceipt";
import { openWhatsApp, getManualFeedbackMessage } from "@/pages/admin/components/OrderNotifications";

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE ÁUDIO CAIXA v2 — Sino suave profissional
// ═══════════════════════════════════════════════════════════════════════════════

const CAIXA_LOG = "[CAIXA-AUDIO]";
let caixaCtx: AudioContext | null = null;

function caixaLog(msg: string) { console.log(`${CAIXA_LOG} ${msg}`); }
function caixaErr(msg: string, e?: unknown) { console.error(`${CAIXA_LOG} ❌ ${msg}`, e || ""); }

function getCaixaCtx(): AudioContext {
  if (!caixaCtx || caixaCtx.state === "closed") {
    caixaCtx = new AudioContext();
    caixaCtx.addEventListener("statechange", () => caixaLog(`statechange -> ${caixaCtx!.state}`));
  }
  return caixaCtx;
}

function caixaIsUnlocked(): boolean {
  try { return localStorage.getItem("np_caixa_audio_unlocked") === "true"; } catch { return false; }
}
function caixaSetUnlocked(v: boolean) {
  try { localStorage.setItem("np_caixa_audio_unlocked", v ? "true" : "false"); } catch { /* noop */ }
}

function caixaIsFirstTime(): boolean {
  try { return localStorage.getItem("np_caixa_audio_first_time") !== "true"; } catch { return true; }
}
function caixaMarkFirstTimeDone() {
  try { localStorage.setItem("np_caixa_audio_first_time", "true"); } catch { /* noop */ }
}

async function caixaUnlock(): Promise<boolean> {
  caixaLog("=== unlock INICIO ===");
  try {
    const ctx = getCaixaCtx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") {
      caixaErr(`ctx NÃO está running: ${ctx.state}`);
      return false;
    }
    // Beep inaudível para destravar
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
    caixaSetUnlocked(true);
    caixaLog("=== unlock SUCESSO ===");
    return true;
  } catch (e) {
    caixaErr("unlock explodiu", e);
    return false;
  }
}

// Sino suave: três notas ascendentes com timbre de sino (triangle + harmônico)
function caixaPlayReadyChime(): boolean {
  try {
    const ctx = getCaixaCtx();
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
      return false;
    }
    const notes = [
      { f: 659, d: 0.14, v: 0.22, t: 0 },
      { f: 784, d: 0.14, v: 0.22, t: 0.18 },
      { f: 1047, d: 0.22, v: 0.22, t: 0.36 },
    ];
    const now = ctx.currentTime;
    notes.forEach(({ f, d, v, t }) => {
      // Fundamental com triangle (mais suave que sine)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(v, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.03);
      // Harmônico suave para timbre de sino
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = f * 2.5;
      gain2.gain.setValueAtTime(v * 0.15, now + t);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + t + d * 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + t);
      osc2.stop(now + t + d + 0.03);
    });
    return true;
  } catch (e) {
    caixaErr("caixaPlayReadyChime explodiu", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

const TABLES = Array.from({ length: 10 }, (_, i) => i + 1);
const MAX_TABLE = 10;

export default function CaixaPage() {
  const { orders, updateStatus, updatePaymentStatus } = useOrderHistory();
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000, options?: { actions?: Array<{ label: string; onClick: () => void; icon?: string; className?: string }> }) => {
    const id = `caixa-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration, actions: options?.actions });
  };
  const { printOrder, printTableBill } = usePrintReceipt();
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);

  // ── Estado do áudio ──
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const audioReadyRef = useRef(false);
  const unlockingRef = useRef(false);
  const hasEverUnlockedRef = useRef(caixaIsUnlocked());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const readyNotifiedRef = useRef<Set<string>>(new Set());
  const lastReadySoundRef = useRef(0);

  const nextCaixaToastId = (prefix: string, suffix: string | number) =>
    `${prefix}-${suffix}-${++toastCounterRef.current}-${Date.now()}`;

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
    caixaLog(`doUnlock(${source})`);
    try {
      const ok = await caixaUnlock();
      if (ok) {
        audioReadyRef.current = true;
        setAudioReady(true);
        caixaMarkFirstTimeDone();
        caixaLog(`doUnlock(${source}): SUCESSO`);
        return true;
      }
      caixaErr(`doUnlock(${source}): FALHOU`);
      return false;
    } finally {
      unlockingRef.current = false;
      setAudioLoading(false);
    }
  }, []);

  // ── Auto-unlock no primeiro clique/tecla ──
  useEffect(() => {
    const handler = () => {
      if (audioReadyRef.current) return;
      if (!unlockingRef.current) {
        doUnlock("auto-click");
      }
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
    if (caixaIsFirstTime() && !audioReadyRef.current && !hasEverUnlockedRef.current) {
      const timer = setTimeout(() => setShowFirstTimeModal(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── Detectar pedidos que ficaram Prontos ──
  useEffect(() => {
    const currentMap = new Map<string, string>();
    orders.forEach((o) => currentMap.set(o.id, o.status));
    const prevMap = prevStatusRef.current;

    orders.forEach((order) => {
      const prevStatus = prevMap.get(order.id);
      if (prevStatus && prevStatus !== "ready" && order.status === "ready" && !readyNotifiedRef.current.has(order.id)) {
        readyNotifiedRef.current.add(order.id);
        const label = order.orderType === "mesa"
          ? `Mesa ${order.tableNumber}`
          : "Delivery";
        showToast({
          id: nextCaixaToastId("ready", order.id),
          message: `Pedido pronto — ${label}`,
          type: "success",
          duration: 8000,
          skipBroadcast: true,
        });
        // Som de alerta com debounce 600ms
        if (soundEnabled && audioReadyRef.current) {
          const now = Date.now();
          if (now - lastReadySoundRef.current >= 600) {
            lastReadySoundRef.current = now;
            caixaPlayReadyChime();
          }
        }
      }
    });
    prevStatusRef.current = currentMap;
  }, [orders, soundEnabled, showToast]);

  // ── Sound toggle ──
  const handleSoundToggle = useCallback(async () => {
    if (!audioReadyRef.current && !unlockingRef.current) {
      setAudioLoading(true);
      const ok = await doUnlock("header-icon");
      setAudioLoading(false);
      if (ok) {
        setSoundEnabled(true);
        addToast("Notificações sonoras ativadas", "success", 2500);
        return;
      }
      addToast("Não foi possível ativar o som", "error", 3000);
      return;
    }
    setSoundEnabled((prev) => {
      const next = !prev;
      addToast(
        next ? "Notificações sonoras ativadas" : "Notificações sonoras desativadas",
        next ? "success" : "info",
        2500,
      );
      return next;
    });
  }, [doUnlock]);

  const handleFirstTimeAccept = useCallback(async () => {
    setShowFirstTimeModal(false);
    caixaMarkFirstTimeDone();
    setAudioLoading(true);
    const ok = await doUnlock("first-time-modal");
    setAudioLoading(false);
    if (ok) {
      setSoundEnabled(true);
      addToast("Notificações sonoras ativadas", "success", 3000);
    }
  }, [doUnlock]);

  const handleFirstTimeDecline = useCallback(() => {
    setShowFirstTimeModal(false);
    caixaMarkFirstTimeDone();
  }, []);

  const activeTableOrders = selectedTable
    ? orders.filter(
        (o) =>
          o.tableNumber === selectedTable &&
          o.orderType === "mesa" &&
          o.status !== "cancelled" &&
          o.paymentStatus === "pending"
      )
    : [];

  // Pedidos aguardando confirmação de pagamento (PIX e Cartão)
  const pendingPaymentOrders = useMemo(() =>
    orders.filter(
      (o) =>
        o.status === "aguardando_pagamento_pix" || o.status === "aguardando_pagamento"
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const tableTotals: Record<number, number> = {};
  orders
    .filter(
      (o) =>
        o.orderType === "mesa" &&
        o.status !== "cancelled" &&
        o.paymentStatus === "pending"
    )
    .forEach((o) => {
      if (o.tableNumber && o.tableNumber <= MAX_TABLE) {
        tableTotals[o.tableNumber] = (tableTotals[o.tableNumber] || 0) + o.totalAmount;
      }
    });

  const handleDeliverOrder = async (orderId: string) => {
    const { insufficient, success, error } = await updateStatus(orderId, "delivered");
    if (!success) {
      addToast(`Erro ao entregar pedido: ${error || "erro desconhecido"}`, "error", 6000);
      return;
    }
    if (insufficient.length > 0) {
      addToast(`⚠️ Estoque insuficiente: ${insufficient.join(", ")}`, "warning", 6000);
    } else {
      addToast("✅ Estoque baixado com sucesso!", "success", 3000);
    }
    addToast("Pedido marcado como entregue", "success", 3000);
  };

  const handleManualWhatsApp = (order: Order) => {
    const fbMsg = getManualFeedbackMessage(order.id);
    openWhatsApp(order.customerPhone!, fbMsg);
  };

  const handleCloseTable = async (tableNumber: number) => {
    if (window.confirm(`Fechar conta da Mesa ${tableNumber}?\n\nTotal: R$ ${(tableTotals[tableNumber] || 0).toFixed(2)}`)) {
      const allInsufficient: string[] = [];
      const allErrors: string[] = [];
      let anyStockSuccess = false;
      let anyStockAttempted = false;
      for (const o of activeTableOrders) {
        // Marcar como pago primeiro
        const payResult = await updatePaymentStatus(o.id, "paid");
        if (!payResult.success) {
          allErrors.push(`Pagamento #${o.id.slice(-6)}: ${payResult.error}`);
          continue;
        }
        // Depois marcar como entregue (baixa estoque + pontos)
        const { insufficient: ins1, success: suc1, error: err1 } = await updateStatus(o.id, "delivered");
        if (!suc1) {
          allErrors.push(`Entrega #${o.id.slice(-6)}: ${err1 || "erro desconhecido"}`);
          continue;
        }
        if (ins1.length > 0) allInsufficient.push(...ins1);
        if (suc1) anyStockSuccess = true;
        anyStockAttempted = true;
      }
      if (allErrors.length > 0) {
        addToast(`❌ Erros: ${allErrors.join(" | ")}`, "error", 8000);
      }
      if (allInsufficient.length > 0) {
        const unique = [...new Set(allInsufficient)];
        addToast(`⚠️ Estoque insuficiente: ${unique.join(", ")}`, "warning", 6000);
      } else if (anyStockSuccess && anyStockAttempted) {
        addToast("✅ Estoque baixado com sucesso para todos os pedidos!", "success", 3000);
      }
      addToast(`Conta da Mesa ${tableNumber} fechada com sucesso!`, "success", 4000);
      setSelectedTable(null);
    }
  };

  const handlePayOrder = (orderId: string) => {
    setPaymentOrderId(orderId);
    setShowPaymentModal(true);
  };

  const confirmPayment = async () => {
    if (paymentOrderId) {
      const { insufficient, success } = await updatePaymentStatus(paymentOrderId, "paid");
      if (insufficient.length > 0) {
        addToast(`⚠️ Estoque insuficiente: ${insufficient.join(", ")}`, "warning", 6000);
      } else if (success) {
        addToast("✅ Estoque baixado com sucesso!", "success", 3000);
      }
      addToast("Pagamento confirmado", "success", 3000);
      setShowPaymentModal(false);
      setPaymentOrderId(null);
    }
  };

  const activeTables = Object.keys(tableTotals)
    .map(Number)
    .filter((t) => tableTotals[t] > 0);

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-6 md:py-8 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-np-gold-400">
                <i className="ri-coins-line mr-2"></i>
                Caixa NP
              </h1>
              <p className="text-white/70 text-sm mt-1">
                Gerencie pedidos por mesa e feche contas
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Ícone de som discreto */}
              <button
                onClick={handleSoundToggle}
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
              <a href="/" className="text-white/70 hover:text-white text-sm transition-colors">
                <i className="ri-home-line mr-1"></i>
                Site
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-6">
        {!selectedTable ? (
          <div>
            {/* ── Pedidos aguardando pagamento (PIX + Cartão) ── */}
            {pendingPaymentOrders.length > 0 && (
              <div className="mb-6">
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-amber-200 rounded-full flex items-center justify-center">
                      <i className="ri-time-line text-amber-700"></i>
                    </div>
                    <div>
                      <h2 className="font-display text-lg text-amber-900">
                        Aguardando Pagamento
                      </h2>
                      <p className="text-xs text-amber-700">
                        {pendingPaymentOrders.length} pedido{pendingPaymentOrders.length !== 1 ? "s" : ""} aguardando confirmação — não foram enviados para a cozinha
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {pendingPaymentOrders.map((order) => {
                      const isPix = order.paymentMethod === "pix";
                      const targetStatus = "pending";
                      return (
                      <div key={order.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {order.orderType === "mesa" ? (
                            <span className="bg-np-purple-100 text-np-purple-700 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              <i className="ri-armchair-line mr-1"></i>Mesa {order.tableNumber}
                            </span>
                          ) : (
                            <span className="bg-np-green-100 text-np-green-700 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              <i className="ri-truck-line mr-1"></i>Delivery
                            </span>
                          )}
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${isPix ? "bg-np-green-100 text-np-green-700" : "bg-blue-100 text-blue-700"}`}>
                            <i className={isPix ? "ri-qr-code-line" : "ri-bank-card-line"}></i> {isPix ? "PIX" : "Cartão"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-np-purple-900 truncate">{order.customerName}</p>
                            <p className="text-xs text-np-purple-500">
                              {order.items.reduce((s, i) => s + i.quantity, 0)} itens &bull; R$ {order.totalAmount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const { success, error } = await updateStatus(order.id, targetStatus);
                            if (success) {
                              addToast(`${isPix ? "PIX" : "Cartão"} confirmado! Pedido #${order.id.slice(-6)} liberado para a cozinha.`, "success", 4000);
                            } else {
                              addToast(`Erro ao confirmar: ${error || "erro desconhecido"}`, "error", 6000);
                            }
                          }}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-np-green-600 hover:bg-np-green-700 text-white transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ml-3"
                        >
                          <i className="ri-check-line mr-1"></i>
                          Confirmar Pagamento
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <h2 className="font-display text-lg text-np-purple-900 mb-4">
              <i className="ri-armchair-line mr-2 text-np-purple-500"></i>
              Mesas Ativas
            </h2>

            {activeTables.length === 0 ? (
              <div className="text-center py-16 text-np-purple-400">
                <i className="ri-check-double-line text-6xl mb-4 block"></i>
                <p className="text-lg font-medium text-np-purple-600">
                  Nenhuma mesa ativa no momento
                </p>
                <p className="text-sm mt-2">
                  As mesas aparecerão aqui quando os clientes fizerem pedidos
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 max-w-4xl">
                {activeTables.map((tableNum) => (
                  <button
                    key={tableNum}
                    onClick={() => setSelectedTable(tableNum)}
                    className="bg-white rounded-xl border-2 border-np-purple-200 hover:border-np-purple-400 p-4 text-center transition-all hover:shadow-md cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-np-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <i className="ri-armchair-line text-xl text-np-purple-600"></i>
                    </div>
                    <p className="font-bold text-np-purple-900">Mesa {tableNum}</p>
                    <p className="text-sm text-np-green-600 font-bold mt-1">
                      R$ {tableTotals[tableNum].toFixed(2)}
                    </p>
                    <p className="text-xs text-np-purple-500 mt-1">
                      {orders.filter((o) => o.tableNumber === tableNum && o.status !== "cancelled" && o.paymentStatus === "pending").length} pedidos
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* All Tables Grid */}
            <div className="mt-8">
              <h2 className="font-display text-lg text-np-purple-900 mb-4">
                <i className="ri-grid-line mr-2 text-np-purple-500"></i>
                Todas as Mesas (1–10)
              </h2>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2 max-w-4xl">
                {TABLES.map((num) => {
                  const hasOrders = !!tableTotals[num];
                  return (
                    <button
                      key={num}
                      onClick={() => hasOrders && setSelectedTable(num)}
                      className={`w-full aspect-square rounded-lg font-display font-bold text-sm transition-all ${
                        hasOrders
                          ? "bg-np-purple-600 text-white hover:bg-np-purple-700 cursor-pointer"
                          : "bg-white text-np-wood-400 border border-np-wood-200 cursor-default"
                      }`}
                    >
                      {num}
                      {hasOrders && (
                        <span className="block text-xs font-normal mt-0.5">
                          R$ {tableTotals[num].toFixed(0)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            <button
              onClick={() => setSelectedTable(null)}
              className="flex items-center gap-1 text-np-purple-600 hover:text-np-purple-800 text-sm mb-4 transition-colors cursor-pointer"
            >
              <i className="ri-arrow-left-line"></i>
              Voltar às mesas
            </button>

            <div className="bg-white rounded-xl border border-np-wood-200 p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl text-np-purple-900">
                    <i className="ri-armchair-line mr-2 text-np-purple-500"></i>
                    Mesa {selectedTable}
                  </h2>
                  <p className="text-sm text-np-purple-500 mt-1">
                    {activeTableOrders.length} pedido{activeTableOrders.length !== 1 ? "s" : ""} em aberto
                  </p>
                </div>
                <div className="text-right flex items-center gap-4">
                  <button
                    onClick={() => printTableBill(activeTableOrders, selectedTable)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-np-wood-300 hover:bg-np-wood-50 text-np-purple-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-printer-line"></i>
                    Imprimir Conta
                  </button>
                  <div>
                    <p className="text-sm text-np-purple-600">Total da Conta</p>
                    <p className="font-display text-2xl font-bold text-np-purple-900">
                      R$ {(tableTotals[selectedTable] || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {activeTableOrders.map((order) => (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border p-4 ${
                    order.status === "ready"
                      ? "border-np-green-300"
                      : order.status === "preparing"
                      ? "border-blue-300"
                      : "border-np-wood-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          order.status === "ready"
                            ? "bg-np-green-100 text-np-green-800"
                            : order.status === "preparing"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {order.status === "pending" && "Recebido"}
                        {order.status === "preparing" && "Preparando"}
                        {order.status === "ready" && "Pronto"}
                        {order.status === "out_for_delivery" && "Saiu para Entrega"}
                      </span>
                      <span className="text-xs text-np-purple-400 ml-2">
                        {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <span className="font-bold text-np-purple-900">
                      R$ {order.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-1 mb-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="bg-np-wood-100 text-np-purple-700 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                          {item.quantity}x
                        </span>
                        <span className="text-np-purple-800">{item.name}</span>
                        {item.observation && (
                          <span className="text-xs text-yellow-600 italic">({item.observation})</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Delivery Instructions */}
                  {order.deliveryInstructions && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-yellow-700 font-medium">
                        <i className="ri-alert-line mr-1"></i>Instruções de Entrega:
                      </p>
                      <p className="text-xs text-yellow-800 mt-1">{order.deliveryInstructions}</p>
                    </div>
                  )}

                  {/* Stock status */}
                  {order.stockDeducted && (
                    <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-np-green-700">
                        <i className="ri-check-line mr-1"></i>Estoque baixado
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-np-wood-100 pt-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        order.paymentStatus === "paid"
                          ? "bg-np-green-100 text-np-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {order.paymentStatus === "paid" ? (
                        <><i className="ri-check-line mr-1"></i>Pago</>
                      ) : (
                        <><i className="ri-time-line mr-1"></i>Aguardando pagamento</>
                      )}
                    </span>
                    <div className="flex gap-2 flex-wrap items-center">
                      {order.status === "aguardando_pagamento_pix" && (
                        <button
                          onClick={async () => {
                            const { success, error } = await updateStatus(order.id, "pending");
                            if (success) {
                              addToast(`PIX confirmado! Pedido #${order.id.slice(-6)} liberado para a cozinha.`, "success", 4000);
                            } else {
                              addToast(`Erro ao confirmar PIX: ${error || "erro desconhecido"}`, "error", 6000);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-np-green-600 hover:bg-np-green-700 text-white transition-colors whitespace-nowrap cursor-pointer animate-pulse"
                        >
                          <i className="ri-qr-code-line mr-1"></i>
                          Confirmar PIX
                        </button>
                      )}
                      {order.paymentStatus === "pending" && order.status !== "aguardando_pagamento_pix" && (
                        <button
                          onClick={() => handlePayOrder(order.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-np-green-600 hover:bg-np-green-700 text-white transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <i className="ri-cash-line mr-1"></i>
                          Confirmar Pagamento
                        </button>
                      )}
                      {order.status === "ready" && (
                        <button
                          onClick={() => handleDeliverOrder(order.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-np-purple-600 hover:bg-np-purple-700 text-white transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Entregar
                        </button>
                      )}
                      {order.customerPhone?.replace(/\D/g, "").length > 0 && (
                        <button
                          onClick={() => handleManualWhatsApp(order)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 transition-colors whitespace-nowrap cursor-pointer"
                          title="Enviar feedback pelo WhatsApp"
                        >
                          <i className="ri-whatsapp-line mr-1"></i>
                          WhatsApp
                        </button>
                      )}
                      <button
                        onClick={() => printOrder(order, selectedTable)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-np-wood-300 hover:bg-np-wood-50 text-np-purple-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-printer-line mr-1"></i>
                        Imprimir
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-np-purple-400 mt-1">
                    Pagamento: {order.paymentMethod === "caixa" ? "Pagar no caixa" : order.paymentMethod === "cartao" ? "Cartão" : "📱 PIX"}
                    {order.paymentMethod === "pix" && (
                      <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-np-green-100 text-np-green-700 text-[10px] font-bold">
                        <i className="ri-qr-code-line"></i>PIX
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>

            {activeTableOrders.length > 0 && (
              <button
                onClick={() => handleCloseTable(selectedTable)}
                className="w-full bg-np-gold-500 hover:bg-np-gold-600 text-np-purple-900 font-bold py-4 px-6 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-file-list-3-line mr-2"></i>
                Fechar Conta da Mesa {selectedTable} — R${" "}
                {(tableTotals[selectedTable] || 0).toFixed(2)}
              </button>
            )}
          </div>
        )}
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-cash-line text-2xl text-np-green-600"></i>
              </div>
              <h3 className="font-display text-lg text-np-purple-900">Confirmar Pagamento</h3>
              <p className="text-sm text-np-purple-500 mt-1">Marcar este pedido como pago?</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPayment}
                className="flex-1 bg-np-green-600 hover:bg-np-green-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Primeira Utilização ── */}
      {showFirstTimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-6 mx-4 max-w-sm w-full animate-in fade-in zoom-in">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-np-green-100 text-np-green-600 flex items-center justify-center mx-auto mb-3">
                <i className="ri-notification-3-line text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-np-purple-900">Alertas sonoros</h3>
              <p className="text-sm text-np-purple-600 mt-2">
                Deseja ativar alertas sonoros para pedidos prontos?
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
                className="flex-1 py-2.5 rounded-lg bg-np-green-600 text-white text-sm font-bold hover:bg-np-green-700 transition-colors cursor-pointer whitespace-nowrap"
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