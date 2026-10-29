import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { clientEnv } from '@/configs/env';
import { TOKEN_KEYS, TOKEN_MAX_AGE } from '@/constants/auth';
import { deleteCookie, getCookie, setCookie } from '@/libs/cookies';
import { useRewardStore } from '@/stores/reward.store';
import type { ProgressReward } from '@/types';

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: string) => void; reject: (error: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  failedQueue = [];
}

function getAccessToken(): string | null {
  return getCookie(TOKEN_KEYS.ACCESS);
}

function getRefreshToken(): string | null {
  return getCookie(TOKEN_KEYS.REFRESH);
}

export function setTokens(access: string, refresh: string) {
  setCookie(TOKEN_KEYS.ACCESS, access, { maxAge: TOKEN_MAX_AGE.ACCESS });
  setCookie(TOKEN_KEYS.REFRESH, refresh, { maxAge: TOKEN_MAX_AGE.REFRESH });
}

export function clearTokens() {
  deleteCookie(TOKEN_KEYS.ACCESS);
  deleteCookie(TOKEN_KEYS.REFRESH);
}

export function createApiClient(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL ?? clientEnv.NEXT_PUBLIC_API_URL,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      // The API pays xp and coins when something is finished and says so in that response.
      const reward = (response.data as { data?: { reward?: ProgressReward } } | undefined)?.data
        ?.reward;
      if (reward) useRewardStore.getState().announce(reward);
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return instance(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        try {
          const { data } = await axios.post(`${clientEnv.NEXT_PUBLIC_API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefresh } = data.data;
          setTokens(accessToken, newRefresh);
          processQueue(null, accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return instance(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    },
  );

  return instance;
}

export const apiClient = createApiClient();
