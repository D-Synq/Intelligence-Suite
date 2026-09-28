import * as XLSX from 'xlsx';
import type { PayoutRow, Sale, KycStatus } from './types';

type PackageInfo = { name: string; rank: number; commission: number };

const PACKAGES: Record<string, PackageInfo> = {
  lite: { name: 'Lite Package', rank: 1, commission: 800 },
  basic: { name: 'Basic Package', rank: 2, commission: 2000 },
  mid: { name: 'Mid Package', rank: 3, commission: 4000 },
  advance: { name: 'Advance Package', rank: 4, commission: 6000 },
  supreme: { name: 'Supreme Package', rank: 5, commission: 10500 },
};

const PLAN_ALIASES: Record<string, string> = {
  'lite package': 'lite', lite: 'lite',
  'basic package': 'basic', basic: 'basic',
  'mid package': 'mid', mid: 'mid',
  'advance package': 'advance', advance: 'advance',
  'supreme package': 'supreme', supreme: 'supreme',
};

const NEW_PLANS: Record<number, [string, number]> = {
  1499: ['lite', 800], 3499: ['basic', 2000], 5999: ['mid', 4000],
  8999: ['advance', 6000], 15999: ['supreme', 10500],
};

const UPGRADES: Record<number, [string, string, number]> = {
  2000: ['lite', 'basic', 1200], 4500: ['lite', 'mid', 3200], 7500: ['lite', 'advance', 5200],
  14500: ['lite', 'supreme', 9700], 2500: ['basic', 'mid', 2000], 5500: ['basic', 'advance', 4000],
  12500: ['basic', 'supreme', 8500], 3000: ['mid', 'advance', 2000], 10000: ['mid', 'supreme', 6500],
  7000: ['advance', 'supreme', 4500],
};

type MasterEntry = { code: string; name: string; plan: string; plan_name: string; ifsc: string; kyc_status: KycStatus; bank_holder_name: string; account_number: string; phone: string };

const KYC_PRIORITY: Record<KycStatus, number> = {
  'Not Fill': 0,
  'Rejected': 1,
  'Pending': 2,
  'Unknown': 3,
  'Verified': 4,
};

function parseKycStatus(value: unknown): KycStatus {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'Unknown';
  if (raw === 'verified' || raw === 'approved' || raw === 'complete') return 'Verified';
  if (raw === 'pending' || raw === 'in review' || raw === 'under review') return 'Pending';
  if (raw === 'not fill' || raw === 'not filled' || raw === 'notfill') return 'Not Fill';
  if (raw === 'rejected' || raw === 'declined') return 'Rejected';
  return 'Unknown';
}

class EngineState {
  master: Record<string, MasterEntry> = {};
  itemized: Sale[] = [];
  summary: PayoutRow[] = [];
  lastSync: string | null = null;
  sourceName = 'Awaiting master data';
}

const state = new EngineState();

function packageKey(value: unknown): string {
  const key = String(value ?? '').trim().toLowerCase();
  return PLAN_ALIASES[key] ?? 'supreme';
}

function valueFrom(row: Record<string, unknown>, names: string[], defaultValue: unknown = ''): unknown {
  for (const name of names) {
    if (name in row && row[name] != null && row[name] !== '') return row[name];
  }
  return defaultValue;
}

function parseRows(data: Uint8Array): Record<string, unknown>[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

function indexMaster(rows: Record<string, unknown>[], sourceName: string): number {
  const master: Record<string, MasterEntry> = {};
  for (const row of rows) {
    const rawCode = String(valueFrom(row, ['Referrer Code'], '')).trim().toUpperCase();
    if (!rawCode || rawCode === 'NAN') continue;
    const plan = packageKey(valueFrom(row, ['Active Plan', 'Sponsor Package'], 'supreme'));
    const ifsc = String(valueFrom(row, ['IFSC', 'IFSC Code'], '')).trim().toUpperCase();
    master[rawCode] = {
      code: rawCode,
      name: String(valueFrom(row, ['Name', 'Affiliate Name'], rawCode)).trim(),
      plan,
      plan_name: PACKAGES[plan].name,
      ifsc,
      kyc_status: parseKycStatus(valueFrom(row, ['KYC Status', 'KYC', 'Kyc Status', 'Verification Status'], 'Unknown')),
      bank_holder_name: String(valueFrom(row, ['Bank Holder Name', 'Account Holder Name', 'Holder Name', 'Beneficiary Name', 'A/C Holder Name'], '')).trim(),
      account_number: String(valueFrom(row, ['Account Number', 'Acc No', 'Account No', 'A/C No', 'Bank Account Number'], '')).trim(),
      phone: String(valueFrom(row, ['Phone', 'Phone No', 'Mobile', 'Mobile No', 'Contact', 'Phone Number'], '')).trim(),
    };
  }
  state.master = master;
  state.lastSync = new Date().toISOString();
  state.sourceName = sourceName;
  state.itemized = [];
  state.summary = [];
  return Object.keys(master).length;
}

function calculateSales(rows: Record<string, unknown>[]): PayoutRow[] {
  const grouped: Record<string, Sale[]> = {};
  const ifscFromRows: Record<string, string> = {};
  rows.forEach((row, index) => {
    const amount = Number(valueFrom(row, ['Total Amount'], 0)) || 0;
    const amountKey = Math.round(amount);
    const sponsorCode = String(valueFrom(row, ['Sponsor Referral Code', 'Sponsor Code', 'Referrer Code'], '')).trim().toUpperCase();
    if (!sponsorCode || sponsorCode === 'NAN') return;
    const sponsor = state.master[sponsorCode] ?? ({ ifsc: '' } as MasterEntry);
    const rowIfsc = String(valueFrom(row, ['IFSC', 'IFSC Code'], sponsor.ifsc ?? '')).trim().toUpperCase();
    if (rowIfsc) ifscFromRows[sponsorCode] = rowIfsc;
    const ownedKey = sponsor.plan ?? packageKey(valueFrom(row, ['Sponsor Package', 'Active Plan'], 'supreme'));
    const owned = PACKAGES[ownedKey] ?? PACKAGES.supreme;
    let saleType: 'New Plan' | 'Upgrade' = 'New Plan';
    let fromPlan = '';
    let targetPlan = '';
    let commission = 0;
    if (amountKey in NEW_PLANS) {
      [targetPlan, commission] = NEW_PLANS[amountKey];
      commission = Math.min(commission, owned.commission);
    } else if (amountKey in UPGRADES) {
      [fromPlan, targetPlan, commission] = UPGRADES[amountKey];
      saleType = 'Upgrade';
      const fromCommission = PACKAGES[fromPlan].commission;
      commission = owned.rank >= PACKAGES[targetPlan].rank
        ? commission
        : Math.max(0, owned.commission - fromCommission);
    } else {
      return;
    }
    if (!grouped[sponsorCode]) grouped[sponsorCode] = [];
    grouped[sponsorCode].push({
      id: `sale-${index}-${sponsorCode}`,
      type: saleType,
      amount,
      target_plan: PACKAGES[targetPlan].name,
      from_plan: fromPlan ? PACKAGES[fromPlan].name : '',
      commission: Math.round(commission * 100) / 100,
      buyer: String(valueFrom(row, ['Customer Name', 'Name', 'Buyer Name'], 'Direct sale')),
    });
  });

  const summary: PayoutRow[] = [];
  const itemized: Sale[] = [];
  for (const [code, sales] of Object.entries(grouped)) {
    const sponsor = state.master[code] ?? { name: 'Unverified Sponsor', plan: 'supreme', plan_name: 'Not in master data', ifsc: '', kyc_status: 'Unknown', bank_holder_name: '', account_number: '', phone: '' } as MasterEntry;
    const gross = Math.round(sales.reduce((sum, sale) => sum + sale.commission, 0) * 100) / 100;
    const tds = Math.round(gross * 0.02 * 100) / 100;
    const rowIfsc = (ifscFromRows[code] || sponsor.ifsc || '').trim().toUpperCase();
    summary.push({
      code,
      name: sponsor.name,
      plan: sponsor.plan_name,
      plan_key: sponsor.plan,
      new_count: sales.filter((sale) => sale.type === 'New Plan').length,
      upgrade_count: sales.filter((sale) => sale.type === 'Upgrade').length,
      sales_count: sales.length,
      gross,
      tds,
      net: Math.round((gross - tds) * 100) / 100,
      sales,
      ifsc: rowIfsc || undefined,
      kyc_status: sponsor.kyc_status,
      bank_holder_name: sponsor.bank_holder_name || sponsor.name,
      account_number: sponsor.account_number,
      phone: sponsor.phone,
    });
    for (const sale of sales) {
      itemized.push({ ...sale, id: `${code}-${sale.id}` });
    }
  }
  state.itemized = itemized;
  state.summary = summary.sort((a, b) => {
    const kycDiff = KYC_PRIORITY[a.kyc_status] - KYC_PRIORITY[b.kyc_status];
    if (kycDiff !== 0) return kycDiff;
    return b.net - a.net;
  });
  return state.summary;
}

export const engine = {
  state,
  indexMaster,
  calculateSales,
  parseRows,
};
