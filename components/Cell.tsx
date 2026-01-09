'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import { Cell as CellType } from '@/lib/types';
import { ResultsTable } from './ResultsTable';
import { ServerSelectModal } from './ServerSelectModal';
import styles from './Cell.module.css';

// Dynamic import for Monaco Editor (client-side only)
const Editor = dynamic(() => import('@monaco-editor/react').then(mod => mod.default), {
  ssr: false,
  loading: () => <div className={styles.editorLoading}>Loading editor...</div>,
});

interface CellProps {
  notebookId: string;
  cell: CellType;
  isActive: boolean;
  onActivate: () => void;
  onAddCellBelow: () => void;
  onRequestConnection?: (cellId: string) => void;
}

export function Cell({ notebookId, cell, isActive, onActivate, onAddCellBelow, onRequestConnection }: CellProps) {
  const { state, updateCellSql, updateCellServer, executeCell, removeCell, fetchCellPage } = useApp();
  const editorRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showServerSelect, setShowServerSelect] = useState(false);
  const [pendingExecute, setPendingExecute] = useState(false);
  // Use ref to avoid stale closure in Monaco actions
  const executeRef = useRef<() => void>(() => {});

  const handleExecute = useCallback(() => {
    // Auto-activate this cell when executing so right pane updates
    onActivate();

    // Check if the cell's server still exists (could be stale from previous session)
    const serverExists = cell.serverId && state.servers.some(s => s.id === cell.serverId);

    // If no server selected or server no longer exists
    if (!cell.serverId || !serverExists) {
      // Clear stale server ID if it no longer exists
      if (cell.serverId && !serverExists) {
        updateCellServer(notebookId, cell.id, null);
      }

      // If no servers connected, request connection
      if (state.servers.length === 0) {
        if (onRequestConnection) {
          onRequestConnection(cell.id);
        }
        return;
      }
      // If only one server, auto-select it
      if (state.servers.length === 1) {
        updateCellServer(notebookId, cell.id, state.servers[0].id);
        // Execute after state update
        setTimeout(() => executeCell(notebookId, cell.id), 0);
        return;
      }
      // If multiple servers, show selection modal
      if (state.servers.length > 1) {
        setShowServerSelect(true);
        return;
      }
      return;
    }

    executeCell(notebookId, cell.id);
  }, [executeCell, notebookId, cell.id, cell.serverId, state.servers, updateCellServer, onRequestConnection, onActivate]);

  const handleServerSelect = (serverId: string) => {
    updateCellServer(notebookId, cell.id, serverId);
    setShowServerSelect(false);
    setPendingExecute(true);
  };

  // Execute when server is selected and state has updated
  useEffect(() => {
    if (pendingExecute && cell.serverId) {
      setPendingExecute(false);
      executeCell(notebookId, cell.id);
    }
  }, [pendingExecute, cell.serverId, executeCell, notebookId, cell.id]);

  // Keep the ref updated
  useEffect(() => {
    executeRef.current = handleExecute;
  }, [handleExecute]);

  // Handle keyboard shortcut at the container level as fallback
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Enter or Ctrl+Enter or Shift+Enter
      if ((e.metaKey || e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        executeRef.current();
      }
    };

    container.addEventListener('keydown', handleKeyDown, true);
    return () => container.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleEditorDidMount = (editorInstance: unknown, monaco: unknown) => {
    editorRef.current = editorInstance;
    const editor = editorInstance as { addAction: (config: unknown) => void; focus: () => void };
    const mon = monaco as { KeyMod: { CtrlCmd: number; Shift: number }; KeyCode: { Enter: number }; languages: { CompletionItemKind: { Keyword: number }; registerCompletionItemProvider: (lang: string, provider: unknown) => void } };

    // Add Ctrl+Enter / Cmd+Enter action to execute query
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [
        mon.KeyMod.CtrlCmd | mon.KeyCode.Enter,
      ],
      precondition: undefined,
      keybindingContext: undefined,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        executeRef.current();
      },
    });

    // Also add Shift+Enter as alternative
    editor.addAction({
      id: 'execute-query-shift',
      label: 'Execute Query (Shift+Enter)',
      keybindings: [
        mon.KeyMod.Shift | mon.KeyCode.Enter,
      ],
      run: () => {
        executeRef.current();
      },
    });

    // SQL autocomplete
    mon.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: { getWordUntilPosition: (pos: unknown) => { startColumn: number; endColumn: number } }, position: { lineNumber: number }) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
          'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
          'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'GROUP', 'HAVING',
          'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
          'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW', 'AS', 'DISTINCT',
          'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];

        return {
          suggestions: keywords.map(kw => ({
            label: kw,
            kind: mon.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          })),
        };
      },
    });
  };

  // Focus editor when cell becomes active
  useEffect(() => {
    if (isActive && editorRef.current) {
      (editorRef.current as { focus: () => void }).focus();
    }
  }, [isActive]);

  const selectedServer = state.servers.find(s => s.id === cell.serverId);
  // Allow execution if there's SQL - the handler will prompt for connection if needed
  const canExecute = !!cell.sql.trim() && !cell.isExecuting;

  return (
    <div
      ref={containerRef}
      className={`${styles.cell} ${isActive ? styles.active : ''}`}
      onClick={onActivate}
    >
      <div className={styles.cellHeader}>
        <div className={styles.cellHeaderLeft}>
          <button
            className={`btn btn-primary btn-sm ${styles.executeBtn}`}
            onClick={handleExecute}
            disabled={!canExecute}
          >
            {cell.isExecuting ? (
              <>
                <span className="spinner"></span>
                Running...
              </>
            ) : (
              <>▶ Run</>
            )}
          </button>
          {cell.result && (
            <span className={styles.cellStats}>
              {cell.result.rowCount} row{cell.result.rowCount !== 1 ? 's' : ''} • {cell.result.executionTimeMs}ms
            </span>
          )}
        </div>
        <div className={styles.cellHeaderRight}>
          <select
            className={styles.serverSelect}
            value={cell.serverId || ''}
            onChange={e => updateCellServer(notebookId, cell.id, e.target.value || null)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">Select server...</option>
            {state.servers.map(server => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost btn-icon"
            onClick={e => { e.stopPropagation(); onAddCellBelow(); }}
            title="Add cell below"
          >
            +
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={e => { e.stopPropagation(); removeCell(notebookId, cell.id); }}
            title="Delete cell"
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.cellEditor}>
        <Editor
          height="100px"
          defaultLanguage="sql"
          value={cell.sql}
          onChange={(value) => updateCellSql(notebookId, cell.id, value || '')}
          onMount={handleEditorDidMount}
          theme={state.theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'none',
            scrollbar: { vertical: 'hidden', horizontal: 'auto' },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
          }}
        />
      </div>

      {cell.error && (
        <div className={styles.cellError}>
          <span className={styles.errorIcon}>⚠</span>
          {cell.error}
        </div>
      )}

      {cell.result && !cell.error && (
        <div className={styles.cellResult}>
          <ResultsTable
            result={cell.result}
            maxHeight={300}
            onPageChange={(page) => fetchCellPage(notebookId, cell.id, page)}
            isLoading={cell.isExecuting}
          />
        </div>
      )}

      {!selectedServer && state.servers.length === 0 && (
        <div className={styles.cellHint}>
          Connect to a server to run queries
        </div>
      )}

      {showServerSelect && (
        <ServerSelectModal
          servers={state.servers}
          onSelect={handleServerSelect}
          onCancel={() => setShowServerSelect(false)}
        />
      )}
    </div>
  );
}
