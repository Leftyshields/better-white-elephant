/**
 * Contact Page - Web form for support, security issues, bug reports, and general inquiries
 */
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EnvelopeIcon, ShieldCheckIcon, UserIcon, ChatBubbleLeftRightIcon, BugAntIcon } from '@heroicons/react/24/outline';

export function Contact() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    type: typeParam || 'general', // 'general', 'account', 'security', 'bug'
  });
  
  // Pre-fill bug report info if coming from bug report link
  useEffect(() => {
    if (typeParam === 'bug') {
      // Pre-fill with browser and page info for bug reports
      const userAgent = navigator.userAgent;
      const url = window.location.href;
      const timestamp = new Date().toISOString();
      const messageParam = searchParams.get('message');
      
      setFormData(prev => ({
        ...prev,
        type: 'bug',
        subject: 'Bug Report',
        message: messageParam || `**Bug Description:**
[Describe what happened]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should have happened]

**Actual Behavior:**
[What actually happened]

**Browser Info:**
${userAgent}

**Page URL:**
${url}

**Timestamp:**
${timestamp}

**Additional Context:**
[Any other relevant information]`,
      }));
    }
  }, [typeParam, searchParams]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    setErrorMessage('');

    // Validation
    if (!formData.email || !formData.message) {
      setErrorMessage('Email and message are required');
      setIsSubmitting(false);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setErrorMessage('Please enter a valid email address');
      setIsSubmitting(false);
      return;
    }

    try {
      // Get the Firebase Function URL for contact emails (production)
      // Always use the direct URL to avoid conflicts with other function URLs
      const functionUrl = 'https://us-central1-better-white-elephant.cloudfunctions.net/sendContactEmail';
      
      console.log('Sending contact email to:', functionUrl);
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          type: formData.type,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitStatus('success');
        // Reset form
        setFormData({
          name: '',
          email: '',
          subject: '',
          message: '',
          type: 'general',
        });
      } else {
        setSubmitStatus('error');
        let errorMsg = data.error || 'Unknown error';
        if (data.message) {
          errorMsg = data.message; // Use the full message from server
        } else if (data.details?.message) {
          errorMsg = data.details.message;
        }
        
        // Special handling for Resend testing mode
        if (data.testingMode || data.message?.includes('testing mode') || data.message?.includes('verified email')) {
          errorMsg = 'Email service is in testing mode. Your message may not be delivered. Please try again later or contact us via GitHub Issues.';
        }
        
        setErrorMessage(errorMsg);
      }
    } catch (error) {
      console.error('Error sending contact form:', error);
      setSubmitStatus('error');
      
      // Provide helpful error messages
      let errorMsg = 'Failed to send message. ';
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMsg += 'The email service is not available. The function may not be deployed. See DEPLOY_FUNCTIONS.md for deployment instructions.';
      } else {
        errorMsg += error.message;
      }
      
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto pt-24 pb-16 px-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <EnvelopeIcon className="w-12 h-12 text-purple-300" />
            <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300">
              Contact Us
            </h1>
          </div>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Have a question or need support? We're here to help.
          </p>
        </div>

        {/* Contact Form */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact Type */}
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-slate-300 mb-2">
                What can we help you with?
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="general">General Inquiry</option>
                <option value="bug">Bug Report</option>
                <option value="account">Account Issue</option>
                <option value="security">Security Issue / Unauthorized Access</option>
              </select>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                <UserIcon className="w-4 h-4 inline mr-1" />
                Name (Optional)
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                <EnvelopeIcon className="w-4 h-4 inline mr-1" />
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="your.email@example.com"
              />
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                Subject (Optional)
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Brief description of your inquiry"
              />
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                <ChatBubbleLeftRightIcon className="w-4 h-4 inline mr-1" />
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                placeholder="Please provide as much detail as possible..."
              />
            </div>

            {/* Bug Report Notice */}
            {formData.type === 'bug' && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <BugAntIcon className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-orange-300 font-semibold mb-1">Bug Report</p>
                    <p className="text-sm text-slate-300">
                      Please include as much detail as possible about the bug, including:
                    </p>
                    <ul className="text-sm text-slate-300 mt-2 list-disc list-inside space-y-1">
                      <li>What you were doing when the bug occurred</li>
                      <li>Steps to reproduce the issue</li>
                      <li>What you expected to happen vs. what actually happened</li>
                      <li>Any error messages you saw</li>
                    </ul>
                    <p className="text-sm text-slate-300 mt-2">
                      Browser and page information has been automatically included in your message.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Security Notice */}
            {formData.type === 'security' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-300 font-semibold mb-1">Security Issue Reported</p>
                    <p className="text-sm text-slate-300">
                      If you're reporting unauthorized access to your account, please include:
                    </p>
                    <ul className="text-sm text-slate-300 mt-2 list-disc list-inside space-y-1">
                      <li>When you noticed the unauthorized access</li>
                      <li>What actions were taken on your account</li>
                      <li>Any suspicious activity you've observed</li>
                    </ul>
                    <p className="text-sm text-slate-300 mt-2">
                      We will respond to security issues immediately.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {submitStatus === 'error' && errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-300">{errorMessage}</p>
              </div>
            )}

            {/* Success Message */}
            {submitStatus === 'success' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-300 font-semibold">Message sent successfully!</p>
                <p className="text-sm text-slate-300 mt-1">
                  We've received your message and will get back to you as soon as possible. 
                  {formData.type === 'security' && ' Security issues are handled with priority.'}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-lg px-8 py-4 rounded-full shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>

        {/* Additional Information */}
        <div className="mt-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Other Ways to Reach Us</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              <strong className="text-white">GitHub Issues:</strong> For bug reports and feature requests, please use our{' '}
              <a 
                href="https://github.com/Leftyshields/better-white-elephant/issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-300 hover:text-purple-200 underline"
              >
                GitHub Issues page
              </a>
              .
            </p>
            <p>
              <strong className="text-white">Response Time:</strong> We typically respond within 24-48 hours. 
              Security issues are handled with priority and may receive a response within a few hours.
            </p>
            <p>
              <strong className="text-white">Privacy:</strong> Your contact information and message are kept confidential 
              and will only be used to respond to your inquiry. See our{' '}
              <Link to="/privacy" className="text-purple-300 hover:text-purple-200 underline">
                Privacy Policy
              </Link>
              {' '}for more details.
            </p>
          </div>
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

