import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n, isApiError } from '@induru/shared';
import '@induru/shared/styles.css';
import './app.css';
import { SessionProvider } from './app/session';
import { StepUpProvider } from './app/stepUp';
import { AppRoutes } from './app/routes';

// GitHub Pages deep links arrive via 404.html as ?p=<path>; restore the real URL.
const redirected = new URLSearchParams(window.location.search).get('p');
if (redirected) window.history.replaceState(null, '', import.meta.env.BASE_URL + redirected.replace(/^\//, ''));

initI18n();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => count < 2 && !isApiError(err) ,
      refetchOnWindowFocus: true,
      // Private data is never persisted; keep it in memory briefly only.
      gcTime: 5 * 60_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <SessionProvider>
          <StepUpProvider>
            <AppRoutes />
          </StepUpProvider>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
