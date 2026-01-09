'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { CellResult } from '@/lib/types';
import * as arrow from 'apache-arrow';
import styles from './ResultsTable.module.css';

interface ResultsTableProps {
  result: CellResult;
  maxHeight?: number;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
}

export function ResultsTable({ result, maxHeight, onPageChange, isLoading }: ResultsTableProps) {
  const { columns, rows, page, pageSize, hasMore } = result;
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownloadMenu]);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getCellClassName = (value: unknown): string => {
    if (value === null || value === undefined) {
      return styles.cellNull;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return styles.cellNumber;
    }
    if (typeof value === 'boolean') {
      return styles.cellBoolean;
    }
    return '';
  };

  const tableStyle = useMemo(() => ({
    maxHeight: maxHeight ? `${maxHeight}px` : undefined,
  }), [maxHeight]);

  // Calculate row number offset based on page
  const rowOffset = ((page || 1) - 1) * (pageSize || 1000);

  // Format value for export (different from display)
  const formatExportValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Copy results to clipboard as TSV
  const handleCopy = async () => {
    const header = columns.map(c => c.name).join('\t');
    const dataRows = rows.map(row =>
      columns.map(col => formatExportValue(row[col.name])).join('\t')
    ).join('\n');
    const text = header + '\n' + dataRows;

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Download as file
  const handleDownload = async (format: 'csv' | 'tsv' | 'json' | 'parquet') => {
    setShowDownloadMenu(false);

    if (format === 'parquet') {
      try {
        // Dynamic import for parquet-wasm
        const { default: initParquetWasm, Table: ParquetTable, writeParquet } = await import('parquet-wasm');
        await initParquetWasm();

        // Build column data as object for arrow.tableFromArrays
        const columnArrays: Record<string, unknown[]> = {};
        for (const col of columns) {
          columnArrays[col.name] = rows.map(row => {
            const val = row[col.name];
            if (val === null || val === undefined) return null;
            // Convert to appropriate type
            const sqlType = col.type.toUpperCase();
            if (sqlType.includes('INT') || sqlType.includes('DECIMAL') || sqlType.includes('DOUBLE') || sqlType.includes('FLOAT')) {
              return typeof val === 'number' ? val : Number(val);
            }
            if (sqlType.includes('BOOL')) {
              return Boolean(val);
            }
            return String(val);
          });
        }

        // Create Arrow table from arrays
        const arrowTable = arrow.tableFromArrays(columnArrays);

        // Convert to IPC stream format
        const ipcBytes = arrow.tableToIPC(arrowTable, 'stream');

        // Convert to parquet-wasm Table and write Parquet
        const parquetTable = ParquetTable.fromIPCStream(ipcBytes);
        const parquetBytes = writeParquet(parquetTable);

        // Copy to regular ArrayBuffer (parquet-wasm may use SharedArrayBuffer)
        const parquetBuffer = new Uint8Array(parquetBytes.length);
        parquetBuffer.set(parquetBytes);

        // Download
        const blob = new Blob([parquetBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'results.parquet';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to create Parquet file:', err);
        alert('Failed to create Parquet file. See console for details.');
      }
      return;
    }

    let content: string;
    let mimeType: string;
    let extension: string;

    const delimiter = format === 'csv' ? ',' : '\t';

    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    } else {
      // CSV or TSV
      const escapeValue = (val: string) => {
        if (format === 'csv' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      };
      const header = columns.map(c => escapeValue(c.name)).join(delimiter);
      const dataRows = rows.map(row =>
        columns.map(col => escapeValue(formatExportValue(row[col.name]))).join(delimiter)
      ).join('\n');
      content = header + '\n' + dataRows;
      mimeType = format === 'csv' ? 'text/csv' : 'text/tab-separated-values';
      extension = format;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canGoPrevious = (page || 1) > 1;
  const canGoNext = hasMore;

  const handlePrevious = () => {
    if (onPageChange && canGoPrevious) {
      onPageChange((page || 1) - 1);
    }
  };

  const handleNext = () => {
    if (onPageChange && canGoNext) {
      onPageChange((page || 1) + 1);
    }
  };

  return (
    <div className={styles.resultsTableContainer}>
      <div className={styles.resultsTableWrapper} style={tableStyle}>
        {isLoading && (
          <div className={styles.resultsLoadingOverlay}>
            <span className={styles.loadingSpinner}>⟳</span>
            Loading...
          </div>
        )}
        <table className={styles.resultsTable}>
          <thead>
            <tr>
              <th className={styles.rowNumberHeader}>#</th>
              {columns.map((col, idx) => (
                <th key={idx}>
                  <div className={styles.columnHeader}>
                    <span className={styles.columnName}>{col.name}</span>
                    <span className={styles.columnType}>{col.type}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className={styles.emptyResults}>
                  No results
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <td className={styles.rowNumber}>{rowOffset + rowIdx + 1}</td>
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={getCellClassName(row[col.name])}>
                      {formatValue(row[col.name])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with pagination and export controls */}
      <div className={styles.resultsFooter}>
        {/* Pagination controls - left side */}
        <div className={styles.resultsPagination}>
          {onPageChange && (canGoPrevious || canGoNext) ? (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handlePrevious}
                disabled={!canGoPrevious || isLoading}
              >
                ← Previous
              </button>
              <span className={styles.paginationInfo}>
                Page {page || 1} • Rows {rowOffset + 1}-{rowOffset + rows.length}
                {hasMore ? '+' : ''}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleNext}
                disabled={!canGoNext || isLoading}
              >
                Next →
              </button>
            </>
          ) : (
            <span className={styles.paginationInfo}>
              {rows.length} row{rows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Export controls - right side */}
        <div className={styles.resultsExport}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copyStatus === 'copied' ? '✓' : '📋'}
          </button>
          <div className={styles.downloadMenuContainer} ref={downloadMenuRef}>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              title="Download results"
            >
              ⬇
            </button>
            {showDownloadMenu && (
              <div className={styles.downloadMenu}>
                <button onClick={() => handleDownload('csv')}>
                  Comma-Separated values (.csv)
                </button>
                <button onClick={() => handleDownload('tsv')}>
                  Tab-Separated values (.tsv)
                </button>
                <button onClick={() => handleDownload('json')}>
                  JSON
                </button>
                <button onClick={() => handleDownload('parquet')}>
                  Parquet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
