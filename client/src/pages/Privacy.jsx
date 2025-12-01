/**
 * Privacy Policy Page
 */
import { Link } from 'react-router-dom';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export function Privacy() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto pt-24 pb-16 px-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <ShieldCheckIcon className="w-12 h-12 text-purple-300" />
            <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300">
              Privacy Policy
            </h1>
          </div>
          <p className="text-sm text-slate-400">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <p className="text-slate-300 leading-relaxed">
              StealOrReveal.com ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.1 Personal Information</h3>
            <p className="text-slate-300 leading-relaxed mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>Account Information:</strong> Name, email address, and profile information when you create an account</li>
              <li><strong>Gift Links:</strong> URLs to gift items you submit for exchange</li>
              <li><strong>Fulfillment Information:</strong> Shipping addresses you provide for gift fulfillment (only shared with the person assigned to send you a gift)</li>
              <li><strong>Game Data:</strong> Information about your participation in gift exchange games, including turn actions and game history</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.2 Automatically Collected Information</h3>
            <p className="text-slate-300 leading-relaxed mb-4">
              When you use the Service, we automatically collect certain information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>Usage Data:</strong> Information about how you interact with the Service, including pages visited, features used, and time spent</li>
              <li><strong>Device Information:</strong> Browser type, device type, operating system, and IP address</li>
              <li><strong>Cookies and Tracking:</strong> We use cookies and similar tracking technologies to track activity on our Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process and manage your account and game participation</li>
              <li>Facilitate gift exchanges and coordinate fulfillment</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. How We Share Your Information</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>With Other Participants:</strong> Your name and email may be visible to other participants in the same gift exchange party. Shipping addresses are only shared with the person assigned to send you a gift.</li>
              <li><strong>Service Providers:</strong> We may share information with third-party service providers who perform services on our behalf, such as hosting, analytics, and email delivery.</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid requests by public authorities.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Data Retention</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. Our retention periods are as follows:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>Account Information:</strong> Retained while your account is active and for 90 days after account deletion, unless you request immediate deletion</li>
              <li><strong>Game and Party Data:</strong> Retained for 1 year after the game ends, then automatically deleted</li>
              <li><strong>Fulfillment Information (Shipping Addresses):</strong> Deleted immediately after gift fulfillment is confirmed or 30 days after game ends, whichever comes first</li>
              <li><strong>Gift Links:</strong> Retained for the duration of the game and 30 days after game ends</li>
              <li><strong>Analytics and Logs:</strong> Retained for 90 days, then automatically deleted</li>
              <li><strong>Support Communications:</strong> Retained for 1 year after the last communication</li>
            </ul>
            <p className="text-slate-300 leading-relaxed mt-4">
              You may request deletion of your personal information at any time by contacting us. We will honor such requests in accordance with applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Data Security</h2>
            <p className="text-slate-300 leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Your Privacy Rights</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt out of certain data processing activities</li>
            </ul>
            <p className="text-slate-300 leading-relaxed mt-4">
              To exercise these rights, please contact us through our <a href="https://github.com/Leftyshields/better-white-elephant/issues" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-200 underline">GitHub Issues</a> page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Children's Privacy</h2>
            <p className="text-slate-300 leading-relaxed">
              Our Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to track activity on our Service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.
            </p>
            <p className="text-slate-300 leading-relaxed">
              We use cookies for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300 mt-4">
              <li>Authentication and session management</li>
              <li>Remembering your preferences and settings</li>
              <li>Analyzing usage patterns and improving the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">10. Changes to This Privacy Policy</h2>
            <p className="text-slate-300 leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">11. Contact Us</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please{' '}
              <Link to="/contact" className="text-purple-300 hover:text-purple-200 underline">contact us</Link>
              {' '}or reach out through our{' '}
              <a href="https://github.com/Leftyshields/better-white-elephant/issues" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-200 underline">GitHub Issues</a> page.
            </p>
          </section>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link to="/" className="text-purple-300 hover:text-purple-200 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

