'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import styles from './TableDetails.module.css';

// Dynamic import for Monaco Editor (client-side only)
const Editor = dynamic(() => import('@monaco-editor/react').then(mod => mod.default), {
  ssr: false,
  loading: () => <div className={styles.editorLoading}>Loading...</div>,
});

interface TableDetailsProps {
  serverId: string | null;
  catalog: string | null;
  schema: string | null;
  tableName: string | null;
}

interface ColumnSummary {
  column_name: string;
  column_type: string;
  min: string | null;
  max: string | null;
  approx_unique: number | null;
  avg: string | null;
  std: string | null;
  q25: string | null;
  q50: string | null;
  q75: string | null;
  count: number | null;
  null_percentage: string | null;
}

interface PreviewData {
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
}

type TabType = 'summary' | 'preview' | 'definition';
type SortType = 'original' | 'type' | 'name';

export function TableDetails({ serverId, catalog, schema, tableName }: TableDetailsProps) {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnSummary[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [ddl, setDdl] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [sortBy, setSortBy] = useState<SortType>('original');
  const [showTypes, setShowTypes] = useState(true);
  const [showDistributions, setShowDistributions] = useState(true);

  const server = serverId ? state.servers.find(s => s.id === serverId) : null;

  // Escape SQL string values
  const escapeString = (str: string): string => {
    return str.replace(/'/g, "''");
  };

  // Fetch table summary
  const fetchSummary = useCallback(async () => {
    if (!server || !catalog || !schema || !tableName) return;

    setLoading(true);
    setError(null);

    try {
      const quotedTable = `"${catalog}"."${schema}"."${tableName}"`;
      const sql = `SUMMARIZE ${quotedTable}`;

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': server.sessionId,
        },
        body: JSON.stringify({ sessionId: server.sessionId, sql }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch table summary');
      }

      const data = await response.json();

      const summaries: ColumnSummary[] = data.rows.map((row: Record<string, unknown>) => ({
        column_name: row.column_name as string,
        column_type: normalizeType(row.column_type as string),
        min: row.min as string | null,
        max: row.max as string | null,
        approx_unique: row.approx_unique as number | null,
        avg: row.avg as string | null,
        std: row.std as string | null,
        q25: row.q25 as string | null,
        q50: row.q50 as string | null,
        q75: row.q75 as string | null,
        count: row.count as number | null,
        null_percentage: row.null_percentage as string | null,
      }));

      setColumns(summaries);
      if (summaries.length > 0 && summaries[0].count !== null) {
        setRowCount(summaries[0].count);
      }
    } catch (err) {
      console.error('Failed to fetch table summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch summary');
    } finally {
      setLoading(false);
    }
  }, [server, catalog, schema, tableName]);

  // Fetch preview data
  const fetchPreview = useCallback(async () => {
    if (!server || !catalog || !schema || !tableName) return;

    setLoading(true);
    setError(null);

    try {
      const quotedTable = `"${catalog}"."${schema}"."${tableName}"`;
      const sql = `SELECT * FROM ${quotedTable} LIMIT 100`;

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': server.sessionId,
        },
        body: JSON.stringify({ sessionId: server.sessionId, sql }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch preview');
      }

      const data = await response.json();
      setPreviewData({
        columns: data.columns,
        rows: data.rows,
      });
    } catch (err) {
      console.error('Failed to fetch preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch preview');
    } finally {
      setLoading(false);
    }
  }, [server, catalog, schema, tableName]);

  // Fetch DDL
  const fetchDDL = useCallback(async () => {
    if (!server || !catalog || !schema || !tableName) return;

    setLoading(true);
    setError(null);

    try {
      const sql = `SELECT sql FROM duckdb_tables() WHERE database_name = '${escapeString(catalog)}' AND schema_name = '${escapeString(schema)}' AND table_name = '${escapeString(tableName)}'`;

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': server.sessionId,
        },
        body: JSON.stringify({ sessionId: server.sessionId, sql }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch DDL');
      }

      const data = await response.json();
      if (data.rows.length > 0 && data.rows[0].sql) {
        setDdl(data.rows[0].sql as string);
      } else {
        setDdl(null);
      }
    } catch (err) {
      console.error('Failed to fetch DDL:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch DDL');
    } finally {
      setLoading(false);
    }
  }, [server, catalog, schema, tableName]);

  // Load data when table changes or tab changes
  useEffect(() => {
    if (!serverId || !catalog || !schema || !tableName) {
      setColumns([]);
      setRowCount(null);
      setPreviewData(null);
      setDdl(null);
      return;
    }

    if (activeTab === 'summary') {
      fetchSummary();
    } else if (activeTab === 'preview') {
      if (!previewData) fetchPreview();
    } else if (activeTab === 'definition') {
      if (!ddl) fetchDDL();
    }
  }, [serverId, catalog, schema, tableName, activeTab, fetchSummary, fetchPreview, fetchDDL, previewData, ddl]);

  // Reset data when table changes
  useEffect(() => {
    setPreviewData(null);
    setDdl(null);
    setActiveTab('summary');
  }, [serverId, catalog, schema, tableName]);

  // Normalize type names
  const normalizeType = (type: string): string => {
    const typeMap: Record<string, string> = {
      'Utf8': 'VARCHAR', 'utf8': 'VARCHAR', 'LargeUtf8': 'VARCHAR',
      'Int8': 'TINYINT', 'Int16': 'SMALLINT', 'Int32': 'INTEGER', 'Int64': 'BIGINT',
      'UInt8': 'UTINYINT', 'UInt16': 'USMALLINT', 'UInt32': 'UINTEGER', 'UInt64': 'UBIGINT',
      'Float32': 'FLOAT', 'Float64': 'DOUBLE', 'Boolean': 'BOOLEAN',
      'Date32': 'DATE', 'Date64': 'DATE', 'Timestamp': 'TIMESTAMP',
    };
    return typeMap[type] || type;
  };

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTypeIcon = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') ||
        lowerType.includes('double') || lowerType.includes('numeric')) return '123';
    if (lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('text') ||
        lowerType.includes('string')) return 'T';
    if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) return 'D';
    if (lowerType.includes('bool')) return 'B';
    return '?';
  };

  const getTypeClass = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') ||
        lowerType.includes('double') || lowerType.includes('numeric')) return styles.typeNumber;
    if (lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('text') ||
        lowerType.includes('string')) return styles.typeString;
    if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) return styles.typeDate;
    if (lowerType.includes('bool')) return styles.typeBool;
    return styles.typeOther;
  };

  const getSortedColumns = (): ColumnSummary[] => {
    const sorted = [...columns];
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.column_name.localeCompare(b.column_name));
    } else if (sortBy === 'type') {
      sorted.sort((a, b) => a.column_type.localeCompare(b.column_type));
    }
    return sorted;
  };

  const copyDDL = () => {
    if (ddl) {
      navigator.clipboard.writeText(ddl);
    }
  };

  const copyColumnNames = () => {
    const names = columns.map(c => c.column_name).join(', ');
    navigator.clipboard.writeText(names);
  };

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  if (!tableName) {
    return (
      <div className={`${styles.tableDetails} ${styles.empty}`}>
        <p>Select a table to view details</p>
      </div>
    );
  }

  return (
    <div className={styles.tableDetails}>
      <div className={styles.tableDetailsHeader}>
        <div className={styles.tableDetailsTitle}>
          <span className={styles.tableIcon}>▦</span>
          <span className={styles.tableName}>{tableName}</span>
        </div>
        <div className={styles.tableDetailsMeta}>
          {rowCount !== null && (
            <span className={styles.tableRowCount}>{formatNumber(rowCount)} rows</span>
          )}
          <button
            className={`btn btn-ghost btn-icon ${styles.optionsBtn}`}
            onClick={() => setShowOptions(!showOptions)}
            title="Options"
          >
            ⋮
          </button>
        </div>

        {showOptions && (
          <div className={styles.optionsMenu}>
            <button onClick={() => { fetchSummary(); setShowOptions(false); }}>
              ↻ Refresh table summary
            </button>
            <button onClick={() => { copyColumnNames(); setShowOptions(false); }}>
              📋 Copy column names to clipboard
            </button>
            <div className={styles.optionsDivider} />
            <button onClick={() => setSortBy('original')} className={sortBy === 'original' ? styles.active : ''}>
              {sortBy === 'original' && '✓ '}Sort columns by original position
            </button>
            <button onClick={() => setSortBy('type')} className={sortBy === 'type' ? styles.active : ''}>
              {sortBy === 'type' && '✓ '}Sort columns by type
            </button>
            <button onClick={() => setSortBy('name')} className={sortBy === 'name' ? styles.active : ''}>
              {sortBy === 'name' && '✓ '}Sort columns by name
            </button>
            <div className={styles.optionsDivider} />
            <button onClick={() => setShowTypes(!showTypes)}>
              {showTypes && '✓ '}Show types
            </button>
            <button onClick={() => setShowDistributions(!showDistributions)}>
              {showDistributions && '✓ '}Show distributions
            </button>
            <div className={styles.optionsDivider} />
            <button onClick={() => setShowOptions(false)}>
              ✕ Close
            </button>
          </div>
        )}
      </div>

      <div className={styles.tableDetailsTabs}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'summary' ? styles.active : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.active : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Preview
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'definition' ? styles.active : ''}`}
          onClick={() => setActiveTab('definition')}
        >
          Definition
        </button>
      </div>

      <div className={styles.tableDetailsContent}>
        {loading && (
          <div className={styles.tableDetailsLoading}>
            <span className={styles.loadingSpinner}>⟳</span>
            Loading...
          </div>
        )}

        {error && (
          <div className={styles.tableDetailsError}>
            {error}
          </div>
        )}

        {!loading && !error && activeTab === 'summary' && (
          <div className={styles.tableDetailsColumns}>
            {/* Column headers */}
            <div className={styles.tableColumnHeader}>
              <span className={styles.columnHeaderIcon}></span>
              <span className={styles.columnHeaderName}>Column</span>
              {showTypes && (
                <span className={styles.columnHeaderType}>Type</span>
              )}
              {showDistributions && (
                <span className={styles.columnHeaderStat}>NDV</span>
              )}
            </div>
            {getSortedColumns().map((col, idx) => (
              <div key={idx} className={styles.tableColumnItem}>
                <span className={`${styles.columnTypeIcon} ${getTypeClass(col.column_type)}`}>
                  {getTypeIcon(col.column_type)}
                </span>
                <span className={styles.columnName}>{col.column_name}</span>
                {showTypes && (
                  <span className={styles.columnTypeLabel}>{col.column_type}</span>
                )}
                {showDistributions && (
                  <span className={styles.columnStat}>
                    {col.approx_unique !== null ? formatNumber(col.approx_unique) : '-'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && activeTab === 'preview' && previewData && (
          <div className={styles.previewTableContainer}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  {previewData.columns.map((col, idx) => (
                    <th key={idx}>
                      <span className={`${styles.columnTypeIcon} ${styles.small} ${getTypeClass(col.type)}`}>
                        {getTypeIcon(col.type)}
                      </span>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {previewData.columns.map((col, colIdx) => (
                      <td key={colIdx}>{formatCellValue(row[col.name])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.previewFooter}>
              {previewData.columns.length} columns, {previewData.rows.length} rows shown
            </div>
          </div>
        )}

        {!loading && !error && activeTab === 'definition' && (
          <div className={styles.ddlContainer}>
            {ddl ? (
              <>
                <div className={styles.ddlEditor}>
                  <Editor
                    height="100%"
                    defaultLanguage="sql"
                    value={ddl}
                    theme={state.theme === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                      lineNumbers: 'off',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: 'on',
                      padding: { top: 8, bottom: 8 },
                      renderLineHighlight: 'none',
                      scrollbar: { vertical: 'auto', horizontal: 'auto' },
                      overviewRulerLanes: 0,
                      hideCursorInOverviewRuler: true,
                      overviewRulerBorder: false,
                      folding: false,
                      glyphMargin: false,
                      lineDecorationsWidth: 0,
                      lineNumbersMinChars: 0,
                    }}
                  />
                </div>
                <div className={styles.ddlFooter}>
                  <button className="btn btn-secondary btn-sm" onClick={copyDDL}>
                    📋 Copy DDL
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.ddlEmpty}>No DDL available for this table</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
