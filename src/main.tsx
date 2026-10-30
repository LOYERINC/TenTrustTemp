import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './mvp.css';
import './styles/site-language.css';
import './styles/landing-v2.css';
import './styles/auth-redesign.css';
import './styles/dashboard-pricing.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
import './styles/navigation.css';
import './styles/textured-cards.css';
import './styles/sample-report.css';
