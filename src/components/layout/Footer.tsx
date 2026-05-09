import React from 'react';
import { useAdmin } from '../../contexts/AdminContext';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Instagram, Youtube, MessageCircle } from 'lucide-react';

const Footer: React.FC = () => {
  const { settings } = useAdmin();
  const hasFooterContact = Boolean(settings.contactEmail || settings.contactPhone || settings.contactAddress);
  const socialLinks = [
    { label: 'Facebook', icon: Facebook, href: settings.socialFacebookUrl, color: 'hover:text-blue-400' },
    { label: 'X / Twitter', icon: Twitter, href: settings.socialTwitterUrl, color: 'hover:text-sky-400' },
    { label: 'LinkedIn', icon: Linkedin, href: settings.socialLinkedinUrl, color: 'hover:text-blue-500' },
    { label: 'Instagram', icon: Instagram, href: settings.socialInstagramUrl, color: 'hover:text-pink-400' },
    { label: 'YouTube', icon: Youtube, href: settings.socialYoutubeUrl, color: 'hover:text-red-400' },
    { label: 'WhatsApp', icon: MessageCircle, href: settings.socialWhatsappUrl, color: 'hover:text-green-400' }
  ].filter((social) => social.href && social.href.trim());

  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-3 mb-6">
              <div className="relative">
                <img
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="rounded-xl object-cover shadow-lg"
                  style={{ width: '180px' }}
                />
              </div>
              <div>
                <span className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                </span>
              </div>
            </div>
            <p className="text-gray-300 mb-6 leading-relaxed max-w-md">
              The ultimate referral platform with direct-parent relationships, designed for sustainable growth and transparent earnings. 
              Join thousands of successful entrepreneurs building their financial future.
            </p>
            
            {hasFooterContact && (
              <div className="space-y-3">
                {settings.contactEmail && (
                  <a href={`mailto:${settings.contactEmail}`} className="flex items-center space-x-3 text-gray-300 hover:text-emerald-400 transition-colors">
                    <div className="bg-emerald-600 p-2 rounded-lg">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span className="break-all">{settings.contactEmail}</span>
                  </a>
                )}
                {settings.contactPhone && (
                  <a href={`tel:${settings.contactPhone.replace(/\s+/g, '')}`} className="flex items-center space-x-3 text-gray-300 hover:text-emerald-400 transition-colors">
                    <div className="bg-teal-600 p-2 rounded-lg">
                      <Phone className="h-4 w-4" />
                    </div>
                    <span>{settings.contactPhone}</span>
                  </a>
                )}
                {settings.contactAddress && (
                  <div className="flex items-center space-x-3 text-gray-300">
                    <div className="bg-cyan-600 p-2 rounded-lg">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <span className="whitespace-pre-line">{settings.contactAddress}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-6 text-white">Quick Links</h3>
            <ul className="space-y-3">
              {[
                { to: "/join-customer", label: "Join as Customer" },
                { to: "/join-company", label: "Join as Company" },
                { to: "/about", label: "About Us" }
              ].map((link, index) => (
                <li key={index}>
                  <Link 
                    to={link.to} 
                    className="text-gray-300 hover:text-emerald-400 transition-colors duration-200 flex items-center space-x-2 group"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  >
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full group-hover:bg-emerald-400 transition-colors"></div>
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Support */}
          <div>
            <h3 className="text-lg font-bold mb-6 text-white">Support</h3>
            <ul className="space-y-3">
              {[
                { label: "Help Center", to: "/faq" },
                { label: "Contact Us", to: "/contact" },
                { label: "Terms of Service", to: "/policies" },
                { label: "Privacy Policy", to: "/policies" },
                { label: "FAQ", to: "/faq" }
              ].map((link, index) => (
                <li key={index}>
                  <Link 
                    to={link.to} 
                    className="text-gray-300 hover:text-emerald-400 transition-colors duration-200 flex items-center space-x-2 group"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  >
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full group-hover:bg-teal-400 transition-colors"></div>
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Social Media & Copyright */}
        <div className="border-t border-gray-700 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    title={social.label}
                    className={`bg-gray-800 p-3 rounded-xl text-gray-400 ${social.color} transition-all duration-200 hover:bg-gray-700 transform hover:scale-110`}
                  >
                    <social.icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            )}
            
            <div className="text-center md:text-right">
              <p className="text-gray-400 text-sm">
                © {new Date().getFullYear()} {settings.siteName}. All rights reserved.
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Built for the referral community
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
