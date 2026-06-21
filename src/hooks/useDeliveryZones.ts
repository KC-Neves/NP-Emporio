import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface DeliveryZone {
  id: number;
  neighborhood: string;
  zone_label: string;
  fee: number;
  min_order: number;
  avg_time: string;
  active: boolean;
  created_at: string;
}

export interface ZoneFormData {
  neighborhood: string;
  zone_label: string;
  fee: number;
  min_order?: number;
  avg_time?: string;
  active?: boolean;
}

export function useDeliveryZones() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supaError } = await supabase
        .from("delivery_zones")
        .select("id, neighborhood, zone_label, fee, min_order, avg_time, active, created_at")
        .order("active", { ascending: false })
        .order("zone_label", { ascending: true })
        .order("neighborhood", { ascending: true });

      if (supaError) {
        throw supaError;
      }
      setZones(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar taxas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const createZone = useCallback(async (form: ZoneFormData) => {
    const { data, error: supaError } = await supabase
      .from("delivery_zones")
      .insert({
        neighborhood: form.neighborhood.trim(),
        zone_label: form.zone_label.trim(),
        fee: form.fee,
        min_order: form.min_order ?? 0,
        avg_time: form.avg_time?.trim() || "30–50 min",
        active: form.active ?? true,
      })
      .select()
      .single();

    if (supaError) {
      return { data: null, error: new Error(supaError.message) };
    }
    setZones((prev) => [...prev, data]);
    return { data, error: null };
  }, []);

  const updateZone = useCallback(async (id: number, form: Partial<ZoneFormData>) => {
    const payload: Record<string, unknown> = {};
    if (form.neighborhood !== undefined) payload.neighborhood = form.neighborhood.trim();
    if (form.zone_label !== undefined) payload.zone_label = form.zone_label.trim();
    if (form.fee !== undefined) payload.fee = form.fee;
    if (form.min_order !== undefined) payload.min_order = form.min_order;
    if (form.avg_time !== undefined) payload.avg_time = form.avg_time?.trim();
    if (form.active !== undefined) payload.active = form.active;

    const { data, error: supaError } = await supabase
      .from("delivery_zones")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (supaError) {
      return { data: null, error: new Error(supaError.message) };
    }
    setZones((prev) => prev.map((z) => (z.id === id ? data : z)));
    return { data, error: null };
  }, []);

  const deleteZone = useCallback(async (id: number) => {
    const { error: supaError } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id);

    if (supaError) {
      return { error: new Error(supaError.message) };
    }
    setZones((prev) => prev.filter((z) => z.id !== id));
    return { error: null };
  }, []);

  const getFeeByNeighborhood = useCallback(
    (neighborhood: string): number => {
      const trimmed = neighborhood.trim().toLowerCase();
      const match = zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
      return match ? Number(match.fee) : 0;
    },
    [zones]
  );

  const getZoneByNeighborhood = useCallback(
    (neighborhood: string): DeliveryZone | undefined => {
      const trimmed = neighborhood.trim().toLowerCase();
      return zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
    },
    [zones]
  );

  const getZoneLabel = useCallback(
    (neighborhood: string): string | null => {
      const trimmed = neighborhood.trim().toLowerCase();
      const match = zones.find(
        (z) => z.active && z.neighborhood.toLowerCase() === trimmed
      );
      return match ? match.zone_label : null;
    },
    [zones]
  );

  const activeZones = useMemo(() => zones.filter((z) => z.active), [zones]);

  const zonesByLabel = useMemo(() => {
    const map = new Map<string, DeliveryZone[]>();
    for (const z of activeZones) {
      if (!map.has(z.zone_label)) {
        map.set(z.zone_label, []);
      }
      map.get(z.zone_label)!.push(z);
    }
    return map;
  }, [activeZones]);

  return {
    zones,
    activeZones,
    zonesByLabel,
    loading,
    error,
    refresh: fetchZones,
    createZone,
    updateZone,
    deleteZone,
    getFeeByNeighborhood,
    getZoneByNeighborhood,
    getZoneLabel,
  };
}