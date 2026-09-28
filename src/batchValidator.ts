import * as XLSX from 'xlsx';
import {
  batchValidateIfsc,
  detectIfscColumn,
  ifscStatusFromResult,
  normalizeIfsc,
  isValidIfscFormat,
  type BatchIfscRow,
  type BatchIfscStatus,
} from './ifsc';
import type { IfscResult } from './types';

async function loadExcel() {
  const mod = await import('exceljs');
  return mod.default ?? mod;
}

export type BatchValidationResult = {
  rows: BatchIfscRow[];
  headers: string[];
  detectedColumn: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
};

export async function parseBatchFile(file: File): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  detectedColumn: string | null;
}> {
  const data = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
  const detectedColumn = detectIfscColumn(headers);
  return { headers, rows: jsonRows, detectedColumn };
}

export async function validateBatchIfsc(
  file: File,
  columnName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchValidationResult> {
  const { rows } = await parseBatchFile(file);
  if (rows.length === 0) {
    return { rows: [], headers: [], detectedColumn: columnName, totalRows: 0, validCount: 0, invalidCount: 0 };
  }

  const codesByRow: string[] = rows.map((row) =>
    normalizeIfsc(String(row[columnName] ?? '')),
  );

  const uniqueCodes = [...new Set(codesByRow.filter(Boolean))];
  const ifscMap = await batchValidateIfsc(uniqueCodes, onProgress);

  const resultRows: BatchIfscRow[] = rows.map((originalRow, index) => {
    const rawCode = codesByRow[index];
    const ifscCode = rawCode || '';
    if (!ifscCode) {
      return {
        rowIndex: index + 2,
        originalRow,
        ifscCode,
        status: 'Invalid Format' as BatchIfscStatus,
        bank: '',
        branch: '',
        city: '',
        state: '',
      };
    }
    const result: IfscResult | undefined = ifscMap.get(ifscCode);
    if (!result) {
      return {
        rowIndex: index + 2,
        originalRow,
        ifscCode,
        status: 'Verification Failed',
        bank: '',
        branch: '',
        city: '',
        state: '',
      };
    }
    const status = ifscStatusFromResult(result);
    return {
      rowIndex: index + 2,
      originalRow,
      ifscCode,
      status,
      bank: result.bank ?? '',
      branch: result.branch ?? '',
      city: result.city ?? '',
      state: result.state ?? '',
    };
  });

  const validCount = resultRows.filter((r) => r.status === 'Valid').length;
  const invalidCount = resultRows.length - validCount;

  return {
    rows: resultRows,
    headers: Object.keys(rows[0]),
    detectedColumn: columnName,
    totalRows: resultRows.length,
    validCount,
    invalidCount,
  };
}

export async function downloadValidatedFile(
  rows: BatchIfscRow[],
  headers: string[],
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('IFSC Validation', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const allHeaders = [...headers, 'IFSC Validation Status', 'Bank Name', 'Branch Name', 'City', 'State'];
  ws.columns = allHeaders.map((header) => ({ header, key: header, width: 20 }));

  for (const row of rows) {
    const rowData: Record<string, unknown> = { ...row.originalRow };
    rowData['IFSC Validation Status'] = row.status;
    rowData['Bank Name'] = row.bank;
    rowData['Branch Name'] = row.branch;
    rowData['City'] = row.city;
    rowData['State'] = row.state;
    const added = ws.addRow(rowData);
    if (row.status !== 'Valid') {
      added.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFCE4E4' },
        };
        cell.font = { color: { argb: 'FF9F1239' } };
      });
    }
  }

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    cell.alignment = { vertical: 'middle' };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export { isValidIfscFormat };
