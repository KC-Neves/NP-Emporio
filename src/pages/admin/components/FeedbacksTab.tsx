import { useState, useRef } from "react";
import { useFeedbacks } from "@/hooks/useFeedbacks";
import { useGlobalToast } from "@/hooks/useToast";

export default function FeedbacksTab() {
  const { feedbacks, loading, newFeedbackIds, fetchFeedbacks, getAverageRating, getRecommendRate, getRatingDistribution, getRatingOverTime } = useFeedbacks();
  const { showToast } = useGlobalToast();
  const toastCounterRef = useRef(0);
  const addToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000) => {
    const id = `feedbacks-${++toastCounterRef.current}-${Date.now()}`;
    showToast({ id, message, type, duration });
  };
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailFeedbackId, setDetailFeedbackId] = useState<string | null>(null);

  const filtered = feedbacks.filter((f) => {
    const matchRating = ratingFilter === "all" || f.rating === ratingFilter;
    const query = searchQuery.toLowerCase();
    const matchSearch =
      !query ||
      f.customerName.toLowerCase().includes(query) ||
      (f.comment?.toLowerCase() || "").includes(query);
    return matchRating && matchSearch;
  });

  const avgRating = getAverageRating();
  const recommendRate = getRecommendRate();
  const distribution = getRatingDistribution();
  const maxDist = Math.max(...Object.values(distribution), 1);
  const ratingOverTime = getRatingOverTime();
  const maxAvg = Math.max(...ratingOverTime.map((p) => p.avg), 5);
  const minAvg = Math.min(...ratingOverTime.map((p) => p.avg), 1);

  const handleCopyFeedback = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      addToast("Feedback copiado!", "success", 2000);
    });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl text-np-purple-900">
          <i className="ri-star-line mr-2 text-np-gold-500"></i>
          Avaliações dos Clientes
        </h2>
        <button
          onClick={fetchFeedbacks}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-np-wood-300 hover:bg-np-wood-50 text-np-purple-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-refresh-line mr-1"></i>
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
          <i className="ri-star-fill text-3xl text-np-gold-500 mb-2 block"></i>
          <p className="font-display text-2xl font-bold text-np-purple-900">
            {avgRating.toFixed(1)}
          </p>
          <p className="text-xs text-np-purple-500">Nota Média</p>
        </div>
        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
          <i className="ri-message-3-line text-3xl text-np-purple-600 mb-2 block"></i>
          <p className="font-display text-2xl font-bold text-np-purple-900">
            {feedbacks.length}
          </p>
          <p className="text-xs text-np-purple-500">Total de Avaliações</p>
        </div>
        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
          <i className="ri-heart-3-line text-3xl text-red-500 mb-2 block"></i>
          <p className="font-display text-2xl font-bold text-np-purple-900">
            {Math.round(recommendRate)}%
          </p>
          <p className="text-xs text-np-purple-500">Recomendam</p>
        </div>
        <div className="bg-white rounded-xl border border-np-wood-200 p-5">
          <i className="ri-star-smile-line text-3xl text-np-green-600 mb-2 block"></i>
          <p className="font-display text-2xl font-bold text-np-purple-900">
            {feedbacks.filter((f) => f.rating >= 4).length}
          </p>
          <p className="text-xs text-np-purple-500">Notas 4-5</p>
        </div>
      </div>

      {/* Rating Distribution */}
      <div className="bg-white rounded-xl border border-np-wood-200 p-5 mb-6">
        <h3 className="font-display text-sm text-np-purple-800 mb-3">
          <i className="ri-bar-chart-line mr-1 text-np-purple-500"></i>
          Distribuição de Notas
        </h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[star] || 0;
            const pct = Math.round((count / maxDist) * 100);
            const totalPct = feedbacks.length > 0 ? Math.round((count / feedbacks.length) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="text-sm font-medium text-np-purple-700 w-12">{star} <i className="ri-star-fill text-np-gold-400 text-xs"></i></span>
                <div className="flex-1 h-3 bg-np-wood-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-np-gold-500 transition-all"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
                <span className="text-xs text-np-purple-500 w-16 text-right">
                  {count} ({totalPct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rating Over Time Chart */}
      {ratingOverTime.length > 1 && (
        <div className="bg-white rounded-xl border border-np-wood-200 p-5 mb-6">
          <h3 className="font-display text-sm text-np-purple-800 mb-3">
            <i className="ri-line-chart-line mr-1 text-np-purple-500"></i>
            Evolução da Satisfação
          </h3>
          <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
            {ratingOverTime.map((point, idx) => {
              const range = maxAvg - minAvg || 1;
              const height = ((point.avg - minAvg) / range) * 100;
              const prev = ratingOverTime[idx - 1];
              const prevHeight = prev ? ((prev.avg - minAvg) / range) * 100 : height;
              return (
                <div key={point.date} className="flex flex-col items-center gap-1 min-w-[48px] flex-1 relative">
                  <span className="text-[10px] text-np-purple-600 font-medium">
                    {point.avg.toFixed(1)}
                  </span>
                  <div className="w-full bg-np-wood-100 rounded-t-md relative overflow-hidden" style={{ height: `${Math.max(height, 8)}%`, minHeight: "8px" }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-np-purple-700 to-np-purple-500 rounded-t-md"></div>
                  </div>
                  <span className="text-[10px] text-np-purple-400">{point.label}</span>
                  <span className="text-[9px] text-np-purple-300">{point.count} av</span>
                </div>
              );
            })}
          </div>
          {/* Simple SVG line overlay */}
          <div className="relative h-2 mt-1">
            <svg className="absolute inset-0 w-full h-6 overflow-visible" preserveAspectRatio="none">
              {ratingOverTime.map((point, idx) => {
                if (idx === 0) return null;
                const prev = ratingOverTime[idx - 1];
                const range = maxAvg - minAvg || 1;
                const x1 = ((idx - 1) / (ratingOverTime.length - 1)) * 100;
                const x2 = (idx / (ratingOverTime.length - 1)) * 100;
                const y1 = 100 - ((prev.avg - minAvg) / range) * 100;
                const y2 = 100 - ((point.avg - minAvg) / range) * 100;
                return (
                  <line
                    key={point.date}
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                );
              })}
              {ratingOverTime.map((point, idx) => {
                const range = maxAvg - minAvg || 1;
                const x = (idx / (ratingOverTime.length - 1)) * 100;
                const y = 100 - ((point.avg - minAvg) / range) * 100;
                return (
                  <circle
                    key={point.date + "-dot"}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="3"
                    fill="#f59e0b"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nome ou comentário..."
          className="px-4 py-2 rounded-lg border border-np-wood-300 text-sm focus:outline-none focus:ring-2 focus:ring-np-purple-500 w-full sm:w-64"
        />
        <div className="flex gap-2 overflow-x-auto">
          {[
            { id: "all" as const, label: "Todas" },
            { id: 5, label: "5 estrelas" },
            { id: 4, label: "4 estrelas" },
            { id: 3, label: "3 estrelas" },
            { id: 2, label: "2 estrelas" },
            { id: 1, label: "1 estrela" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setRatingFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                ratingFilter === f.id
                  ? "bg-np-purple-700 text-white"
                  : "bg-white text-np-purple-700 border border-np-wood-300 hover:border-np-purple-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback List */}
      {loading ? (
        <div className="text-center py-16">
          <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400"></i>
          <p className="text-sm text-np-purple-500 mt-2">Carregando avaliações...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-np-purple-400 bg-white rounded-xl border border-np-wood-200">
          <i className="ri-star-line text-4xl mb-3 block"></i>
          <p className="text-sm">Nenhuma avaliação encontrada</p>
          {feedbacks.length > 0 && (
            <p className="text-xs mt-2">Tente ajustar os filtros</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => {
            const isNew = newFeedbackIds.has(f.id);
            return (
              <div
                key={f.id}
                className={`bg-white rounded-xl border p-5 transition-all ${
                  isNew ? "border-np-gold-400 shadow-md" : "border-np-wood-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-np-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="font-bold text-np-purple-700 text-sm">
                        {f.customerName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-np-purple-900">
                          {f.customerName}
                        </span>
                        {isNew && (
                          <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse-fast">
                            <i className="ri-notification-3-line"></i>
                            NOVO!
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <i
                            key={i}
                            className={`ri-star-fill text-xs ${
                              i < f.rating ? "text-np-gold-500" : "text-np-wood-200"
                            }`}
                          ></i>
                        ))}
                        <span className="text-xs text-np-purple-400 ml-1">
                          {new Date(f.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.wouldRecommend && (
                      <span className="inline-flex items-center gap-1 text-xs text-np-green-600 bg-np-green-50 px-2 py-1 rounded-full">
                        <i className="ri-heart-3-line"></i>
                        Recomenda
                      </span>
                    )}
                    {f.orderId && (
                      <span className="text-xs text-np-purple-400 bg-np-wood-50 px-2 py-1 rounded-full">
                        Pedido #{f.orderId.slice(-8)}
                      </span>
                    )}
                  </div>
                </div>
                {f.comment && (
                  <div className="mt-3 bg-np-wood-50 rounded-lg p-3">
                    <p className="text-sm text-np-purple-700">{f.comment}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => setDetailFeedbackId(f.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-eye-line mr-1"></i>
                    Detalhes
                  </button>
                  {f.comment && (
                    <button
                      onClick={() => handleCopyFeedback(f.comment || "")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-np-wood-100 text-np-purple-600 hover:bg-np-wood-200 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-file-copy-line mr-1"></i>
                      Copiar
                    </button>
                  )}
                  {f.orderId && (
                    <a
                      href={`/feedback/${f.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-np-purple-100 text-np-purple-700 hover:bg-np-purple-200 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-external-link-line mr-1"></i>
                      Ver Página
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detailFeedbackId && (() => {
        const f = feedbacks.find((fb) => fb.id === detailFeedbackId);
        if (!f) return null;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
              <h3 className="font-display text-lg text-np-purple-900 mb-1">
                <i className="ri-star-line mr-2 text-np-gold-500"></i>
                Avaliação de {f.customerName}
              </h3>
              <p className="text-xs text-np-purple-500 mb-4">
                {new Date(f.createdAt).toLocaleString("pt-BR")}
              </p>

              <div className="space-y-3">
                <div className="bg-np-wood-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Nota</span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <i
                          key={i}
                          className={`ri-star-fill text-sm ${
                            i < f.rating ? "text-np-gold-500" : "text-np-wood-200"
                          }`}
                        ></i>
                      ))}
                      <span className="text-sm font-medium text-np-purple-900 ml-1">{f.rating}/5</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-np-purple-700">Recomenda?</span>
                    <span className={`text-sm font-medium ${f.wouldRecommend ? "text-np-green-600" : "text-np-purple-400"}`}>
                      {f.wouldRecommend ? "Sim" : "Não"}
                    </span>
                  </div>
                  {f.orderId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-np-purple-700">Pedido</span>
                      <span className="text-sm font-medium text-np-purple-900">#{f.orderId.slice(-8)}</span>
                    </div>
                  )}
                </div>
                {f.comment && (
                  <div className="bg-np-wood-50 rounded-lg p-4">
                    <p className="text-xs text-np-purple-600 font-medium mb-1">Comentário</p>
                    <p className="text-sm text-np-purple-800">{f.comment}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDetailFeedbackId(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors"
                >
                  Fechar
                </button>
                {f.comment && (
                  <button
                    onClick={() => {
                      handleCopyFeedback(f.comment || "");
                      setDetailFeedbackId(null);
                    }}
                    className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <i className="ri-file-copy-line mr-1"></i>
                    Copiar Comentário
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}