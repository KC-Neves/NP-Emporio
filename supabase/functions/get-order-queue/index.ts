import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface OrderItem {
  name?: string;
  quantity?: number;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function classifyStations(items: OrderItem[]) {
  let pasta = false;
  let fryer = false;

  for (const item of items || []) {
    const name = normalize(String(item?.name || ""));

    if (
      name.includes("macarrao") ||
      name.includes("massa") ||
      name.includes("talharim") ||
      name.includes("espaguete") ||
      name.includes("pene") ||
      name.includes("penne")
    ) {
      pasta = true;
    }

    if (
      name.includes("batata") ||
      name.includes("torre") ||
      name.includes("coxinha") ||
      name.includes("salgado") ||
      name.includes("frito")
    ) {
      fryer = true;
    }
  }

  return { pasta, fryer };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: currentOrder, error: currentOrderError } = await adminClient
      .from("orders")
      .select("id, items, status, created_at")
      .eq("id", orderId)
      .maybeSingle();

    if (currentOrderError || !currentOrder) {
      return new Response(
        JSON.stringify({ error: currentOrderError?.message || "Pedido não encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const currentStations = classifyStations(
      Array.isArray(currentOrder.items) ? currentOrder.items : []
    );

    const participatesInQueue = currentStations.pasta || currentStations.fryer;

    if (!participatesInQueue) {
      return new Response(
        JSON.stringify({
          participatesInQueue: false,
          ordersAhead: 0,
          estimatedMinutes: 0,
          stations: { pasta: 0, fryer: 0 },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: previousOrders, error: previousOrdersError } = await adminClient
      .from("orders")
      .select("id, items, status, created_at")
      .in("status", ["pending", "preparing"])
      .lt("created_at", currentOrder.created_at)
      .order("created_at", { ascending: true });

    if (previousOrdersError) {
      return new Response(JSON.stringify({ error: previousOrdersError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pastaAhead = 0;
    let fryerAhead = 0;
    const relevantOrderIds = new Set<string>();

    for (const order of previousOrders || []) {
      const stations = classifyStations(Array.isArray(order.items) ? order.items : []);
      let relevant = false;

      if (currentStations.pasta && stations.pasta) {
        pastaAhead += 1;
        relevant = true;
      }

      if (currentStations.fryer && stations.fryer) {
        fryerAhead += 1;
        relevant = true;
      }

      if (relevant) relevantOrderIds.add(order.id);
    }

    return new Response(
      JSON.stringify({
        participatesInQueue: true,
        ordersAhead: relevantOrderIds.size,
        estimatedMinutes: 35,
        stations: {
          pasta: currentStations.pasta ? pastaAhead : 0,
          fryer: currentStations.fryer ? fryerAhead : 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});