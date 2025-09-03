import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
import { Menu, X, User, LogOut, Settings, Home, ChevronDown, Building, CreditCard } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { settings } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setIsMenuOpen(false);
  };

  const handleNavClick = (path: string) => {
    setIsMenuOpen(false);
    setIsCustomerDropdownOpen(false);
    setIsCompanyDropdownOpen(false);
    
    if (location.pathname === path) {
      window.scrollTo({ 
        top: 0, 
        behavior: 'smooth',
        left: 0
      });
    } else {
      navigate(path);
    }
  };

  const getDashboardLink = () => {
    if (!user) return '/';
    switch (user.userType) {
      case 'admin':
        return '/admin/dashboard';
      case 'company':
        return '/company/dashboard';
      case 'customer':
        return '/customer/dashboard';
      default:
        return '/';
    }
  };

  return (
    <nav className="bg-white/95 backdrop-blur-md shadow-lg fixed w-full top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative">
                <img
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="h-20 w-100 rounded-xl object-cover group-hover:shadow-lg transition-shadow duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                  {settings.siteName}
                </span>
                <span className="text-xs text-gray-500 -mt-1">All Deals. One Sphere.</span>
              </div>
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1">
            <Link 
              to="/" 
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200 font-medium"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
            
            {!user ? (
              <>
                {/* Customer Dropdown */}
                <div className="relative group">
                  <button 
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200 font-medium"
                    onMouseEnter={() => setIsCustomerDropdownOpen(true)}
                    onMouseLeave={() => setIsCustomerDropdownOpen(false)}
                  >
                    <User className="h-4 w-4" />
                    <span>Customer</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <div 
                    className={`absolute top-full left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-200 ${
                      isCustomerDropdownOpen ? 'opacity-100 visible transform translate-y-0' : 'opacity-0 invisible transform -translate-y-2'
                    }`}
                    onMouseEnter={() => setIsCustomerDropdownOpen(true)}
                    onMouseLeave={() => setIsCustomerDropdownOpen(false)}
                  >
                    <div className="p-2">
                      <Link
                        to="/customer/login"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <User className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <div className="font-medium">Customer Login</div>
                          <div className="text-xs text-gray-500">Access your account</div>
                        </div>
                      </Link>
                      <Link
                        to="/customer/register"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                          <User className="h-4 w-4 text-teal-600" />
                        </div>
                        <div>
                          <div className="font-medium">Customer Register</div>
                          <div className="text-xs text-gray-500">Join our network</div>
                        </div>
                      </Link>
                      <Link
                        to="/join-customer"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center">
                          <User className="h-4 w-4 text-cyan-600" />
                        </div>
                        <div>
                          <div className="font-medium">Learn More</div>
                          <div className="text-xs text-gray-500">Customer benefits</div>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
                
                {/* Company Dropdown */}
                <div className="relative group">
                  <button 
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all duration-200 font-medium"
                    onMouseEnter={() => setIsCompanyDropdownOpen(true)}
                    onMouseLeave={() => setIsCompanyDropdownOpen(false)}
                  >
                    <Building className="h-4 w-4" />
                    <span>Company</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <div 
                    className={`absolute top-full left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-200 ${
                      isCompanyDropdownOpen ? 'opacity-100 visible transform translate-y-0' : 'opacity-0 invisible transform -translate-y-2'
                    }`}
                    onMouseEnter={() => setIsCompanyDropdownOpen(true)}
                    onMouseLeave={() => setIsCompanyDropdownOpen(false)}
                  >
                    <div className="p-2">
                      <Link
                        to="/company/login"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Building className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium">Company Login</div>
                          <div className="text-xs text-gray-500">Business dashboard</div>
                        </div>
                      </Link>
                      <Link
                        to="/company/register"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Building className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium">Company Register</div>
                          <div className="text-xs text-gray-500">Join as business</div>
                        </div>
                      </Link>
                      <Link
                        to="/join-company"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-all duration-200"
                      >
                        <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                          <Building className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div>
                          <div className="font-medium">Learn More</div>
                          <div className="text-xs text-gray-500">Business benefits</div>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
                
                <Link
                  to="/subscription-plans"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200 font-medium"
                >
                  <span>Pricing</span>
                </Link>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-3 px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                  <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {user.firstName || user.companyName || 'Admin'}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">{user.userType}</div>
                  </div>
                </div>
                
                <Link
                  to={getDashboardLink()}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
                >
                  <Settings className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
                
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-xl text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-gray-100">
          <div className="px-4 pt-2 pb-3 space-y-1">
            <Link
              to="/"
              className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
              onClick={() => setIsMenuOpen(false)}
            >
              <Home className="h-5 w-5" />
              <span className="font-medium">Home</span>
            </Link>
            
            {!user ? (
              <>
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</p>
                  <Link
                    to="/customer/login"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <User className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-medium">Customer Login</div>
                      <div className="text-xs text-gray-500">Access your account</div>
                    </div>
                  </Link>
                  <Link
                    to="/customer/register"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                      <User className="h-4 w-4 text-teal-600" />
                    </div>
                    <div>
                      <div className="font-medium">Customer Register</div>
                      <div className="text-xs text-gray-500">Join our network</div>
                    </div>
                  </Link>
                  <Link
                    to="/join-customer"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center">
                      <User className="h-4 w-4 text-cyan-600" />
                    </div>
                    <div>
                      <div className="font-medium">Learn More</div>
                      <div className="text-xs text-gray-500">Customer benefits</div>
                    </div>
                  </Link>
                </div>
                
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</p>
                  <Link
                    to="/company/login"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Building className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium">Company Login</div>
                      <div className="text-xs text-gray-500">Business dashboard</div>
                    </div>
                  </Link>
                  <Link
                    to="/company/register"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Building className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">Company Register</div>
                      <div className="text-xs text-gray-500">Join as business</div>
                    </div>
                  </Link>
                  <Link
                    to="/join-company"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Building className="h-4 w-4 text-yellow-600" />
                    </div>
                    <div>
                      <div className="font-medium">Learn More</div>
                      <div className="text-xs text-gray-500">Business benefits</div>
                    </div>
                  </Link>
                </div>
                
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <Link
                    to="/subscription-plans"
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="font-medium">Pricing Plans</div>
                      <div className="text-xs text-gray-500">View subscription options</div>
                    </div>
                  </Link>
                </div>
              </>
            ) : (
              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="flex items-center space-x-3 px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {user.firstName || user.companyName || 'Admin'}
                    </div>
                    <div className="text-sm text-gray-500 capitalize">{user.userType}</div>
                  </div>
                </div>
                
                <Link
                  to={getDashboardLink()}
                  className="flex items-center space-x-3 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 mb-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Settings className="h-5 w-5" />
                  <span className="font-medium">Dashboard</span>
                </Link>
                
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 w-full"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;