import React from 'react';
import { ToastProvider } from './components/ui/ToastProvider';
import AppContent from './components/AppContent';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

/**
 * ============================================================================
 * MEDIAFLOW PHOENIX FRONTEND v7.5.1 (Enterprise Edition - Hotfix)
 * ============================================================================
 * * CORE ARCHITECTURE:
 * - Framework: React 18 + Vite
 * - Styling: TailwindCSS (Glassmorphism UI)
 * - State Management: SWR (Stale-While-Revalidate) + React Context
 * - Realtime: Server-Sent Events (SSE)
 * * AUTHORIZATION:
 * - Mocked Bearer Token via AUTH_TOKEN constant.
 * * MODULES:
 * 1. Library (Asset Management, Virtualization, Streaming)
 * 2. Ingestion (Drag & Drop Upload, Validation)
 * 3. Processing (FFmpeg Transcoding Wizard, Batch Processing)
 * 4. Administration (User Management, System Monitoring)
 */

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  );
}
