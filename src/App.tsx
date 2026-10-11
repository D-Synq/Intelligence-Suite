import { ChangeEvent, DragEvent, FormEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  BadgeIndianRupee,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Database,
  FileSpreadsheet,
  FileUp,
  Filter,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Upload,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { commitMasterUpload, downloadReport, parseMasterFile, processSales, switchDataSourceMode, syncGoogleSheet } from '@/api';
import { DSynqLogo } from '@/components/DSynqLogo';
import { ThemeSwitcher } from '@/theme';
import type { Kpis, PayoutRow, Sale, KycStatus, MasterParseResult } from '@/types';

const BatchValidator = lazy(() =>
  import('@/components/BatchValidator').then((m) => ({ default: m.BatchValidator })),
);

const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7clyjnFONEDvT23flDmT1DrRAxeOQJuI-wW5qbZkxI0SJGddCFwhK-rRV2HSKv_9svx44Ok9dw4p6/pub?gid=0&single=true&output=csv';
const initialKpis: Kpis = { gross: 0, tds: 0, net: 0, sales_count: 0, active_paid_sponsors: 0 };
const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const formatTime = (date: string | null) => date ? new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Not synced';
const kycBadgeClass = (status: KycStatus) => {
  switch (status) {
    case 'Verified': return 'border-status-success/25 bg-status-successBg text-status-success';
    case 'Pending': return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
    case 'Not Fill': return 'border-status-error/25 bg-status-errorBg text-status-error';
    case 'Rejected': return 'border-status-error/25 bg-status-errorBg text-status-error';
    default: return 'border-slate-600/40 bg-slate-700/20 text-slate-400';
  }
};

function PayoutView({ setActiveAffiliates, lastSync, setLastSync }: {
  setActiveAffiliates: (n: number) => void;
  lastSync: string | null;
  setLastSync: (s: string | null) => void;
}) {
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('dsynq_sheet_url') || DEFAULT_URL;
    } catch {
      return DEFAULT_URL;
    }
  });
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempSheetUrl, setTempSheetUrl] = useState(sheetUrl);
  const [file, setFile] = useState<File | null>(null);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterParseResult, setMasterParseResult] = useState<MasterParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [masterSuccessMessage, setMasterSuccessMessage] = useState<string>('');
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [masterDragging, setMasterDragging] = useState<boolean>(false);
  const masterInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [kpis, setKpis] = useState(initialKpis);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState<'sync' | 'master' | 'process' | 'export' | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PayoutRow | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ifscProgress, setIfscProgress] = useState<{ done: number; total: number } | null>(null);
  const [dataSourceMode, setDataSourceMode] = useState<'sheet' | 'manual'>('sheet');
  const [masterIndexed, setMasterIndexed] = useState(false);
  const hasAutoSynced = useRef(false);

  useEffect(() => {
    if (hasAutoSynced.current) return;
    hasAutoSynced.current = true;
    (async () => {
      setLoading('sync');
      setError('');
      try {
        const result = await syncGoogleSheet(sheetUrl);
        setActiveAffiliates(result.active_affiliates);
        setLastSync(result.last_sync);
        setMasterIndexed(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auto-sync failed. Click Sync to retry.');
      } finally {
        setLoading(null);
      }
    })();
  }, [sheetUrl, setActiveAffiliates, setLastSync]);

  const filteredRows = useMemo(() => rows.filter((row) => `${row.name} ${row.code}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const selectFile = (nextFile: File | undefined) => { if (nextFile && /\.(xlsx|xls|csv)$/i.test(nextFile.name)) { setFile(nextFile); setError(''); } };
  const handleDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); };
  const handleSalesChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);

  const sync = async () => {
    if (dataSourceMode === 'manual') {
      setError('Manual Excel mode is active. Upload your Master Data file below or switch back to Google Sheet Live mode.');
      return;
    }
    setLoading('sync');
    setError('');
    try {
      const result = await syncGoogleSheet(sheetUrl);
      setActiveAffiliates(result.active_affiliates);
      setLastSync(result.last_sync);
      setMasterIndexed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setLoading(null);
    }
  };

  const handleModeChange = (mode: 'sheet' | 'manual') => {
    setDataSourceMode(mode);
    setError('');
    setMasterSuccessMessage('');
    const status = switchDataSourceMode(mode);
    setActiveAffiliates(status.active_affiliates);
    setLastSync(status.last_sync);
    setMasterIndexed(status.is_indexed);
    setRows([]);
    setKpis(initialKpis);
  };

  const handleMasterFileSelect = async (nextFile: File | null | undefined, sheetToUse?: string) => {
    if (!nextFile) return;

    if (!/\.(xlsx|xls|csv)$/i.test(nextFile.name)) {
      setError(`Invalid file type "${nextFile.name}". Please upload a supported spreadsheet (.xlsx, .xls, or .csv).`);
      return;
    }

    if (nextFile.size === 0) {
      setError(`The selected file "${nextFile.name}" is empty (0 bytes).`);
      return;
    }

    setMasterFile(nextFile);
    setError('');
    setMasterSuccessMessage('');
    setLoading('master');

    try {
      console.log(`[DSynq Master Upload] Reading file "${nextFile.name}" (${(nextFile.size / 1024).toFixed(1)} KB)...`);
      const parsed = await parseMasterFile(nextFile, sheetToUse);
      console.log(`[DSynq Master Upload] Parsed sheet "${parsed.selectedSheet}": ${parsed.validCount} valid records, ${parsed.rejectedCount} rejected rows, columns:`, parsed.detectedHeaders);
      setMasterParseResult(parsed);
      setSelectedSheet(parsed.selectedSheet);

      if (parsed.missingRequiredColumns.length > 0) {
        setError(`Missing required column: ${parsed.missingRequiredColumns.join(', ')}. Please verify the worksheet structure.`);
      } else if (parsed.validCount === 0) {
        setError('No valid affiliate master records found. Please check that the Referrer Code / Sponsor Code column is populated.');
      } else {
        setMasterSuccessMessage(`Excel parsed successfully: ${parsed.validCount} records detected in sheet "${parsed.selectedSheet}". Ready to index.`);
      }
    } catch (err) {
      console.error('[DSynq Master Upload] Parse error:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse Excel file.');
      setMasterParseResult(null);
    } finally {
      setLoading(null);
    }
  };

  const handleSheetChange = async (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (masterFile) {
      await handleMasterFileSelect(masterFile, newSheet);
    }
  };

  const confirmMasterImport = async () => {
    if (!masterParseResult) {
      if (masterFile) {
        await handleMasterFileSelect(masterFile);
      }
      return;
    }

    if (masterParseResult.missingRequiredColumns.length > 0) {
      setError(`Cannot import: missing required column ${masterParseResult.missingRequiredColumns.join(', ')}`);
      return;
    }

    if (masterParseResult.validCount === 0) {
      setError('Cannot import: 0 valid affiliate records detected.');
      return;
    }

    setLoading('master');
    setError('');
    try {
      const result = await commitMasterUpload(masterParseResult.parsedEntries, masterParseResult.fileName);
      setActiveAffiliates(result.active_affiliates);
      setLastSync(result.last_sync);
      setMasterIndexed(true);
      setShowPreviewModal(false);
      setMasterSuccessMessage(`Master data successfully indexed: ${result.active_affiliates} affiliates active from "${masterParseResult.fileName}".`);
    } catch (err) {
      console.error('[DSynq Master Upload] Import error:', err);
      setError(err instanceof Error ? err.message : 'Master upload failed.');
    } finally {
      setLoading(null);
    }
  };

  const resetMasterUpload = () => {
    setMasterFile(null);
    setMasterParseResult(null);
    setSelectedSheet('');
    setMasterSuccessMessage('');
    if (masterInputRef.current) {
      masterInputRef.current.value = '';
    }
  };
  const process = async (nextPage = 1) => {
    if (!file) return;
    if (!masterIndexed) {
      setError(dataSourceMode === 'sheet'
        ? 'No master data synced yet. Click Sync to pull the Google Sheet before running calculations.'
        : 'No master data uploaded yet. Upload and index your Master Data Excel before running calculations.');
      return;
    }
    setLoading('process');
    setError('')
    setIfscProgress(null)
    try {
      const result = await processSales(file, nextPage, 50, (done, total) => setIfscProgress({ done, total }));
      setRows(result.rows)
      setKpis(result.kpis)
      setPage(result.page)
      setTotalPages(result.total_pages)
      setTotalRows(result.total_rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process sales.');
    } finally {
      setLoading(null)
      setIfscProgress(null)
    }
  };
  const exportReport = async () => { setLoading('export'); setError(''); try { const blob = await downloadReport(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'Payout_Report.xlsx'; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof Error ? err.message : 'Export failed.'); } finally { setLoading(null); } };

  return <div className="relative mx-auto max-w-[1536px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-xl border border-color-border bg-[var(--c-surface)] p-2 shadow-sm">
          <DSynqLogo size="sm" interactive={false} className="h-full w-full" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand">Payout command</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-forest">Commission intelligence</h1>
          <p className="mt-0.5 text-xs text-sage">powered by <strong className="font-semibold text-brand">DSynq</strong> · Owned-tier capping, 2% TDS, and verified sales ledger</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-sage">Last sync {formatTime(lastSync)}</span>
        <button onClick={sync} disabled={loading !== null} className="dsynq-btn-secondary flex items-center gap-2 px-3 py-2 text-xs transition-transform duration-150 active:scale-[0.97]"><RefreshCw size={14} className={loading === 'sync' ? 'animate-spin' : ''} /> Sync source</button>
      </div>
    </div>

    {error && <div className="animate-in mb-5 flex items-center justify-between rounded-xl border border-status-error/25 bg-status-errorBg px-4 py-3 text-sm text-status-error"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}
    {masterSuccessMessage && (
      <div className="animate-in mb-5 flex items-center justify-between rounded-xl border border-status-success/25 bg-status-successBg px-4 py-3 text-sm text-status-success">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{masterSuccessMessage}</span>
        </div>
        <button onClick={() => setMasterSuccessMessage('')}><X size={16} /></button>
      </div>
    )}

    <section className="dsynq-card dsynq-card-rim mb-6 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><Layers size={16} className="text-brand" /><h2 className="text-sm font-semibold text-forest">Data control center</h2></div>
        <span className="hidden text-[10px] uppercase tracking-[.18em] text-sage sm:block">Secure ingestion layer</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-color-border bg-color-input p-1">
          <button onClick={() => handleModeChange('sheet')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${dataSourceMode === 'sheet' ? 'border border-cyan-400/30 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300' : 'border border-transparent text-sage hover:text-forest'}`}><Cloud size={14} /> Google Sheet Live</button>
          <button onClick={() => handleModeChange('manual')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${dataSourceMode === 'manual' ? 'border border-brand/30 bg-brand/15 text-brand' : 'border border-transparent text-sage hover:text-forest'}`}><Database size={14} /> Manual Excel Upload</button>
        </div>
        {dataSourceMode === 'sheet' ? (
          <span className="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-300"><Wifi size={11} /> Live cloud sync mode active</span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-[10px] font-semibold text-brand"><FileUp size={11} /> Manual Excel upload mode (Google Sheet bypassed)</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {dataSourceMode === 'sheet' ? (
          <div className="flex flex-col justify-center rounded-xl border border-dsynq-border bg-dsynq-surface p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={sync}
                disabled={loading !== null}
                className="dsynq-btn-primary flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
              >
                {loading === 'sync' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                <span>Sync Google Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingUrl((prev) => !prev);
                  setTempSheetUrl(sheetUrl);
                }}
                title="Edit Google Sheet URL"
                aria-label="Edit Google Sheet URL"
                className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border transition-all duration-150 active:scale-95 ${
                  isEditingUrl
                    ? 'border-brand bg-brand/15 text-brand shadow-sm'
                    : 'border-dsynq-border bg-dsynq-surface text-sage hover:border-brand/40 hover:text-forest'
                }`}
              >
                <Pencil size={15} />
              </button>
            </div>
            {isEditingUrl && (
              <div className="mt-2.5 rounded-lg border border-dsynq-border bg-[var(--c-input)]/90 p-2.5 animate-in fade-in duration-150">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-sage">
                  <span>Google Sheet Published CSV URL</span>
                  {sheetUrl !== DEFAULT_URL && (
                    <button
                      type="button"
                      onClick={() => {
                        setTempSheetUrl(DEFAULT_URL);
                        setSheetUrl(DEFAULT_URL);
                        try { localStorage.removeItem('dsynq_sheet_url'); } catch { /* ignore */ }
                      }}
                      className="text-[10px] text-brand hover:underline"
                    >
                      Reset default
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={tempSheetUrl}
                    onChange={(event) => setTempSheetUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                    className="min-w-0 flex-1 rounded-md border border-dsynq-border bg-dsynq-surface px-2.5 py-1.5 font-mono text-xs text-forest outline-none transition focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const nextUrl = tempSheetUrl.trim() || DEFAULT_URL;
                      setSheetUrl(nextUrl);
                      try { localStorage.setItem('dsynq_sheet_url', nextUrl); } catch { /* ignore */ }
                      setIsEditingUrl(false);
                      // Trigger sync with new URL
                      setLoading('sync');
                      setError('');
                      try {
                        const result = await syncGoogleSheet(nextUrl);
                        setActiveAffiliates(result.active_affiliates);
                        setLastSync(result.last_sync);
                        setMasterIndexed(true);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Sync failed with updated URL.');
                      } finally {
                        setLoading(null);
                      }
                    }}
                    className="dsynq-btn-primary flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold"
                  >
                    <Check size={13} />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempSheetUrl(sheetUrl);
                      setIsEditingUrl(false);
                    }}
                    className="rounded-md border border-dsynq-border px-2.5 py-1.5 text-xs text-sage transition hover:text-forest"
                  >
                    <X size={13} />
                  </button>
                </div>
                {sheetUrl !== DEFAULT_URL && (
                  <p className="mt-1.5 text-[10px] text-emerald-500 dark:text-emerald-400">Custom sheet configured</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dsynq-border bg-dsynq-surface p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sage">
                <Database size={14} className="text-brand" />
                <span>Manual Master Data Excel</span>
              </div>
              {masterFile && (
                <button
                  type="button"
                  onClick={resetMasterUpload}
                  className="text-[10px] text-sage transition hover:text-forest"
                  title="Clear selected file"
                >
                  Clear file
                </button>
              )}
            </div>

            <label
              onDragOver={(event) => { event.preventDefault(); setMasterDragging(true); }}
              onDragLeave={() => setMasterDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setMasterDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) handleMasterFileSelect(dropped);
              }}
              className={`group relative flex min-h-[50px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-xs transition select-none ${
                masterDragging
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'dsynq-border text-sage hover:border-brand/50 hover:text-forest'
              }`}
            >
              <input
                ref={masterInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (selectedFile) {
                    handleMasterFileSelect(selectedFile);
                  }
                  // Reset input value so the exact same file can be selected again
                  event.target.value = '';
                }}
              />
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="rounded-md bg-dsynq-surface p-1.5 text-sage group-hover:text-brand">
                  <Upload size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-forest">
                    {masterFile ? masterFile.name : 'Drop master file or click to browse'}
                  </p>
                  <p className="text-[10px] text-sage">
                    {masterFile
                      ? `${(masterFile.size / 1024).toFixed(1)} KB · ${masterFile.name.split('.').pop()?.toUpperCase()}`
                      : 'Accepts .xlsx, .xls, .csv'}
                  </p>
                </div>
              </div>

              {loading === 'master' && (
                <div className="flex items-center gap-1.5 text-[11px] text-brand">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Parsing...</span>
                </div>
              )}
            </label>

            {/* If workbook has multiple sheets, allow selecting sheet */}
            {masterParseResult && masterParseResult.sheets.length > 1 && (
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                <span className="text-[11px] text-sage shrink-0">Worksheet:</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="dsynq-input min-w-0 flex-1 px-2.5 py-1 text-xs"
                >
                  {masterParseResult.sheets.map((sheet) => (
                    <option key={sheet} value={sheet}>{sheet}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Diagnostic / Status Summary Bar */}
            {masterParseResult && (
              <div className="mt-2.5 rounded-lg border border-dsynq-border bg-[var(--c-input)]/60 p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-status-successBg px-1.5 py-0.5 text-[10px] font-semibold text-status-success">
                      <CheckCircle2 size={11} /> {masterParseResult.validCount} valid records
                    </span>
                    {masterParseResult.rejectedCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        {masterParseResult.rejectedCount} skipped/empty
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="text-[10px] font-medium text-brand hover:underline"
                  >
                    View preview ({masterParseResult.validCount})
                  </button>
                </div>

                {masterParseResult.missingRequiredColumns.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-status-error">
                    Missing required: {masterParseResult.missingRequiredColumns.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex items-center justify-end gap-2">
              {masterParseResult && masterParseResult.validCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="dsynq-btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  Preview Data
                </button>
              )}
              <button
                type="button"
                onClick={confirmMasterImport}
                disabled={!masterFile || loading !== null || (masterParseResult?.missingRequiredColumns.length ?? 0) > 0 || (masterParseResult?.validCount === 0)}
                className="dsynq-btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                {loading === 'master' ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Indexing...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>{masterIndexed ? 'Re-Index Master Data' : 'Index Master Data'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        <label
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`dsynq-dropzone group relative block cursor-pointer !p-3 transition select-none active:scale-[0.99] ${dragging ? 'is-dragging' : ''}`}
        >
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleSalesChange} />
          <div className="flex min-w-[210px] items-center gap-3">
            <div className="rounded-lg bg-dsynq-surface p-2.5 text-sage transition-colors group-hover:text-forest"><FileSpreadsheet size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-forest">{file ? file.name : 'Drop weekly sales file or click to browse'}</p>
              <p className="mt-0.5 text-[10px] text-sage">XLSX, XLS or CSV — click anywhere</p>
            </div>
            <div className="text-brand transition group-hover:scale-105 group-hover:text-brand-hover">
              <Upload size={17} />
            </div>
          </div>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dsynq-border pt-4">
        <div className="flex items-center gap-2 text-xs text-sage"><ShieldCheck size={15} className="text-brand" /> Calculations stay server-side for 50k+ records</div>
        <div className="flex gap-2">
          <button onClick={() => process(1)} disabled={!file || loading !== null} className="dsynq-btn-primary flex items-center gap-2 px-4 py-2.5 text-xs transition-transform duration-150 active:scale-[0.97] disabled:opacity-40">{loading === 'process' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />} Run weekly calculation</button>
          <button onClick={exportReport} disabled={loading !== null || !rows.length} className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition active:scale-[0.97] hover:bg-emerald-400/20 disabled:opacity-40">{loading === 'export' ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />} Export Payout Excel</button>
        </div>
      </div>
    </section>

    {ifscProgress && ifscProgress.total > 0 && <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs text-brand"><div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-visible"><DSynqLogo size="xs" interactive={false} className="h-3.5 w-3.5 animate-pulse" /></div><Loader2 size={14} className="animate-spin" /><span>Verifying IFSC codes — {ifscProgress.done} of {ifscProgress.total}</span><div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-dsynq-border sm:w-40"><div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${(ifscProgress.done / ifscProgress.total) * 100}%` }} /></div></div>}
    <section className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
      {[
        { label: 'Total net payout', value: formatCurrency(kpis.net), icon: CircleDollarSign, color: 'text-status-success', bg: 'bg-status-successBg' },
        { label: 'Gross commission', value: formatCurrency(kpis.gross), icon: BadgeIndianRupee, color: 'text-brand', bg: 'bg-brand/10' },
        { label: '2% TDS deducted', value: formatCurrency(kpis.tds), icon: ArrowDownToLine, color: 'text-status-error', bg: 'bg-status-errorBg' },
        { label: 'Total sales count', value: kpis.sales_count.toLocaleString('en-IN'), icon: BarChart3, color: 'text-forest', bg: 'bg-dsynq-surface' },
        { label: 'Active paid sponsors', value: kpis.active_paid_sponsors.toLocaleString('en-IN'), icon: Users, color: 'text-forest', bg: 'bg-dsynq-surface' },
      ].map((metric, index) => (
        <div key={metric.label} className="dsynq-card dsynq-card-rim animate-in p-3.5 transition-transform duration-150 active:scale-[0.98] sm:p-4" style={{ animationDelay: `${index * 70}ms` }}>
          <div className="mb-2.5 flex items-center justify-between sm:mb-3"><span className="text-[10px] font-medium uppercase tracking-wider text-sage">{metric.label}</span><span className={`rounded-lg p-1.5 sm:p-2 ${metric.bg} ${metric.color}`}><metric.icon size={14} /></span></div>
          <p className={`font-mono text-lg font-semibold tabular-nums tracking-tight sm:text-xl ${metric.color}`}>{metric.value}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-dsynq-border"><div className={`h-full w-2/3 rounded-full ${metric.bg}`} /></div>
        </div>
      ))}
    </section>

    <section className="dsynq-card dsynq-card-rim overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-dsynq-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-forest">Payout ledger</h2>
            <span className="rounded-full bg-dsynq-surface px-2 py-0.5 text-[10px] text-sage">{totalRows} sponsors</span>
            <span className="text-[10px] text-sage/80 md:hidden">• Swipe table horizontally</span>
          </div>
          <p className="mt-1 text-xs text-sage">Verified sponsor commissions after owned-tier capping</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-dsynq-border bg-dsynq-surface px-3 py-2 sm:w-64"><Search size={14} className="text-sage" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sponsor or code" className="w-full bg-transparent text-xs text-forest outline-none placeholder:text-sage" /></div>
          <button className="dsynq-btn-secondary rounded-lg p-2 text-sage"><Filter size={16} /></button>
        </div>
      </div>
      <div className="scrollbar touch-scroll overflow-x-auto">
        <table className="w-full min-w-[1140px] text-left">
          <thead className="dsynq-table-header dsynq-sticky-head sticky top-0 z-10 text-[10px]">
            <tr><th className="px-5 py-3">Sponsor</th><th className="px-5 py-3">Verified plan</th><th className="px-5 py-3">KYC</th><th className="px-5 py-3">Sales mix</th><th className="px-5 py-3">Breakdown</th><th className="px-5 py-3">IFSC</th><th className="px-5 py-3 text-right">Gross</th><th className="px-5 py-3 text-right">TDS</th><th className="px-5 py-3 text-right">Net payout</th></tr>
          </thead>
          <tbody className="divide-y divide-dsynq-border">
            {filteredRows.length ? filteredRows.map((row) => {
              const ifscInvalid = row.ifscResult && !row.ifscResult.valid;
              return <tr key={row.code} onClick={() => setSelected(row)} className={`dsynq-table-row cursor-pointer transition-colors duration-150 ease-in-out hover:bg-cyan-500/[0.04] ${ifscInvalid ? 'bg-status-errorBg/40' : ''}`}>
                <td className="px-5 py-4"><p className="font-medium text-forest">{row.name}</p><p className="mt-1 font-mono text-[10px] text-brand">{row.code}</p></td>
                <td className="px-5 py-4"><span className="rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-[10px] text-brand">{row.plan.replace(' Package', '')}</span></td>
                <td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${kycBadgeClass(row.kyc_status)}`}>{row.kyc_status}</span></td>
                <td className="px-5 py-4"><div className="flex gap-1.5"><span className="rounded-md bg-brand/10 px-2 py-1 text-[10px] text-brand">{row.new_count} new</span>{row.upgrade_count > 0 && <span className="rounded-md bg-brand/10 px-2 py-1 text-[10px] text-brand">{row.upgrade_count} upg</span>}</div></td>
                <td className="max-w-[240px] px-5 py-4"><p className="truncate text-xs text-sage">{row.sales.map((sale) => sale.target_plan.replace(' Package', '')).join(' · ')}</p><p className="mt-1 text-[10px] text-sage">{row.sales_count} transactions</p></td>
                <td className="px-5 py-4">{row.ifsc ? <div className="flex items-center gap-2">{ifscInvalid ? <span className="flex items-center gap-1.5 rounded-md border border-status-error/25 bg-status-errorBg px-2 py-1 text-[10px] font-semibold text-status-error"><ShieldX size={12} /> <span className="font-mono">{row.ifsc}</span></span> : row.ifscResult?.valid ? <span className="flex items-center gap-1.5 rounded-md border border-status-success/25 bg-status-successBg px-2 py-1 text-[10px] font-semibold text-status-success"><ShieldCheck size={12} /> <span className="font-mono">{row.ifsc}</span></span> : <span className="font-mono text-[10px] text-sage">{row.ifsc}</span>}</div> : <span className="text-[10px] text-sage">—</span>}</td>
                <td className="px-5 py-4 text-right font-mono text-xs tabular-nums text-forest">{formatCurrency(row.gross)}</td>
                <td className="px-5 py-4 text-right font-mono text-xs tabular-nums text-status-error/80">−{formatCurrency(row.tds)}</td>
                <td className="px-5 py-4 text-right font-mono text-sm font-semibold tabular-nums text-status-success">{formatCurrency(row.net)}</td>
              </tr>;
            }) : <tr><td colSpan={9} className="px-5 py-20 text-center"><div className="mx-auto flex max-w-sm flex-col items-center"><div className="mb-3 rounded-xl border border-dsynq-border bg-dsynq-surface p-3 text-sage"><FileSpreadsheet size={24} /></div><p className="text-sm font-medium text-forest">Your payout ledger is ready</p><p className="mt-1 text-xs leading-5 text-sage">Sync your master data, drop in the weekly sales file, and run the calculation to populate this view.</p></div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-dsynq-border px-5 py-4">
        <p className="text-xs text-sage">Showing {filteredRows.length ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, totalRows)}` : '0'} of {totalRows}</p>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1 || loading !== null} onClick={() => process(page - 1)} className="dsynq-btn-secondary rounded-lg p-2 text-sage transition-transform duration-150 active:scale-90 disabled:opacity-30"><ChevronLeft size={15} /></button>
          <span className="rounded-lg bg-dsynq-surface px-3 py-1.5 font-mono text-[11px] text-forest">{page} / {totalPages}</span>
          <button disabled={page >= totalPages || loading !== null} onClick={() => process(page + 1)} className="dsynq-btn-secondary rounded-lg p-2 text-sage transition-transform duration-150 active:scale-90 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>
      </div>
    </section>

    <footer className="flex flex-col gap-2 py-6 text-[10px] uppercase tracking-[.16em] text-sage sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-4 w-4 items-center justify-center overflow-visible">
          <DSynqLogo size="xs" interactive={false} className="h-3.5 w-3.5" />
        </div>
        <span>DSynq Intelligence Suite</span>
        <span className="text-sage/50">•</span>
        <span className="normal-case">powered by <strong className="font-semibold text-brand">DSynq</strong></span>
      </div>
      <span>Owned-tier capping & 2% TDS ledger</span>
    </footer>
    {selected && <Drawer row={selected} onClose={() => setSelected(null)} />}
    {showPreviewModal && masterParseResult && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-dsynq-border bg-[var(--glass-background-elevated)] shadow-2xl backdrop-blur-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-dsynq-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Database size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-forest">Master Data Import Preview</h3>
                <p className="text-xs text-sage">
                  File: <strong className="font-semibold text-forest">{masterParseResult.fileName}</strong> · Sheet: <strong className="font-semibold text-forest">{masterParseResult.selectedSheet}</strong> ({(masterParseResult.fileSizeBytes / 1024).toFixed(1)} KB)
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPreviewModal(false)}
              className="rounded-lg p-2 text-sage transition hover:bg-dsynq-surface hover:text-forest"
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 gap-3 border-b border-dsynq-border bg-[var(--c-input)]/40 p-4 sm:grid-cols-4">
            <div className="rounded-lg border border-dsynq-border bg-dsynq-surface p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-sage">Detected Rows</span>
              <p className="font-mono text-base font-semibold text-forest">
                {masterParseResult.validCount + masterParseResult.rejectedCount}
              </p>
            </div>
            <div className="rounded-lg border border-status-success/20 bg-status-successBg p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-status-success">Valid Affiliates</span>
              <p className="font-mono text-base font-semibold text-status-success">
                {masterParseResult.validCount}
              </p>
            </div>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-amber-300">Skipped Empty</span>
              <p className="font-mono text-base font-semibold text-amber-300">
                {masterParseResult.rejectedCount}
              </p>
            </div>
            <div className="rounded-lg border border-dsynq-border bg-dsynq-surface p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-sage">Columns Detected</span>
              <p className="font-mono text-base font-semibold text-forest">
                {masterParseResult.detectedHeaders.length}
              </p>
            </div>
          </div>

          {/* Multi-sheet selector inside modal if available */}
          {masterParseResult.sheets.length > 1 && (
            <div className="flex items-center gap-2 border-b border-dsynq-border px-5 py-2.5 text-xs">
              <span className="text-sage">Active Sheet:</span>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="dsynq-input px-2.5 py-1 text-xs"
              >
                {masterParseResult.sheets.map((sheet) => (
                  <option key={sheet} value={sheet}>{sheet}</option>
                ))}
              </select>
            </div>
          )}

          {/* Table Preview */}
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-forest">First 10 records sample:</span>
              <span className="text-[10px] text-sage">Leading zeros in IFSC and Account numbers preserved</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-dsynq-border bg-dsynq-surface">
              <table className="min-w-full divide-y divide-dsynq-border text-left text-xs">
                <thead className="bg-[var(--c-input)] font-semibold text-sage">
                  <tr>
                    <th className="px-3 py-2">Referrer Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">IFSC</th>
                    <th className="px-3 py-2">Bank Account</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">KYC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dsynq-border font-mono text-[11px] text-forest">
                  {masterParseResult.previewRows.map((entry) => (
                    <tr key={entry.code} className="hover:bg-color-hover">
                      <td className="px-3 py-2 font-bold text-brand">{entry.code}</td>
                      <td className="px-3 py-2 font-sans font-medium text-forest">{entry.name}</td>
                      <td className="px-3 py-2 font-sans text-sage">{entry.plan_name}</td>
                      <td className="px-3 py-2 text-forest">{entry.ifsc || '—'}</td>
                      <td className="px-3 py-2 text-forest">{entry.account_number || '—'}</td>
                      <td className="px-3 py-2 text-sage">{entry.phone || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-sans font-semibold ${kycBadgeClass(entry.kyc_status)}`}>
                          {entry.kyc_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detected Header Mapping badges */}
            <div className="mt-4">
              <span className="text-[11px] font-medium text-sage">Detected Columns:</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {masterParseResult.detectedHeaders.map((header) => (
                  <span
                    key={header}
                    className="rounded-md border border-dsynq-border bg-dsynq-surface px-2 py-0.5 font-mono text-[10px] text-forest"
                  >
                    {header}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-dsynq-border p-4">
            <button
              type="button"
              onClick={() => setShowPreviewModal(false)}
              className="dsynq-btn-secondary rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Close
            </button>
            <button
              type="button"
              onClick={confirmMasterImport}
              disabled={loading !== null || masterParseResult.validCount === 0 || masterParseResult.missingRequiredColumns.length > 0}
              className="dsynq-btn-primary flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-semibold disabled:opacity-40"
            >
              {loading === 'master' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Indexing {masterParseResult.validCount} records...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Confirm & Index ({masterParseResult.validCount} Affiliates)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function Drawer({ row, onClose }: { row: PayoutRow; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
    <aside onClick={(event) => event.stopPropagation()} className="h-full w-full max-w-lg overflow-y-auto border-l border-dsynq-border bg-[var(--glass-background-elevated)] p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl border border-color-border bg-[var(--c-surface)] p-1.5 shadow-sm">
            <DSynqLogo size="sm" interactive={false} className="h-full w-full" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.2em] text-brand">Sponsor detail</p>
            <h2 className="text-2xl font-bold text-forest">{row.name}</h2>
            <p className="mt-1 font-mono text-xs text-sage">{row.code} · {row.plan}</p>
            <span className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${kycBadgeClass(row.kyc_status)}`}>KYC: {row.kyc_status}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close drawer" className="dsynq-btn-secondary rounded-lg p-2 text-sage transition hover:text-forest"><X size={17} /></button>
      </div>
      <div className="mb-7 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-dsynq-border bg-dsynq-surface p-3"><p className="text-[10px] text-sage">Sales</p><p className="mt-1 font-mono text-lg tabular-nums text-forest">{row.sales_count}</p></div>
        <div className="rounded-xl border border-dsynq-border bg-dsynq-surface p-3"><p className="text-[10px] text-sage">Gross</p><p className="mt-1 font-mono text-lg tabular-nums text-brand">{formatCurrency(row.gross)}</p></div>
        <div className="rounded-xl border border-dsynq-border bg-dsynq-surface p-3"><p className="text-[10px] text-sage">Net</p><p className="mt-1 font-mono text-lg tabular-nums text-status-success">{formatCurrency(row.net)}</p></div>
      </div>
      {row.ifsc && row.ifscResult && <div className={`mb-6 rounded-xl border p-4 ${row.ifscResult.valid ? 'border-status-success/20 bg-status-successBg' : 'border-status-error/20 bg-status-errorBg'}`}>
        <div className="mb-3 flex items-center gap-2"><Building2 size={15} className={row.ifscResult.valid ? 'text-status-success' : 'text-status-error'} /><span className="text-sm font-semibold text-forest">Banking verification</span><span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${row.ifscResult.valid ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'}`}>{row.ifscResult.valid ? 'Valid' : 'Invalid'}</span></div>
        {row.ifscResult.valid ? <div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-sage">Bank</span><p className="text-forest">{row.ifscResult.bank}</p></div><div><span className="text-sage">Branch</span><p className="text-forest">{row.ifscResult.branch}</p></div><div><span className="text-sage">City</span><p className="text-forest">{row.ifscResult.city}</p></div><div><span className="text-sage">State</span><p className="text-forest">{row.ifscResult.state}</p></div></div> : <p className="text-xs text-status-error">{row.ifscResult.error || 'This IFSC code could not be verified.'}</p>}
      </div>}
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-forest">Itemized transactions</h3><span className="text-[10px] text-sage">TDS 2% applied</span></div>
      <div className="space-y-2">{row.sales.map((sale: Sale) => <div key={sale.id} className="rounded-xl border border-dsynq-border bg-dsynq-surface p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-md bg-brand/10 px-2 py-1 text-[10px] text-brand">{sale.type}</span><span className="text-xs text-sage">{sale.target_plan}</span></div><p className="mt-2 text-xs text-sage">{sale.buyer}</p></div><p className="font-mono text-sm font-semibold tabular-nums text-status-success">{formatCurrency(sale.commission)}</p></div><div className="mt-3 flex items-center justify-between border-t border-dsynq-border pt-3 text-[10px] text-sage"><span>Sale value <strong className="font-mono font-medium text-forest">{formatCurrency(sale.amount)}</strong></span><span>{sale.from_plan ? `${sale.from_plan.replace(' Package', '')} → ` : ''}{sale.target_plan.replace(' Package', '')}</span></div></div>)}</div>
      <div className="mt-6 rounded-xl border border-dsynq-border bg-dsynq-surface p-4">
        <div className="flex items-center justify-between text-xs"><span className="text-sage">Gross commission</span><span className="font-mono tabular-nums text-forest">{formatCurrency(row.gross)}</span></div>
        <div className="mt-2 flex items-center justify-between text-xs"><span className="text-status-error/70">TDS deduction</span><span className="font-mono tabular-nums text-status-error">−{formatCurrency(row.tds)}</span></div>
        <div className="mt-3 flex items-center justify-between border-t border-dsynq-border pt-3 text-sm font-semibold"><span className="text-forest">Final net payout</span><span className="font-mono tabular-nums text-status-success">{formatCurrency(row.net)}</span></div>
      </div>
    </aside>
  </div>;
}

const VALID_LOGIN_ID = 'admin@dsynq';
const VALID_PASSWORD = 'admin@dsynq';

type ActiveModule = 'payout' | 'ifsc';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    const installedHandler = () => { setInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);
  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };
  const dismiss = () => setDeferredPrompt(null);
  return { canInstall: !!deferredPrompt && !installed, promptInstall, dismiss };
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginId.trim() === VALID_LOGIN_ID && password === VALID_PASSWORD) {
      setError('');
      onAuthenticated();
      return;
    }
    setError('Invalid ID or password');
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-8 text-forest">
      <div className="app-ambient" />
      <div className="login-ambient pointer-events-none fixed inset-0 z-0" />
      <div className="absolute top-4 right-4 z-20">
        <ThemeSwitcher compact />
      </div>
      <section className="dsynq-card dsynq-card-rim relative z-10 w-full max-w-md p-6 sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-visible bg-transparent">
            <DSynqLogo size="xl" interactive={false} className="h-16 w-16" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-brand">Welcome back</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-forest">DSynq Intelligence Suite</h1>
          <p className="mt-1.5 text-xs text-sage tracking-wider">
            powered by <strong className="font-semibold text-brand">DSynq</strong>
          </p>
          <p className="mt-2 text-xs text-sage">Sign in to access the commission &amp; payout intelligence suite</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold text-forest">Login ID / Email<input value={loginId} onChange={(event) => { setLoginId(event.target.value); setError(''); }} type="text" autoComplete="username" placeholder="Enter your login ID" className="dsynq-input mt-2 w-full px-3 py-3 text-sm" /></label>
          <label className="block text-xs font-semibold text-forest">Password<input value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} type="password" autoComplete="current-password" placeholder="Enter your password" className="dsynq-input mt-2 w-full px-3 py-3 text-sm" /></label>
          {error && <p role="alert" className={`shake rounded-xl px-3 py-2.5 text-xs font-medium text-status-error`} style={{ background: 'rgba(255, 94, 104, 0.12)', border: '1px solid rgba(255, 94, 104, 0.3)' }}>{error}</p>}
          <button type="submit" className="dsynq-btn-primary mt-2 w-full px-4 py-3 text-sm">Sign in</button>
        </form>
        <p className="mt-6 text-center text-[10px] uppercase tracking-[.16em] text-sage">Secure operations console</p>
      </section>
    </main>
  );
}

function ModuleSwitcher({
  active,
  onChange,
  idPrefix = 'nav',
}: {
  active: ActiveModule;
  onChange: (mod: ActiveModule) => void;
  idPrefix?: string;
}) {
  const isPayout = active === 'payout';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(isPayout ? 'ifsc' : 'payout');
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange('payout');
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange('ifsc');
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Workspace Module Selector"
      onKeyDown={handleKeyDown}
      className="relative flex w-full items-center rounded-xl bg-color-input p-1 shadow-inner backdrop-blur-md select-none sm:inline-flex sm:w-auto"
    >
      {/* Smooth sliding coral-red active indicator */}
      <div
        aria-hidden="true"
        className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg pointer-events-none transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none will-change-transform ${
          isPayout ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(135deg, rgba(255, 94, 104, 0.20) 0%, rgba(255, 94, 104, 0.10) 100%)',
          border: '1px solid rgba(255, 94, 104, 0.35)',
          boxShadow: '0 2px 10px -2px rgba(255, 94, 104, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        }}
      />

      {/* Payout Tab */}
      <button
        role="tab"
        id={`${idPrefix}-tab-payout`}
        aria-selected={isPayout}
        aria-controls="panel-payout"
        tabIndex={isPayout ? 0 : -1}
        onClick={() => onChange('payout')}
        type="button"
        className={`relative z-10 flex flex-1 sm:flex-initial sm:min-w-[124px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98] ${
          isPayout
            ? 'font-semibold text-brand'
            : 'font-medium text-sage hover:text-forest'
        }`}
      >
        <CircleDollarSign size={14} className={`transition-colors duration-200 ${isPayout ? 'text-brand' : 'text-sage'}`} />
        <span>Payout</span>
      </button>

      {/* IFSC Validator Tab */}
      <button
        role="tab"
        id={`${idPrefix}-tab-ifsc`}
        aria-selected={!isPayout}
        aria-controls="panel-ifsc"
        tabIndex={!isPayout ? 0 : -1}
        onClick={() => onChange('ifsc')}
        type="button"
        className={`relative z-10 flex flex-1 sm:flex-initial sm:min-w-[124px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98] ${
          !isPayout
            ? 'font-semibold text-brand'
            : 'font-medium text-sage hover:text-forest'
        }`}
      >
        <ShieldCheck size={14} className={`transition-colors duration-200 ${!isPayout ? 'text-brand' : 'text-sage'}`} />
        <span>IFSC Validator</span>
      </button>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dsynq_auth') === 'true' || localStorage.getItem('dsynq_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [activeModule, setActiveModule] = useState<ActiveModule>('payout');
  const [panelAnimClass, setPanelAnimClass] = useState<string>('');
  const [activeAffiliates, setActiveAffiliates] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();

  const handleLoginSuccess = () => {
    try {
      sessionStorage.setItem('dsynq_auth', 'true');
    } catch {
      // Storage unavailable fallback
    }
    setAuthenticated(true);
  };

  const handleSignOut = () => {
    try {
      sessionStorage.removeItem('dsynq_auth');
      localStorage.removeItem('dsynq_auth');
    } catch {
      // Storage unavailable fallback
    }
    setAuthenticated(false);
  };

  const handleModuleChange = (mod: ActiveModule) => {
    if (mod === activeModule) return;
    setPanelAnimClass(mod === 'ifsc' ? 'dsynq-panel-slide-right' : 'dsynq-panel-slide-left');
    setActiveModule(mod);
  };

  if (!authenticated) return <LoginScreen onAuthenticated={handleLoginSuccess} />;

  return (
    <div className="min-h-screen bg-canvas text-forest">
      <div className="app-ambient" />
      {canInstall && (
        <div className="animate-in fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl border border-cyan-400/25 bg-[var(--glass-background-elevated)] p-3 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl border border-color-border bg-[var(--c-surface)] p-1.5 shadow-sm">
              <DSynqLogo size="sm" interactive={false} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-forest">Install DSynq</p>
              <p className="text-[10px] text-sage">powered by <strong className="font-semibold text-brand">DSynq</strong></p>
            </div>
            <button onClick={promptInstall} className="dsynq-btn-primary rounded-lg px-3 py-1.5 text-[11px] font-semibold">Install</button>
            <button onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-sage transition hover:text-forest"><X size={15} /></button>
          </div>
        </div>
      )}
      <nav className="sticky top-0 z-40 border-b border-color-border bg-[var(--glass-background-elevated)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-visible bg-transparent">
              <DSynqLogo size="md" interactive className="cursor-pointer" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold tracking-tight text-forest leading-tight">DSynq Intelligence Suite</span>
              <span className="text-[9px] sm:text-[10px] leading-tight text-sage tracking-wider">
                powered by <strong className="font-semibold text-brand">DSynq</strong>
              </span>
            </div>
            <div className="h-5 w-px bg-color-border mx-2 hidden md:block" />
            <div className="hidden md:block">
              <ModuleSwitcher active={activeModule} onChange={handleModuleChange} idPrefix="desktop" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-color-border bg-color-input px-3 py-1.5">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px #34D399' }} />
              <span className="text-[10px] font-semibold tabular-nums text-sage sm:text-xs">
                {activeAffiliates > 0 ? `${activeAffiliates.toLocaleString('en-IN')} Sponsors Active` : 'Awaiting sync'}
                {lastSync && <span className="opacity-70"> • Last sync {formatTime(lastSync)}</span>}
              </span>
            </div>
            <ThemeSwitcher />
            <button onClick={handleSignOut} aria-label="Sign out" className="dsynq-btn-secondary flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <LogOut size={14} className="text-sage" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
          <div className="w-full md:hidden">
            <ModuleSwitcher active={activeModule} onChange={handleModuleChange} idPrefix="mobile" />
          </div>
        </div>
      </nav>

      {/* Main Workspace Panels with smooth directional slide and preserved state */}
      <main className="relative min-h-[calc(100vh-65px)] overflow-x-clip">
        <div
          id="panel-payout"
          role="tabpanel"
          aria-labelledby="desktop-tab-payout"
          className={activeModule === 'payout' ? panelAnimClass : 'hidden'}
          style={{ display: activeModule === 'payout' ? 'block' : 'none' }}
        >
          <PayoutView setActiveAffiliates={setActiveAffiliates} lastSync={lastSync} setLastSync={setLastSync} />
        </div>

        <div
          id="panel-ifsc"
          role="tabpanel"
          aria-labelledby="desktop-tab-ifsc"
          className={`mx-auto max-w-[1536px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8 ${
            activeModule === 'ifsc' ? panelAnimClass : 'hidden'
          }`}
          style={{ display: activeModule === 'ifsc' ? 'block' : 'none' }}
        >
          <div className="mb-6 flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-xl border border-color-border bg-[var(--c-surface)] p-2 shadow-sm">
              <DSynqLogo size="sm" interactive={false} className="h-full w-full" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand">IFSC validator</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-forest">Bank verification workspace</h1>
              <p className="mt-0.5 text-xs text-sage">powered by <strong className="font-semibold text-brand">DSynq</strong> · Batch-check bank branches before payout processing</p>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="dsynq-card dsynq-card-rim flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-sage">
                <Loader2 size={24} className="animate-spin text-brand" />
                <p className="text-xs font-medium text-forest">Loading IFSC Validator...</p>
              </div>
            }
          >
            <BatchValidator />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
