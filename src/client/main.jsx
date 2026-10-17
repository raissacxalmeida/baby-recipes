import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createApi } from './api.js';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App api={createApi()} />
  </StrictMode>,
);
