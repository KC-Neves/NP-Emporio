import { useCallback, useRef, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface TrackingState {
  active: boolean;
  orderId: string | null;
  error: string | null;
  lastUpdate: Date | null;
}

const TRACKING_INTERVAL_MS = 5000; // Save every 5 seconds

export function useDeliveryTracking() {
  const [tracking, setTracking] = useState<TrackingState>({
    active: false,
    orderId: null,
    error: null,
    lastUpdate: null,
  });
  const watchIdRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const lastSaveRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveCoordinates = useCallback(async (orderId: string, lat: number, lng: number) => {
    const now = Date.now();
    // Throttle: no more than 1 update every 5 seconds
    if (now - lastSaveRef.current < TRACKING_INTERVAL_MS) return;
    lastSaveRef.current = now;

    // Save to orders table (for quick access)
    const { error: orderError } = await supabase
      .from("orders")
      .update({
        delivery_latitude: lat,
        delivery_longitude: lng,
      })
      .eq("id", orderId);

    if (orderError) {
      console.error("[TRACKING] Failed to save coordinates to orders:", orderError);
    }

    // Save to delivery_tracking table (for history / route visualization)
    const { error: trackError } = await supabase
      .from("delivery_tracking")
      .insert({
        order_id: orderId,
        latitude: lat,
        longitude: lng,
        tracked_at: new Date().toISOString(),
      });

    if (trackError) {
      console.error("[TRACKING] Failed to save to delivery_tracking:", trackError);
    } else {
      setTracking((prev) => ({
        ...prev,
        error: null,
        lastUpdate: new Date(),
      }));
    }
  }, []);

  const getPositionError = (code: number): string => {
    switch (code) {
      case 1:
        return "Permissão de localização negada. Vá nas configurações do navegador/celular e ative a localização para este site.";
      case 2:
        return "Localização indisponível. Verifique se o GPS do seu celular está ligado e tente novamente.";
      case 3:
        return "Tempo esgotado. Tente novamente em uma área com melhor sinal de GPS ou Wi-Fi.";
      default:
        return "Erro desconhecido ao obter localização. Tente recarregar a página.";
    }
  };

  const startTracking = useCallback((orderId: string) => {
    if (watchIdRef.current !== null) {
      console.log("[TRACKING] Already tracking, stopping first");
      stopTracking();
    }

    if (!navigator.geolocation) {
      setTracking({
        active: false,
        orderId: null,
        error: "Seu dispositivo/navegador não suporta geolocalização. Use um celular com GPS.",
        lastUpdate: null,
      });
      return;
    }

    isActiveRef.current = true;
    lastSaveRef.current = 0;
    setTracking({
      active: true,
      orderId,
      error: null,
      lastUpdate: null,
    });

    // Get initial position with longer timeout
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isActiveRef.current) return;
        const { latitude, longitude } = position.coords;
        console.log("[TRACKING] Initial position obtained:", latitude, longitude);
        saveCoordinates(orderId, latitude, longitude);
        setTracking((prev) => ({ ...prev, error: null }));
      },
      (err) => {
        console.error("[TRACKING] Initial position error:", err.code, err.message);
        const errorMsg = getPositionError(err.code);
        setTracking((prev) => ({
          ...prev,
          error: errorMsg,
        }));
        // Don't stop tracking - watchPosition might still work
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    // Watch for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isActiveRef.current) return;
        const { latitude, longitude } = position.coords;
        saveCoordinates(orderId, latitude, longitude);
        // Clear error once we get a position
        setTracking((prev) => {
          if (prev.error) return { ...prev, error: null };
          return prev;
        });
      },
      (err) => {
        console.error("[TRACKING] Watch position error:", err.code, err.message);
        if (!isActiveRef.current) return;
        const errorMsg = getPositionError(err.code);
        setTracking((prev) => ({
          ...prev,
          error: errorMsg,
        }));
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );

    // Fallback interval: try getCurrentPosition every 10s in case watchPosition is silent
    intervalRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isActiveRef.current) return;
          const { latitude, longitude } = position.coords;
          saveCoordinates(orderId, latitude, longitude);
        },
        () => {
          // Silent fail for interval fallback
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    }, 10000);

    console.log("[TRACKING] Started tracking for order:", orderId);
  }, [saveCoordinates]);

  const stopTracking = useCallback(() => {
    isActiveRef.current = false;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking({
      active: false,
      orderId: null,
      error: null,
      lastUpdate: null,
    });
    console.log("[TRACKING] Stopped tracking");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isActiveRef.current = false;
    };
  }, []);

  return {
    tracking,
    startTracking,
    stopTracking,
  };
}