import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return new Response(JSON.stringify({ valid: false, error: "Missing code" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[VALIDATE-TRACKING] Missing env vars");
      return new Response(JSON.stringify({ valid: false, error: "Server configuration error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("orders")
      .select("id, public_tracking_code, customer_name, table_number, order_type, status, payment_status, total_amount, delivery_fee, address, neighborhood, items, created_at, delivery_latitude, delivery_longitude")
      .eq("public_tracking_code", code)
      .maybeSingle();

    if (error) {
      console.error("[VALIDATE-TRACKING] Database error:", error);
      return new Response(JSON.stringify({ valid: false, error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ valid: false, error: "Order not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        orderId: data.id,
        customerName: data.customer_name,
        tableNumber: data.table_number,
        orderType: data.order_type,
        status: data.status,
        paymentStatus: data.payment_status,
        totalAmount: data.total_amount,
        deliveryFee: data.delivery_fee,
        address: data.address,
        neighborhood: data.neighborhood,
        items: data.items,
        createdAt: data.created_at,
        deliveryLatitude: data.delivery_latitude,
        deliveryLongitude: data.delivery_longitude,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("[VALIDATE-TRACKING] Exception:", err);
    return new Response(JSON.stringify({ valid: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
