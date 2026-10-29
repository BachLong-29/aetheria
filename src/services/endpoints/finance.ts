import { apiClient } from '@/libs/axios';
import type {
  ApiResponse,
  Wallet,
  CreateWalletPayload,
  UpdateWalletPayload,
  FinanceCategory,
  CategoryDeleteCheck,
  CreateFinanceCategoryPayload,
  UpdateFinanceCategoryPayload,
  Transaction,
  CreateTransactionPayload,
  UpdateTransactionPayload,
  TransactionFilters,
  SepayStatus,
  SepayKeyResult,
  Budget,
  CreateBudgetPayload,
  ImportBudgetsPayload,
  ImportBudgetsResult,
  UpdateBudgetPayload,
  FinanceOverview,
  FinanceGoal,
  CreateFinanceGoalPayload,
  UpdateFinanceGoalPayload,
  CreateContributionPayload,
  GoalContribution,
  BalanceForecast,
  GoldPriceResponse,
  GoldAccount,
  UpdateGoldAccountPayload,
  TransactionPreset,
  CreateTransactionPresetPayload,
  UpdateTransactionPresetPayload,
} from '@/types';

function toQueryString(filters?: TransactionFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.walletId) params.set('walletId', filters.walletId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.type) params.set('type', filters.type);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const financeEndpoints = {
  listWallets: () => apiClient.get<ApiResponse<Wallet[]>>('/finance/wallets'),

  createWallet: (payload: CreateWalletPayload) =>
    apiClient.post<ApiResponse<Wallet>>('/finance/wallets', payload),

  updateWallet: (id: string, payload: UpdateWalletPayload) =>
    apiClient.patch<ApiResponse<Wallet>>(`/finance/wallets/${id}`, payload),

  removeWallet: (id: string) => apiClient.delete<ApiResponse<null>>(`/finance/wallets/${id}`),

  listPresets: () => apiClient.get<ApiResponse<TransactionPreset[]>>('/finance/presets'),

  createPreset: (payload: CreateTransactionPresetPayload) =>
    apiClient.post<ApiResponse<TransactionPreset>>('/finance/presets', payload),

  updatePreset: (id: string, payload: UpdateTransactionPresetPayload) =>
    apiClient.patch<ApiResponse<TransactionPreset>>(`/finance/presets/${id}`, payload),

  removePreset: (id: string) => apiClient.delete<ApiResponse<null>>(`/finance/presets/${id}`),

  getSepayStatus: (walletId: string) =>
    apiClient.get<ApiResponse<SepayStatus>>(`/finance/wallets/${walletId}/sepay`),

  generateSepayKey: (walletId: string) =>
    apiClient.patch<ApiResponse<SepayKeyResult>>(`/finance/wallets/${walletId}/sepay`),

  listCategories: (type?: 'income' | 'expense') =>
    apiClient.get<ApiResponse<FinanceCategory[]>>(
      `/finance/categories${type ? `?type=${type}` : ''}`,
    ),

  createCategory: (payload: CreateFinanceCategoryPayload) =>
    apiClient.post<ApiResponse<FinanceCategory>>('/finance/categories', payload),

  updateCategory: (id: string, payload: UpdateFinanceCategoryPayload) =>
    apiClient.patch<ApiResponse<FinanceCategory>>(`/finance/categories/${id}`, payload),

  removeCategory: (id: string) => apiClient.delete<ApiResponse<null>>(`/finance/categories/${id}`),

  checkCategoryDelete: (id: string) =>
    apiClient.delete<ApiResponse<CategoryDeleteCheck>>(`/finance/categories/${id}`, {
      params: { dryRun: true },
    }),

  listTransactions: (filters?: TransactionFilters) =>
    apiClient.get<ApiResponse<Transaction[]>>(`/finance/transactions${toQueryString(filters)}`),

  createTransaction: (payload: CreateTransactionPayload) =>
    apiClient.post<ApiResponse<Transaction>>('/finance/transactions', payload),

  updateTransaction: (id: string, payload: UpdateTransactionPayload) =>
    apiClient.patch<ApiResponse<Transaction>>(`/finance/transactions/${id}`, payload),

  removeTransaction: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/finance/transactions/${id}`),

  listBudgets: (month: string) =>
    apiClient.get<ApiResponse<Budget[]>>(`/finance/budgets?month=${month}`),

  createBudget: (payload: CreateBudgetPayload) =>
    apiClient.post<ApiResponse<Budget>>('/finance/budgets', payload),

  updateBudget: (id: string, payload: UpdateBudgetPayload) =>
    apiClient.patch<ApiResponse<Budget>>(`/finance/budgets/${id}`, payload),

  removeBudget: (id: string) => apiClient.delete<ApiResponse<null>>(`/finance/budgets/${id}`),

  importBudgets: (payload: ImportBudgetsPayload) =>
    apiClient.post<ApiResponse<ImportBudgetsResult>>('/finance/budgets/import', payload),

  listGoals: (month: string, today: string) =>
    apiClient.get<ApiResponse<FinanceGoal[]>>(`/finance/goals?month=${month}&today=${today}`),

  createGoal: (payload: CreateFinanceGoalPayload) =>
    apiClient.post<ApiResponse<FinanceGoal>>('/finance/goals', payload),

  updateGoal: (id: string, payload: UpdateFinanceGoalPayload) =>
    apiClient.patch<ApiResponse<FinanceGoal>>(`/finance/goals/${id}`, payload),

  removeGoal: (id: string) => apiClient.delete<ApiResponse<null>>(`/finance/goals/${id}`),

  listContributions: (goalId: string) =>
    apiClient.get<ApiResponse<GoalContribution[]>>(`/finance/goals/${goalId}/contributions`),

  addContribution: (goalId: string, payload: CreateContributionPayload) =>
    apiClient.post<ApiResponse<FinanceGoal>>(`/finance/goals/${goalId}/contributions`, payload),

  getForecast: (today: string) =>
    apiClient.get<ApiResponse<BalanceForecast>>(`/finance/forecast?today=${today}`),

  getOverview: (month: string, today: string) =>
    apiClient.get<ApiResponse<FinanceOverview>>(`/finance/overview?month=${month}&today=${today}`),

  getGoldPrice: () => apiClient.get<ApiResponse<GoldPriceResponse>>('/finance/gold/price'),

  getGoldAccount: () => apiClient.get<ApiResponse<GoldAccount>>('/finance/gold/account'),

  updateGoldAccount: (payload: UpdateGoldAccountPayload) =>
    apiClient.patch<ApiResponse<GoldAccount>>('/finance/gold/account', payload),
};
