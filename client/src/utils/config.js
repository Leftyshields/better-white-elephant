/**
 * Centralized configuration for API and Socket URLs
 * Automatically detects production environment and uses correct backend URL
 */

function getServerUrl() {
  // If explicitly set via environment variable, use it (highest priority)
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  // Detect if we're in production
  const isProduction = 
    typeof window !== 'undefined' && 
    (window.location.hostname === 'stealorreveal.com' || 
     window.location.hostname === 'www.stealorreveal.com' ||
     window.location.hostname === 'better-white-elephant.web.app');

  if (isProduction) {
    // Production backend URL
    // Default: assume backend is on same domain (common for Firebase Hosting + serverless)
    // If backend is on a different domain/subdomain, set VITE_SERVER_URL at build time
    const protocol = window.location.protocol;
    const hostname = window.location.hostname.replace('www.', '');
    
    // Try common patterns in order:
    // 1. Same domain (for proxied backends or serverless functions)
    // 2. API subdomain (for dedicated backend servers)
    
    // For now, use same domain - if backend is proxied through Firebase Hosting
    // or if it's a serverless function on the same project, this will work
    // If backend is on api.stealorreveal.com or another domain, set VITE_SERVER_URL
    console.warn('[Config] Production detected but VITE_SERVER_URL not set. Using same domain. If backend is elsewhere, set VITE_SERVER_URL at build time.');
    return `${protocol}//${hostname}`;
  }

  // Development default
  return 'http://localhost:3001';
}

export const SERVER_URL = getServerUrl();
