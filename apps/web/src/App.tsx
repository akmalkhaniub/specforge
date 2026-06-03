/**
 * App shell: React Query + org context providers, router, and the layout with
 * an error boundary around the routed page.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { OrgProvider } from './lib/org';
import { ThemeProvider } from './lib/theme';
import { Analytics } from './pages/Analytics';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Project } from './pages/Project';
import { Upload } from './pages/Upload';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OrgProvider>
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
        </OrgProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
