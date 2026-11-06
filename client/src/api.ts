const TOKEN_KEY = 'roster-dashboard.token.v2';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void): void => {
  onUnauthorized = handler;
};

export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null): void => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const api = async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Pastikan backend berjalan.', 0);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Login yang salah juga 401; handler hanya relevan jika sudah punya sesi.
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(data?.message ?? 'Terjadi kesalahan pada server.', response.status);
  }
  return data as T;
};

