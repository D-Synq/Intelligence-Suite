import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './theme.tsx';
import { BrandErrorBoundary } from './components/BrandErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrandErrorBoundary>
  </StrictMode>
);
