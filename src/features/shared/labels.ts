// Human-readable labels + display metadata shared by the accounts and net-worth
// screens. Colours themselves live in CSS (theme-aware custom properties); here
// we only name each series and point at its CSS variable.

import type { AccountType } from '../../types/data';
import type { AssetClass } from '../../engine/networth';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking account',
  savings: 'Savings account',
  investment: 'Investment',
  pension: 'Pension',
  property: 'Property',
  mortgage: 'Mortgage',
  'family-loan': 'Family loan',
  'other-asset': 'Other asset',
  'other-liability': 'Other liability',
};

/** Order the type picker offers — assets first, liabilities last. */
export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'checking',
  'savings',
  'investment',
  'pension',
  'property',
  'other-asset',
  'mortgage',
  'family-loan',
  'other-liability',
];

export const CLASS_LABELS: Record<AssetClass, string> = {
  bank: 'Bank',
  investments: 'Investments',
  pensions: 'Pensions',
  property: 'Property',
  otherAssets: 'Other assets',
  liabilities: 'Liabilities',
};

/** Display order the accounts list groups classes in (liabilities last). */
export const CLASS_ORDER: AssetClass[] = [
  'bank',
  'investments',
  'pensions',
  'property',
  'otherAssets',
  'liabilities',
];

export interface SeriesMeta {
  key: AssetClass;
  label: string;
  /** CSS custom property carrying the (theme-aware) series colour. */
  cssVar: string;
}

/** Five stacked asset series (fixed categorical slot order 1–5). */
export const ASSET_SERIES: SeriesMeta[] = [
  { key: 'bank', label: 'Bank', cssVar: '--series-bank' },
  { key: 'investments', label: 'Investments', cssVar: '--series-investments' },
  { key: 'pensions', label: 'Pensions', cssVar: '--series-pensions' },
  { key: 'property', label: 'Property', cssVar: '--series-property' },
  { key: 'otherAssets', label: 'Other assets', cssVar: '--series-other' },
];

/** Liabilities travel below the baseline as their own band (slot 6). */
export const LIABILITY_SERIES: SeriesMeta = {
  key: 'liabilities',
  label: 'Liabilities',
  cssVar: '--series-liabilities',
};
