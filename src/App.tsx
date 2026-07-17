import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import './App.css';

const Index = lazy(() => import('./pages/Index'));
const Login = lazy(() => import('./pages/Login'));

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--page-bg)' }}>
      <div
        className="h-8 w-8 animate-spin rounded-full"
        style={{ border: '3px solid var(--border)', borderTopColor: 'var(--brand)' }}
        aria-label="页面加载中"
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Index />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
