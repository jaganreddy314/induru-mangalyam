import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n, isApiError, setLocale } from '@induru/shared';
import '@induru/shared/styles.css';
import './admin.css';
import { StaffGate } from './auth';
import { App } from './App';

// GitHub Pages deep links arrive via 404.html as ?p=<path>; restore the real URL.
const redirected = new URLSearchParams(window.location.search).get('p');
if (redirected) window.history.replaceState(null, '', import.meta.env.BASE_URL + redirected.replace(/^\//, ''));

initI18n();
setLocale('en');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => n < 1 && !isApiError(e), gcTime: 60_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <StaffGate>{(state) => <App state={state} />}</StaffGate>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
