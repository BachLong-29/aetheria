import { fold } from '@/libs/utils';
import type { FinanceCategory, TransactionType, Wallet } from '@/types';

export interface QuickEntryDraft {
  type: TransactionType;
  amount: number;
  walletId?: string;
  categoryId?: string;
  note: string;
}

/** Splits normalized text into comparable word tokens. */
function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

const AMOUNT_RE = /([+-]?)(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|m|ty)?/i;

const MULTIPLIER: Record<string, number> = {
  k: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  tr: 1_000_000,
  trieu: 1_000_000,
  m: 1_000_000,
  ty: 1_000_000_000,
};

/**
 * Reads a one-line entry like "85k lunch @momo" or "+25tr lương" into a transaction draft.
 *
 * Deliberately rule-based, and deliberately a *draft*: the parse is a suggestion the user
 * confirms in the normal form, so a misread never writes a wrong number into the ledger.
 * Returns null when there's no amount to work with — everything else is optional.
 */
export function parseQuickEntry(
  input: string,
  wallets: Wallet[],
  categories: FinanceCategory[],
): QuickEntryDraft | null {
  const raw = input.trim();
  if (!raw) return null;

  const normalized = fold(raw);
  const match = AMOUNT_RE.exec(normalized);
  if (!match) return null;

  const [, sign, digits, unit] = match;
  const base = Number((digits ?? '').replace(',', '.'));
  if (!Number.isFinite(base) || base <= 0) return null;

  const amount = Math.round(base * (unit ? (MULTIPLIER[unit] ?? 1) : 1));
  if (amount <= 0) return null;

  const type: TransactionType = sign === '+' ? 'income' : 'expense';

  // Everything that isn't the amount is the description we match names against.
  const rest = normalized.replace(match[0], ' ').replace(/\s+/g, ' ').trim();

  // Match on whole words, not substrings — "an" as a token shouldn't fire inside "thanh".
  const restWords = new Set(tokenize(rest));
  const mentions = (name: string) => {
    const nameWords = tokenize(fold(name));
    if (nameWords.length === 0) return false;
    return (
      nameWords.every((w) => restWords.has(w)) ||
      nameWords.some((w) => w.length >= 2 && restWords.has(w))
    );
  };

  const wallet =
    wallets.find((w) => rest.includes(`@${fold(w.name)}`)) ?? wallets.find((w) => mentions(w.name));

  const category = categories.filter((c) => c.type === type).find((c) => mentions(c.name));

  // Keep the user's original casing/diacritics in the note, minus the amount token.
  const note = raw
    .replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
    .replace(/@\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    type,
    amount,
    walletId: wallet?.id,
    categoryId: category?.id,
    note,
  };
}
