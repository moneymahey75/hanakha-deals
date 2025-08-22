import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  Building, 
  TrendingUp, 
  Users, 
  Globe, 
  CheckCircle, 
  Star,
  Zap,
  Shield,
  Target,
  BarChart3,
  Handshake
} from 'lucide-react';

const JoinAsCompany: React.FC = () => {
  const benefits = [
    {
      icon: Users,
      title: "Massive Network Reach",
      description: "Access to our global network of 50,000+ active members across 150+ countries for maximum market penetration.",
      color: "from-blue-500 to-indigo-600"
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description: "Comprehensive business intelligence tools to track performance, optimize campaigns, and maximize ROI.",
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-grade security infrastructure with blockchain technology ensuring secure and transparent operations.",
      color: "from-purple-500 to-pink-600"
    },
    {
      icon: Handshake,
      title: "Partnership Support",
      description: "Dedicated account management and marketing support to help your business succeed and grow.",
      color: "from-yellow-500 to-orange-600"
    }
  ];

  const features = [
    {
      title: "Multi-Channel Marketing",
      description: "Leverage our platform's built-in marketing tools and member network for product promotion.",
      image: "https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      title: "Real-time Reporting",
      description: "Access detailed analytics on sales performance, customer engagement, and revenue metrics.",
      image: "https://images.pexels.com/photos/3184317/pexels-photo-3184317.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      title: "Global Distribution",
      description: "Expand your reach to international markets through our established global network.",
      image: "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      title: "Compliance Management",
      description: "Built-in compliance tools ensuring adherence to local and international regulations.",
      image: "https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    }
  ];

  const steps = [
    {
      step: "1",
      title: "Business Registration",
      description: "Complete our comprehensive business registration with company details and documentation.",
      icon: Building
    },
    {
      step: "2",
      title: "Verification Process",
      description: "Our team verifies your business credentials and ensures compliance with regulations.",
      icon: Shield
    },
    {
      step: "3",
      title: "Platform Integration",
      description: "Set up your business profile, products/services, and customize your company presence.",
      icon: Zap
    },
    {
      step: "4",
      title: "Launch & Scale",
      description: "Go live on our platform and start leveraging our network for business growth.",
      icon: TrendingUp
    }
  ];

  const testimonials = [
    {
      company: "TechCorp Solutions",
      industry: "Technology",
      growth: "300%",
      period: "6 months",
      quote: "The platform's reach and analytics have transformed our business. We've expanded to 25 new countries.",
      logo: "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    },
    {
      company: "HealthPlus Inc",
      industry: "Healthcare",
      growth: "450%",
      period: "8 months",
      quote: "The compliance tools and global network helped us navigate international markets seamlessly.",
      logo: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    },
    {
      company: "EcoGreen Products",
      industry: "Sustainability",
      growth: "600%",
      period: "1 year",
      quote: "The marketing support and member engagement tools have exceeded our expectations completely.",
      logo: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-green-900 via-blue-900 to-indigo-900 text-white py-20 overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop" 
            alt="Join as Company"
            className="w-full h-full object-cover opacity-20"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 mb-6 border border-white/20">
                <Building className="h-5 w-5 text-green-300" />
                <span className="text-sm font-medium">Business Partnership</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                Scale Your <span className="bg-gradient-to-r from-green-300 to-blue-400 bg-clip-text text-transparent">Business</span> Globally
              </h1>
              <p className="text-xl text-gray-200 mb-8 leading-relaxed">
                Partner with our platform to reach 50,000+ active members worldwide and accelerate your business growth through our proven MLM network.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/company/register"
                  className="group bg-gradient-to-r from-green-400 to-blue-500 text-white px-8 py-4 rounded-2xl font-bold hover:from-green-300 hover:to-blue-400 transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
                >
                  <span>Register Your Business</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/contact"
                  className="group border-2 border-white/30 text-white px-8 py-4 rounded-2xl font-semibold hover:bg-white hover:text-green-900 transition-all duration-300 flex items-center justify-center space-x-3 backdrop-blur-sm"
                >
                  <span>Schedule Demo</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
                <h3 className="text-2xl font-bold mb-6">Platform Reach</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-300 mb-2">50K+</div>
                    <div className="text-sm text-gray-300">Active Members</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-300 mb-2">150+</div>
                    <div className="text-sm text-gray-300">Countries</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-300 mb-2">500+</div>
                    <div className="text-sm text-gray-300">Partner Companies</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-300 mb-2">10M+ USDT</div>
                    <div className="text-sm text-gray-300">Revenue Generated</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-green-100 rounded-full px-6 py-3 mb-6">
              <Target className="h-5 w-5 text-green-600" />
              <span className="text-sm font-semibold text-green-600">Business Benefits</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              Why Partner With Us?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Unlock powerful business growth opportunities through our comprehensive MLM platform and global network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="group relative">
                <div className="bg-gray-50 rounded-3xl p-8 hover:shadow-xl transition-all duration-500 border border-gray-100 hover:border-gray-200 transform hover:-translate-y-2">
                  <div className={`bg-gradient-to-r ${benefit.color} w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <benefit.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{benefit.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-blue-100 rounded-full px-6 py-3 mb-6">
              <Zap className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-semibold text-blue-600">Platform Features</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              Powerful Business Tools
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to succeed in the MLM marketplace
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2">
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={feature.image} 
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-purple-100 rounded-full px-6 py-3 mb-6">
              <Target className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-semibold text-purple-600">Getting Started</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              Simple Onboarding Process
            </h2>
            <p className="text-xl text-gray-600">
              Get your business up and running in just four steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center group relative">
                <div className="relative mb-8">
                  <div className="bg-gradient-to-r from-green-500 to-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
                    <step.icon className="h-10 w-10 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                    {step.step}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-10 -right-4 w-8 h-0.5 bg-gradient-to-r from-green-300 to-blue-300"></div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Success Stories */}
      <section className="py-20 bg-gradient-to-r from-gray-900 to-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 mb-6 border border-white/20">
              <Star className="h-5 w-5 text-yellow-300" />
              <span className="text-sm font-medium">Success Stories</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Partner Success Stories
            </h2>
            <p className="text-xl text-gray-300">
              See how businesses like yours are thriving on our platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20 hover:bg-white/15 transition-colors">
                <div className="flex items-center mb-6">
                  <img 
                    src={testimonial.logo} 
                    alt={testimonial.company}
                    className="w-16 h-16 rounded-full object-cover mr-4"
                  />
                  <div>
                    <h4 className="font-bold text-white">{testimonial.company}</h4>
                    <p className="text-gray-300 text-sm">{testimonial.industry}</p>
                    <div className="flex items-center space-x-1 mt-1">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
                <div className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-4 rounded-2xl text-center">
                  <div className="text-2xl font-bold">{testimonial.growth}</div>
                  <div className="text-sm opacity-90">growth in {testimonial.period}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Partnership Requirements
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Simple requirements to join our business network and start growing your company.
              </p>
              <div className="space-y-4">
                {[
                  "Registered business entity with valid documentation",
                  "Minimum 2 years of business operation",
                  "Compliance with local and international regulations",
                  "Quality products or services suitable for MLM distribution",
                  "Commitment to ethical business practices and transparency"
                ].map((requirement, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{requirement}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <img 
                src="https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop" 
                alt="Requirements"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-6 -right-6 bg-gradient-to-r from-green-500 to-blue-600 text-white p-6 rounded-2xl shadow-xl">
                <div className="text-2xl font-bold">Ready to Partner?</div>
                <div className="text-sm opacity-90">Join 500+ successful businesses</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Scale Your Business?
          </h2>
          <p className="text-xl text-green-100 mb-12 max-w-3xl mx-auto">
            Join our network of successful businesses and unlock global growth opportunities. 
            Your business expansion journey starts here.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Link
              to="/company/register"
              className="group bg-white text-green-600 px-8 py-4 rounded-2xl font-bold hover:bg-gray-100 transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              <Building className="h-6 w-6" />
              <span>Register Your Business</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/contact"
              className="group border-2 border-white/30 text-white px-8 py-4 rounded-2xl font-semibold hover:bg-white hover:text-green-600 transition-all duration-300 flex items-center justify-center space-x-3 backdrop-blur-sm"
            >
              <Globe className="h-5 w-5" />
              <span>Schedule Consultation</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-75">
            <div className="flex items-center justify-center space-x-2">
              <Shield className="h-6 w-6" />
              <span className="text-sm">Enterprise Security</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <CheckCircle className="h-6 w-6" />
              <span className="text-sm">Verified Partners</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <Globe className="h-6 w-6" />
              <span className="text-sm">Global Reach</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <TrendingUp className="h-6 w-6" />
              <span className="text-sm">Proven Growth</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JoinAsCompany;