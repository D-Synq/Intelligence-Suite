import { ChangeEvent, DragEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Search,
  ShieldCheck,
  ShieldX,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  downloadValidatedFile,
  parseBatchFile,
  validateBatchIfsc,
  type BatchValidationResult,
} from '@/batchValidator';
import type { BatchIfscRow } from '@/types';

type FilterMode = 'all' | 'valid' | 'invalid';

const SR_NO_ALIASES = ['sr no', 'sr. no', 'sl no', 'sl. no', '#'];
const GN_NAME_ALIASES = ['gn name', 'sponsor name', 'affiliate name', 'gn'];
const NAME_ALIASES = ['name', 'account holder name', 'holder name', 'beneficiary name'];

function findColumn(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);
  const normalized = keys.map((k) => k.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.findIndex((k) => k === alias);
    if (idx !== -1) return keys[idx];
  }
  for (const alias of aliases) {
    const idx = normalized.findIndex((k) => k.includes(alias));
    if (idx !== -1) return keys[idx];
  }
  return '';
}

function extractSrNo(row: BatchIfscRow, index: number): string {
  const col = findColumn(row.originalRow, SR_NO_ALIASES);
  if (col) return String(row.originalRow[col] ?? index + 1);
  return String(index + 1);
}

function extractGnName(row: BatchIfscRow): string {
  const col = findColumn(row.originalRow, GN_NAME_ALIASES);
  if (col) return String(row.originalRow[col] ?? '').trim();
  return '';
}

function extractName(row: BatchIfscRow): string {
  const col = findColumn(row.originalRow, NAME_ALIASES);
  if (col) return String(row.originalRow[col] ?? '').trim();
  return '';
}

export function BatchValidator() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<BatchIfscRow[]>([]);
  const [detectedColumn, setDetectedColumn] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [result, setResult] = useState<BatchValidationResult | null>(null);
  const [loading, setLoading] = useState<'parse' | 'validate' | 'export' | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const handleFileSelect = async (nextFile: File | undefined) => {
    if (!nextFile || !/\.(xlsx|xls|csv)$/i.test(nextFile.name)) return;
    setFile(nextFile);
    setError('');
    setResult(null);
    setRows([]);
    setProgress(null);
    setLoading('parse');
    try {
      const parsed = await parseBatchFile(nextFile);
      setHeaders(parsed.headers);
      setDetectedColumn(parsed.detectedColumn);
      setSelectedColumn(parsed.detectedColumn ?? parsed.headers[0] ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file.');
    } finally {
      setLoading(null);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFileSelect(event.dataTransfer.files[0]);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) =>
    handleFileSelect(event.target.files?.[0]);

  const runValidation = async () => {
    if (!file || !selectedColumn) return;
    setLoading('validate');
    setError('');
    setProgress({ done: 0, total: 0 });
    setResult(null);
    try {
      const res = await validateBatchIfsc(file, selectedColumn, (done: number, total: number) =>
        setProgress({ done, total }),
      );
      setResult(res);
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setLoading(null);
      setProgress(null);
    }
  };

  const handleExport = async () => {
    if (!result) return;
    setLoading('export');
    setError('');
    try {
      const blob = await downloadValidatedFile(result.rows, result.headers);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'IFSC_Validated_File.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setLoading(null);
    }
  };

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (filter === 'valid') filtered = filtered.filter((r) => r.status === 'Valid');
    else if (filter === 'invalid') filtered = filtered.filter((r) => r.status !== 'Valid');
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ifscCode.toLowerCase().includes(q) ||
          r.bank.toLowerCase().includes(q) ||
          r.branch.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [rows, filter, query]);

  const isBusy = loading !== null;

  return (
    <section className="dsynq-card dsynq-card-rim mb-6 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-brand" />
          <h2 className="text-sm font-semibold text-forest">Excel IFSC Batch Validator<span className="heading-dot">.</span></h2>
        </div>
        <span className="hidden text-[10px] uppercase tracking-[.18em] text-sage sm:block">
          Razorpay IFSC API
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_auto]">
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`dsynq-dropzone !p-4 transition active:scale-[0.99] ${dragging ? 'is-dragging' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-dsynq-surface p-2.5 text-sage"><Upload size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-forest">{file ? file.name : 'Drop Excel/CSV file with IFSC column'}</p>
              <p className="mt-0.5 text-[10px] text-sage">XLSX, XLS or CSV — auto-detects IFSC column</p>
            </div>
            <label className="cursor-pointer text-brand transition active:scale-90 hover:text-brand-hover"><ArrowDownToLine size={17} /><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} /></label>
          </div>
        </div>

        <div className="flex items-end gap-2">
          {headers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-sage">IFSC Column</label>
              <select value={selectedColumn} onChange={(event) => setSelectedColumn(event.target.value)} className="dsynq-input px-3 py-2 text-xs">
                {headers.map((header) => (<option key={header} value={header}>{header}{detectedColumn === header ? ' (auto-detected)' : ''}</option>))}
              </select>
            </div>
          )}
          <button onClick={runValidation} disabled={!file || !selectedColumn || isBusy} className="dsynq-btn-primary flex items-center gap-2 px-4 py-2.5 text-xs transition-transform duration-150 active:scale-[0.97] disabled:opacity-40">
            {loading === 'validate' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Validate
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-status-error/25 bg-status-errorBg px-4 py-3 text-sm text-status-error">
          <span>{error}</span>
          <button onClick={() => setError('')}><XCircle size={16} /></button>
        </div>
      )}

      {progress && progress.total > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs text-brand">
          <Loader2 size={14} className="animate-spin" />
          <span>Verified {progress.done} of {progress.total} codes...</span>
          <div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-dsynq-border sm:w-40"><div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
        </div>
      )}

      {result && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="dsynq-card dsynq-card-rim animate-in p-3.5 transition-transform duration-150 active:scale-[0.98] sm:p-4">
              <div className="mb-2.5 flex items-center justify-between sm:mb-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-sage">Total Rows</span>
                <span className="rounded-lg bg-dsynq-surface p-1.5 text-forest sm:p-2"><FileSpreadsheet size={14} /></span>
              </div>
              <p className="font-mono text-lg font-semibold tabular-nums text-forest sm:text-xl">{result.totalRows.toLocaleString('en-IN')}</p>
            </div>
            <div className="dsynq-card dsynq-card-rim animate-in p-3.5 transition-transform duration-150 active:scale-[0.98] sm:p-4" style={{ animationDelay: '70ms' }}>
              <div className="mb-2.5 flex items-center justify-between sm:mb-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-sage">Valid IFSCs</span>
                <span className="rounded-lg bg-status-successBg p-1.5 text-status-success sm:p-2"><CheckCircle2 size={14} /></span>
              </div>
              <p className="font-mono text-lg font-semibold tabular-nums text-status-success sm:text-xl">{result.validCount.toLocaleString('en-IN')}</p>
            </div>
            <div className="dsynq-card dsynq-card-rim animate-in p-3.5 transition-transform duration-150 active:scale-[0.98] sm:p-4" style={{ animationDelay: '140ms' }}>
              <div className="mb-2.5 flex items-center justify-between sm:mb-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-sage">Invalid / Flagged</span>
                <span className="rounded-lg bg-status-errorBg p-1.5 text-status-error sm:p-2"><AlertTriangle size={14} /></span>
              </div>
              <p className="font-mono text-lg font-semibold tabular-nums text-status-error sm:text-xl">{result.invalidCount.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-dsynq-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-dsynq-border bg-dsynq-surface p-1">
                {(['all', 'valid', 'invalid'] as FilterMode[]).map((mode) => (
                  <button key={mode} onClick={() => setFilter(mode)} className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${filter === mode ? 'bg-brand/10 text-brand' : 'text-sage hover:text-forest'}`}>{mode === 'all' ? 'Show All' : mode === 'valid' ? 'Valid Only' : 'Invalid Only'}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-dsynq-border bg-dsynq-surface px-3 py-2">
                <Search size={14} className="text-sage" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, bank, city..." className="w-full bg-transparent text-xs text-forest outline-none placeholder:text-sage" />
              </div>
            </div>
            <button onClick={handleExport} disabled={isBusy} className="dsynq-btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-transform duration-150 active:scale-[0.97] disabled:opacity-40">
              {loading === 'export' ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
              Download Validated File
            </button>
          </div>

          <div className="mt-4 scrollbar touch-scroll max-h-[420px] overflow-auto rounded-xl border border-dsynq-border">
            <table className="w-full min-w-[960px] text-left">
              <thead className="dsynq-table-header dsynq-sticky-head sticky top-0 z-10 text-[10px]">
                <tr><th className="px-4 py-3">Sr No</th><th className="px-4 py-3">GN Name</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">IFSC</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">City</th><th className="px-4 py-3">State</th></tr>
              </thead>
              <tbody className="divide-y divide-dsynq-border">
                {filteredRows.length ? (
                  filteredRows.map((row, index) => {
                    const isValid = row.status === 'Valid';
                    const srNo = extractSrNo(row, index);
                    const gnName = extractGnName(row);
                    const name = extractName(row);
                    return (
                      <tr key={row.rowIndex} className={`dsynq-table-row transition-colors duration-150 ease-in-out hover:bg-cyan-500/[0.04] ${!isValid ? 'bg-status-errorBg/40' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-sage">{srNo}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-brand">{gnName || '—'}</td>
                        <td className="px-4 py-3 text-xs font-medium text-forest">{name || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-forest">{row.ifscCode || '—'}</td>
                        <td className="px-4 py-3">
                          {isValid ? (
                            <span className="flex items-center gap-1.5 rounded-md border border-status-success/25 bg-status-successBg px-2 py-1 text-[10px] font-semibold text-status-success"><ShieldCheck size={12} /> VALID</span>
                          ) : (
                            <span className="flex items-center gap-1.5 rounded-md border border-status-error/25 bg-status-errorBg px-2 py-1 text-[10px] font-semibold text-status-error"><ShieldX size={12} /> {row.status.toUpperCase()}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-sage">{row.bank || '—'}</td>
                        <td className="px-4 py-3 text-xs text-sage">{row.branch || '—'}</td>
                        <td className="px-4 py-3 text-xs text-sage">{row.city || '—'}</td>
                        <td className="px-4 py-3 text-xs text-sage">{row.state || '—'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={9} className="px-4 py-16 text-center text-xs text-sage">No rows match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
