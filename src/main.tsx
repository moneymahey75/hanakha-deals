import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Restore last route for MetaMask DApp browser which resets URL to '/' on reload
const SESSION_ROUTE_KEY = 'app_last_route';
const savedRoute = sessionStorage.getItem(SESSION_ROUTE_KEY);
if (savedRoute && savedRoute !== '/' && window.location.pathname === '/') {
  window.history.replaceState(null, '', savedRoute);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
