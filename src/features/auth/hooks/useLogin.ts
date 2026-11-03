'use client';

import { useMutation } from '@tanstack/react-query';

import { useRouter } from '@/i18n/navigation';

import { apiClient } from '@/libs/axios';
import { setTokens } from '@/libs/axios/instance';
import type { ApiResponse, AuthSession } from '@/types';

import { useAuthStore } from '../stores/auth.store';
import type { LoginFormValues } from '../schemas';
import { getCallbackUrl } from '../utils';

async function login(credentials: LoginFormValues): Promise<ApiResponse<AuthSession>> {
  const { data } = await apiClient.post<ApiResponse<AuthSession>>('/auth/login', credentials);
  return data;
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      const { user, tokens } = data.data;
      setTokens(tokens.accessToken, tokens.refreshToken);
      setUser(user);
      router.push(getCallbackUrl());
    },
  });
}
