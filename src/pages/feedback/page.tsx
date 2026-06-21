import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Footer from "@/components/feature/Footer";

export default function FeedbackPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);
  const [orderValid, setOrderValid] = useState<boolean | null>(null);
  const [orderInfo, setOrderInfo] = useState<{ customerName: string; orderType?: string } | null>(null);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [hoverDeliveryRating, setHoverDeliveryRating] = useState(0);
  const [deliveryComment, setDeliveryComment] = useState("");

  // Validate orderId via edge function (bypasses RLS)
  useEffect(() => {
    console.log("[FEEDBACK PAGE] orderId from URL:", orderId);
    console.log("[FEEDBACK PAGE] window.location:", window.location.href);
    const validateOrder = async () => {
      if (!orderId) {
        console.log("[FEEDBACK PAGE] No orderId provided");
        setOrderValid(false);
        setValidating(false);
        return;
      }
      try {
        const validateUrl = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/validate-feedback?orderId=${encodeURIComponent(orderId)}`;
        console.log("[FEEDBACK PAGE] Calling validate URL:", validateUrl);
        const response = await fetch(
          validateUrl,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
            },
          }
        );

        console.log("[FEEDBACK PAGE] Validate response status:", response.status);
        if (!response.ok) {
          console.log("[FEEDBACK PAGE] Validate response NOT OK, body:", await response.text());
          setOrderValid(false);
        } else {
          const result = await response.json();
          console.log("[FEEDBACK PAGE] Validate result:", result);
          if (result.valid) {
            setOrderValid(true);
            setOrderInfo({ customerName: result.customerName || "Cliente", orderType: result.orderType });
          } else {
            setOrderValid(false);
          }
        }
      } catch (err) {
        console.error("[FEEDBACK PAGE] Validate exception:", err);
        setOrderValid(false);
      } finally {
        setValidating(false);
      }
    };
    validateOrder();
  }, [orderId]);

  const handleSubmit = async () => {
    if (!orderId) {
      setError("ID do pedido não encontrado.");
      return;
    }
    if (rating === 0) {
      setError("Por favor, selecione uma nota de 1 a 5 estrelas.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const isDelivery = orderInfo?.orderType === "delivery";
      const { data: insertData, error: insertError } = await supabase
        .from("feedbacks")
        .insert({
          order_id: orderId,
          customer_name: orderInfo?.customerName || "Cliente",
          rating,
          comment: comment.trim() || null,
          would_recommend: wouldRecommend,
          delivery_rating: isDelivery ? (deliveryRating || null) : null,
          delivery_comment: isDelivery ? (deliveryComment.trim() || null) : null,
        })
        .select()
        .single();

      if (insertError) {
        setError("Erro ao enviar feedback. Tente novamente.");
        console.error("[FEEDBACK] insert error:", insertError);
        setLoading(false);
        return;
      }

      // Call edge function to send thank-you email and admin notification
      try {
        const response = await fetch(
          `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/feedback-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              id: insertData.id,
              order_id: insertData.order_id,
              customer_name: insertData.customer_name,
              rating: insertData.rating,
              comment: insertData.comment,
              would_recommend: insertData.would_recommend,
              created_at: insertData.created_at,
            }),
          }
        );
        const result = await response.json();
        console.log("[FEEDBACK] Notification result:", result);
      } catch (notifyErr) {
        console.error("[FEEDBACK] Notification error:", notifyErr);
      }

      setSubmitted(true);
    } catch (err) {
      setError("Erro inesperado. Tente novamente.");
      console.error("[FEEDBACK] exception:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-np-wood-50 flex flex-col">
      {/* Header */}
      <div className="bg-np-purple-900 text-white py-8 md:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm mb-4"
          >
            <i className="ri-arrow-left-line"></i>
            Voltar para o site
          </button>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-np-gold-400">
            Sua Opinião Importa
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Conte-nos como foi sua experiência na NP Empório
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-12 py-8 md:py-12">
        <div className="max-w-xl mx-auto">
          {/* Validating */}
          {validating && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 md:p-10 text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-np-purple-400 mb-4 block"></i>
              <p className="text-sm text-np-purple-600">Verificando seu pedido...</p>
            </div>
          )}

          {/* Invalid Order */}
          {!validating && orderValid === false && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 md:p-10 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-error-warning-line text-3xl text-red-500"></i>
              </div>
              <h2 className="font-display text-xl text-np-purple-900 mb-2">
                Link de Avaliação Inválido
              </h2>
              <p className="text-np-purple-600 text-sm mb-2">
                Este link de avaliação não foi encontrado ou já expirou.
              </p>
              <p className="text-np-purple-500 text-sm mb-6">
                Se você acabou de fazer um pedido, aguarde alguns minutos e tente novamente. Ou entre em contato conosco.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="/"
                  className="px-6 py-2.5 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1"
                >
                  <i className="ri-home-line mr-1"></i>
                  Página Inicial
                </a>
                <a
                  href="/cardapio"
                  className="px-6 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1"
                >
                  <i className="ri-restaurant-line mr-1"></i>
                  Ver Cardápio
                </a>
              </div>
            </div>
          )}

          {/* Valid Order - Submitted */}
          {!validating && orderValid === true && submitted && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-8 md:p-10 text-center">
              <div className="w-16 h-16 bg-np-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-check-double-line text-3xl text-np-green-600"></i>
              </div>
              <h2 className="font-display text-2xl text-np-purple-900 mb-2">
                Obrigado pelo Feedback!
              </h2>
              <p className="text-np-purple-600 text-sm mb-6">
                Sua opinião é muito importante para nós. Agradecemos a preferência!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => navigate("/cardapio")}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium bg-np-purple-700 hover:bg-np-purple-800 text-white transition-colors whitespace-nowrap"
                >
                  <i className="ri-restaurant-line mr-1"></i>
                  Ver Cardápio
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 transition-colors whitespace-nowrap"
                >
                  <i className="ri-home-line mr-1"></i>
                  Página Inicial
                </button>
              </div>
            </div>
          )}

          {/* Valid Order - Form */}
          {!validating && orderValid === true && !submitted && (
            <div className="bg-white rounded-xl border border-np-wood-200 p-6 md:p-8">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-np-gold-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="ri-heart-3-line text-2xl text-np-gold-600"></i>
                </div>
                <h2 className="font-display text-xl text-np-purple-900">
                  Como foi sua experiência?
                </h2>
                <p className="text-sm text-np-purple-500 mt-1">
                  Pedido #{orderId?.slice(-8)}
                </p>
              </div>

              {/* Star Rating */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-np-purple-800 mb-3 text-center">
                  Avalie de 1 a 5 estrelas
                </label>
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center transition-transform hover:scale-110"
                    >
                      <i
                        className={`ri-star-fill text-2xl md:text-3xl transition-colors ${
                          star <= (hoverRating || rating)
                            ? "text-np-gold-500"
                            : "text-np-wood-200"
                        }`}
                      ></i>
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-np-purple-600 mt-2 font-medium">
                  {rating === 1 && "Muito insatisfeito"}
                  {rating === 2 && "Insatisfeito"}
                  {rating === 3 && "Neutro"}
                  {rating === 4 && "Satisfeito"}
                  {rating === 5 && "Muito satisfeito"}
                </p>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-np-purple-800 mb-2">
                  Conte-nos mais sobre sua experiência
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="O que você gostou? O que podemos melhorar?"
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-lg border border-np-wood-300 focus:outline-none focus:ring-2 focus:ring-np-purple-500 focus:border-transparent text-sm resize-none"
                />
                <p className="text-xs text-np-purple-400 mt-1 text-right">
                  {comment.length}/500
                </p>
              </div>

              {/* Delivery Rating (only for delivery orders) */}
              {orderInfo?.orderType === "delivery" && (
                <div className="mb-6 p-4 rounded-lg bg-purple-50 border border-purple-200">
                  <p className="text-sm font-medium text-purple-800 mb-3 flex items-center gap-2">
                    <i className="ri-truck-line text-purple-600"></i>
                    Como foi a entrega?
                  </p>
                  <label className="block text-xs text-purple-600 mb-2">
                    Avalie o entregador de 1 a 5 estrelas
                  </label>
                  <div className="flex items-center gap-2 mb-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setDeliveryRating(star)}
                        onMouseEnter={() => setHoverDeliveryRating(star)}
                        onMouseLeave={() => setHoverDeliveryRating(0)}
                        className="w-9 h-9 flex items-center justify-center transition-transform hover:scale-110"
                      >
                        <i
                          className={`ri-star-fill text-xl transition-colors ${
                            star <= (hoverDeliveryRating || deliveryRating)
                              ? "text-purple-500"
                              : "text-purple-200"
                          }`}
                        ></i>
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={deliveryComment}
                    onChange={(e) => setDeliveryComment(e.target.value)}
                    placeholder="Comentário opcional sobre a entrega..."
                    rows={2}
                    maxLength={300}
                    className="w-full px-3 py-2 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-none bg-white"
                  />
                  <p className="text-xs text-purple-400 mt-1 text-right">
                    {deliveryComment.length}/300
                  </p>
                </div>
              )}

              {/* Would Recommend */}
              <div className="mb-6">
                <button
                  onClick={() => setWouldRecommend(!wouldRecommend)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                    wouldRecommend
                      ? "bg-np-green-50 border-np-green-300"
                      : "bg-np-wood-50 border-np-wood-300"
                  }`}
                >
                  <span className="text-sm font-medium text-np-purple-800">
                    Você recomendaria a NP Empório?
                  </span>
                  <div
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      wouldRecommend ? "bg-np-green-600" : "bg-np-wood-300"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        wouldRecommend ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </div>
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-red-700 flex items-center gap-2">
                    <i className="ri-error-warning-line text-red-500"></i>
                    {error}
                  </p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-np-purple-700 hover:bg-np-purple-800 disabled:bg-np-wood-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Enviando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-send-plane-line"></i>
                    Enviar Feedback
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}