import { useCallback } from 'react';
import type { Order } from '@/hooks/useOrderHistory';

export function usePrintReceipt() {
  const openPrintWindow = useCallback((html: string) => {
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank', 'width=340,height=680');
      if (!printWindow) {
        // Fallback: popup blocked — open in same tab with a print trigger
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
        return;
      }
      // Cleanup Blob URL after window loads
      const cleanup = () => {
        URL.revokeObjectURL(url);
        printWindow.removeEventListener('load', cleanup);
      };
      printWindow.addEventListener('load', cleanup);
    } catch {
      // Ultimate fallback
      const w = window.open('', '_blank', 'width=340,height=680');
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    }
  }, []);

  const printOrder = useCallback((order: Order, tableNumber?: number) => {
    const date = new Date(order.createdAt).toLocaleString('pt-BR');
    const methodLabel = order.paymentMethod === 'caixa' ? 'Pagar no Caixa' : order.paymentMethod === 'cartao' ? 'Cartão' : 'PIX';
    const statusLabel = order.status === 'pending' ? 'Recebido' : order.status === 'preparing' ? 'Preparando' : order.status === 'ready' ? 'Pronto' : order.status === 'delivered' ? 'Entregue' : 'Cancelado';

    const itemsHtml = order.items.map((item) => `
      <tr>
        <td style="padding: 4px 8px; font-size: 13px;">${item.quantity}x ${item.name}</td>
        <td style="padding: 4px 8px; font-size: 13px; text-align: right;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
      ${item.observation ? `<tr><td colspan="2" style="padding: 2px 8px; font-size: 11px; color: #666; font-style: italic;">Obs: ${item.observation}</td></tr>` : ''}
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo NP Empório</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 8px; color: #1a1a2e; }
          .header { text-align: center; border-bottom: 2px dashed #1a1a2e; padding-bottom: 8px; margin-bottom: 8px; }
          .header h1 { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
          .header p { font-size: 11px; margin-top: 2px; }
          .divider { border-top: 1px dashed #999; margin: 8px 0; }
          .info { font-size: 12px; margin-bottom: 6px; }
          .info span { display: block; }
          table { width: 100%; border-collapse: collapse; }
          .total { font-size: 15px; font-weight: bold; text-align: right; border-top: 1px solid #1a1a2e; padding-top: 6px; margin-top: 6px; }
          .footer { text-align: center; font-size: 11px; margin-top: 12px; border-top: 2px dashed #1a1a2e; padding-top: 8px; }
          @media print { body { margin: 0; padding: 4px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NP EMPÓRIO</h1>
          <p>Cafeteria &amp; Massas Artesanais</p>
          <p>Salvador - BA</p>
        </div>
        <div class="info">
          <span><strong>Data:</strong> ${date}</span>
          ${order.orderType === 'mesa' ? `<span><strong>Mesa:</strong> ${order.tableNumber || tableNumber || '-'}</span>` : `<span><strong>Delivery</strong></span>`}
          <span><strong>Cliente:</strong> ${order.customerName}</span>
          ${order.customerPhone ? `<span><strong>Tel:</strong> ${order.customerPhone}</span>` : ''}
          <span><strong>Pedido:</strong> ${order.id.slice(-8).toUpperCase()}</span>
        </div>
        <div class="divider"></div>
        <table>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <div class="total">
          TOTAL: R$ ${order.totalAmount.toFixed(2)}
        </div>
        <div class="info" style="margin-top: 6px;">
          <span><strong>Pagamento:</strong> ${methodLabel}</span>
          <span><strong>Situação:</strong> ${order.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}</span>
          <span><strong>Status:</strong> ${statusLabel}</span>
        </div>
        <div class="footer">
          <p>Obrigado pela preferência!</p>
          <p>NP Empório - Siga @npemporio</p>
          <p>Programa NP Lovers - Acumule pontos!</p>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    openPrintWindow(html);
  }, []);

  const printTableBill = useCallback((orders: Order[], tableNumber: number) => {
    const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const date = new Date().toLocaleString('pt-BR');

    const ordersHtml = orders.map((order) => `
      <div style="margin-bottom: 6px;">
        <div style="font-size: 12px; font-weight: bold;">Pedido ${order.id.slice(-8).toUpperCase()}</div>
        ${order.items.map((item) => `
          <div style="font-size: 12px; padding-left: 8px;">${item.quantity}x ${item.name} - R$ ${(item.price * item.quantity).toFixed(2)}</div>
        `).join('')}
        <div style="font-size: 12px; text-align: right; font-weight: bold;">Subtotal: R$ ${order.totalAmount.toFixed(2)}</div>
      </div>
    `).join('<div style="border-top: 1px dotted #ccc; margin: 4px 0;"></div>');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fechamento Mesa ${tableNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 8px; color: #1a1a2e; }
          .header { text-align: center; border-bottom: 2px dashed #1a1a2e; padding-bottom: 8px; margin-bottom: 8px; }
          .header h1 { font-size: 16px; font-weight: bold; }
          .header p { font-size: 11px; margin-top: 2px; }
          .big-total { font-size: 18px; font-weight: bold; text-align: center; padding: 8px; background: #f5f0e8; margin: 8px 0; border-radius: 4px; }
          .footer { text-align: center; font-size: 11px; margin-top: 12px; border-top: 2px dashed #1a1a2e; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NP EMPÓRIO</h1>
          <p>FECHAMENTO DE CONTA</p>
          <p>Salvador - BA</p>
        </div>
        <div style="font-size: 12px;">
          <span><strong>Data:</strong> ${date}</span><br>
          <span><strong>Mesa:</strong> ${tableNumber}</span><br>
          <span><strong>Total de pedidos:</strong> ${orders.length}</span>
        </div>
        <div style="border-top: 1px dashed #999; margin: 8px 0;"></div>
        ${ordersHtml}
        <div style="border-top: 1px dashed #999; margin: 8px 0;"></div>
        <div class="big-total">
          TOTAL: R$ ${totalAmount.toFixed(2)}
        </div>
        <div class="footer">
          <p>Obrigado pela preferência!</p>
          <p>NP Empório - Volte sempre!</p>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    openPrintWindow(html);
  }, []);

  return { printOrder, printTableBill };
}