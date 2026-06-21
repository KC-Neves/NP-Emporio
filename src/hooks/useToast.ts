// Global toast helper — re-export for convenience
export { useGlobalToast } from "@/contexts/ToastContext";
export type { Toast, ToastAction } from "@/contexts/ToastContext";

// Helper to generate deterministic toast IDs
export function toastId(prefix: string, suffix: string | number): string {
  return `${prefix}-${suffix}`;
}