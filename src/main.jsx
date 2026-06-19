import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/figtree';
import '@fontsource-variable/jetbrains-mono';
import App from './App.jsx';
import { LocaleProvider } from './i18n/provider.jsx';
import './styles/main.scss';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>
);
