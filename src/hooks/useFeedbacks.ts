import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface Feedback {
  id: string;
  orderId: string | null;
  customerName: string;
  rating: number;
  comment: string | null;
  wouldRecommend: boolean;
  deliveryRating: number | null;
  deliveryComment: string | null;
  createdAt: string;
}

interface DbFeedback {
  id: string;
  order_id: string | null;
  customer_name: string;
  rating: number;
  comment: string | null;
  would_recommend: boolean | null;
  delivery_rating: number | null;
  delivery_comment: string | null;
  created_at: string;
}

function mapDbToFeedback(row: DbFeedback): Feedback {
  return {
    id: row.id,
    orderId: row.order_id,
    customerName: row.customer_name,
    rating: row.rating,
    comment: row.comment,
    wouldRecommend: row.would_recommend ?? false,
    deliveryRating: row.delivery_rating ?? null,
    deliveryComment: row.delivery_comment ?? null,
    createdAt: row.created_at,
  };
}

export interface RatingOverTimePoint {
  date: string;
  label: string;
  avg: number;
  count: number;
}

export function useFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFeedbackIds, setNewFeedbackIds] = useState<Set<string>>(new Set());

  const fetchFeedbacks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[useFeedbacks] Erro ao buscar feedbacks:", error);
      }

      if (data && !error) {
        const mapped = (data as DbFeedback[]).map(mapDbToFeedback);
        setFeedbacks(mapped);
      }
    } catch (err) {
      console.error("[useFeedbacks] Exceção:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("feedbacks-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedbacks" },
        (payload) => {
          const newFeedback = mapDbToFeedback(payload.new as DbFeedback);
          setFeedbacks((prev) => {
            if (prev.some((f) => f.id === newFeedback.id)) return prev;
            return [newFeedback, ...prev];
          });
          setNewFeedbackIds((prev) => new Set(prev).add(newFeedback.id));
          // Auto-remove from "new" after 30 seconds
          setTimeout(() => {
            setNewFeedbackIds((prev) => {
              const next = new Set(prev);
              next.delete(newFeedback.id);
              return next;
            });
          }, 30000);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feedbacks" },
        (payload) => {
          const updated = mapDbToFeedback(payload.new as DbFeedback);
          setFeedbacks((prev) =>
            prev.map((f) => (f.id === updated.id ? updated : f))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getAverageRating = useCallback(() => {
    if (feedbacks.length === 0) return 0;
    return feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
  }, [feedbacks]);

  const getRecommendRate = useCallback(() => {
    if (feedbacks.length === 0) return 0;
    const recommendCount = feedbacks.filter((f) => f.wouldRecommend).length;
    return (recommendCount / feedbacks.length) * 100;
  }, [feedbacks]);

  const getRatingDistribution = useCallback(() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedbacks.forEach((f) => {
      if (f.rating >= 1 && f.rating <= 5) {
        dist[f.rating] = (dist[f.rating] || 0) + 1;
      }
    });
    return dist;
  }, [feedbacks]);

  const getRatingOverTime = useCallback((): RatingOverTimePoint[] => {
    if (feedbacks.length === 0) return [];

    const groups: Record<string, { sum: number; count: number }> = {};
    const sorted = [...feedbacks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sorted.forEach((f) => {
      const d = new Date(f.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!groups[key]) groups[key] = { sum: 0, count: 0 };
      groups[key].sum += f.rating;
      groups[key].count += 1;
    });

    const result = Object.keys(groups)
      .sort()
      .map((key) => {
        const g = groups[key];
        return {
          date: key,
          label: new Date(key + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          avg: Math.round((g.sum / g.count) * 10) / 10,
          count: g.count,
        };
      });

    // If more than 14 days, aggregate by week
    if (result.length > 14) {
      const weekGroups: Record<string, { sum: number; count: number; label: string }> = {};
      result.forEach((r) => {
        const d = new Date(r.date + "T00:00:00");
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);
        const weekLabel = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        if (!weekGroups[weekKey]) weekGroups[weekKey] = { sum: 0, count: 0, label: weekLabel };
        weekGroups[weekKey].sum += r.avg * r.count;
        weekGroups[weekKey].count += r.count;
      });
      return Object.keys(weekGroups)
        .sort()
        .map((k) => ({
          date: k,
          label: weekGroups[k].label,
          avg: Math.round((weekGroups[k].sum / weekGroups[k].count) * 10) / 10,
          count: weekGroups[k].count,
        }));
    }

    return result;
  }, [feedbacks]);

  return {
    feedbacks,
    loading,
    newFeedbackIds,
    fetchFeedbacks,
    getAverageRating,
    getRecommendRate,
    getRatingDistribution,
    getRatingOverTime,
  };
}