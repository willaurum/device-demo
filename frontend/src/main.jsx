// main.jsx -- the entry point. Mounts the <App> into the #root div in
// index.html. Standard Vite + React boilerplate; the interesting code is App.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
