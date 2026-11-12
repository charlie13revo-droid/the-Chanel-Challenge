import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { Home } from './pages/Home.tsx';
import { Play } from './pages/Play.tsx';
import { HostPage } from './pages/Host.tsx';
import { Screen } from './pages/Screen.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:code" element={<Home />} />
        <Route path="/play" element={<Play />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/screen/:code" element={<Screen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
