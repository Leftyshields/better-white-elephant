/**
 * Simple Game Footer - Only shows Report a Bug link
 */
import { Link } from 'react-router-dom';

export function GameFooter() {
  return (
    <footer className="bg-black/50 border-t border-white/10 py-4 mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center">
          <Link
            to="/contact?type=bug"
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            Report a Bug
          </Link>
        </div>
      </div>
    </footer>
  );
}

