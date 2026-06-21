import { useState } from "react";

interface CardPaymentModalProps {
  amount: number;
  onClose: () => void;
  orderLabel?: string;
}

export default function CardPaymentModal({ amount, onClose, orderLabel }: CardPaymentModalProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardCpf, setCardCpf] = useState("");
  const [processing, setProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 9) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (digits.length > 6) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");
    if (digits.length > 3) return digits.replace(/(\d{3})(\d{3})/, "$1.$2");
    return digits;
  };

  const handleSubmit = () => {
    const rawNumber = cardNumber.replace(/\s/g, "");
    if (rawNumber.length < 13) {
      setError("Número do cartão inválido. Verifique e tente novamente.");
      return;
    }
    if (!cardName.trim()) {
      setError("Informe o nome no cartão.");
      return;
    }
    if (cardExpiry.length < 5) {
      setError("Data de validade inválida.");
      return;
    }
    if (cardCvv.length < 3) {
      setError("CVV inválido.");
      return;
    }
    const rawCpf = cardCpf.replace(/\D/g, "");
    if (rawCpf.length < 11) {
      setError("CPF inválido. Informe os 11 dígitos.");
      return;
    }

    setError(null);
    setProcessing(true);

    // Simula processamento do cartão (1.5s)
    setTimeout(() => {
      setProcessing(false);
      setConfirmed(true);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {!confirmed ? (
          <>
            {/* Cabeçalho */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-bank-card-line text-2xl text-blue-600"></i>
              </div>
              <h3 className="font-display text-xl text-np-purple-900">
                Pagamento com Cartão
              </h3>
              {orderLabel && (
                <p className="text-sm text-np-purple-500 mt-1">{orderLabel}</p>
              )}
              <p className="text-lg font-bold text-np-purple-900 mt-2">
                R$ {amount.toFixed(2)}
              </p>
            </div>

            {/* Alerta */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-time-line text-amber-600"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800 mb-1">
                    Aguardando Pagamento
                  </p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Seu pedido <strong>ainda não foi enviado para a cozinha</strong>. Ele será liberado assim que o pagamento for confirmado.
                  </p>
                </div>
              </div>
            </div>

            {/* Formulário do cartão */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <i className="ri-error-warning-line"></i>
                  {error}
                </p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1.5">
                  Número do Cartão
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm pl-10"
                  />
                  <i className="ri-bank-card-line absolute left-3 top-1/2 -translate-y-1/2 text-np-purple-400"></i>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1.5">
                  Nome no Cartão
                </label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value.toUpperCase())}
                  placeholder="SEU NOME COMPLETO"
                  className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1.5">
                    Validade
                  </label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/AA"
                    maxLength={5}
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-np-purple-800 mb-1.5">
                    CVV
                  </label>
                  <input
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-np-purple-800 mb-1.5">
                  CPF do Titular
                </label>
                <input
                  type="text"
                  value={cardCpf}
                  onChange={(e) => setCardCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 text-sm"
                />
              </div>
            </div>

            {/* Botão processar */}
            <button
              onClick={handleSubmit}
              disabled={processing}
              className="w-full py-3 rounded-lg bg-np-purple-600 hover:bg-np-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors whitespace-nowrap mb-3"
            >
              {processing ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Processando...
                </span>
              ) : (
                <span>
                  <i className="ri-lock-line mr-2"></i>
                  Processar Pagamento
                </span>
              )}
            </button>

            <div className="flex items-center gap-2 mb-4 justify-center">
              <i className="ri-shield-check-line text-xs text-np-purple-400"></i>
              <p className="text-[10px] text-np-purple-400">
                Dados processados com segurança. Nenhuma informação do cartão é armazenada.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg border border-np-wood-300 text-np-purple-700 font-medium text-sm hover:bg-np-wood-50 transition-colors whitespace-nowrap"
            >
              Fechar
            </button>
          </>
        ) : (
          <>
            {/* Confirmação */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-shield-check-line text-3xl text-np-green-600"></i>
              </div>
              <h3 className="font-display text-xl text-np-purple-900 mb-2">
                Cartão Processado!
              </h3>
              <p className="text-sm text-np-purple-600">
                Pagamento de R$ {amount.toFixed(2)} registrado com sucesso.
              </p>
            </div>

            <div className="bg-np-green-50 border border-np-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-np-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-time-line text-np-green-600"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-np-green-800 mb-1">
                    Aguardando Confirmação
                  </p>
                  <p className="text-xs text-np-green-700 leading-relaxed">
                    O caixa confirmará seu pagamento e liberará o pedido para a cozinha. Você será redirecionado automaticamente.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-np-green-100 border border-np-green-200 rounded-lg p-3 mb-6 text-center">
              <p className="text-sm font-medium text-np-green-700">
                <i className="ri-check-line mr-1"></i>
                Pagamento registrado! Aguarde a confirmação do caixa...
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg border border-np-wood-300 text-np-purple-700 font-medium text-sm hover:bg-np-wood-50 transition-colors whitespace-nowrap"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
}