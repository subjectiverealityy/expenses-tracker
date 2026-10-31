import React from 'react';
import { createRoot } from 'react-dom/client';
import { installStorage } from './storage.js';
import './index.css';

installStorage();

// Import after the storage shim is installed.
import('./LedgerLog.jsx').then(({ default: LedgerLog }) => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <LedgerLog />
    </React.StrictMode>
  );
});
