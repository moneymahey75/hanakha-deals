// API client for communicating with Node.js backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Debug logging in development
if (import.meta.env.DEV) {
  console.log('🔗 API Base URL:', API_BASE_URL);
  console.log('🔗 Environment VITE_API_URL:', import.meta.env.VITE_API_URL);
}

class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.loadToken();
  }

  private loadToken() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  private saveToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      this.token = token;
    }
  }

  private removeToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      this.token = null;
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error(`❌ API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Auth methods
  async login(emailOrUsername: string, password: string, userType: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername, password, userType }),
    });

    if (data.success && data.data.token) {
      this.saveToken(data.data.token);
    }

    return data;
  }

  async registerCustomer(userData: any) {
    const data = await this.request('/auth/register/customer', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (data.success && data.data.token) {
      this.saveToken(data.data.token);
    }

    return data;
  }

  async registerCompany(userData: any) {
    const data = await this.request('/auth/register/company', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (data.success && data.data.token) {
      this.saveToken(data.data.token);
    }

    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      this.removeToken();
    }
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async forgotPassword(email: string) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // OTP methods
  async sendOTP(userId: string, contactInfo: string, otpType: 'email' | 'mobile') {
    return this.request('/otp/send', {
      method: 'POST',
      body: JSON.stringify({ userId, contactInfo, otpType }),
    });
  }

  async verifyOTP(userId: string, otpCode: string, otpType: 'email' | 'mobile') {
    return this.request('/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ userId, otpCode, otpType }),
    });
  }

  // User methods
  async getUserProfile(userId: string) {
    return this.request(`/users/${userId}/profile`);
  }

  async updateUserProfile(userId: string, profileData: any) {
    return this.request(`/users/${userId}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  // Subscription methods
  async getSubscriptionPlans() {
    return this.request('/subscriptions/plans');
  }

  async createSubscription(planId: string, paymentData: any) {
    return this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planId, paymentData }),
    });
  }

  async getUserSubscriptions(userId: string) {
    return this.request(`/subscriptions/user/${userId}`);
  }

  // Payment methods
  async getPaymentHistory(userId: string) {
    return this.request(`/payments/user/${userId}`);
  }

  async createPayment(paymentData: any) {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  // MLM methods
  async getMLMTreeStructure(userId: string, maxLevels: number = 5) {
    return this.request(`/mlm/tree/${userId}?maxLevels=${maxLevels}`);
  }

  async getTreeStatistics(userId: string) {
    return this.request(`/mlm/stats/${userId}`);
  }

  async addUserToMLMTree(userId: string, sponsorshipNumber: string, sponsorSponsorshipNumber: string) {
    return this.request('/mlm/add-user', {
      method: 'POST',
      body: JSON.stringify({ userId, sponsorshipNumber, sponsorSponsorshipNumber }),
    });
  }

  // Admin methods
  async adminLogin(email: string, password: string) {
    const data = await this.request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.success && data.data.token) {
      this.saveToken(data.data.token);
    }

    return data;
  }

  async getSystemSettings() {
    console.log('🔍 Making API call to get system settings...');
    return this.request('/admin/settings');
  }

  async updateSystemSettings(settings: any) {
    return this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async getSubAdmins() {
    return this.request('/admin/sub-admins');
  }

  async createSubAdmin(data: any) {
    return this.request('/admin/sub-admins', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubAdmin(id: string, data: any) {
    return this.request(`/admin/sub-admins/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSubAdmin(id: string) {
    return this.request(`/admin/sub-admins/${id}`, {
      method: 'DELETE',
    });
  }

  async resetSubAdminPassword(id: string) {
    return this.request(`/admin/sub-admins/${id}/reset-password`, {
      method: 'POST',
    });
  }

  // Company methods
  async getCompanies(filters: any = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return this.request(`/companies${queryParams ? `?${queryParams}` : ''}`);
  }

  async updateCompanyStatus(companyId: string, status: string) {
    return this.request(`/companies/${companyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // Coupon methods
  async getCoupons(filters: any = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return this.request(`/coupons${queryParams ? `?${queryParams}` : ''}`);
  }

  async createCoupon(couponData: any) {
    return this.request('/coupons', {
      method: 'POST',
      body: JSON.stringify(couponData),
    });
  }

  async updateCoupon(couponId: string, couponData: any) {
    return this.request(`/coupons/${couponId}`, {
      method: 'PUT',
      body: JSON.stringify(couponData),
    });
  }

  async deleteCoupon(couponId: string) {
    return this.request(`/coupons/${couponId}`, {
      method: 'DELETE',
    });
  }

  // Task methods
  async getDailyTasks(date: string) {
    return this.request(`/tasks/daily?date=${date}`);
  }

  async createDailyTask(taskData: any) {
    return this.request('/tasks/daily', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  async updateDailyTask(taskId: string, taskData: any) {
    return this.request(`/tasks/daily/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
  }

  async deleteDailyTask(taskId: string) {
    return this.request(`/tasks/daily/${taskId}`, {
      method: 'DELETE',
    });
  }

  // Wallet methods
  async getUserWallet(userId: string) {
    return this.request(`/wallets/user/${userId}`);
  }

  async getWalletTransactions(userId: string) {
    return this.request(`/wallets/user/${userId}/transactions`);
  }

  async createWalletTransaction(transactionData: any) {
    return this.request('/wallets/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  // Utility methods
  isAuthenticated() {
    return !!this.token;
  }

  getToken() {
    return this.token;
  }

  setToken(token: string) {
    this.saveToken(token);
  }

  clearToken() {
    this.removeToken();
  }
}

// Create singleton instance
export const apiClient = new APIClient(API_BASE_URL);

// Export for use in components
export default apiClient;