import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Award, 
  CheckCircle, 
  Star,
  Zap,
  Shield,
  Target
} from 'lucide-react';

const JoinAsCustomer: React.FC = () => {
  const benefits = [
    {
      icon: DollarSign,
      title: "Multiple Income Streams",
      description: "Earn through direct sales, team bonuses, and binary tree commissions with unlimited earning potential.",
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: Users,
      title: "Binary Tree System",
      description: "Fair and balanced compensation structure with automated left-first placement for optimal growth.",
      color: "from-blue-500 to-indigo-600"
    },
    {
      icon: TrendingUp,
      title: "Real-time Analytics",
      description: "Track your network growth, earnings, and performance with comprehensive dashboard analytics.",
      color: "from-purple-500 to-pink-600"
    },
    {
      icon: Shield,
      title: "Secure Platform",
      description: "Enterprise-grade security with blockchain technology ensuring transparent and secure transactions.",
      color: "from-yellow-500 to-orange-600"
    }
  ];

  const steps = [
    {
      step: "1",
      title: "Register Your Account",
      description: "Complete our simple registration form with your basic information and choose a unique username.",
      image: "https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      step: "2",
      title: "Verify Your Identity",
      description: "Complete email and mobile verification to secure your account and enable all features.",
      image: "https://images.pexels.com/photos/3184317/pexels-photo-3184317.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      step: "3",
      title: "Choose Your Plan",
      description: "Select a subscription plan that matches your goals and investment capacity.",
      image: "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    },
    {
      step: "4",
      title: "Start Building",
      description: "Begin building your network and earning through our transparent binary system.",
      image: "https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop"
    }
  ];

  const testimonials = [
    {
      name: "Sarah Johnson",
      earnings: "5,200 USDT",
      period: "monthly",
      quote: "The binary system is incredibly fair and transparent. I've built a sustainable income stream that continues to grow.",
      image: "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    },
    {
      name: "Michael Chen",
      earnings: "8,750 USDT",
      period: "monthly",
      quote: "The platform's analytics help me optimize my strategy. The support team is always there when I need help.",
      image: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    },
    {
      name: "Emma Davis",
      earnings: "12,300 USDT",
      period: "monthly",
      quote: "I love the blockchain transparency. Every transaction is visible and secure. It's the future of MLM.",
      image: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white py-20 overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop" 
            alt="Join as Customer"
            className="w-full h-full object-cover opacity-20"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 mb-6 border border-white/20">
                <Target className="h-5 w-5 text-yellow-300" />
                <span className="text-sm font-medium">Customer Registration</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                Start Your <span className="bg-gradient-to-r from-yellow-300 to-orange-400 bg-clip-text text-transparent">Financial Journey</span>
              </h1>
              <p className="text-xl text-gray-200 mb-8 leading-relaxed">
                Join thousands of successful entrepreneurs building their financial future through our innovative binary tree MLM system.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/customer/register"
                  className="group bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 px-8 py-4 rounded-2xl font-bold hover:from-yellow-300 hover:to-orange-400 transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
                >
                  <span>Register Now</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/subscription-plans"
                  className="group border-2 border-white/30 text-white px-8 py-4 rounded-2xl font-semibold hover:bg-white hover:text-indigo-900 transition-all duration-300 flex items-center justify-center space-x-3 backdrop-blur-sm"
                >
                  <span>View Plans</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
                <h3 className="text-2xl font-bold mb-6">Quick Stats</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-300 mb-2">50K+</div>
                    <div className="text-sm text-gray-300">Active Members</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-300 mb-2">$2M+</div>
                    <div className="text-sm text-gray-300">Total Earnings</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-300 mb-2">150+</div>
                    <div className="text-sm text-gray-300">Countries</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-300 mb-2">99.9%</div>
                    <div className="text-sm text-gray-300">Uptime</div>
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
            <div className="inline-flex items-center space-x-2 bg-indigo-100 rounded-full px-6 py-3 mb-6">
              <Award className="h-5 w-5 text-indigo-600" />
              <span className="text-sm font-semibold text-indigo-600">Customer Benefits</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              Why Join as a Customer?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Unlock exclusive benefits and earning opportunities designed specifically for individual entrepreneurs.
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

      {/* How It Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-purple-100 rounded-full px-6 py-3 mb-6">
              <Zap className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-semibold text-purple-600">Simple Process</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              Get Started in 4 Easy Steps
            </h2>
            <p className="text-xl text-gray-600">
              Join our community and start earning in minutes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center group relative">
                <div className="relative mb-8">
                  <div className="relative overflow-hidden rounded-2xl">
                    <img 
                      src={step.image} 
                      alt={step.title}
                      className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    <div className="absolute top-4 left-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">
                      {step.step}
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-24 -right-4 w-8 h-0.5 bg-gradient-to-r from-indigo-300 to-purple-300"></div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-green-100 rounded-full px-6 py-3 mb-6">
              <Star className="h-5 w-5 text-green-600" />
              <span className="text-sm font-semibold text-green-600">Success Stories</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
              What Our Customers Say
            </h2>
            <p className="text-xl text-gray-600">
              Real stories from real people building real success
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-gray-50 rounded-3xl p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-6">
                  <img 
                    src={testimonial.image} 
                    alt={testimonial.name}
                    className="w-16 h-16 rounded-full object-cover mr-4"
                  />
                  <div>
                    <h4 className="font-bold text-gray-900">{testimonial.name}</h4>
                    <div className="flex items-center space-x-1">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 mb-6 italic">"{testimonial.quote}"</p>
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-2xl text-center">
                  <div className="text-2xl font-bold">{testimonial.earnings}</div>
                  <div className="text-sm opacity-90">{testimonial.period} earnings</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-20 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Customer Requirements
              </h2>
              <p className="text-xl text-indigo-100 mb-8">
                Simple requirements to get started on your entrepreneurial journey.
              </p>
              <div className="space-y-4">
                {[
                  "Must be 18 years or older",
                  "Valid email address and phone number",
                  "Government-issued ID for verification",
                  "Active subscription to one of our plans",
                  "Commitment to ethical business practices"
                ].map((requirement, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-6 w-6 text-green-300 flex-shrink-0" />
                    <span className="text-indigo-100">{requirement}</span>
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
              <div className="absolute -bottom-6 -left-6 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 p-6 rounded-2xl shadow-xl">
                <div className="text-2xl font-bold">Ready to Start?</div>
                <div className="text-sm opacity-90">Join thousands of successful entrepreneurs</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
            Ready to Transform Your Life?
          </h2>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Join our community of successful entrepreneurs and start building your financial future today. 
            Your journey to financial freedom starts with a single click.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Link
              to="/customer/register"
              className="group bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              <DollarSign className="h-6 w-6" />
              <span>Start Earning Today</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/subscription-plans"
              className="group border-2 border-indigo-600 text-indigo-600 px-8 py-4 rounded-2xl font-semibold hover:bg-indigo-50 transition-all duration-300 flex items-center justify-center space-x-3"
            >
              <CheckCircle className="h-5 w-5" />
              <span>View Pricing Plans</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-75">
            <div className="flex items-center justify-center space-x-2">
              <Shield className="h-6 w-6 text-gray-600" />
              <span className="text-sm text-gray-600">SSL Secured</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <CheckCircle className="h-6 w-6 text-gray-600" />
              <span className="text-sm text-gray-600">Verified Platform</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <Users className="h-6 w-6 text-gray-600" />
              <span className="text-sm text-gray-600">50K+ Members</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <Award className="h-6 w-6 text-gray-600" />
              <span className="text-sm text-gray-600">Award Winning</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JoinAsCustomer;