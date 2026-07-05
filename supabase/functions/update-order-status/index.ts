
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIERS = [
  { name: "bronze", min: 0 },
  { name: "prata", min: 300 },
  { name: "ouro", min: 800 },
  { name: "platina", min: 1500 },
];

function getTierName(points: number): string {
  const tier = TIERS.slice().reverse().find((t) => points >= t.min);
  return tier?.name || "bronze";
}

// Status que representam "aguardando pagamento" — ao sair deles, pagamento é confirmado automaticamente
const PENDING_PAYMENT_STATUSES = ["aguardando_pagamento_pix", "aguardando_pagamento"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[UPDATE-ORDER-STATUS:${requestId}] ========== NOVA REQUISICAO ==========`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRole) {
      return new Response(
        JSON.stringify({ error: "Configuracao do servidor incompleta", code: "MISSING_ENV" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "NO_AUTH_HEADER" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt || jwt.length < 10) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — JWT invalido", code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: `Unauthorized — ${userError?.message || "token invalido"}`, code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;
    console.log(`[UPDATE-ORDER-STATUS:${requestId}] Usuario: ${user.id}`);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: profileError ? `Erro ao verificar permissoes: ${profileError.message}` : "Perfil nao encontrado", code: profileError ? "PROFILE_FETCH_ERROR" : "PROFILE_NOT_FOUND" }),
        { status: profileError ? 500 : 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => null);
    const { orderId, status, action } = body || {};

    // ── AÇÃO: DELETE ──
    if (action === "delete") {
      const allowedRoles = ["admin", "gerente", "caixa"];
      if (callerProfile.status !== "ativo" || !allowedRoles.includes(callerProfile.role)) {
        return new Response(
          JSON.stringify({ error: "Acesso negado para exclusao", code: "FORBIDDEN_ROLE" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "orderId ausente", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] DELETE pedido: ${orderId}`);
      const { error: delError } = await adminClient.from("orders").delete().eq("id", orderId);
      if (delError) {
        console.error(`[UPDATE-ORDER-STATUS:${requestId}] Erro ao excluir:`, delError.message);
        return new Response(
          JSON.stringify({ error: `Erro ao excluir: ${delError.message}`, code: delError.code }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] Pedido excluido: ${orderId}`);
      return new Response(
        JSON.stringify({ success: true, deleted: true, orderId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── AÇÃO: DELETE_OLD ──
    if (action === "delete_old") {
      const allowedRoles = ["admin", "gerente", "caixa"];
      if (callerProfile.status !== "ativo" || !allowedRoles.includes(callerProfile.role)) {
        return new Response(
          JSON.stringify({ error: "Acesso negado", code: "FORBIDDEN_ROLE" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const olderThanDays = body?.olderThanDays || 1;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffIso = cutoffDate.toISOString();
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] DELETE_OLD: status delivered/cancelled, older than ${olderThanDays} days`);
      const { data: deleted, error: delError } = await adminClient
        .from("orders").delete().in("status", ["delivered", "cancelled"]).lt("created_at", cutoffIso).select("id");
      if (delError) {
        console.error(`[UPDATE-ORDER-STATUS:${requestId}] Erro delete_old:`, delError.message);
        return new Response(
          JSON.stringify({ error: `Erro ao limpar: ${delError.message}`, code: delError.code }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const count = deleted?.length || 0;
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] ${count} pedidos excluidos`);
      return new Response(
        JSON.stringify({ success: true, deletedCount: count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── AÇÃO: DELETE_TESTS ──
    if (action === "delete_tests") {
      const allowedRoles = ["admin", "gerente", "caixa"];
      if (callerProfile.status !== "ativo" || !allowedRoles.includes(callerProfile.role)) {
        return new Response(
          JSON.stringify({ error: "Acesso negado - apenas admin", code: "FORBIDDEN_ROLE" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] DELETE_TESTS`);
      const { data: deleted, error: delError } = await adminClient
        .from("orders").delete().or("customer_name.ilike.%Teste%,customer_name.ilike.%teste%").select("id");
      if (delError) {
        console.error(`[UPDATE-ORDER-STATUS:${requestId}] Erro delete_tests:`, delError.message);
        return new Response(
          JSON.stringify({ error: `Erro ao limpar testes: ${delError.message}`, code: delError.code }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const count = deleted?.length || 0;
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] ${count} pedidos de teste excluidos`);
      return new Response(
        JSON.stringify({ success: true, deletedCount: count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── AÇÃO PADRÃO: UPDATE STATUS ──
    const allowedRoles = ["admin", "gerente", "caixa"];
    if (callerProfile.status !== "ativo" || !allowedRoles.includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Acesso negado", code: "FORBIDDEN_ROLE" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!orderId || !status) {
      return new Response(
        JSON.stringify({ error: "Parametro ausente", code: "MISSING_PARAMS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validStatuses = ["pending", "preparing", "ready", "out_for_delivery", "delivered", "cancelled", "aguardando_pagamento_pix", "aguardando_pagamento"];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Status invalido: "${status}"`, code: "INVALID_STATUS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: currentOrder, error: fetchError } = await adminClient
      .from("orders")
      .select("id, status, order_type, customer_name, customer_phone, items, total_amount, payment_status, stock_deducted, created_at, public_tracking_code, table_number, user_id")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchError || !currentOrder) {
      return new Response(
        JSON.stringify({ error: fetchError ? `Erro ao buscar pedido: ${fetchError.message}` : `Pedido nao encontrado: ${orderId}`, code: fetchError ? fetchError.code : "ORDER_NOT_FOUND" }),
        { status: fetchError ? 500 : 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[UPDATE-ORDER-STATUS:${requestId}] Pedido: "${currentOrder.status}" -> "${status}", order_type="${currentOrder.order_type}", user_id="${currentOrder.user_id || "SEM"}", total=R$${Number(currentOrder.total_amount).toFixed(2)}`);

    const updatePayload: Record<string, unknown> = { status };

    // Ao sair de qualquer status de "aguardando pagamento" (PIX ou Cartão),
    // marca automaticamente como pago — a menos que esteja cancelando
    if (PENDING_PAYMENT_STATUSES.includes(currentOrder.status) && !PENDING_PAYMENT_STATUSES.includes(status) && status !== "cancelled") {
      updatePayload.payment_status = "paid";
      console.log(`[UPDATE-ORDER-STATUS:${requestId}] Pagamento confirmado automaticamente — payment_status → paid (saindo de "${currentOrder.status}")`);
    }

    const { data: updatedOrder, error: updateError } = await adminClient
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select("id, status, customer_name, customer_phone, public_tracking_code, order_type, table_number, items, total_amount, payment_status, stock_deducted, created_at, user_id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      return new Response(
        JSON.stringify({ error: updateError?.message || "Erro ao atualizar status", code: updateError?.code || "UPDATE_FAILED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PASSO 8: BAIXA DE ESTOQUE
    let stockResult = { deducted: false, insufficient: [] as string[], errors: [] as string[] };

    if (status === "delivered" && !currentOrder.stock_deducted) {
      const items = currentOrder.items as Array<{ id: number; name: string; quantity: number }> | null;
      if (items && Array.isArray(items) && items.length > 0) {
        let allDeducted = true;
        for (const item of items) {
          if (!item.id || !item.quantity || item.quantity <= 0) continue;
          try {
            const { data: product, error: prodError } = await adminClient
              .from("products").select("stock_quantity, name").eq("id", item.id).maybeSingle();
            if (prodError || !product) { stockResult.errors.push(`${item.name || "Produto"}: erro de leitura`); allDeducted = false; continue; }
            const currentStock = product.stock_quantity ?? 0;
            const newStock = Math.max(0, currentStock - item.quantity);
            if (currentStock < item.quantity) stockResult.insufficient.push(`${product.name} (disp: ${currentStock})`);
            const { error: updError } = await adminClient.from("products").update({ stock_quantity: newStock }).eq("id", item.id);
            if (updError) { stockResult.errors.push(`${product.name}: ${updError.message}`); allDeducted = false; continue; }
            await adminClient.from("stock_movements").insert({
              product_id: item.id, quantity: -item.quantity, reason: "baixa_pedido",
              notes: `Baixa automatica pedido ${orderId.slice(-8)}`, previous_stock: currentStock, new_stock: newStock,
            }).catch(() => {});
          } catch (itemErr: any) {
            stockResult.errors.push(`${item.name || "Produto"}: ${itemErr?.message || "excecao"}`);
            allDeducted = false;
          }
        }
        if (allDeducted && stockResult.insufficient.length === 0 && stockResult.errors.length === 0) {
          await adminClient.from("orders").update({ stock_deducted: true }).eq("id", orderId);
          stockResult.deducted = true;
        }
      }
    }

    // PASSO 9: FIDELIDADE
    let loyaltyResult = { awarded: false, points: 0, tier: "bronze" as string, skipped: false, reason: "" };

    if (status === "delivered" && currentOrder.user_id) {
      const customerId = currentOrder.user_id;
      const totalAmount = Number(currentOrder.total_amount) || 0;
      console.log(`[LOYALTY:${requestId}] INICIANDO — customerId=${customerId}, total=R$${totalAmount.toFixed(2)}`);

      try {
        const { data: existingLh, error: lhCheckError } = await adminClient
          .from("loyalty_history").select("id").eq("user_id", customerId).eq("order_id", orderId).maybeSingle();
        if (lhCheckError) {
          console.error(`[LOYALTY:${requestId}] Erro duplicidade:`, lhCheckError.message);
          loyaltyResult.skipped = true;
          loyaltyResult.reason = `Erro ao verificar duplicidade: ${lhCheckError.message}`;
        } else if (existingLh) {
          console.log(`[LOYALTY:${requestId}] Ja creditado`);
          loyaltyResult.skipped = true;
          loyaltyResult.reason = "Pontos ja creditados";
        }

        if (!loyaltyResult.skipped) {
          const { data: lpData, error: lpFetchError } = await adminClient
            .from("loyalty_points").select("id, points, tier").eq("user_id", customerId).maybeSingle();
          if (lpFetchError) {
            console.error(`[LOYALTY:${requestId}] Erro buscar lp:`, lpFetchError.message);
            loyaltyResult.skipped = true;
            loyaltyResult.reason = `Erro ao buscar loyalty_points: ${lpFetchError.message}`;
          }

          let lpId = "";
          let currentPoints = 0;

          if (!loyaltyResult.skipped && !lpData) {
            lpId = crypto.randomUUID();
            const { error: lpInsertError } = await adminClient
              .from("loyalty_points").insert({ id: lpId, user_id: customerId, points: 0, tier: "bronze", updated_at: new Date().toISOString() });
            if (lpInsertError) {
              console.error(`[LOYALTY:${requestId}] Erro criar lp:`, lpInsertError.message);
              loyaltyResult.skipped = true;
              loyaltyResult.reason = `Erro ao criar loyalty_points: ${lpInsertError.message}`;
            }
          } else if (!loyaltyResult.skipped && lpData) {
            lpId = lpData.id;
            currentPoints = lpData.points || 0;
          }

          if (!loyaltyResult.skipped) {
            const points = Math.max(1, Math.floor(totalAmount / 2));
            const newPoints = currentPoints + points;
            const newTier = getTierName(newPoints);
            console.log(`[LOYALTY:${requestId}] Creditando +${points}pts → total=${newPoints}, tier=${newTier}`);

            const { error: lpUpdateError } = await adminClient
              .from("loyalty_points").update({ points: newPoints, tier: newTier, updated_at: new Date().toISOString() }).eq("id", lpId);

            if (lpUpdateError) {
              console.error(`[LOYALTY:${requestId}] ❌ Erro atualizar lp:`, JSON.stringify(lpUpdateError));
              loyaltyResult.skipped = true;
              loyaltyResult.reason = `Erro ao atualizar pontos: ${lpUpdateError.message} (code: ${lpUpdateError.code})`;
            } else {
              console.log(`[LOYALTY:${requestId}] ✅ lp atualizado: ${newPoints}pts, tier=${newTier}`);
              const historyId = crypto.randomUUID();
              const { error: lhInsertError } = await adminClient
                .from("loyalty_history").insert({ id: historyId, user_id: customerId, points, reason: `Pontos pelo pedido #${orderId.slice(-6)}`, order_id: orderId });
              if (lhInsertError) {
                console.error(`[LOYALTY:${requestId}] Erro historico:`, lhInsertError.message);
                loyaltyResult.reason = `Pontos creditados (${points}) mas historico falhou`;
              }
              loyaltyResult.awarded = true;
              loyaltyResult.points = points;
              loyaltyResult.tier = newTier;
            }
          }
        }
      } catch (loyaltyErr: any) {
        console.error(`[LOYALTY:${requestId}] EXCECAO PASSO 9:`, loyaltyErr?.message || loyaltyErr);
        loyaltyResult.skipped = true;
        loyaltyResult.reason = `Excecao: ${loyaltyErr?.message || "erro desconhecido"}`;
      }
      console.log(`[LOYALTY:${requestId}] FIM — awarded=${loyaltyResult.awarded}, tier=${loyaltyResult.tier}, reason=${loyaltyResult.reason}`);
    } else if (status === "delivered" && !currentOrder.user_id) {
      loyaltyResult.skipped = true;
      loyaltyResult.reason = "Pedido sem cliente vinculado";
    }

    console.log(`[UPDATE-ORDER-STATUS:${requestId}] ========== FIM (sucesso) ==========`);

    return new Response(
      JSON.stringify({ success: true, order: updatedOrder, stock: stockResult, loyalty: loyaltyResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const e = err as Error;
    console.error(`[UPDATE-ORDER-STATUS:${requestId}] EXCECAO:`, e.message);
    return new Response(
      JSON.stringify({ error: e.message || "Erro interno", code: "UNHANDLED_EXCEPTION" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
