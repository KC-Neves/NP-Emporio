import { useRef } from "react";
import { useGlobalToast } from "@/hooks/useToast";
import type { Order } from "@/hooks/useOrderHistory";
import { getBaseUrl } from "@/lib/getBaseUrl";

const HEART = "\u2665";

// ─── Mensagens automáticas por status — ricas e contextualizadas ────────────

function getPreparingTimeEstimate(order: Order): string {
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  if (itemCount <= 2) return "15-20 minutos";
  if (itemCount <= 5) return "20-30 minutos";
  return "30-40 minutos";
}

function getDeliveryTimeEstimate(avgTime?: string): string {
  return avgTime || "25-40 minutos";
}

export function getStatusAutoMessage(order: Order, status: Order["status"], avgTime?: string): string {
  const isMesa = order.orderType === "mesa";
  const isDelivery = order.orderType === "delivery";
  const preparingTime = getPreparingTimeEstimate(order);
  const deliveryTime = getDeliveryTimeEstimate(avgTime);

  switch (status) {
    case "pending":
      return "Seu pedido foi recebido com sucesso! Estamos organizando tudo para voce.";
    case "preparing":
      return `Seu pedido esta sendo preparado com carinho. Tempo estimado: ${preparingTime}.`;
    case "ready":
      if (isMesa) {
        return `Seu pedido esta pronto! Pode retirar na mesa ${order.tableNumber}.`;
      }
      return "Seu pedido esta pronto e ja vai sair para entrega!";
    case "out_for_delivery":
      return `Seu pedido saiu para entrega e esta a caminho. Tempo estimado de chegada: ${deliveryTime}.`;
    case "delivered":
      return "Seu pedido foi entregue. Bom apetite! \u{1F49C}";
    case "cancelled":
      return "Seu pedido foi cancelado. Entre em contato conosco se precisar de ajuda.";
    default:
      return "";
  }
}

// Mantemos STATUS_AUTO_MESSAGES para compatibilidade com codigo que so passa status
export const STATUS_AUTO_MESSAGES: Record<string, string> = {
  pending: "Seu pedido foi recebido com sucesso! Estamos organizando tudo para voce.",
  preparing: "Seu pedido esta sendo preparado com carinho.",
  ready: "Seu pedido esta pronto!",
  out_for_delivery: "Seu pedido saiu para entrega e esta a caminho. Tempo estimado: 25-40 minutos.",
  delivered: "Seu pedido foi entregue. Bom apetite! \u{1F49C}",
  cancelled: "Seu pedido foi cancelado. Entre em contato conosco se precisar de ajuda.",
};

export function getFeedbackUrl(orderId: string): string {
  const base = getBaseUrl();
  const url = `${base}/feedback/${orderId}`;
  console.log("[FEEDBACK URL] getFeedbackUrl generated:", url);
  return url;
}

export function getManualFeedbackMessage(orderId: string): string {
  const url = getFeedbackUrl(orderId);
  const msg = `Após a sua experiência no nosso estabelecimento, deixe seu feedback para que possamos melhorar a sua experiência.\n\nObrigado por escolher a NP Empório!\n\nAvalie seu atendimento aqui: ${url}`;
  console.log("[FEEDBACK MSG] getManualFeedbackMessage:", msg);
  return msg;
}

export function getWhatsAppMessage(order: Order, status: Order["status"], avgTime?: string): string {
  const typeLabel = order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery";
  const items = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const trackingCode = order.publicTrackingCode || order.id;
  const trackingUrl = `${getBaseUrl()}/acompanhar-pedido/${trackingCode}`;
  const statusMsg = getStatusAutoMessage(order, status, avgTime);
  let message = `Ola ${order.customerName}!\n\n${statusMsg}\n\n📋 Pedido ${typeLabel}\n🍽️ ${items}\n💰 Total: R$ ${order.totalAmount.toFixed(2)}\n\n🔗 Acompanhe aqui: ${trackingUrl}\n\nObrigado por escolher a NP Emporio! ${HEART}`;
  if (status === "delivered") {
    message += `\n\n` + getManualFeedbackMessage(order.id);
  }
  return message;
}

export function getEmailSubject(order: Order, status: Order["status"]): string {
  const labels: Record<string, string> = {
    pending: "Pedido recebido",
    preparing: "Pedido em preparo",
    ready: "Seu pedido esta pronto!",
    out_for_delivery: "Seu pedido saiu para entrega!",
    delivered: "Pedido entregue — Queremos seu feedback!",
    cancelled: "Pedido cancelado",
  };
  return `[NP Emporio] ${labels[status] || status} - ${order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery"}`;
}

export function getEmailBody(order: Order, status: Order["status"], avgTime?: string): string {
  const typeLabel = order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery";
  const items = order.items.map((i) => `• ${i.quantity}x ${i.name} - R$ ${(i.price * i.quantity).toFixed(2)}`).join("\n");
  const statusMsg = getStatusAutoMessage(order, status, avgTime);
  let body = `Ola ${order.customerName},\n\n${statusMsg}\n\n📋 Detalhes do pedido:\nTipo: ${typeLabel}\nItens:\n${items}\n\nTotal: R$ ${order.totalAmount.toFixed(2)}\n\nObrigado por escolher a NP Emporio! ${HEART}`;
  if (status === "delivered") {
    body += `\n\nAvalie seu atendimento aqui: ${getFeedbackUrl(order.id)}\n\nAgradecemos sua preferencia!`;
  }
  body += `\n\n---\nNP Emporio - Massas & Variedades\nSalvador, BA`;
  return body;
}

export function openWhatsApp(phone: string, message: string) {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return;
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${clean}?text=${encoded}`;
  console.log("[WHATSAPP] URL gerada:", url);
  window.open(url, "_blank");
}

export function openEmail(email: string, subject: string, body: string) {
  if (!email) return;
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function useOrderNotifications() {
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000, options?: { actions?: Array<{ label: string; onClick: () => void; icon?: string; className?: string }> }) => {
    const id = `order-notif-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration, actions: options?.actions });
  };

  const notifyStatusChange = (order: Order, newStatus: Order["status"], avgTime?: string) => {
    const message = getWhatsAppMessage(order, newStatus, avgTime);
    const emailSubject = getEmailSubject(order, newStatus);
    const emailBody = getEmailBody(order, newStatus, avgTime);
    const statusLabel = STATUS_AUTO_MESSAGES[newStatus]?.split(".")[0] || newStatus;
    const hasPhone = order.customerPhone?.replace(/\D/g, "").length > 0;
    const hasEmail = order.customerName?.includes("@") || false;

    addToast(
      `Pedido de ${order.customerName} (${order.orderType === "mesa" ? `Mesa ${order.tableNumber}` : "Delivery"}) - ${statusLabel}`,
      "info",
      10000,
      {
        actions: [
          ...(hasPhone
            ? [
                {
                  label: "WhatsApp",
                  onClick: () => openWhatsApp(order.customerPhone!, message),
                  icon: "ri-whatsapp-line",
                  className: "bg-green-600 text-white",
                },
              ]
            : []),
          ...(hasEmail
            ? [
                {
                  label: "E-mail",
                  onClick: () => openEmail(order.customerName!, emailSubject, emailBody),
                  icon: "ri-mail-line",
                  className: "bg-np-purple-600 text-white",
                },
              ]
            : []),
        ],
      }
    );
  };

  return { notifyStatusChange, getWhatsAppMessage, getEmailSubject, getEmailBody, openWhatsApp, openEmail, getFeedbackUrl, getManualFeedbackMessage };
}