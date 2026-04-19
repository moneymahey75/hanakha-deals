type AnyRecord = Record<string, unknown>;

const getResponseFromContext = (context: unknown): Response | null => {
  if (!context) return null;
  if (context instanceof Response) return context;
  if (typeof context === 'object' && context !== null) {
    const maybeResponse = (context as AnyRecord).response;
    if (maybeResponse instanceof Response) return maybeResponse;
  }
  return null;
};

export const getEdgeFunctionErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const anyError = error as AnyRecord;
  const response = getResponseFromContext(anyError.context);
  return response ? response.status : null;
};

export const isRetryableEdgeFunctionError = (error: unknown): boolean => {
  const status = getEdgeFunctionErrorStatus(error);
  if (status === null) return false;
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
};

export const extractEdgeFunctionErrorMessage = async (error: unknown): Promise<string> => {
  if (!error || typeof error !== 'object') return 'Request failed';

  const anyError = error as AnyRecord;
  const response = getResponseFromContext(anyError.context);

  if (response) {
    try {
      const cloned = typeof response.clone === 'function' ? response.clone() : response;
      const payload = await cloned.json().catch(() => null);
      if (payload && typeof payload === 'object' && 'error' in (payload as AnyRecord)) {
        const message = (payload as AnyRecord).error;
        if (typeof message === 'string' && message.trim()) return message;
      }
    } catch {
      // ignore
    }
  }

  const message = anyError.message;
  if (typeof message === 'string' && message.trim()) return message;

  return 'Request failed';
};
