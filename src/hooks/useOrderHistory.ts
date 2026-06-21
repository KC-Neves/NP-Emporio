import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { CartItemCustomization } from "@/hooks/useCart";

export interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  observation?: string;
  customizations?: CartItemCustomization[];
}

export interface Order {
  id: string;
  userId?: string;
  tableNumber?: number;
  orderType: "mesa" | "delivery";
  customerName: string;
  customerPhone: string;
  address?: string;
  addressReference?: string;
  neighborhood?: string;
  deliveryFee?: number;
  deliveryInstructions?: string;
  items: OrderItem[];
  totalAmount: number;
  status: "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled" | "aguardando_pagamento_pix" | "aguardando_pagamento";
  paymentMethod: "caixa" | "cartao" | "pix";
  paymentStatus: "pending" | "paid";
  stockDeducted: boolean;
  publicTrackingCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  createdAt: string;
}

interface DbOrder {
  id: string;
  user_id: string | null;
  table_number: number | null;
  order_type: string;
  customer_name: string;
  customer_phone: string | null;
  address: string | null;
  address_reference: string | null;
  neighborhood: string | null;
  delivery_fee: number | null;
  delivery_instructions: string | null;
  items: OrderItem[];
  total_amount: number;
  status: string;
  payment_method: string;
  payment_status: string;
  stock_deducted: boolean;
  public_tracking_code: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  created_at: string;
}

export function mapDbToOrder(row: DbOrder): Order {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    tableNumber: row.table_number ?? undefined,
    orderType: row.order_type as Order["orderType"],
    customerName: row.customer_name,
    customerPhone: row.customer_phone || "",
    address: row.address || undefined,
    addressReference: row.address_reference || undefined,
    neighborhood: row.neighborhood || undefined,
    deliveryFee: row.delivery_fee ? Number(row.delivery_fee) : undefined,
    deliveryInstructions: row.delivery_instructions || undefined,
    items: row.items || [],
    totalAmount: Number(row.total_amount),
    status: row.status as Order["status"],
    paymentMethod: (row.payment_method as Order["paymentMethod"]) || "caixa",
    paymentStatus: (row.payment_status as Order["paymentStatus"]) || "pending",
    stockDeducted: row.stock_deducted || false,
    publicTrackingCode: row.public_tracking_code ?? undefined,
    deliveryLatitude: row.delivery_latitude ? Number(row.delivery_latitude) : undefined,
    deliveryLongitude: row.delivery_longitude ? Number(row.delivery_longitude) : undefined,
    createdAt: row.created_at,
  };
}

export const TIERS = [
  { name: "bronze", min: 0 },
  { name: "prata", min: 300 },
  { name: "ouro", min: 800 },
  { name: "platina", min: 1500 },
];

export function getTierName(points: number): string {
  const tier = TIERS.slice().reverse().find((t) => points >= t.min);
  return tier?.name || "bronze";
}

export async function ensureLoyaltyRecord(userId: string) {
  const { data: existing } = await supabase
    .from("loyalty_points")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) {
    await supabase.from("loyalty_points").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      points: 0,
      tier: "bronze",
      updated_at: new Date().toISOString(),
    });
  }
}

export async function hasPointsBeenAwardedForOrder(userId: string, orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("loyalty_history")
    .select("id")
    .eq("user_id", userId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[LOYALTY] Erro ao verificar pontos já creditados:", error);
    return false;
  }
  return !!data;
}

export async function awardLoyaltyPoints(userId: string | undefined, orderId: string, totalAmount: number) {
  if (!userId) return;

  const alreadyAwarded = await hasPointsBeenAwardedForOrder(userId, orderId);
  if (alreadyAwarded) {
    console.log(`[LOYALTY] Points already awarded for order ${orderId}, skipping.`);
    return;
  }

  const points = Math.max(1, Math.floor(totalAmount / 2));
  await ensureLoyaltyRecord(userId);

  const { data: current } = await supabase
    .from("loyalty_points")
    .select("points")
    .eq("user_id", userId)
    .maybeSingle();

  const newPoints = (current?.points || 0) + points;
  const newTier = getTierName(newPoints);

  const { error: updateError } = await supabase
    .from("loyalty_points")
    .update({ points: newPoints, tier: newTier, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (updateError) {
    console.error(`[LOYALTY] Failed to update loyalty_points for user ${userId}:`, updateError);
    return;
  }

  const { error: insertError } = await supabase.from("loyalty_history").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    points,
    reason: `Pontos pelo pedido #${orderId.slice(-6)}`,
    order_id: orderId,
  });

  if (insertError) {
    console.error(`[LOYALTY] Failed to insert loyalty_history for order ${orderId}:`, insertError);
    return;
  }

  console.log(`[LOYALTY] Awarded ${points} points to user ${userId} for order ${orderId}. Total: ${newPoints}`);
}

// Global counter for stable channel names
let channelCounter = 0;

export function useOrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeInsertIds, setRealtimeInsertIds] = useState<string[]>([]);
  const seenEventIdsRef = useRef<Map<string, number>>(new Map()); // id -> timestamp
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isMountedRef = useRef(true);
  const instanceIdRef = useRef(++channelCounter);

  const clearRealtimeInsertIds = useCallback(() => {
    setRealtimeInsertIds([]);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("[useOrderHistory] Erro ao buscar pedidos:", fetchError);
        if (isMountedRef.current) setError(fetchError.message || "Erro ao carregar pedidos");
        return;
      }

      if (data) {
        console.log("[useOrderHistory] Loaded", (data as DbOrder[]).length, "orders");
        const mapped = (data as DbOrder[]).map(mapDbToOrder);
        if (isMountedRef.current) {
          setOrders(mapped);
          setError(null);
        }
      }
    } catch (err: any) {
      console.error("[useOrderHistory] Exceção em fetchOrders:", err);
      if (isMountedRef.current) setError(err?.message || "Erro de rede ao carregar pedidos");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch + re-fetch on auth state change
  useEffect(() => {
    isMountedRef.current = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const doFetch = async () => {
      if (!isMountedRef.current) return;
      await fetchOrders();
    };

    doFetch();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log("[useOrderHistory] Auth state change:", event);
      if (isMountedRef.current) {
        setTimeout(() => {
          fetchOrders();
        }, 300);
      }
    });
    authSubscription = subscription;

    return () => {
      isMountedRef.current = false;
      authSubscription?.unsubscribe();
    };
  }, [fetchOrders]);

  // Realtime subscription — stable channel name per instance
  useEffect(() => {
    isMountedRef.current = true;
    const channelName = `orders-realtime-${instanceIdRef.current}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;

          const now = Date.now();
          const lastSeen = seenEventIdsRef.current.get(id);
          // Deduplicate: ignore same id within 3 seconds
          if (lastSeen && now - lastSeen < 3000) {
            console.log(`[ORDER] duplicate insert event skipped: ${id}`);
            return;
          }
          seenEventIdsRef.current.set(id, now);
          // Cleanup old entries
          if (seenEventIdsRef.current.size > 200) {
            const cutoff = now - 30000;
            for (const [key, ts] of seenEventIdsRef.current) {
              if (ts < cutoff) seenEventIdsRef.current.delete(key);
            }
          }

          console.log(`[ORDER] insert received: ${id}`);
          const newOrder = mapDbToOrder(payload.new as DbOrder);
          if (!isMountedRef.current) return;
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
          // Track realtime inserts for kitchen notification
          setRealtimeInsertIds((prev) => {
            if (prev.includes(newOrder.id)) return prev;
            return [...prev, newOrder.id];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;

          // For updates, we use a slightly different key with event type
          const eventKey = `update-${id}`;
          const now = Date.now();
          const lastSeen = seenEventIdsRef.current.get(eventKey);
          if (lastSeen && now - lastSeen < 3000) {
            console.log(`[ORDER] duplicate update event skipped: ${id}`);
            return;
          }
          seenEventIdsRef.current.set(eventKey, now);
          if (seenEventIdsRef.current.size > 200) {
            const cutoff = now - 30000;
            for (const [key, ts] of seenEventIdsRef.current) {
              if (ts < cutoff) seenEventIdsRef.current.delete(key);
            }
          }

          console.log(`[ORDER] update received: ${id}`);
          const updated = mapDbToOrder(payload.new as DbOrder);
          if (!isMountedRef.current) return;
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
        }
      )
      .subscribe((status) => {
        console.log(`[REALTIME] subscribed: ${status}`);
      });

    channelRef.current = channel;

    // Polling fallback every 10 seconds
    const pollInterval = setInterval(() => {
      console.log("[REALTIME] polling fallback — fetching orders");
      fetchOrders();
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      if (channelRef.current) {
        console.log("[REALTIME] unsubscribing channel:", channelName);
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [fetchOrders]);

  // Deduplicated orders
  const dedupedOrders = useMemo(() => {
    const seen = new Set<string>();
    const result: Order[] = [];
    for (const o of orders) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        result.push(o);
      }
    }
    return result;
  }, [orders]);

  // Stock deduction
  const deductStock = useCallback(async (orderId: string, items: OrderItem[]) => {
    console.log("[STOCK] Starting stock deduction for order:", orderId);

    const { data: orderRow, error: checkError } = await supabase
      .from("orders")
      .select("stock_deducted")
      .eq("id", orderId)
      .maybeSingle();

    if (checkError) {
      console.error("[STOCK] Failed to check stock_deducted flag:", checkError);
      return { insufficient: ["Erro ao verificar status do estoque"], success: false };
    }

    if (orderRow?.stock_deducted) {
      console.log("[STOCK] Order already deducted, skipping:", orderId);
      return { insufficient: [], success: true };
    }

    const insufficient: string[] = [];
    let allSuccess = true;

    for (const item of items) {
      if (!item.id || !item.quantity || item.quantity <= 0) continue;

      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.id)
        .maybeSingle();

      if (fetchError) {
        console.error(`[STOCK] Failed to fetch product ${item.id}:`, fetchError);
        insufficient.push(`${item.name} (erro de leitura)`);
        allSuccess = false;
        continue;
      }

      const currentStock = product?.stock_quantity ?? 0;
      if (currentStock < item.quantity) {
        console.warn(`[STOCK] Insufficient stock for ${item.name}: ${currentStock} < ${item.quantity}`);
        insufficient.push(`${item.name} (estoque: ${currentStock}, precisa: ${item.quantity})`);
        allSuccess = false;
        continue;
      }

      const newStock = currentStock - item.quantity;
      const { data: updatedData, error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", item.id)
        .select("stock_quantity");

      if (updateError) {
        console.error(`[STOCK] Failed to update stock for ${item.id}:`, updateError);
        insufficient.push(`${item.name} (erro ao baixar)`);
        allSuccess = false;
        continue;
      }

      if (!updatedData || updatedData.length === 0) {
        console.warn(`[STOCK] No rows updated for product ${item.id} — RLS may have blocked`);
        insufficient.push(`${item.name} (nenhuma linha atualizada — verifique permissões)`);
        allSuccess = false;
        continue;
      }

      const confirmedStock = updatedData[0]?.stock_quantity;
      if (confirmedStock !== newStock) {
        console.warn(`[STOCK] Stock not confirmed for product ${item.id}: expected ${newStock}, got ${confirmedStock}`);
        insufficient.push(`${item.name} (estoque não confirmado)`);
        allSuccess = false;
        continue;
      }

      // Record stock movement for automatic deduction
      const { error: movementError } = await supabase.from("stock_movements").insert({
        product_id: item.id,
        quantity: -item.quantity,
        reason: "baixa_pedido",
        notes: `Baixa automática pelo pedido ${orderId.slice(-8)}`,
        previous_stock: currentStock,
        new_stock: newStock,
      });

      if (movementError) {
        console.error(`[STOCK] Failed to record movement for product ${item.id}:`, movementError);
      }

      console.log(`[STOCK] Deducted ${item.quantity} from ${item.name}, new stock: ${newStock} (confirmed: ${confirmedStock})`);
    }

    if (allSuccess && insufficient.length === 0) {
      const { data: markedData, error: markError } = await supabase
        .from("orders")
        .update({ stock_deducted: true })
        .eq("id", orderId)
        .select("stock_deducted");

      if (markError) {
        console.error("[STOCK] Failed to mark order as deducted:", markError);
        allSuccess = false;
      } else if (!markedData || markedData.length === 0) {
        console.warn("[STOCK] No order rows updated for stock_deducted — RLS may have blocked");
        allSuccess = false;
      } else {
        console.log("[STOCK] Order marked as stock_deducted=true");
      }
    } else {
      console.warn("[STOCK] Order NOT marked as deducted because some items failed:", insufficient);
    }

    return { insufficient, success: allSuccess && insufficient.length === 0 };
  }, []);

  const addOrder = useCallback(
    async (order: Omit<Order, "id" | "createdAt" | "stockDeducted">) => {
      console.log("[ORDER] addOrder started");
      try {
        let newId: string;
        try {
          newId = crypto.randomUUID();
        } catch {
          newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        }
        console.log("[ORDER] generated id:", newId);

        let userId: string | null = null;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id || null;
          console.log("[ORDER] userId:", userId);
        } catch (sessionErr) {
          console.error("[ORDER] getSession error (non-critical):", sessionErr);
          userId = null;
        }

        let trackingCode: string;
        try {
          const rawBytes = crypto.getRandomValues(new Uint8Array(6));
          trackingCode = Array.from(rawBytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase();
        } catch {
          trackingCode = Math.random().toString(36).slice(2, 12).toUpperCase();
        }

        const insertPayload = {
          id: newId,
          user_id: userId,
          table_number: order.tableNumber ?? null,
          order_type: order.orderType,
          customer_name: order.customerName,
          customer_phone: order.customerPhone || null,
          address: order.address || null,
          address_reference: order.addressReference || null,
          neighborhood: order.neighborhood || null,
          delivery_fee: order.deliveryFee ?? null,
          delivery_instructions: order.deliveryInstructions || null,
          items: order.items,
          total_amount: order.totalAmount,
          status: order.status || "pending",
          payment_method: order.paymentMethod || "caixa",
          payment_status: order.paymentStatus || "pending",
          stock_deducted: false,
          public_tracking_code: trackingCode,
        };
        console.log("[ORDER] insert payload:", insertPayload);

        const { data, error } = await supabase
          .from("orders")
          .insert(insertPayload)
          .select();

        if (error) {
          console.error("[ORDER] insert error:", error);
          throw error;
        }

        console.log("[ORDER] insert success, returned rows:", data?.length ?? 0);

        const dbRow = data && (data as DbOrder[]).length > 0
          ? (data as DbOrder[])[0]
          : {
              ...insertPayload,
              created_at: new Date().toISOString(),
              items: order.items,
              public_tracking_code: trackingCode,
            } as DbOrder;

        const mapped = mapDbToOrder(dbRow);
        setOrders((prev) => {
          if (prev.some((o) => o.id === mapped.id)) return prev;
          return [mapped, ...prev];
        });
        return { id: mapped.id, publicTrackingCode: mapped.publicTrackingCode };
      } catch (err) {
        console.error("[ORDER] addOrder failed:", err);
        throw err;
      }
    },
    []
  );

  const getOrderById = useCallback(
    (id: string) => dedupedOrders.find((o) => o.id === id),
    [dedupedOrders]
  );

  const updateStatus = useCallback(
    async (id: string, status: Order["status"]) => {
      const order = dedupedOrders.find((o) => o.id === id);
      // ── LOGGING: status atual vs destino ──
      console.log("[ORDER] updateStatus chamado:", {
        orderId: id,
        currentStatus: order?.status || "N/A",
        targetStatus: status,
        orderType: order?.orderType || "N/A",
        timestamp: new Date().toISOString(),
      });

      // Optimistic update — reflect immediately in local state
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status } : o))
      );

      // Usar edge function (service role, bypassa RLS) em vez de supabase direto
      // NOTA: NÃO passamos Authorization manualmente — o supabase.functions.invoke
      // já envia automaticamente o token da sessão atual via header Authorization.
      // Passar manualmente pode causar conflito entre o token do getSession() e o
      // token gerenciado internamente pela lib (especialmente após auto-refresh).
      console.log("[ORDER] updateStatus: chamando edge function update-order-status com:", { orderId: id, status });

      let fnData: any = null;
      let fnError: any = null;

      try {
        const response = await supabase.functions.invoke("update-order-status", {
          body: { orderId: id, status },
        });
        fnData = response.data;
        fnError = response.error;
      } catch (invokeErr: any) {
        console.error("[ORDER] updateStatus: EXCEÇÃO ao invocar edge function:", {
          name: invokeErr?.name,
          message: invokeErr?.message,
          stack: invokeErr?.stack,
          rawError: JSON.stringify(invokeErr, Object.getOwnPropertyNames(invokeErr)),
        });
        // Revert on exception
        setOrders((prev) =>
          prev.map((o) => (o.id === id && order ? { ...o, status: order.status } : o))
        );
        const errMsg = invokeErr?.message || invokeErr?.name || "Erro de rede ao chamar função";
        return { insufficient: [] as string[], success: false, error: errMsg };
      }

      // ── LOGGING: resposta completa da edge function ──
      console.log("[ORDER] updateStatus: resposta da edge function:", {
        fnData_type: typeof fnData,
        fnData_keys: fnData ? Object.keys(fnData) : "null",
        fnData_success: fnData?.success,
        fnData_error: fnData?.error,
        fnData_full: JSON.stringify(fnData),
        fnError_type: typeof fnError,
        fnError_name: fnError?.name,
        fnError_message: fnError?.message,
        fnError_context: fnError?.context,
        fnError_status: fnError?.status,
        fnError_full: fnError ? JSON.stringify(fnError, Object.getOwnPropertyNames(fnError)) : "null",
      });

      if (fnError || !fnData?.success) {
        // Extrai TODAS as fontes possíveis de erro
        const sources: string[] = [];
        if (fnData?.error) sources.push(`edgeFn: ${fnData.error}`);
        if (fnData?.code) sources.push(`code: ${fnData.code}`);
        if (fnData?.details) sources.push(`details: ${fnData.details}`);
        if (fnData?.context) sources.push(`ctx: ${fnData.context}`);
        if (fnError?.message) sources.push(`invoke: ${fnError.message}`);
        if (fnError?.name && fnError.name !== "FunctionsHttpError") sources.push(`type: ${fnError.name}`);
        if (fnError?.context?.status) sources.push(`HTTP ${fnError.context.status}`);

        // Tenta ler o corpo JSON do erro (edge function retorna {error, code, details, hint, context})
        let errorBody = "";
        try {
          if (fnError?.context?.text && typeof fnError.context.text === "function") {
            errorBody = await fnError.context.text();
            console.error("[ORDER] updateStatus: corpo bruto do erro HTTP:", errorBody);
            try {
              const parsed = JSON.parse(errorBody);
              if (parsed.error) sources.push(`dbError: ${parsed.error}`);
              if (parsed.code) sources.push(`dbCode: ${parsed.code}`);
              if (parsed.details) sources.push(`dbDetails: ${parsed.details}`);
              if (parsed.hint) sources.push(`dbHint: ${parsed.hint}`);
              if (parsed.context) sources.push(`dbCtx: ${parsed.context}`);
            } catch {
              if (errorBody && errorBody.length < 500) sources.push(`raw: ${errorBody}`);
            }
          }
        } catch (bodyErr: any) {
          console.error("[ORDER] updateStatus: erro ao ler corpo da resposta:", bodyErr?.message || bodyErr);
        }

        const errMsg = sources.length > 0 ? sources.join(" | ") : "Falha ao atualizar status (sem detalhes)";
        console.error("[ORDER] updateStatus: ERRO compilado:", errMsg);
        // Revert on error
        setOrders((prev) =>
          prev.map((o) => (o.id === id && order ? { ...o, status: order.status } : o))
        );
        return { insufficient: [] as string[], success: false, error: errMsg };
      }

      console.log("[ORDER] updateStatus: SUCESSO — pedido atualizado para", status);

      // ── Processar resultado da baixa de estoque (feita server-side pela Edge Function) ──
      const stockInfo = fnData?.stock;
      console.log("[STOCK] updateStatus: resultado da baixa server-side:", JSON.stringify(stockInfo));

      const insufficient: string[] = [];
      let stockSuccess = true;

      if (stockInfo) {
        if (stockInfo.insufficient && stockInfo.insufficient.length > 0) {
          insufficient.push(...stockInfo.insufficient);
          stockSuccess = false;
        }
        if (stockInfo.errors && stockInfo.errors.length > 0) {
          insufficient.push(...stockInfo.errors);
          stockSuccess = false;
        }
        if (stockInfo.deducted) {
          console.log("[STOCK] Server-side baixou estoque com sucesso!");
          setOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, stockDeducted: true } : o))
          );
        }
      }

      // ── Loyalty points (server-side via Edge Function) ──
      const loyaltyInfo = fnData?.loyalty;
      if (loyaltyInfo) {
        if (loyaltyInfo.awarded) {
          console.log(`[LOYALTY] Edge Function creditou +${loyaltyInfo.points} pontos para pedido ${id}. Tier: ${loyaltyInfo.tier}`);
        } else if (loyaltyInfo.skipped) {
          console.log(`[LOYALTY] Pontos não creditados: ${loyaltyInfo.reason}`);
        }
      }

      if (insufficient.length > 0) {
        console.warn("[STOCK] updateStatus: alertas de estoque:", insufficient);
        return { insufficient, success: true, error: `⚠️ Estoque: ${insufficient.join(", ").slice(0, 200)}` };
      }

      return { insufficient: [] as string[], success: true };
    },
    [dedupedOrders]
  );

  const updatePaymentStatus = useCallback(
    async (id: string, paymentStatus: "pending" | "paid") => {
      const order = dedupedOrders.find((o) => o.id === id);
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, paymentStatus } : o))
      );
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: paymentStatus })
        .eq("id", id);
      if (error) {
        console.error("[ORDER] updatePaymentStatus error:", error);
        setOrders((prev) =>
          prev.map((o) => (o.id === id && order ? { ...o, paymentStatus: order.paymentStatus } : o))
        );
        return { insufficient: [] as string[], success: false, error: error.message };
      }

      if (paymentStatus === "paid" && order) {
        console.log("[STOCK] Order paid, triggering stock deduction");
        let stockResult;
        try {
          stockResult = await deductStock(id, order.items);
        } catch (stockErr: any) {
          console.error("[STOCK] EXCEÇÃO no deductStock:", stockErr?.message || stockErr);
          return { insufficient: [], success: false, error: `Erro ao deduzir estoque: ${stockErr?.message || "exceção desconhecida"}` };
        }
        const { insufficient, success } = stockResult;
        if (success) {
          setOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, stockDeducted: true } : o))
          );
          // Loyalty points are now handled server-side by the Edge Function when status reaches "delivered"
          // This ensures both mesa AND delivery orders get points regardless of who processes them
          return { insufficient: [] as string[], success: true };
        }
        const stockErrMsg = insufficient.length > 0
          ? `Estoque insuficiente: ${insufficient.join(", ")}`
          : "Falha ao deduzir estoque (verifique permissões RLS na tabela products)";
        console.error("[STOCK] deductStock falhou:", stockErrMsg);
        return { insufficient, success: false, error: stockErrMsg };
      }
      return { insufficient: [] as string[], success: true };
    },
    [dedupedOrders, deductStock]
  );

  const updateOrder = useCallback(
    async (id: string, updates: Partial<Pick<Order, "customerName" | "customerPhone" | "address" | "tableNumber" | "paymentMethod" | "paymentStatus" | "status">>) => {
      const order = dedupedOrders.find((o) => o.id === id);
      if (!order) return { error: new Error("Pedido não encontrado") };

      const dbUpdates: Record<string, unknown> = {};
      if (updates.customerName !== undefined) dbUpdates.customer_name = updates.customerName;
      if (updates.customerPhone !== undefined) dbUpdates.customer_phone = updates.customerPhone || null;
      if (updates.address !== undefined) dbUpdates.address = updates.address || null;
      if (updates.tableNumber !== undefined) dbUpdates.table_number = updates.tableNumber ?? null;
      if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
      if (updates.paymentStatus !== undefined) dbUpdates.payment_status = updates.paymentStatus;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { error } = await supabase.from("orders").update(dbUpdates).eq("id", id);
      if (error) {
        console.error("[ORDER] updateOrder error:", error);
        return { error };
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
      );
      return { error: null };
    },
    [dedupedOrders]
  );

  const deleteOrder = useCallback(async (orderId: string) => {
    console.log("[ORDER] deleteOrder via Edge Function:", orderId);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("update-order-status", {
        body: { action: "delete", orderId },
      });
      if (fnError || !fnData?.success) {
        const errMsg = fnData?.error || fnError?.message || "Erro ao excluir";
        console.error("[ORDER] deleteOrder error:", errMsg);
        return { error: new Error(errMsg) };
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      return { error: null };
    } catch (err: any) {
      console.error("[ORDER] deleteOrder exception:", err?.message || err);
      return { error: new Error(err?.message || "Erro de rede") };
    }
  }, []);

  const deleteOldOrders = useCallback(async (olderThanDays: number = 1) => {
    console.log("[ORDER] deleteOldOrders via Edge Function, olderThanDays:", olderThanDays);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("update-order-status", {
        body: { action: "delete_old", olderThanDays },
      });
      if (fnError || !fnData?.success) {
        const errMsg = fnData?.error || fnError?.message || "Erro ao limpar";
        console.error("[ORDER] deleteOldOrders error:", errMsg);
        return { error: new Error(errMsg), deletedCount: 0 };
      }
      const deletedCount = fnData?.deletedCount || 0;
      // Refresh full list after bulk delete
      fetchOrders();
      return { error: null, deletedCount };
    } catch (err: any) {
      console.error("[ORDER] deleteOldOrders exception:", err?.message || err);
      return { error: new Error(err?.message || "Erro de rede"), deletedCount: 0 };
    }
  }, [fetchOrders]);

  const deleteTestOrders = useCallback(async () => {
    console.log("[ORDER] deleteTestOrders via Edge Function");
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("update-order-status", {
        body: { action: "delete_tests" },
      });
      if (fnError || !fnData?.success) {
        const errMsg = fnData?.error || fnError?.message || "Erro ao limpar testes";
        console.error("[ORDER] deleteTestOrders error:", errMsg);
        return { error: new Error(errMsg), deletedCount: 0 };
      }
      const deletedCount = fnData?.deletedCount || 0;
      fetchOrders();
      return { error: null, deletedCount };
    } catch (err: any) {
      console.error("[ORDER] deleteTestOrders exception:", err?.message || err);
      return { error: new Error(err?.message || "Erro de rede"), deletedCount: 0 };
    }
  }, [fetchOrders]);

  return {
    orders: dedupedOrders,
    loading,
    error,
    realtimeInsertIds,
    addOrder,
    getOrderById,
    updateStatus,
    updatePaymentStatus,
    updateOrder,
    deleteOrder,
    deleteOldOrders,
    deleteTestOrders,
    clearRealtimeInsertIds,
    retry: fetchOrders,
  };
}

// Hook for kitchen: detects new orders by comparing current vs previous order snapshot.
// Works with both realtime events and polling fallback.
export function useKitchenOrders() {
  const orderHistory = useOrderHistory();
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstRunRef = useRef(true);

  const activeOrders = useMemo(() => {
    return orderHistory.orders.filter(
      (o) => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "aguardando_pagamento_pix" && o.status !== "aguardando_pagamento"
    );
  }, [orderHistory.orders]);

  // Detect new orders by comparing current IDs with previous snapshot
  useEffect(() => {
    if (orderHistory.loading) return;

    const currentIds = new Set(activeOrders.map((o) => o.id));

    // First load: register all existing, don't notify
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      currentIds.forEach((id) => seenOrderIdsRef.current.add(id));
      prevOrderIdsRef.current = currentIds;
      console.log("[KITCHEN] registered", seenOrderIdsRef.current.size, "existing orders");
      return;
    }

    // Find ids that appeared since last snapshot
    const newIds = [...currentIds].filter((id) => !prevOrderIdsRef.current.has(id));
    prevOrderIdsRef.current = currentIds;

    if (newIds.length === 0) return;

    // Filter out already-notified
    const genuinelyNew = newIds.filter((id) => !seenOrderIdsRef.current.has(id));
    if (genuinelyNew.length === 0) return;

    genuinelyNew.forEach((id) => {
      seenOrderIdsRef.current.add(id);
      console.log(`[KITCHEN] new order detected: ${id}`);
    });

    setNewOrderIds((prev) => [...new Set([...prev, ...genuinelyNew])]);
  }, [activeOrders, orderHistory.loading]);

  const clearNewOrderIds = useCallback(() => {
    setNewOrderIds([]);
  }, []);

  const updateOrderStatus = useCallback(
    async (orderId: string, newStatus: Order["status"]) => {
      const result = await orderHistory.updateStatus(orderId, newStatus);
      const errorMsg = result.success ? null : (result.error || "Falha ao atualizar status (erro desconhecido)");
      return { error: errorMsg };
    },
    [orderHistory]
  );

  return {
    orders: activeOrders,
    loading: orderHistory.loading,
    newOrderIds,
    clearNewOrderIds,
    updateOrderStatus,
    seenOrderIds: seenOrderIdsRef.current,
  };
}