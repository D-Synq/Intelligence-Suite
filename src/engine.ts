import * as XLSX from 'xlsx';
import type { PayoutRow, Sale, KycStatus, MasterParseResult, MasterRowPreview } from './types';

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

export type MasterEntry = {
  code: string;
  name: string;
  plan: string;
  plan_name: string;
  ifsc: string;
  kyc_status: KycStatus;
  bank_holder_name: string;
  account_number: string;
  phone: string;
};

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
  sheetMaster: Record<string, MasterEntry> = {};
  sheetLastSync: string | null = null;
  sheetSourceName: string = 'Awaiting Google Sheet sync';

  manualMaster: Record<string, MasterEntry> = {};
  manualLastSync: string | null = null;
  manualSourceName: string = 'Awaiting manual master upload';

  activeMode: 'sheet' | 'manual' = 'sheet';

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

export function normalizeHeaderKey(str: unknown): string {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./#]+/g, '');
}

export function valueFrom(row: Record<string, unknown>, names: string[], defaultValue: unknown = ''): unknown {
  const rowKeys = Object.keys(row);
  const normalizedKeysMap = new Map<string, string>();
  for (const k of rowKeys) {
    normalizedKeysMap.set(normalizeHeaderKey(k), k);
  }

  for (const name of names) {
    // 1. Direct match
    if (name in row && row[name] != null && row[name] !== '') {
      return row[name];
    }
    // 2. Normalized match
    const norm = normalizeHeaderKey(name);
    const actualKey = normalizedKeysMap.get(norm);
    if (actualKey && row[actualKey] != null && row[actualKey] !== '') {
      return row[actualKey];
    }
  }
  return defaultValue;
}

function parseRows(data: Uint8Array): Record<string, unknown>[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Spreadsheet has no worksheets.');
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

export function inspectWorkbookSheets(data: Uint8Array): string[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
  return workbook.SheetNames || [];
}

const MASTER_HEADER_ALIASES = {
  code: ['referrercode', 'referrer', 'sponsorcode', 'affiliatecode', 'usercode', 'memberid', 'affiliateid', 'code', 'id'],
  name: ['name', 'affiliatename', 'fullname', 'username', 'membername', 'sponsorname'],
  plan: ['activeplan', 'sponsorpackage', 'package', 'currentplan', 'plan', 'tier', 'packagename'],
  ifsc: ['ifsc', 'ifsccode', 'bankifsc', 'branchifsc'],
  kyc: ['kycstatus', 'kyc', 'verificationstatus', 'verification', 'kycstate'],
  bank_holder: ['bankholdername', 'accountholdername', 'holdername', 'beneficiaryname', 'acholdername', 'bankholder'],
  account_number: ['accountnumber', 'accountno', 'accno', 'acno', 'bankaccountnumber', 'bankaccountno', 'account'],
  phone: ['phone', 'phoneno', 'mobile', 'mobileno', 'contact', 'phonenumber', 'contactnumber', 'mobilenumber', 'telephone'],
};

export function parseMasterWorkbook(
  data: Uint8Array,
  fileName: string,
  fileSizeBytes: number,
  sheetName?: string,
): MasterParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
  } catch (err) {
    throw new Error(`Failed to read Excel workbook: ${err instanceof Error ? err.message : 'Invalid or corrupted file'}`);
  }

  const sheets = workbook.SheetNames || [];
  if (sheets.length === 0) {
    throw new Error('Workbook contains no sheets.');
  }

  const targetSheetName = (sheetName && sheets.includes(sheetName)) ? sheetName : sheets[0];
  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${targetSheetName}" not found in workbook.`);
  }

  // Parse raw 2D array to accurately detect header row if preceded by blank or title rows
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
  if (!rawMatrix || rawMatrix.length === 0) {
    throw new Error(`Sheet "${targetSheetName}" is empty.`);
  }

  // Find header row: look for row that contains candidate keywords
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
    const row = rawMatrix[i];
    if (Array.isArray(row)) {
      const rowNorm = row.map((cell) => normalizeHeaderKey(cell));
      const hasCode = rowNorm.some((c) => MASTER_HEADER_ALIASES.code.includes(c));
      const hasName = rowNorm.some((c) => MASTER_HEADER_ALIASES.name.includes(c));
      const hasPlan = rowNorm.some((c) => MASTER_HEADER_ALIASES.plan.includes(c));
      const hasIfsc = rowNorm.some((c) => MASTER_HEADER_ALIASES.ifsc.includes(c));
      if (hasCode || (hasName && hasPlan) || (hasName && hasIfsc)) {
        headerRowIndex = i;
        break;
      }
    }
  }

  // Parse rows starting from detected header
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: headerRowIndex,
    defval: '',
    raw: false,
  });

  const rawHeaders = rows.length > 0
    ? Object.keys(rows[0])
    : (Array.isArray(rawMatrix[headerRowIndex]) ? rawMatrix[headerRowIndex].map(String) : []);

  const detectedHeaders = rawHeaders.map((h) => String(h).trim()).filter(Boolean);

  // Check required columns (Referrer Code is mandatory for indexing)
  const normalizedHeaders = detectedHeaders.map((h) => normalizeHeaderKey(h));
  const hasReferrerCode = normalizedHeaders.some((h) => MASTER_HEADER_ALIASES.code.includes(h));
  const missingRequiredColumns: string[] = [];
  if (!hasReferrerCode) {
    missingRequiredColumns.push('Referrer Code (or Sponsor Code / Affiliate ID)');
  }

  const parsedEntries: Record<string, MasterRowPreview> = {};
  let validCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    // Check if entire row is empty
    const values = Object.values(row).map((v) => String(v ?? '').trim()).filter(Boolean);
    if (values.length === 0) continue;

    const rawCodeVal = valueFrom(row, ['Referrer Code', 'Referrer', 'Sponsor Referral Code', 'Sponsor Code', 'Affiliate Code', 'User Code', 'Member ID', 'Affiliate ID', 'Code', 'ID'], '');
    const rawCode = String(rawCodeVal ?? '').trim().toUpperCase();

    if (!rawCode || rawCode === 'NAN' || rawCode === 'NULL' || rawCode === 'UNDEFINED') {
      rejectedCount++;
      continue;
    }

    const planVal = valueFrom(row, ['Active Plan', 'Sponsor Package', 'Package', 'Current Plan', 'Plan', 'Tier', 'Package Name'], 'supreme');
    const plan = packageKey(planVal);

    const ifscVal = valueFrom(row, ['IFSC', 'IFSC Code', 'Bank IFSC', 'Branch IFSC'], '');
    const ifsc = String(ifscVal ?? '').trim().toUpperCase();

    const nameVal = valueFrom(row, ['Name', 'Affiliate Name', 'Full Name', 'User Name', 'Member Name', 'Sponsor Name'], rawCode);
    const name = String(nameVal ?? rawCode).trim();

    const kycVal = valueFrom(row, ['KYC Status', 'KYC', 'Kyc Status', 'Verification Status', 'Verification', 'KYC State'], 'Unknown');
    const kyc_status = parseKycStatus(kycVal);

    const bankHolderVal = valueFrom(row, ['Bank Holder Name', 'Account Holder Name', 'Holder Name', 'Beneficiary Name', 'A/C Holder Name', 'Bank Holder'], name);
    const bank_holder_name = String(bankHolderVal ?? name).trim();

    // Preserve leading zeros in account number & phone
    const accVal = valueFrom(row, ['Account Number', 'Acc No', 'Account No', 'A/C No', 'Bank Account Number', 'Bank Account No', 'Account'], '');
    const account_number = String(accVal ?? '').trim();

    const phoneVal = valueFrom(row, ['Phone', 'Phone No', 'Mobile', 'Mobile No', 'Contact', 'Phone Number', 'Contact Number', 'Mobile Number'], '');
    const phone = String(phoneVal ?? '').trim();

    parsedEntries[rawCode] = {
      code: rawCode,
      name: name || rawCode,
      plan,
      plan_name: PACKAGES[plan]?.name ?? 'Supreme Package',
      ifsc,
      kyc_status,
      bank_holder_name: bank_holder_name || name || rawCode,
      account_number,
      phone,
    };
    validCount++;
  }

  const previewRows = Object.values(parsedEntries).slice(0, 10);

  return {
    fileName,
    fileSizeBytes,
    sheets,
    selectedSheet: targetSheetName,
    detectedHeaders,
    validCount,
    rejectedCount,
    missingRequiredColumns,
    previewRows,
    parsedEntries,
  };
}

function indexMaster(
  rowsOrEntries: Record<string, unknown>[] | Record<string, MasterEntry>,
  sourceName: string,
  mode: 'sheet' | 'manual' = 'sheet',
): number {
  let master: Record<string, MasterEntry> = {};

  if (!Array.isArray(rowsOrEntries)) {
    // Already pre-parsed entries
    master = { ...rowsOrEntries };
  } else {
    for (const row of rowsOrEntries) {
      const rawCode = String(
        valueFrom(
          row,
          ['Referrer Code', 'Referrer', 'Sponsor Referral Code', 'Sponsor Code', 'Affiliate Code', 'User Code', 'Member ID', 'Affiliate ID', 'Code', 'ID'],
          '',
        ),
      ).trim().toUpperCase();

      if (!rawCode || rawCode === 'NAN' || rawCode === 'NULL') continue;
      const plan = packageKey(valueFrom(row, ['Active Plan', 'Sponsor Package', 'Package', 'Current Plan', 'Plan', 'Tier', 'Package Name'], 'supreme'));
      const ifsc = String(valueFrom(row, ['IFSC', 'IFSC Code', 'Bank IFSC', 'Branch IFSC'], '')).trim().toUpperCase();
      const name = String(valueFrom(row, ['Name', 'Affiliate Name', 'Full Name', 'User Name', 'Member Name', 'Sponsor Name'], rawCode)).trim();
      master[rawCode] = {
        code: rawCode,
        name: name || rawCode,
        plan,
        plan_name: PACKAGES[plan]?.name ?? 'Supreme Package',
        ifsc,
        kyc_status: parseKycStatus(valueFrom(row, ['KYC Status', 'KYC', 'Kyc Status', 'Verification Status', 'Verification', 'KYC State'], 'Unknown')),
        bank_holder_name: String(valueFrom(row, ['Bank Holder Name', 'Account Holder Name', 'Holder Name', 'Beneficiary Name', 'A/C Holder Name'], name || rawCode)).trim(),
        account_number: String(valueFrom(row, ['Account Number', 'Acc No', 'Account No', 'A/C No', 'Bank Account Number', 'Bank Account No', 'Account'], '')).trim(),
        phone: String(valueFrom(row, ['Phone', 'Phone No', 'Mobile', 'Mobile No', 'Contact', 'Phone Number', 'Contact Number', 'Mobile Number'], '')).trim(),
      };
    }
  }

  const syncTime = new Date().toISOString();
  if (mode === 'sheet') {
    state.sheetMaster = master;
    state.sheetLastSync = syncTime;
    state.sheetSourceName = sourceName;
  } else {
    state.manualMaster = master;
    state.manualLastSync = syncTime;
    state.manualSourceName = sourceName;
  }

  if (state.activeMode === mode) {
    state.master = master;
    state.lastSync = syncTime;
    state.sourceName = sourceName;
    state.itemized = [];
    state.summary = [];
  }
  return Object.keys(master).length;
}

function setActiveMode(mode: 'sheet' | 'manual'): { active_affiliates: number; last_sync: string | null; is_indexed: boolean } {
  state.activeMode = mode;
  state.itemized = [];
  state.summary = [];

  if (mode === 'manual') {
    // Strictly isolate: do not use Google Sheet live data
    state.master = { ...state.manualMaster };
    state.lastSync = state.manualLastSync;
    state.sourceName = state.manualSourceName;
    const count = Object.keys(state.manualMaster).length;
    return {
      active_affiliates: count,
      last_sync: state.manualLastSync,
      is_indexed: count > 0,
    };
  } else {
    state.master = { ...state.sheetMaster };
    state.lastSync = state.sheetLastSync;
    state.sourceName = state.sheetSourceName;
    const count = Object.keys(state.sheetMaster).length;
    return {
      active_affiliates: count,
      last_sync: state.sheetLastSync,
      is_indexed: count > 0,
    };
  }
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
  setActiveMode,
  calculateSales,
  parseRows,
  parseMasterWorkbook,
  inspectWorkbookSheets,
  normalizeHeaderKey,
};
