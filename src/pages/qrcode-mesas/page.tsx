import { useState } from "react";
import { getBaseUrl } from "@/lib/getBaseUrl";

const TABLES = Array.from({ length: 10 }, (_, i) => i + 1);

function generateQRCodeUrl(mesa: number): string {
  const base = getBaseUrl();
  return `${base}/pedidos?mesa=${mesa}`;
}

export default function QRCodeMesasPage() {
  const [selectedMesa, setSelectedMesa] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-np-wood-50">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <a href="/" className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm mb-4">
            <i className="ri-arrow-left-line"></i>
            Voltar ao Site
          </a>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
            QR Codes das Mesas
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Imprima e coloque na mesa. O cliente escaneia e faz o pedido direto!
          </p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 py-8">
        <div className="max-w-5xl mx-auto">
          {selectedMesa ? (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 text-center max-w-md mx-auto">
              <button
                onClick={() => setSelectedMesa(null)}
                className="flex items-center gap-1 text-np-purple-600 hover:text-np-purple-800 text-sm mb-6 mx-auto"
              >
                <i className="ri-arrow-left-line"></i>
                Voltar ao grid
              </button>

              <div className="mb-6">
                <div className="w-20 h-20 bg-np-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-armchair-line text-3xl text-np-purple-600"></i>
                </div>
                <h2 className="font-display text-2xl text-np-purple-900">
                  Mesa {selectedMesa}
                </h2>
                <p className="text-sm text-np-purple-500 mt-1">
                  Escaneie para fazer o pedido
                </p>
              </div>

              {/* QR Code Placeholder using API */}
              <div className="bg-white p-4 rounded-xl border-2 border-np-wood-300 inline-block mb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(generateQRCodeUrl(selectedMesa))}`}
                  alt={`QR Code Mesa ${selectedMesa}`}
                  className="w-48 h-48 md:w-56 md:h-56"
                />
              </div>

              <p className="text-xs text-np-purple-400 mb-2 break-all px-4">
                {generateQRCodeUrl(selectedMesa)}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-np-purple-600 hover:bg-np-purple-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <i className="ri-printer-line mr-1"></i>
                  Imprimir
                </button>
                <a
                  href={`/pedidos?mesa=${selectedMesa}`}
                  className="px-4 py-2 bg-np-green-600 hover:bg-np-green-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <i className="ri-external-link-line mr-1"></i>
                  Testar Link
                </a>
              </div>

              <div className="mt-6 bg-np-gold-50 border border-np-gold-200 rounded-lg p-4 text-left">
                <p className="text-sm font-medium text-np-purple-800 mb-2">
                  <i className="ri-information-line mr-1 text-np-gold-600"></i>
                  Instruções para impressão:
                </p>
                <ul className="text-xs text-np-purple-600 space-y-1 list-disc list-inside">
                  <li>Tamanho recomendado: 10cm x 10cm</li>
                  <li>Colocar em um suporte na mesa</li>
                  <li>Incluir o número da mesa abaixo do QR</li>
                  <li>Teste o QR antes de imprimir em massa</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-np-gold-50 border border-np-gold-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <i className="ri-lightbulb-line text-np-gold-600 text-xl flex-shrink-0 mt-0.5"></i>
                <div>
                  <p className="text-sm font-medium text-np-purple-800">
                    Como funciona o QR Code da mesa?
                  </p>
                  <p className="text-xs text-np-purple-600 mt-1">
                    Clique na mesa para gerar o QR code. Imprima e coloque na mesa física. Quando o cliente escanear, ele vai direto para a página de pedidos com a mesa já preenchida.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-3">
                {TABLES.map((num) => (
                  <button
                    key={num}
                    onClick={() => setSelectedMesa(num)}
                    className="bg-white rounded-xl border border-np-wood-200 hover:border-np-purple-400 p-4 text-center transition-all hover:shadow-md group"
                  >
                    <div className="w-10 h-10 bg-np-wood-100 group-hover:bg-np-purple-100 rounded-full flex items-center justify-center mx-auto mb-2 transition-colors">
                      <i className="ri-qr-code-line text-lg text-np-wood-500 group-hover:text-np-purple-600"></i>
                    </div>
                    <p className="font-display font-bold text-np-purple-900">Mesa {num}</p>
                    <p className="text-xs text-np-purple-400 mt-1">Gerar QR</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}