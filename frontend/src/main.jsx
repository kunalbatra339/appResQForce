// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import './styling/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode> // <-- Comment this out temporarily
    <App />
  // </React.StrictMode>, // <-- Comment this out temporarily
);