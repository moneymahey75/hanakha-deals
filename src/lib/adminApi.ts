type AdminApiResponse<T> = {
  success: boolean;
  error?: string;
  data?: T;
};

const getAdminSessionToken = (): string | null => {
  const directToken = sessionStorage.getItem('admin_session_token');
  if (directToken) return directToken;
  const sessionData = sessionStorage.getItem('admin_session_data');
  if (!sessionData) return null;
  try {
    const parsed = JSON.parse(sessionData);
    return parsed?.sessionToken || null;
  } catch {
    return null;
  }
};

export const adminApi = {
  async post<T = any>(path: string, body?: Record<string, any>): Promise<T> {
    const token = getAdminSessionToken();
    if (!token) {
      throw new Error('Admin session not found');
    }

    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${baseUrl}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'X-Admin-Session': token
      },
      body: JSON.stringify(body || {})
    });

    const result = (await response.json()) as AdminApiResponse<T>;
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || 'Request failed');
    }
    return (result.data ?? result) as T;
  }
};
