/**
 * Returns the correct base URL for the app, including the preview path.
 * In Readdy preview: https://readdy.cc/preview/PROJECT_ID/VERSION_ID/
 * In production: https://example.com/
 */
export function getBaseUrl(): string {
  // __BASE_PATH__ is injected by Vite at build time
  const basePath = (typeof __BASE_PATH__ !== "undefined" ? __BASE_PATH__ : "/");
  // Remove trailing slash for clean concatenation
  const cleanBase = basePath.replace(/\/$/, "");
  const origin = window.location.origin;
  const url = cleanBase ? `${origin}${cleanBase}` : origin;
  console.log("[BASE URL] getBaseUrl:", { basePath, cleanBase, origin, url });
  return url;
}

/**
 * Returns the full feedback URL for a given order ID.
 * This ensures the correct base path (including preview path) is used.
 */
export function getFeedbackUrl(orderId: string): string {
  const url = `${getBaseUrl()}/feedback/${orderId}`;
  console.log("[BASE URL] getFeedbackUrl:", url);
  return url;
}

/**
 * Returns the full tracking URL for a given tracking code.
 */
export function getTrackingUrl(code: string): string {
  const url = `${getBaseUrl()}/acompanhar-pedido/${code}`;
  console.log("[BASE URL] getTrackingUrl:", url);
  return url;
}