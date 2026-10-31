/**
 * App shell: React Query + theme + auth providers. Unauthenticated users see the
 * Login screen; authenticated users get the routed app inside the layout.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { Analytics } from './pages/Analytics';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Project } from './pages/Project';
import { Upload } from './pages/Upload';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedApp(): JSX.Element {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-full grid place-items-center bg-background text-muted">Loading…</div>;
  }
  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/projects/:id" element={<Project />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AuthedApp />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
