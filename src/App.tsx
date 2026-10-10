import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, BadgeIndianRupee, BarChart3, Building2, ChevronLeft, ChevronRight, CircleDollarSign, Cloud, Database, FileSpreadsheet, Filter, Layers, Loader2, LogOut, RefreshCw, Search, ShieldCheck, ShieldX, Upload, Users, X, Wifi, FileUp } from 'lucide-react';
import { downloadReport, processSales, switchDataSourceMode, syncGoogleSheet, uploadMaster } from '@/api';
import { BatchValidator } from '@/components/BatchValidator';
import { DSynqLogo } from '@/components/DSynqLogo';
import { ThemeSwitcher } from '@/theme';
import type { Kpis, PayoutRow, Sale, KycStatus } from '@/types';

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
  const sheetUrl = DEFAULT_URL;
  const [file, setFile] = useState<File | null>(null);
  const [masterFile, setMasterFile] = useState<File | null>(null);
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
        const result = await syncGoogleSheet(DEFAULT_URL);
        setActiveAffiliates(result.active_affiliates);
        setLastSync(result.last_sync);
        setMasterIndexed(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auto-sync failed. Click Sync to retry.');
      } finally {
        setLoading(null);
      }
    })();
  }, [setActiveAffiliates, setLastSync]);

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
    const status = switchDataSourceMode(mode);
    setActiveAffiliates(status.active_affiliates);
    setLastSync(status.last_sync);
    setMasterIndexed(status.is_indexed);
    setRows([]);
    setKpis(initialKpis);
  };

  const uploadMasterFile = async () => {
    if (!masterFile) return;
    setLoading('master');
    setError('');
    try {
      const result = await uploadMaster(masterFile);
      setActiveAffiliates(result.active_affiliates);
      setLastSync(result.last_sync);
      setMasterIndexed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master upload failed.');
    } finally {
      setLoading(null);
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
          <div className="flex items-center rounded-xl border border-dsynq-border bg-dsynq-surface p-3">
            <button
              onClick={sync}
              disabled={loading !== null}
              className="dsynq-btn-primary flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
            >
              {loading === 'sync' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              <span>Sync Google Sheet</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dsynq-border bg-dsynq-surface p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sage"><Database size={14} className="text-blue-400" /> Master data upload</div>
            <div className="flex items-center gap-2"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed dsynq-border px-3 py-2 text-xs text-sage transition hover:border-brand/50 hover:text-forest"><Upload size={14} /> <span className="truncate">{masterFile?.name ?? 'Upload Master Data.xlsx'}</span><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => setMasterFile(event.target.files?.[0] ?? null)} /></label><button onClick={uploadMasterFile} disabled={!masterFile || loading !== null} className="dsynq-btn-secondary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40">Index</button></div>
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
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-forest">Payout ledger</h2><span className="rounded-full bg-dsynq-surface px-2 py-0.5 text-[10px] text-sage">{totalRows} sponsors</span></div>
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

function ModuleSwitcher({ active, onChange }: { active: ActiveModule; onChange: (mod: ActiveModule) => void }) {
  const payoutActive = active === 'payout';
  const btnBase = 'flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-all duration-300 ease-out active:scale-[0.97] will-change-transform';
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-color-border bg-color-input p-1 text-center shadow-inner backdrop-blur-md sm:inline-flex sm:w-auto">
      <button onClick={() => onChange('payout')} className={`${btnBase} ${payoutActive ? 'border border-brand/30 bg-brand/15 font-semibold text-brand shadow-sm' : 'font-medium text-sage hover:bg-color-hover hover:text-forest'}`}>
        <CircleDollarSign size={14} />
        <span>Payout</span>
      </button>
      <button onClick={() => onChange('ifsc')} className={`${btnBase} ${!payoutActive ? 'border border-emerald-400/30 bg-emerald-500/15 font-semibold text-emerald-500 dark:text-emerald-300 shadow-sm' : 'font-medium text-sage hover:bg-color-hover hover:text-forest'}`}>
        <ShieldCheck size={14} />
        <span>IFSC Validator</span>
      </button>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>('payout');
  const [activeAffiliates, setActiveAffiliates] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();
  if (!authenticated) return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;

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
              <ModuleSwitcher active={activeModule} onChange={setActiveModule} />
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
            <button onClick={() => setAuthenticated(false)} aria-label="Sign out" className="dsynq-btn-secondary flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold">
              <LogOut size={14} className="text-sage" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
          <div className="w-full md:hidden">
            <ModuleSwitcher active={activeModule} onChange={setActiveModule} />
          </div>
        </div>
      </nav>
      {activeModule === 'payout' && (
        <div key="payout" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300 ease-out">
          <PayoutView setActiveAffiliates={setActiveAffiliates} lastSync={lastSync} setLastSync={setLastSync} />
        </div>
      )}
      {activeModule === 'ifsc' && (
        <div key="ifsc" className="mx-auto max-w-[1536px] animate-in fade-in-50 slide-in-from-bottom-2 px-4 py-5 duration-300 ease-out sm:px-6 lg:px-10 lg:py-8">
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
          <BatchValidator />
        </div>
      )}
    </div>
  );
}

export default App;
