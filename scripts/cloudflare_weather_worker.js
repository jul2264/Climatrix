/**
 * Cloudflare Worker: Open-Meteo Edge Proxy
 * 
 * Purpose:
 * Bypasses cloud datacenter IP blocks (HTTP 429 Too Many Requests) from Render/AWS
 * by proxying Open-Meteo API requests through Cloudflare's global edge network.
 * 
 * Free Tier Quota: 100,000 requests/day on Cloudflare's free plan.
 * 
 * How to deploy:
 * 1. Log in to dash.cloudflare.com -> "Workers & Pages" -> "Create application"
 * 2. Name it (e.g. `climatrix-weather-proxy`) -> click "Deploy"
 * 3. Click "Edit code", paste this file, and click "Deploy"
 * 4. Copy the Worker URL (e.g. `https://climatrix-weather-proxy.<subdomain>.workers.dev`)
 * 5. Add to Render Environment Variables:
 *    OPEN_METEO_BASE_URL=https://climatrix-weather-proxy.<subdomain>.workers.dev/v1/forecast
 */

export default {
  async fetch(request, env, ctx) {
    // Only accept GET and OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, "https://api.open-meteo.com");

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set("User-Agent", "ClimatrixWeatherProxy/1.0 (truck-safety)");
    proxyHeaders.delete("host");

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: proxyHeaders,
      });

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin": "*");
      responseHeaders.set("Cache-Control", "public, max-age=1800"); // Cache 30 mins

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Upstream Open-Meteo proxy error", details: String(err) }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
