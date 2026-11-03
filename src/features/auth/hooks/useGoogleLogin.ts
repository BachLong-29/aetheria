'use client';

import { useMutation } from '@tanstack/react-query';

import { useRouter } from '@/i18n/navigation';

import { apiClient } from '@/libs/axios';
import { setTokens } from '@/libs/axios/instance';
import type { ApiResponse, AuthSession } from '@/types';

import { useAuthStore } from '../stores/auth.store';
import { getCallbackUrl } from '../utils';

async function loginWithGoogle(credential: string): Promise<ApiResponse<AuthSession>> {
  const { data } = await apiClient.post<ApiResponse<AuthSession>>('/auth/google', { credential });
  return data;
}

export function useGoogleLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: loginWithGoogle,
    onSuccess: (data) => {
      const { user, tokens } = data.data;
      setTokens(tokens.accessToken, tokens.refreshToken);
      setUser(user);
      router.push(getCallbackUrl());
    },
  });
}
