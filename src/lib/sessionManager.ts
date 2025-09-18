// Session management utility for JWT tokens
export const sessionManager = {
  // Save token to localStorage
  saveToken: (token: string) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('auth_token', token);
        console.log('✅ Token saved to localStorage');
      } catch (error) {
        console.error('❌ Failed to save token:', error);
      }
    }
  },

  // Get token from localStorage
  getToken: (): string | null => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('auth_token');
      } catch (error) {
        console.error('❌ Failed to get token:', error);
        return null;
      }
    }
    return null;
  },

  // Remove token from localStorage
  clearToken: () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('auth_token');
        console.log('✅ Token cleared from localStorage');
      } catch (error) {
        console.error('❌ Failed to clear token:', error);
      }
    }
  },

  // Check if token exists
  hasToken: (): boolean => {
    return !!sessionManager.getToken();
  }
};