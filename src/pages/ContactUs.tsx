import React, { useState } from 'react';
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, User, Building } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';

const parseQuickSupportLink = (value: string) => {
  const [labelPart, ...urlParts] = value.split('|');
  return {
    label: String(labelPart || '').trim(),
    href: urlParts.join('|').trim()
  };
};

const ContactUs: React.FC = () => {
  const { settings } = useAdmin();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    type: 'general'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    alert('Thank you for your message! We will get back to you within 24 hours.');
    setFormData({ name: '', email: '', subject: '', message: '', type: 'general' });
    setIsSubmitting(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const quickSupportLinks = (settings.contactQuickSupportLinks || [])
    .map(parseQuickSupportLink)
    .filter((link) => link.label);
  const hasContactInfo = Boolean(
    settings.contactEmail ||
    settings.contactPhone ||
    settings.contactAddress ||
    settings.contactBusinessHours ||
    quickSupportLinks.length
  );
  const quickSupportIcons = [MessageSquare, User, Building];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Contact Us</h1>
          <p className="text-xl md:text-2xl text-indigo-100 max-w-3xl mx-auto">
            We're here to help you succeed. Get in touch with our support team.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className={`grid grid-cols-1 gap-12 ${hasContactInfo ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
          {/* Contact Information */}
          <div className="lg:col-span-1">
            {hasContactInfo && (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-8">Get in Touch</h2>

                <div className="space-y-6">
                  {settings.contactEmail && (
                    <div className="flex items-start space-x-4">
                      <div className="bg-indigo-100 p-3 rounded-lg">
                        <Mail className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Email Support</h3>
                        <a href={`mailto:${settings.contactEmail}`} className="text-gray-600 hover:text-indigo-600 break-all">
                          {settings.contactEmail}
                        </a>
                        {settings.contactEmailNote && (
                          <p className="text-sm text-gray-500">{settings.contactEmailNote}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {settings.contactPhone && (
                    <div className="flex items-start space-x-4">
                      <div className="bg-green-100 p-3 rounded-lg">
                        <Phone className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Phone Support</h3>
                        <a href={`tel:${settings.contactPhone.replace(/\s+/g, '')}`} className="text-gray-600 hover:text-green-600">
                          {settings.contactPhone}
                        </a>
                        {settings.contactPhoneNote && (
                          <p className="text-sm text-gray-500">{settings.contactPhoneNote}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {settings.contactAddress && (
                    <div className="flex items-start space-x-4">
                      <div className="bg-purple-100 p-3 rounded-lg">
                        <MapPin className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Office Address</h3>
                        <p className="text-gray-600 whitespace-pre-line">{settings.contactAddress}</p>
                      </div>
                    </div>
                  )}

                  {settings.contactBusinessHours && (
                    <div className="flex items-start space-x-4">
                      <div className="bg-yellow-100 p-3 rounded-lg">
                        <Clock className="h-6 w-6 text-yellow-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Business Hours</h3>
                        <p className="text-gray-600 whitespace-pre-line">{settings.contactBusinessHours}</p>
                      </div>
                    </div>
                  )}
                </div>

                {quickSupportLinks.length > 0 && (
                  <div className="mt-12">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Support</h3>
                    <div className="space-y-3">
                      {quickSupportLinks.map((link, index) => {
                        const Icon = quickSupportIcons[index % quickSupportIcons.length];
                        return link.href ? (
                          <a
                            key={`${link.label}-${index}`}
                            href={link.href}
                            className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{link.label}</span>
                          </a>
                        ) : (
                          <div key={`${link.label}-${index}`} className="flex items-center space-x-2 text-gray-700">
                            <Icon className="h-4 w-4" />
                            <span>{link.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Contact Form */}
          <div className={hasContactInfo ? 'lg:col-span-2' : 'max-w-3xl w-full mx-auto'}>
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a Message</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
                    Inquiry Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="general">General Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="billing">Billing Question</option>
                    <option value="partnership">Partnership</option>
                    <option value="feedback">Feedback</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Brief subject of your message"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Please describe your inquiry in detail..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-gray-600">Quick answers to common questions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                question: "How quickly will I receive a response?",
                answer: settings.contactPhone
                  ? "We typically respond to all inquiries within 24 hours during business days. For urgent matters, please call our support line."
                  : "We typically respond to all inquiries within 24 hours during business days."
              },
              {
                question: "What information should I include in my message?",
                answer: "Please include your account details (if applicable), a clear description of your issue, and any relevant screenshots or error messages."
              },
              ...(settings.contactPhone ? [{
                question: "Do you offer phone support?",
                answer: `Yes, you can reach us at ${settings.contactPhone}${settings.contactPhoneNote ? ` (${settings.contactPhoneNote})` : ''}.`
              }] : []),
              {
                question: "Can I schedule a consultation?",
                answer: "Absolutely! We offer free consultations for potential business partners and enterprise clients. Please mention this in your message."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-3">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactUs;
