import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createStore } from './store.js';
import { fetchRecipe } from './api.js';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App store={createStore(localStorage)} fetchRecipe={fetchRecipe} />
  </StrictMode>,
);
