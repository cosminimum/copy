/**
 * Axios Configuration for Cloudflare Bypass using Scrape.do
 *
 * Configures axios to route requests through scrape.do API to bypass
 * Cloudflare blocking when running on cloud infrastructure (Railway, etc.)
 *
 * Scrape.do API: https://scrape.do/
 * - Routes requests through their proxy network
 * - Handles Cloudflare challenges automatically
 * - Token is hardcoded for simplicity
 */

import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

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
  try {
    const urlObj = new URL(url);
    return PROXY_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Configure axios to use scrape.do for Cloudflare bypass
 * Call this before creating any CLOB clients
 */
export function configureAxiosForCloudflare(): void {
  if (configured) {
    return; // Already configured
  }

  console.log('[AxiosConfig] Configuring scrape.do proxy for Cloudflare bypass...');

  // Request interceptor: Route requests through scrape.do
  axios.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Skip if this is already a scrape.do request
      if (config.url?.includes('api.scrape.do')) {
        return config;
      }

      // Check if this URL should be proxied
      const originalUrl = config.url || '';
      if (!shouldProxy(originalUrl)) {
        return config;
      }

      // Build the full URL with base URL if needed
      let fullUrl = originalUrl;
      if (config.baseURL && !originalUrl.startsWith('http')) {
        fullUrl = `${config.baseURL}${originalUrl}`;
      }

      // Store original URL for logging
      const originalFullUrl = fullUrl;

      // Encode the target URL
      const encodedUrl = encodeURIComponent(fullUrl);

      // Rewrite request to go through scrape.do
      config.url = `${SCRAPE_DO_API}?token=${SCRAPE_DO_TOKEN}&url=${encodedUrl}`;

      // Remove baseURL since we're using the full URL now
      delete config.baseURL;

      // Preserve the original HTTP method
      // scrape.do will forward it to the target

      console.log(`[AxiosConfig] Proxying request: ${originalFullUrl}`);

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor: Handle errors and retries
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;

      // Don't retry if we've already retried
      if (config.__retryCount >= 2) {
        console.error('[AxiosConfig] Max retries reached, giving up');
        return Promise.reject(error);
      }

      config.__retryCount = config.__retryCount || 0;

      // Retry on network errors, 5xx errors, or 403 (Cloudflare block)
      const shouldRetry =
        !error.response ||
        error.response.status === 403 ||
        (error.response.status >= 500 && error.response.status < 600) ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';

      if (shouldRetry) {
        config.__retryCount += 1;

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, config.__retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));

        console.log(`[AxiosConfig] Retrying request (attempt ${config.__retryCount}/2)...`);
        return axios(config);
      }

      return Promise.reject(error);
    }
  );

  // Set reasonable timeout
  axios.defaults.timeout = 30000; // 30 seconds

  configured = true;
  console.log('[AxiosConfig] ✅ Axios configured with scrape.do proxy');
  console.log('[AxiosConfig] Token:', SCRAPE_DO_TOKEN.substring(0, 10) + '...');
  console.log('[AxiosConfig] Proxying domains:', PROXY_DOMAINS.join(', '));
}

/**
 * Check if proxy is configured
 */
export function isProxyConfigured(): boolean {
  return true; // Always true since scrape.do token is hardcoded
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
