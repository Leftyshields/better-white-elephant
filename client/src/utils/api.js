/**
 * API Client Utilities
 */
import { auth } from './firebase.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Make authenticated API request
 */
export async function apiRequest(endpoint, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  
  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

/**
 * Scrape gift URL
 */
export async function scrapeGiftUrl(url) {
  return apiRequest('/api/game/scrape', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}


