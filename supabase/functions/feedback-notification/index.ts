import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface FeedbackPayload {
  id: string;
  order_id: string | null;
  customer_name: string;
  rating: number;
  comment: string | null;
  would_recommend: boolean | null;
  created_at: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as FeedbackPayload;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "npemporiocafeteriaemassas@gmail.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const origin = req.headers.get("origin") || "https://np-emporio.vercel.app";
    console.log("[FEEDBACK-NOTIFY] Request origin:", origin);
    const adminPanelUrl = `${origin}/admin`;
    const siteUrl = origin;

    let customerEmail: string | null = null;
    let customerPhone: string | null = null;

    if (payload.order_id && supabaseUrl && serviceRoleKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, customer_phone")
          .eq("id", payload.order_id)
          .maybeSingle();

        if (order) {
          customerPhone = order.customer_phone || null;
          if (order.user_id) {
            try {
              const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
              if (userData?.user?.email) {
                customerEmail = userData.user.email;
              }
            } catch (authErr) {
              console.log("[FEEDBACK-NOTIFY] Could not fetch auth user:", authErr);
            }
          }
          if (!customerEmail && customerPhone && customerPhone.includes("@")) {
            customerEmail = customerPhone;
          }
        }
      } catch (lookupErr) {
        console.log("[FEEDBACK-NOTIFY] Order lookup failed:", lookupErr);
      }
    }

    const stars = "★".repeat(payload.rating) + "☆".repeat(5 - payload.rating);

    const adminSubject = `[NP Emporio] Nova Avaliação de ${payload.customer_name} - ${payload.rating} estrelas`;
    const adminBody = `Olá,\n\nVocê recebeu uma nova avaliação na NP Emporio!\n\nCliente: ${payload.customer_name}\nNota: ${stars} (${payload.rating}/5)\nRecomenda: ${payload.would_recommend ? "Sim" : "Não"}\n\nComentário:\n${payload.comment || "(sem comentário)"}\n\nPedido: ${payload.order_id ? payload.order_id : "Não associado a pedido"}\nData: ${new Date(payload.created_at).toLocaleString("pt-BR")}\n\nVeja todas as avaliações no painel admin:\n${adminPanelUrl}\n\n---\nNP Emporio - Massas & Variedades\n`;

    const customerSubject = `[NP Emporio] Obrigado pelo seu feedback, ${payload.customer_name}!`;
    const customerBody = `Olá ${payload.customer_name},\n\nObrigado por compartilhar sua experiência conosco!\n\nRecebemos sua avaliação na NP Emporio e queremos que saiba que sua opinião é muito importante para nós.\n\n${payload.rating >= 4
  ? `Ficamos muito felizes em saber que você teve uma experiência positiva! Esperamos recebê-lo em breve para mais momentos especiais.`
  : payload.rating === 3
  ? `Agradecemos sua sinceridade. Estamos sempre buscando melhorar e seu feedback nos ajuda muito nesse caminho.`
  : `Lamentamos que sua experiência não tenha sido a melhor. Gostaríamos muito de ter a oportunidade de fazer diferente na próxima vez. Entre em contato conosco se quiser compartilhar mais detalhes.`
}\n\n${payload.comment ? `Seu comentário: "${payload.comment}"` : ""}\n\nAgradecemos a preferência!\n\n---\nNP Emporio - Massas & Variedades\n${siteUrl}\n`;

    const results: { admin?: unknown; customer?: unknown } = {};

    if (!resendApiKey) {
      console.log("[FEEDBACK-NOTIFY] No RESEND_API_KEY configured.");
      console.log("[FEEDBACK-NOTIFY] Admin email would be:", { to: adminEmail, subject: adminSubject, adminPanelUrl });
      if (customerEmail) {
        console.log("[FEEDBACK-NOTIFY] Customer thank-you email would be:", { to: customerEmail, subject: customerSubject, siteUrl });
      } else {
        console.log("[FEEDBACK-NOTIFY] No customer email found. Could not send thank-you.");
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email notification simulated (no RESEND_API_KEY configured)",
          admin: { to: adminEmail, subject: adminSubject, adminPanelUrl },
          customer: customerEmail ? { to: customerEmail, subject: customerSubject, siteUrl } : null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const adminRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "NP Emporio <naoresponder@np-emporio.com>",
        to: adminEmail,
        subject: adminSubject,
        text: adminBody,
      }),
    });

    if (!adminRes.ok) {
      const err = await adminRes.text();
      console.error("[FEEDBACK-NOTIFY] Resend admin error:", err);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send admin email", details: err }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    results.admin = await adminRes.json();
    console.log("[FEEDBACK-NOTIFY] Admin email sent:", results.admin);

    if (customerEmail) {
      const customerRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "NP Emporio <naoresponder@np-emporio.com>",
          to: customerEmail,
          subject: customerSubject,
          text: customerBody,
        }),
      });

      if (customerRes.ok) {
        results.customer = await customerRes.json();
        console.log("[FEEDBACK-NOTIFY] Customer thank-you email sent:", results.customer);
      } else {
        const err = await customerRes.text();
        console.error("[FEEDBACK-NOTIFY] Customer thank-you email failed:", err);
      }
    } else {
      console.log("[FEEDBACK-NOTIFY] No customer email found, thank-you email not sent.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Emails sent",
        results,
        customerEmail: customerEmail || null,
        siteUrl,
        adminPanelUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[FEEDBACK-NOTIFY] Exception:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});