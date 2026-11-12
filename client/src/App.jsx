/**
 * Main App Component
 */
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { Header } from './components/Header.jsx';
import { Home } from './pages/Home.jsx';
import { Party } from './pages/Party.jsx';
import { Profile } from './pages/Profile.jsx';
import { Rules } from './pages/Rules.jsx';
import { Terms } from './pages/Terms.jsx';
import { Privacy } from './pages/Privacy.jsx';
import { Contact } from './pages/Contact.jsx';
import { trackPageView } from './utils/analytics.js';
import { PartyModalProvider } from './contexts/PartyModalContext.jsx';
import { SoundProvider } from './contexts/SoundContext.jsx';
import { UX_PREVIEW_ENABLED } from './preview/previewFlag.js';

const PreviewChrome = UX_PREVIEW_ENABLED
  ? lazy(() => import('./preview/PreviewChrome.jsx').then((m) => ({ default: m.PreviewChrome })))
  : null;

// Component to track page views
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    const pageName = location.pathname === '/' ? 'Home' : location.pathname.split('/')[1] || 'Home';
    trackPageView(pageName, location.pathname);
  }, [location]);

  return null;
}

function App() {
  return (
    <SoundProvider>
      <PartyModalProvider>
        <BrowserRouter>
          <PageViewTracker />
          <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black pt-24">
            <Header />
            {PreviewChrome ? (
              <Suspense fallback={null}>
                <PreviewChrome />
              </Suspense>
            ) : null}
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/party/:partyId" element={<Party />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </div>
        </BrowserRouter>
      </PartyModalProvider>
    </SoundProvider>
  );
}

export default App;


