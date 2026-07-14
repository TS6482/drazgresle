// Net-worth aggregation — pure functions over accounts + snapshots. Money is
// integer halere. Liability balances are stored as a POSITIVE amount owed; this
// module subtracts them when computing net worth (assets − liabilities).

import type { Account, Snapshot } from '../types/data';

/** The six buckets shown in the composition chart / account list. */
export type AssetClass =
  | 'bank'
  | 'investments'
  | 'pensions'
  | 'property'
  | 'otherAssets'
  | 'liabilities';

/** The five asset buckets (everything except liabilities). */
export const ASSET_CLASSES: readonly AssetClass[] = [
  'bank',
  'investments',
  'pensions',
  'property',
  'otherAssets',
];

/** Map an account to its net-worth bucket. */
export function classify(account: Account): AssetClass {
  switch (account.type) {
    case 'checking':
    case 'savings':
      return 'bank';
    case 'investment':
      return 'investments';
    case 'pension':
      return 'pensions';
    case 'property':
      return 'property';
    case 'other-asset':
      return 'otherAssets';
    case 'mortgage':
    case 'family-loan':
    case 'other-liability':
      return 'liabilities';
    default: {
      // Exhaustiveness guard: adding an AccountType without a bucket is a compile error.
      const exhaustive: never = account.type;
      return exhaustive;
    }
  }
}

function emptyByClass(): Record<AssetClass, number> {
  return {
    bank: 0,
    investments: 0,
    pensions: 0,
    property: 0,
    otherAssets: 0,
    liabilities: 0,
  };
}

export interface NetWorthResult {
  /** Total per bucket in halere; `liabilities` is the positive amount owed. */
  byClass: Record<AssetClass, number>;
  /** Sum of the five asset buckets. */
  assetsTotal: number;
  /** The liabilities bucket (positive = owed). */
  liabilitiesTotal: number;
  /** assetsTotal − liabilitiesTotal (can be negative). */
  netHalere: number;
}

/**
 * Total net worth for one snapshot. Each account contributes its snapshot
 * balance (missing balances count as 0) to its bucket; liabilities are summed as
 * positive owed amounts and subtracted from the net.
 */
export function computeNetWorth(accounts: Account[], snapshot: Snapshot): NetWorthResult {
  const byClass = emptyByClass();

  for (const account of accounts) {
    const balance = snapshot.balances[account.id];
    if (balance === undefined) {
      continue;
    }
    byClass[classify(account)] += balance;
  }

  const assetsTotal = ASSET_CLASSES.reduce((sum, cls) => sum + byClass[cls], 0);
  const liabilitiesTotal = byClass.liabilities;

  return {
    byClass,
    assetsTotal,
    liabilitiesTotal,
    netHalere: assetsTotal - liabilitiesTotal,
  };
}

export interface NetWorthSeriesRow {
  date: string;
  /** Net worth (assets − liabilities) in halere. */
  net: number;
  bank: number;
  investments: number;
  pensions: number;
  property: number;
  otherAssets: number;
  /** Positive amount owed in halere (kept separate — not stacked with assets). */
  liabilities: number;
}

/**
 * One chart row per snapshot, sorted chronologically. Assets are broken out per
 * bucket for the stacked composition; liabilities travel as their own field.
 */
export function computeSeries(accounts: Account[], snapshots: Snapshot[]): NetWorthSeriesRow[] {
  return [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snapshot) => {
      const { byClass, netHalere } = computeNetWorth(accounts, snapshot);
      return {
        date: snapshot.date,
        net: netHalere,
        bank: byClass.bank,
        investments: byClass.investments,
        pensions: byClass.pensions,
        property: byClass.property,
        otherAssets: byClass.otherAssets,
        liabilities: byClass.liabilities,
      };
    });
}
