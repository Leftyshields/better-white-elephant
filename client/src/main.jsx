/**
 * Entry Point
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

// Global error handlers to catch crashes
window.addEventListener('error', (event) => {
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.jsx:global:error',message:'Global error caught',data:{message:event.message,filename:event.filename,lineno:event.lineno,colno:event.colno,error:event.error?.message,stack:event.error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  console.error('❌ Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  // #region agent log
  fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.jsx:global:unhandledrejection',message:'Unhandled promise rejection',data:{reason:event.reason?.message || String(event.reason),stack:event.reason?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  console.error('❌ Unhandled promise rejection:', event.reason);
});

// Create TanStack Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Never consider data stale by default (we use socket updates)
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      retry: 2,
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnReconnect: true, // Refetch when reconnecting
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </QueryClientProvider>
  </React.StrictMode>
);


