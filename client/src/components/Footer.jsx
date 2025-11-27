/**
 * Footer Component
 */
import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-3xl">🎄</span>
              <div>
                <h3 className="text-2xl font-bold text-white">StealOrReveal.com</h3>
                <p className="text-sm text-slate-400">A Better White Elephant Gift Exchange</p>
              </div>
            </div>
            <p className="text-slate-400 mb-4 max-w-md">
              The modern way to host unforgettable White Elephant gift exchanges. 
              Free, fun, and easy to use! 🎁
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-green-600/20 border border-green-500/30 rounded-lg px-4 py-2">
                <span className="text-lg">✨</span>
                <span className="text-sm font-semibold text-slate-400">100% Free Forever</span>
              </div>
              <a 
                href="https://github.com/Leftyshields/better-white-elephant" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-gray-700/50 border border-gray-600/50 rounded-lg px-4 py-2 hover:bg-gray-700 hover:text-white transition-colors text-slate-400"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold">View Source Code</span>
              </a>
            </div>
          </div>

          {/* Help & Support */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">Help & Support</h4>
            <ul className="space-y-2">
              <li>
                <a 
                  href="https://github.com/Leftyshields/better-white-elephant" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>📚</span>
                  <span>Documentation</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://github.com/Leftyshields/better-white-elephant/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>🐛</span>
                  <span>Report a Bug</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://github.com/Leftyshields/better-white-elephant/discussions" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>💬</span>
                  <span>Community</span>
                </a>
              </li>
              <li>
                <Link 
                  to="/faq" 
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>❓</span>
                  <span>FAQ</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Legal */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">Contact & Legal</h4>
            <ul className="space-y-2">
              <li>
                <a 
                  href="mailto:support@stealorreveal.com" 
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>📧</span>
                  <span>Contact Us</span>
                </a>
              </li>
              <li>
                <Link 
                  to="/privacy" 
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>🔒</span>
                  <span>Privacy Policy</span>
                </Link>
              </li>
              <li>
                <Link 
                  to="/terms" 
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>📄</span>
                  <span>Terms of Service</span>
                </Link>
              </li>
              <li>
                <a 
                  href="https://github.com/Leftyshields/better-white-elephant" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span>⭐</span>
                  <span>GitHub</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-400 text-sm">
              &copy; {currentYear} StealOrReveal.com - A Better White Elephant Gift Exchange. Made with ❤️ and 🎄
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>🎁 Free Forever</span>
              <span>•</span>
              <span>🔒 Secure</span>
              <span>•</span>
              <span>⚡ Fast</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

