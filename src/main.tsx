import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
if (window.saa) document.documentElement.classList.add('desktop');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
