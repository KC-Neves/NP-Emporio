import { useState, useEffect, useRef, useCallback } from "react";
import type { User } from "@/hooks/useAuth";

const LS_NAME_KEY = "np_customer_name";
const LS_PHONE_KEY = "np_customer_phone";

/**
 * Hook compartilhado para preenchimento automático de nome e telefone do cliente.
 *
 * Prioridade de preenchimento:
 * 1. Dados do perfil (se logado)
 * 2. Dados salvos no localStorage da última compra
 *
 * Só preenche automaticamente se o cliente ainda não tiver editado manualmente.
 */
export function useCustomerInfo(user: User | null) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const userEditedRef = useRef(false);
  const profileAppliedRef = useRef(false);
  const localStorageAppliedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  // Inicializa com dados do perfil OU localStorage
  useEffect(() => {
    const currentUserId = user?.id || null;
    const userChanged = currentUserId !== prevUserIdRef.current;
    prevUserIdRef.current = currentUserId;

    // Se o usuário mudou (login/logout/troca), reseta os flags
    if (userChanged) {
      profileAppliedRef.current = false;
      localStorageAppliedRef.current = false;
    }

    if (user && !profileAppliedRef.current) {
      // Logado: preenche com dados do perfil (respeita edição manual)
      profileAppliedRef.current = true;
      localStorageAppliedRef.current = true; // evita fallback desnecessário ao localStorage
      setCustomerName((prev) => {
        if (userEditedRef.current) return prev;
        return user.full_name || prev;
      });
      setCustomerPhone((prev) => {
        if (userEditedRef.current) return prev;
        return user.phone || prev;
      });
      return;
    }

    if (!user && !localStorageAppliedRef.current) {
      // Não logado: busca do localStorage
      localStorageAppliedRef.current = true;
      try {
        const savedName = localStorage.getItem(LS_NAME_KEY);
        const savedPhone = localStorage.getItem(LS_PHONE_KEY);
        setCustomerName((prev) => {
          if (userEditedRef.current) return prev;
          return savedName || prev;
        });
        setCustomerPhone((prev) => {
          if (userEditedRef.current) return prev;
          return savedPhone || prev;
        });
      } catch {
        // localStorage indisponível
      }
    }
  }, [user]);

  // Wraps para detectar edição manual
  const handleSetName = useCallback((value: string) => {
    userEditedRef.current = true;
    setCustomerName(value);
  }, []);

  const handleSetPhone = useCallback((value: string) => {
    userEditedRef.current = true;
    setCustomerPhone(value);
  }, []);

  // Salva no localStorage (chamar ao confirmar pedido/reserva)
  const saveToLocalStorage = useCallback(
    (name?: string, phone?: string) => {
      try {
        const n = (name ?? customerName).trim();
        const p = (phone ?? customerPhone).trim();
        if (n) localStorage.setItem(LS_NAME_KEY, n);
        if (p) localStorage.setItem(LS_PHONE_KEY, p);
      } catch {
        // localStorage indisponível
      }
    },
    [customerName, customerPhone],
  );

  return {
    customerName,
    customerPhone,
    setCustomerName: handleSetName,
    setCustomerPhone: handleSetPhone,
    saveToLocalStorage,
  };
}