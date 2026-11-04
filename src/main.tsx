import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './app/globals.css';
import { initClientApiBridge } from './lib/client-api-bridge';

// Aktifkan Firebase Client API Interceptor
initClientApiBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

