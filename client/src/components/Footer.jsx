/**
 * Marketing Footer Component
 */
import { Link } from 'react-router-dom';
import { CodeBracketIcon } from '@heroicons/react/24/outline';

export function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1">
            <h3 className="text-white font-bold text-lg mb-2">StealOrReveal</h3>
            <p className="text-slate-400 text-sm mb-4">
              The modern way to host unforgettable White Elephant gift exchanges. <span className="text-purple-300 font-semibold">100% free.</span>
            </p>
            <p className="text-slate-600 text-xs mt-4">
              © {new Date().getFullYear()} StealOrReveal
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-white font-bold mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/rules"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Rules
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-white font-bold mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/terms"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-white font-bold mb-4">Community</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/Leftyshields/better-white-elephant"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <CodeBracketIcon className="w-4 h-4" />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Leftyshields/better-white-elephant/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Report a Bug
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
