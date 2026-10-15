import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createApi } from './api.js';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App api={createApi()} />
  </StrictMode>,
);
