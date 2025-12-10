/**
 * Terms of Service Page
 */
import { Link } from 'react-router-dom';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

export function Terms() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto pt-24 pb-16 px-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <DocumentTextIcon className="w-12 h-12 text-purple-300" />
            <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300">
              Terms of Service
            </h1>
          </div>
          <p className="text-sm text-slate-400">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              By accessing and using StealOrReveal.com ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Description of Service</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              StealOrReveal is a web-based platform that facilitates White Elephant gift exchanges. The Service allows users to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>Create and host gift exchange parties</li>
              <li>Participate in gift exchange games</li>
              <li>Share gift links and manage gift exchanges</li>
              <li>Coordinate gift fulfillment between participants</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. User Accounts</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              To use certain features of the Service, you must register for an account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and identification</li>
              <li>Accept all responsibility for activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. User Conduct</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Transmit any harmful, offensive, or inappropriate content</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Attempt to gain unauthorized access to any portion of the Service</li>
              <li>Use automated systems to access the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Gift Links and Content</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              You are solely responsible for the gift links and content you submit through the Service. You represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li>You have the right to share the gift links you provide</li>
              <li>All gift links are legitimate and accessible</li>
              <li>You will fulfill your obligations to send gifts to assigned recipients</li>
              <li>You will not use the Service to facilitate fraudulent or illegal activities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Fulfillment Responsibilities</h2>
            <p className="text-slate-300 leading-relaxed">
              When you participate in a gift exchange, you agree to fulfill your obligation to purchase and ship the gift to the assigned recipient. StealOrReveal is not responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300 mt-4">
              <li>The quality, delivery, or condition of gifts exchanged</li>
              <li>Disputes between participants regarding gifts</li>
              <li>Shipping delays or lost packages</li>
              <li>Refunds or returns for exchanged gifts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Intellectual Property</h2>
            <p className="text-slate-300 leading-relaxed">
              The Service and its original content, features, and functionality are owned by StealOrReveal and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Termination</h2>
            <p className="text-slate-300 leading-relaxed">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach the Terms. Upon termination, your right to use the Service will cease immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-slate-300 leading-relaxed">
              The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">10. Limitation of Liability</h2>
            <p className="text-slate-300 leading-relaxed">
              In no event shall StealOrReveal, its directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">11. Changes to Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">12. Contact Information</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about these Terms of Service, please{' '}
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

