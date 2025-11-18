/**
 * Axios Configuration for Cloudflare Bypass using Scrape.do
 *
 * This module patches axios at the MODULE level to ensure ALL axios instances
 * (including those created by @polymarket/clob-client) route through scrape.do
 *
 * Scrape.do API: https://scrape.do/
 * - Routes requests through their proxy network
 * - Handles Cloudflare challenges automatically
 * - Token is hardcoded for simplicity
 *
 * IMPORTANT: This must be imported BEFORE any CLOB client code loads!
 */

// Scrape.do configuration
const SCRAPE_DO_TOKEN = 'bc113e34f8584ac0936675f5df2ad52ea7b101f0ce7';
const SCRAPE_DO_API = 'https://api.scrape.do/';

// Track if configuration has been applied
let configured = false;

// Track which URLs should be proxied through scrape.do
const PROXY_DOMAINS = [
  'clob.polymarket.com',
  'polymarket.com'
];

/**
 * Check if a URL should be proxied through scrape.do
 */
function shouldProxy(url: string): boolean {
  if (!url) return false;

  try {
    // Handle both full URLs and relative paths
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      return PROXY_DOMAINS.some(domain => urlObj.hostname.includes(domain));
    } else {
      // Relative URL - check if it's for a proxied domain
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Transform URL to go through scrape.do
 */
function transformUrl(url: string, baseURL?: string): string {
  // Build full URL
  let fullUrl = url;
  if (baseURL && !url.startsWith('http')) {
    fullUrl = baseURL.endsWith('/') && url.startsWith('/')
      ? baseURL + url.substring(1)
      : baseURL + url;
  }

  // Encode and route through scrape.do
  const encodedUrl = encodeURIComponent(fullUrl);
  return `${SCRAPE_DO_API}?token=${SCRAPE_DO_TOKEN}&url=${encodedUrl}`;
}

/**
 * Patch axios at the module level to intercept ALL instances
 * This works by patching the axios package's request adapter
 */
export function configureAxiosForCloudflare(): void {
  if (configured) {
    console.log('[AxiosConfig] Already configured, skipping...');
    return;
  }

  try {
    console.log('[AxiosConfig] ===============================================');
    console.log('[AxiosConfig] Patching axios module for scrape.do proxy...');
    console.log('[AxiosConfig] Token:', SCRAPE_DO_TOKEN.substring(0, 15) + '...');
    console.log('[AxiosConfig] Domains:', PROXY_DOMAINS.join(', '));

    // Import axios module
    const axios = require('axios');

    // Store original adapter
    const originalAdapter = axios.defaults.adapter;

    // Create custom adapter that wraps the original
    axios.defaults.adapter = async function scrapedoAdapter(config: any) {
      const originalUrl = config.url;
      const originalBaseURL = config.baseURL;

      // Build full URL for checking
      let fullUrl = originalUrl || '';
      if (originalBaseURL && !fullUrl.startsWith('http')) {
        fullUrl = originalBaseURL.endsWith('/') && fullUrl.startsWith('/')
          ? originalBaseURL + fullUrl.substring(1)
          : originalBaseURL + fullUrl;
      } else if (!fullUrl.startsWith('http')) {
        fullUrl = originalUrl;
      }

      // Check if we should proxy this request
      if (shouldProxy(fullUrl) && !originalUrl?.includes('api.scrape.do')) {
        console.log('[AxiosConfig] 🔄 Proxying:', fullUrl);

        // Transform the URL to go through scrape.do
        config.url = transformUrl(originalUrl, originalBaseURL);

        // Remove baseURL since we now have full URL
        delete config.baseURL;

        console.log('[AxiosConfig] ➡️  Via:', config.url.substring(0, 80) + '...');
      }

      // Call original adapter
      return originalAdapter(config);
    };

    configured = true;
    console.log('[AxiosConfig] ✅ Axios module patched successfully!');
    console.log('[AxiosConfig] ===============================================');
  } catch (error) {
    console.error('[AxiosConfig] ❌ Failed to patch axios:', error);
    throw error;
  }
}

/**
 * Check if proxy is configured
 */
export function isProxyConfigured(): boolean {
  return configured;
}

/**
 * Get proxy configuration info (for debugging)
 */
export function getProxyInfo(): { service: string; token: string; domains: string[] } {
  return {
    service: 'scrape.do',
    token: SCRAPE_DO_TOKEN.substring(0, 10) + '...',
    domains: PROXY_DOMAINS,
  };
}
