import { batchValidateIfsc } from './ifsc';
import { engine } from './engine';
import type { ProcessResponse, SyncResponse } from './types';
import type { Worksheet, Cell } from 'exceljs';

async function loadExcel() {
  const mod = await import('exceljs');
  return mod.default ?? mod;
}

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7clyjnFONEDvT23flDmT1DrRAxeOQJuI-wW5qbZkxI0SJGddCFwhK-rRV2HSKv_9svx44Ok9dw4p6/pub?gid=0&single=true&output=csv';

async function fetchCsvWithFallback(targetUrl: string): Promise<string> {
  const cleanUrl = targetUrl.trim() || DEFAULT_SHEET_URL;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const uncachedUrl = `${cleanUrl}${separator}_t=${Date.now()}`;

  // 1. Direct fetch
  try {
    const res = await fetch(uncachedUrl);
    if (res.ok) return await res.text();
  } catch {
    console.warn('Direct fetch blocked by CORS, trying fallback proxy 1...');
  }

  // 2. Proxy fallback 1 (allorigins)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(uncachedUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) return await res.text();
  } catch {
    console.warn('Proxy 1 failed, trying fallback proxy 2...');
  }

  // 3. Proxy fallback 2 (corsproxy.io)
  try {
    const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(uncachedUrl)}`;
    const res = await fetch(proxyUrl2);
    if (res.ok) return await res.text();
  } catch {
    console.error('All proxies failed.');
  }

  throw new Error('Failed to fetch Google Sheet data. Please check the published URL or upload Master Data manually.');
}

export async function syncGoogleSheet(url: string): Promise<SyncResponse> {
  const text = await fetchCsvWithFallback(url);
  const rows = engine.parseRows(new TextEncoder().encode(text));
  const count = engine.indexMaster(rows, 'Google Sheet', 'sheet');
  return {
    active_affiliates: count,
    last_sync: engine.state.lastSync ?? '',
    source: engine.state.sourceName,
  };
}

export async function uploadMaster(file: File): Promise<SyncResponse> {
  const data = new Uint8Array(await file.arrayBuffer());
  const rows = engine.parseRows(data);
  const count = engine.indexMaster(rows, file.name || 'Master Data', 'manual');
  return {
    active_affiliates: count,
    last_sync: engine.state.lastSync ?? '',
    source: engine.state.sourceName,
  };
}

export function switchDataSourceMode(mode: 'sheet' | 'manual'): { active_affiliates: number; last_sync: string | null; is_indexed: boolean } {
  return engine.setActiveMode(mode);
}

export async function processSales(
  file: File,
  page = 1,
  pageSize = 50,
  onIfscProgress?: (done: number, total: number) => void,
): Promise<ProcessResponse> {
  if (Object.keys(engine.state.master).length === 0) {
    throw new Error('Sync or upload master data before processing sales');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const rows = engine.parseRows(data);
  if (!rows.some((row) => 'Total Amount' in row)) {
    throw new Error('Weekly sales must include a Total Amount column');
  }
  engine.calculateSales(rows);

  const ifscCodes = engine.state.summary
    .map((row) => row.ifsc)
    .filter((code): code is string => Boolean(code));
  if (ifscCodes.length > 0) {
    const ifscMap = await batchValidateIfsc(ifscCodes, onIfscProgress);
    for (const row of engine.state.summary) {
      if (row.ifsc) {
        const result = ifscMap.get(row.ifsc);
        if (result) row.ifscResult = result;
      }
    }
  }

  const start = (page - 1) * pageSize;
  const pageRows = engine.state.summary.slice(start, start + pageSize);
  const gross = Math.round(engine.state.summary.reduce((sum, item) => sum + item.gross, 0) * 100) / 100;
  const tds = Math.round(engine.state.summary.reduce((sum, item) => sum + item.tds, 0) * 100) / 100;
  return {
    rows: pageRows,
    page,
    page_size: pageSize,
    total_rows: engine.state.summary.length,
    total_pages: Math.max(1, Math.ceil(engine.state.summary.length / pageSize)),
    kpis: {
      gross,
      tds,
      net: Math.round((gross - tds) * 100) / 100,
      sales_count: engine.state.itemized.length,
      active_paid_sponsors: engine.state.summary.filter((item) => item.gross > 0).length,
    },
  };
}

function styleHeaderRow(ws: Worksheet, currencyCols: number[]): void {
  ws.getRow(1).eachCell((cell: Cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle' };
  });

  for (const col of currencyCols) {
    ws.getColumn(col).numFmt = '0.00';
  }

  ws.columns.forEach((col) => {
    let maxLen = col.header?.length ?? 10;
    col.eachCell?.({ includeEmpty: false }, (cell: Cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 40);
  });
}

export async function downloadReport(): Promise<Blob> {
  if (engine.state.summary.length === 0) {
    throw new Error('Process a weekly sales file before exporting');
  }

  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headers = [
    'Sponsor Referral Code',
    'Sponsor Name',
    'Sponsor Owned Package',
    'New Plans Sold',
    'Upgrades Done',
    'Total Sales Count',
    'Sales Breakdown',
    'Total Commission (INR)',
    'TDS Deducted (2%)',
    'Net Payout Amount (INR)',
    'KYC Status',
  ];

  ws.columns = headers.map((header) => ({ header, key: header, width: header.length + 4 }));

  for (const row of engine.state.summary) {
    const breakdownCounts: Record<string, number> = {};
    for (const sale of row.sales) {
      const label = sale.type === 'Upgrade' && sale.from_plan
        ? `${sale.from_plan.replace(' Package', '')} to ${sale.target_plan.replace(' Package', '')}`
        : sale.target_plan.replace(' Package', '');
      breakdownCounts[label] = (breakdownCounts[label] ?? 0) + 1;
    }
    const breakdown = Object.entries(breakdownCounts)
      .map(([label, count]) => `${label}: ${count}`)
      .join(', ');

    ws.addRow({
      'Sponsor Referral Code': row.code,
      'Sponsor Name': row.name,
      'Sponsor Owned Package': row.plan,
      'New Plans Sold': row.new_count,
      'Upgrades Done': row.upgrade_count,
      'Total Sales Count': row.sales_count,
      'Sales Breakdown': breakdown,
      'Total Commission (INR)': row.gross,
      'TDS Deducted (2%)': row.tds,
      'Net Payout Amount (INR)': row.net,
      'KYC Status': row.kyc_status,
    });
  }

  styleHeaderRow(ws, [8, 9, 10]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
