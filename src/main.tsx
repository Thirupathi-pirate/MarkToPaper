import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress Vite HMR WebSocket errors in the browser console/overlay
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || '';
    if (
      msg.includes('WebSocket') || 
      msg.includes('failed to connect to websocket') ||
      msg.includes('WebSocket closed without opened')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  // Also catch window.onerror for standard errors
  const originalError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    const msg = String(message).toLowerCase();
    if (msg.includes('websocket') || msg.includes('vite')) {
      return true; // suppress
    }
    if (originalError) {
      return originalError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
