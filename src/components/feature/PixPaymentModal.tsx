import { useState } from "react";

export const PIX_KEY = "npemporiocafeteriaemassas@gmail.com";
export const PIX_COPY_PASTE = "00020126570014br.gov.bcb.pix0135npemporiocafeteriaemassas@gmail.com5204000053039865802BR5925Kelly Cristina Neves Silv6014RIO DE JANEIRO62070503***63046B48";
export const PIX_QR_URL = "https://storage.readdy-site.link/project_files/87529abf-260f-40ea-9b61-b4f04aa2824a/5631ac6f-138f-4695-af07-aab4cc1fa7c5_compressed_WhatsApp-Image-2026-06-21-at-3.30.26-PM.webp";
export const PIX_NAME = "Kelly Cristina Neves Silv";
export const PIX_CITY = "RIO DE JANEIRO";

interface PixPaymentModalProps {
  amount: number;
  onClose: () => void;
  orderLabel?: string;
}

export default function PixPaymentModal({ amount, onClose, orderLabel }: PixPaymentModalProps) {
  const [copied, setCopied] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PIX_COPY_PASTE);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = PIX_COPY_PASTE;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handlePaymentDone = () => {
    setPaidConfirmed(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="ri-qr-code-line text-2xl text-np-green-600"></i>
          </div>
          <h3 className="font-display text-xl text-np-purple-900">
            Pagamento via PIX
          </h3>
          {orderLabel && (
            <p className="text-sm text-np-purple-500 mt-1">{orderLabel}</p>
          )}
          <p className="text-lg font-bold text-np-purple-900 mt-2">
            R$ {amount.toFixed(2)}
          </p>
        </div>

        {/* Alerta: Aguardando confirmação */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-time-line text-amber-600"></i>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">
                Aguardando Pagamento PIX
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Seu pedido <strong>ainda não foi enviado para a cozinha</strong>. Ele será liberado assim que o pagamento for confirmado pelo caixa.
              </p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white p-3 rounded-xl border-2 border-np-wood-200 inline-block">
            <img
              src={PIX_QR_URL}
              alt="QR Code Pix"
              className="w-52 h-52 md:w-60 md:h-60 object-contain"
            />
          </div>
          <p className="text-xs text-np-purple-400 mt-2">
            Escaneie com o app do seu banco
          </p>
        </div>

        {/* Código Copia e Cola */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-np-purple-800 mb-2">
            Código PIX (Copia e Cola)
          </label>
          <div className="bg-np-wood-50 rounded-lg p-3 border border-np-wood-200">
            <p className="text-xs text-np-purple-600 break-all font-mono leading-relaxed">
              {PIX_COPY_PASTE}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`w-full mt-2 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
              copied
                ? "bg-np-green-100 text-np-green-700 border border-np-green-200"
                : "bg-np-purple-600 hover:bg-np-purple-700 text-white"
            }`}
          >
            <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
            {copied ? "Código copiado!" : "Copiar código PIX"}
          </button>
        </div>

        {/* Dados da chave */}
        <div className="bg-np-wood-50 rounded-lg p-4 mb-6 border border-np-wood-200">
          <p className="text-sm font-medium text-np-purple-800 mb-2">
            <i className="ri-key-line mr-1 text-np-purple-500"></i>
            Dados para transferência manual
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-np-purple-500">Chave PIX:</span>
              <span className="text-np-purple-800 font-medium">{PIX_KEY}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-np-purple-500">Nome:</span>
              <span className="text-np-purple-800">{PIX_NAME}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-np-purple-500">Cidade:</span>
              <span className="text-np-purple-800">{PIX_CITY}</span>
            </div>
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-np-wood-50 rounded-lg p-4 mb-6 border border-np-wood-200">
          <p className="text-sm font-medium text-np-purple-800 mb-2">
            <i className="ri-information-line mr-1 text-np-purple-500"></i>
            Como funciona
          </p>
          <div className="space-y-2 text-xs text-np-purple-600">
            <p>1. Escaneie o QR Code ou cole o código no app do seu banco</p>
            <p>2. Realize o pagamento de <strong>R$ {amount.toFixed(2)}</strong></p>
            <p>3. Clique em <strong>"Já realizei o pagamento"</strong> abaixo</p>
            <p>4. O garçom ou caixa confirmará e liberará seu pedido para a cozinha</p>
          </div>
        </div>

        {/* Botão Já realizei */}
        {!paidConfirmed ? (
          <button
            onClick={handlePaymentDone}
            className="w-full py-3 rounded-lg bg-np-green-600 hover:bg-np-green-700 text-white font-bold text-sm transition-colors whitespace-nowrap mb-3"
          >
            <i className="ri-check-double-line mr-2"></i>
            Já realizei o pagamento
          </button>
        ) : (
          <div className="w-full py-3 rounded-lg bg-np-green-100 border border-np-green-200 text-np-green-700 font-medium text-sm text-center mb-3">
            <i className="ri-check-line mr-1"></i>
            Pagamento registrado! Aguarde a confirmação do caixa...
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-lg border border-np-wood-300 text-np-purple-700 font-medium text-sm hover:bg-np-wood-50 transition-colors whitespace-nowrap"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}