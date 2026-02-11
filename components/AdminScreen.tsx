'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { TextViewerModal } from './TextViewerModal';
import { KillSessionModal } from './KillSessionModal';
import styles from './AdminScreen.module.css';

interface AdminScreenProps {
  onClose: () => void;
}

interface SessionRow {
  session_id: string;
  username: string;
  role: string;
  peer: string;
  session_start_time: string;
  session_status: string;
  sql_text: string | null;
  bind_parameters: string | null;
  duration_ms: number | null;
}

interface EligibleServer {
  id: string;
  name: string;
  sessionId: string;
  qualifiedPrefix: string;
}

type SortColumn = keyof SessionRow;
type SortDirection = 'asc' | 'desc';

const SEARCHABLE_COLUMNS: { value: SortColumn; label: string }[] = [
  { value: 'username', label: 'Username' },
  { value: 'role', label: 'Role' },
  { value: 'peer', label: 'Peer' },
  { value: 'session_id', label: 'Session ID' },
  { value: 'sql_text', label: 'SQL Text' },
];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  session_id: 130,
  username: 120,
  role: 100,
  peer: 150,
  session_start_time: 180,
  session_status: 100,
  sql_text: 250,
  duration_ms: 100,
  actions: 120,
};

export function AdminScreen({ onClose }: AdminScreenProps) {
  const { state } = useApp();
  const [eligibleServers, setEligibleServers] = useState<EligibleServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingServers, setCheckingServers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [searchColumn, setSearchColumn] = useState<SortColumn>('username');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('session_start_time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Modal states
  const [textViewerContent, setTextViewerContent] = useState<{ title: string; content: string } | null>(null);
  const [killSessionTarget, setKillSessionTarget] = useState<{ serverId: string; sessionId: string; serverSessionId: string } | null>(null);

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const resizingRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column] || DEFAULT_COLUMN_WIDTHS[column] || 100,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.column]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

  // Check which servers have admin privileges and instrumentation enabled
  const checkServerEligibility = useCallback(async () => {
    setCheckingServers(true);
    const eligible: EligibleServer[] = [];

    for (const server of state.servers) {
      if (server.status !== 'connected') continue;

      // Check if instrumentation metadata is available and enabled
      const instrInfo = server.instrumentationInfo;
      if (!instrInfo?.enabled || !instrInfo.qualifiedPrefix) continue;

      try {
        const response = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': server.sessionId,
          },
          body: JSON.stringify({
            sessionId: server.sessionId,
            sql: `SELECT 1 FROM ${instrInfo.qualifiedPrefix}.session_activity LIMIT 1`,
          }),
        });

        if (response.ok) {
          eligible.push({
            id: server.id,
            name: server.name,
            sessionId: server.sessionId,
            qualifiedPrefix: instrInfo.qualifiedPrefix,
          });
        }
      } catch {
        // Server doesn't have admin privileges, skip it
      }
    }

    setEligibleServers(eligible);
    if (eligible.length > 0 && !selectedServerId) {
      setSelectedServerId(eligible[0].id);
    }
    setCheckingServers(false);
  }, [state.servers, selectedServerId]);

  // Fetch the current GizmoSQL session ID for the selected server
  const fetchCurrentSessionId = useCallback(async () => {
    const server = eligibleServers.find(s => s.id === selectedServerId);
    if (!server) {
      setCurrentSessionId(null);
      return;
    }

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': server.sessionId,
        },
        body: JSON.stringify({
          sessionId: server.sessionId,
          sql: 'SELECT gizmosql_current_session() AS session_id',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rows?.length > 0) {
          setCurrentSessionId(data.rows[0].session_id as string);
        }
      }
    } catch {
      // Non-critical — just won't highlight own session
    }
  }, [eligibleServers, selectedServerId]);

  // Fetch sessions from selected server
  const fetchSessions = useCallback(async () => {
    const server = eligibleServers.find(s => s.id === selectedServerId);
    if (!server) return;

    setLoading(true);
    setError(null);

    try {
      const whereClause = showOnlyActive ? "WHERE session_status = 'active'" : '';
      const sql = `SELECT * FROM ${server.qualifiedPrefix}.session_activity ${whereClause} QUALIFY row_number() OVER (PARTITION BY session_id ORDER BY execution_start_time DESC) = 1 ORDER BY session_start_time DESC`;

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
        throw new Error(data.error || 'Failed to fetch sessions');
      }

      const data = await response.json();
      setSessions(data.rows as SessionRow[]);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [eligibleServers, selectedServerId, showOnlyActive]);

  // Check eligibility on mount and when servers change
  useEffect(() => {
    checkServerEligibility();
  }, [checkServerEligibility]);

  // Fetch sessions and current session ID when server or filter changes
  useEffect(() => {
    if (selectedServerId && eligibleServers.length > 0) {
      fetchSessions();
      fetchCurrentSessionId();
    }
  }, [selectedServerId, eligibleServers.length, showOnlyActive, fetchSessions, fetchCurrentSessionId]);

  // Sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filtered and sorted sessions
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(session => {
        const value = session[searchColumn];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [sessions, searchTerm, searchColumn, sortColumn, sortDirection]);

  const getStatusClass = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'active': return styles.statusActive;
      case 'closed': return styles.statusClosed;
      case 'killed': return styles.statusKilled;
      case 'timeout': return styles.statusTimeout;
      case 'error': return styles.statusError;
      default: return styles.statusClosed;
    }
  };

  const formatDuration = (ms: number | null): string => {
    if (ms === null || ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      return date.toLocaleString();
    } catch {
      return ts;
    }
  };

  const truncateText = (text: string | null, maxLen: number = 50): string => {
    if (!text) return '-';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  };

  const handleKillSuccess = () => {
    fetchSessions();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const selectedServer = eligibleServers.find(s => s.id === selectedServerId);

  return (
    <div className={styles.modalOverlay} onMouseDown={handleBackdropClick}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Session Admin</h2>
          <button className={styles.modalClose} onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.serverSelect}>
            <select
              value={selectedServerId || ''}
              onChange={(e) => setSelectedServerId(e.target.value || null)}
              disabled={eligibleServers.length === 0}
            >
              {eligibleServers.length === 0 ? (
                <option value="">No eligible servers</option>
              ) : (
                eligibleServers.map(server => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showOnlyActive}
              onChange={(e) => setShowOnlyActive(e.target.checked)}
            />
            <span>Show only active</span>
          </label>

          <div className={styles.searchGroup}>
            <select
              className={styles.searchColumn}
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value as SortColumn)}
            >
              {SEARCHABLE_COLUMNS.map(col => (
                <option key={col.value} value={col.value}>{col.label}</option>
              ))}
            </select>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            className={styles.refreshBtn}
            onClick={fetchSessions}
            disabled={loading || !selectedServerId}
          >
            <span className={`${styles.refreshIcon} ${loading ? styles.spinning : ''}`}>⟳</span>
            Refresh
          </button>
        </div>

        <div className={styles.tableContainer}>
          {checkingServers ? (
            <div className={styles.loadingState}>
              <span className={styles.loadingSpinner}>⟳</span>
              <span>Checking server permissions...</span>
            </div>
          ) : eligibleServers.length === 0 ? (
            <div className={styles.emptyState}>
              <span>No Eligible Servers</span>
              <p className={styles.noServersMessage}>
                {state.servers.some(s => s.status === 'connected' && !s.instrumentationInfo?.enabled)
                  ? 'Instrumentation is not enabled on any connected server. Start GizmoSQL with --enable-instrumentation to use session management.'
                  : 'No connected servers have admin privileges. Connect to a GizmoSQL server with instrumentation enabled to manage sessions.'}
              </p>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <span>Error</span>
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className={styles.loadingState}>
              <span className={styles.loadingSpinner}>⟳</span>
              <span>Loading sessions...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className={styles.emptyState}>
              <span>No Sessions Found</span>
              <p>{showOnlyActive ? 'No active sessions' : 'No sessions match your criteria'}</p>
            </div>
          ) : (
            <table className={styles.sessionsTable}>
              <thead>
                <tr>
                  <th style={{ width: columnWidths.session_id }} onClick={() => handleSort('session_id')}>
                    <span className={styles.headerContent}>
                      Session ID
                      {sortColumn === 'session_id' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'session_id')} />
                  </th>
                  <th style={{ width: columnWidths.username }} onClick={() => handleSort('username')}>
                    <span className={styles.headerContent}>
                      Username
                      {sortColumn === 'username' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'username')} />
                  </th>
                  <th style={{ width: columnWidths.role }} onClick={() => handleSort('role')}>
                    <span className={styles.headerContent}>
                      Role
                      {sortColumn === 'role' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'role')} />
                  </th>
                  <th style={{ width: columnWidths.peer }} onClick={() => handleSort('peer')}>
                    <span className={styles.headerContent}>
                      Peer
                      {sortColumn === 'peer' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'peer')} />
                  </th>
                  <th style={{ width: columnWidths.session_start_time }} onClick={() => handleSort('session_start_time')}>
                    <span className={styles.headerContent}>
                      Start Time
                      {sortColumn === 'session_start_time' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'session_start_time')} />
                  </th>
                  <th style={{ width: columnWidths.session_status }} onClick={() => handleSort('session_status')}>
                    <span className={styles.headerContent}>
                      Status
                      {sortColumn === 'session_status' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'session_status')} />
                  </th>
                  <th style={{ width: columnWidths.sql_text }} onClick={() => handleSort('sql_text')}>
                    <span className={styles.headerContent}>
                      SQL Text
                      {sortColumn === 'sql_text' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'sql_text')} />
                  </th>
                  <th style={{ width: columnWidths.duration_ms }} onClick={() => handleSort('duration_ms')}>
                    <span className={styles.headerContent}>
                      Duration
                      {sortColumn === 'duration_ms' && (
                        <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                    <span className={styles.resizeHandle} onMouseDown={(e) => handleResizeStart(e, 'duration_ms')} />
                  </th>
                  <th style={{ width: columnWidths.actions }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => {
                  const isOwnSession = currentSessionId === session.session_id;
                  return (
                  <tr key={session.session_id} className={isOwnSession ? styles.ownSessionRow : undefined}>
                    <td className={styles.sessionIdCell} title={session.session_id}>
                      {truncateText(session.session_id, 12)}
                      {isOwnSession && <span className={styles.ownBadge} title="Your session">you</span>}
                    </td>
                    <td>{session.username}</td>
                    <td>{session.role}</td>
                    <td>{session.peer}</td>
                    <td>{formatTimestamp(session.session_start_time)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${getStatusClass(session.session_status)}`}>
                        {session.session_status}
                      </span>
                    </td>
                    <td className={styles.truncatedCell}>
                      {truncateText(session.sql_text)}
                      {session.sql_text && session.sql_text.length > 50 && (
                        <button
                          className={styles.viewBtn}
                          onClick={() => setTextViewerContent({ title: 'SQL Text', content: session.sql_text! })}
                        >
                          View
                        </button>
                      )}
                    </td>
                    <td className={styles.durationCell}>{formatDuration(session.duration_ms)}</td>
                    <td className={styles.actionsCell}>
                      {session.bind_parameters && (
                        <button
                          className={styles.viewBtn}
                          onClick={() => setTextViewerContent({ title: 'Bind Parameters', content: session.bind_parameters! })}
                        >
                          Params
                        </button>
                      )}
                      {session.session_status === 'active' && selectedServer && !isOwnSession && (
                        <button
                          className={styles.killBtn}
                          onClick={() => setKillSessionTarget({
                            serverId: selectedServer.id,
                            sessionId: session.session_id,
                            serverSessionId: selectedServer.sessionId,
                          })}
                        >
                          Kill
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {textViewerContent && (
        <TextViewerModal
          title={textViewerContent.title}
          content={textViewerContent.content}
          onClose={() => setTextViewerContent(null)}
        />
      )}

      {killSessionTarget && (
        <KillSessionModal
          serverSessionId={killSessionTarget.serverSessionId}
          targetSessionId={killSessionTarget.sessionId}
          onClose={() => setKillSessionTarget(null)}
          onSuccess={handleKillSuccess}
        />
      )}
    </div>
  );
}
