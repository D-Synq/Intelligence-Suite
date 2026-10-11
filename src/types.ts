import type { IfscResult } from './ifsc';
export type { IfscResult } from './ifsc';
export type { BatchIfscStatus, BatchIfscRow } from './ifsc';

export type Sale = {
  id: string;
  type: 'New Plan' | 'Upgrade';
  amount: number;
  target_plan: string;
  from_plan: string;
  commission: number;
  buyer: string;
};

export type KycStatus = 'Verified' | 'Pending' | 'Not Fill' | 'Rejected' | 'Unknown';

export type PayoutRow = {
  code: string;
  name: string;
  plan: string;
  plan_key: string;
  new_count: number;
  upgrade_count: number;
  sales_count: number;
  gross: number;
  tds: number;
  net: number;
  sales: Sale[];
  ifsc?: string;
  ifscResult?: IfscResult;
  kyc_status: KycStatus;
  bank_holder_name: string;
  account_number: string;
  phone: string;
};

export type Kpis = {
  gross: number;
  tds: number;
  net: number;
  sales_count: number;
  active_paid_sponsors: number;
};

export type ProcessResponse = {
  rows: PayoutRow[];
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  kpis: Kpis;
};

export type SyncResponse = {
  active_affiliates: number;
  last_sync: string;
  source: string;
};

export type MasterRowPreview = {
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

export type MasterParseResult = {
  fileName: string;
  fileSizeBytes: number;
  sheets: string[];
  selectedSheet: string;
  detectedHeaders: string[];
  validCount: number;
  rejectedCount: number;
  missingRequiredColumns: string[];
  previewRows: MasterRowPreview[];
  parsedEntries: Record<string, MasterRowPreview>;
};
