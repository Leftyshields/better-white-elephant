/**
 * Main App Component
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header.jsx';
import { Home } from './pages/Home.jsx';
import { Party } from './pages/Party.jsx';
import { Profile } from './pages/Profile.jsx';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/party/:partyId" element={<Party />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;


