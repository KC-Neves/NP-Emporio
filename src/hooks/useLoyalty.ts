import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type LoyaltyTier = "bronze" | "prata" | "ouro" | "platina";

export interface LoyaltyHistoryItem {
  id: string;
  points: number;
  reason: string;
  orderId?: string;
  createdAt: string;
}

export interface LoyaltyData {
  points: number;
  tier: LoyaltyTier;
}

const TIERS: { name: LoyaltyTier; min: number }[] = [
  { name: "bronze", min: 0 },
  { name: "prata", min: 300 },
  { name: "ouro", min: 800 },
  { name: "platina", min: 1500 },
];

function getTier(points: number): LoyaltyTier {
  const tier = TIERS.slice()
    .reverse()
    .find((t) => points >= t.min);
  return tier?.name || "bronze";
}

export function useLoyalty(userId?: string | null) {
  const [loyalty, setLoyalty] = useState<LoyaltyData>({
    points: 0,
    tier: "bronze",
  });
  const [history, setHistory] = useState<LoyaltyHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch loyalty data from Supabase
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchData = async () => {
      try {
        const { data: loyaltyData, error: loyaltyError } = await supabase
          .from("loyalty_points")
          .select("points, tier")
          .eq("user_id", userId)
          .maybeSingle();

        if (loyaltyError) {
          console.error("[useLoyalty] Erro ao buscar loyalty_points:", loyaltyError);
        }

        if (mounted && loyaltyData) {
          setLoyalty({
            points: loyaltyData.points,
            tier: loyaltyData.tier as LoyaltyTier,
          });
        }

        const { data: historyData, error: historyError } = await supabase
          .from("loyalty_history")
          .select("id, points, reason, order_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (historyError) {
          console.error("[useLoyalty] Erro ao buscar loyalty_history:", historyError);
        }

        if (mounted && historyData) {
          setHistory(
            historyData.map((h: Record<string, unknown>) => ({
              id: h.id as string,
              points: h.points as number,
              reason: h.reason as string,
              orderId: (h.order_id as string) || undefined,
              createdAt: h.created_at as string,
            }))
          );
        }
      } catch (err) {
        console.error("[useLoyalty] Exceção em fetchData:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Realtime subscription for loyalty updates
  useEffect(() => {
    if (!userId) return;

    const loyaltyChannel = supabase
      .channel(`loyalty-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "loyalty_points",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setLoyalty({
            points: updated.points as number,
            tier: updated.tier as LoyaltyTier,
          });
        }
      )
      .subscribe();

    const historyChannel = supabase
      .channel(`loyalty-history-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "loyalty_history",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const h = payload.new as Record<string, unknown>;
          setHistory((prev) => {
            if (prev.some((item) => item.id === (h.id as string))) return prev;
            return [
              {
                id: h.id as string,
                points: h.points as number,
                reason: h.reason as string,
                orderId: (h.order_id as string) || undefined,
                createdAt: h.created_at as string,
              },
              ...prev,
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(loyaltyChannel);
      supabase.removeChannel(historyChannel);
    };
  }, [userId]);

  const ensureLoyaltyRecord = useCallback(async () => {
    if (!userId) return;
    const { data: existing } = await supabase
      .from("loyalty_points")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing) {
      await supabase.from("loyalty_points").insert({
        id: crypto.randomUUID(),
        user_id: userId,
        points: 0,
        tier: "bronze",
        updated_at: new Date().toISOString(),
      });
    }
  }, [userId]);

  const addPoints = useCallback(
    async (points: number, reason: string, orderId?: string) => {
      if (!userId) return;

      await ensureLoyaltyRecord();

      // Fetch current points from DB to avoid stale closure
      const { data: current } = await supabase
        .from("loyalty_points")
        .select("points")
        .eq("user_id", userId)
        .maybeSingle();

      const currentPoints = current?.points ?? 0;
      const newPoints = currentPoints + points;
      const newTier = getTier(newPoints);

      setLoyalty({ points: newPoints, tier: newTier });

      await supabase
        .from("loyalty_points")
        .update({ points: newPoints, tier: newTier, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      const historyId = crypto.randomUUID();
      const historyEntry: LoyaltyHistoryItem = {
        id: historyId,
        points,
        reason,
        orderId,
        createdAt: new Date().toISOString(),
      };

      setHistory((prev) => [historyEntry, ...prev]);

      await supabase.from("loyalty_history").insert({
        id: historyId,
        user_id: userId,
        points,
        reason,
        order_id: orderId || null,
      });
    },
    [userId, ensureLoyaltyRecord]
  );

  const redeemPoints = useCallback(
    async (points: number, reason: string) => {
      if (!userId || loyalty.points < points) return;

      const newPoints = loyalty.points - points;
      const newTier = getTier(newPoints);

      setLoyalty({ points: newPoints, tier: newTier });

      await supabase
        .from("loyalty_points")
        .update({ points: newPoints, tier: newTier, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      const historyId = crypto.randomUUID();
      const historyEntry: LoyaltyHistoryItem = {
        id: historyId,
        points: -points,
        reason,
        createdAt: new Date().toISOString(),
      };

      setHistory((prev) => [historyEntry, ...prev]);

      await supabase.from("loyalty_history").insert({
        id: historyId,
        user_id: userId,
        points: -points,
        reason,
      });
    },
    [userId, loyalty.points]
  );

  const initializeWelcome = useCallback(async () => {
    if (!userId) return;

    // Check if user already has loyalty record with points
    const { data: existing } = await supabase
      .from("loyalty_points")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing || existing.points === 0) {
      await ensureLoyaltyRecord();
      await addPoints(50, "Bônus de boas-vindas ao NP Lovers");
    }
  }, [userId, addPoints, ensureLoyaltyRecord]);

  return { loyalty, history, loading, addPoints, redeemPoints, initializeWelcome };
}