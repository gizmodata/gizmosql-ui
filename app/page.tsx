'use client';

import { useState, useCallback, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { NotebookExplorer } from '@/components/NotebookExplorer';
import { ServerExplorer } from '@/components/ServerExplorer';
import { NotebookView } from '@/components/NotebookView';
import { ResultSchema } from '@/components/ResultSchema';
import { AddServerDialog } from '@/components/AddServerDialog';
import { TableDetails } from '@/components/TableDetails';
import Image from 'next/image';
import styles from './page.module.css';

interface SelectedTable {
  serverId: string;
  catalog: string;
  schema: string;
  tableName: string;
}

export default function Home() {
  const { state, toggleTheme, updateCellServer, executeCell } = useApp();
  const [showAddServer, setShowAddServer] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(260);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(280);
  const [tableDetailsHeight, setTableDetailsHeight] = useState(280);
  const [pendingExecuteCellId, setPendingExecuteCellId] = useState<string | null>(null);

  // Derive selected cell from state so it updates when cell result changes
  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null;
    const activeNotebook = state.notebooks.find(n => n.id === state.activeNotebookId);
    return activeNotebook?.cells.find(c => c.id === selectedCellId) || null;
  }, [selectedCellId, state.notebooks, state.activeNotebookId]);

  const handleTableSelect = useCallback((serverId: string, catalog: string, schema: string, tableName: string) => {
    setSelectedTable({ serverId, catalog, schema, tableName });
  }, []);

  const handleRequestConnection = useCallback((cellId: string) => {
    setPendingExecuteCellId(cellId);
    setShowAddServer(true);
  }, []);

  const handleServerConnected = useCallback(() => {
    setShowAddServer(false);

    // After server is added, the context will have the new server
    // We need to wait for the state update, then associate cells and execute
    if (pendingExecuteCellId) {
      // Use setTimeout to allow state to update with new server
      setTimeout(() => {
        const newServer = state.servers[state.servers.length - 1];
        if (newServer) {
          // Associate all cells in the active notebook with the new server
          const activeNotebook = state.notebooks.find(n => n.id === state.activeNotebookId);
          if (activeNotebook) {
            activeNotebook.cells.forEach(cell => {
              if (!cell.serverId) {
                updateCellServer(activeNotebook.id, cell.id, newServer.id);
              }
            });
          }

          // Execute the pending cell
          if (activeNotebook) {
            const pendingCell = activeNotebook.cells.find(c => c.id === pendingExecuteCellId);
            if (pendingCell) {
              // Need another timeout to let the server assignment complete
              setTimeout(() => {
                executeCell(activeNotebook.id, pendingExecuteCellId);
              }, 50);
            }
          }
        }
        setPendingExecuteCellId(null);
      }, 100);
    }
  }, [pendingExecuteCellId, state.servers, state.notebooks, state.activeNotebookId, updateCellServer, executeCell]);

  const handleResizeLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + (e.clientX - startX);
      setLeftSidebarWidth(Math.max(200, Math.min(400, newWidth)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [leftSidebarWidth]);

  const handleResizeRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightSidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth - (e.clientX - startX);
      setRightSidebarWidth(Math.max(200, Math.min(400, newWidth)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [rightSidebarWidth]);

  const handleResizeTableDetails = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = tableDetailsHeight;

    const onMouseMove = (e: MouseEvent) => {
      const newHeight = startHeight - (e.clientY - startY);
      setTableDetailsHeight(Math.max(150, Math.min(500, newHeight)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [tableDetailsHeight]);

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <a href="https://gizmodata.com/gizmosql" target="_blank" rel="noopener noreferrer">
            <Image src="/gizmosql-logo.png" alt="GizmoSQL" className={styles.headerLogo} width={28} height={28} />
          </a>
          <span className={styles.headerTitle}>GizmoSQL UI</span>
        </div>
        <div className={styles.headerRight}>
          <button
            className={`btn btn-ghost btn-icon ${styles.themeToggle}`}
            onClick={toggleTheme}
            title={`Switch to ${state.theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {state.theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className={`btn btn-primary ${styles.connectBtn}`}
            onClick={() => setShowAddServer(true)}
          >
            Connect to GizmoSQL Server
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className={styles.appBody}>
        {/* Left sidebar */}
        <aside className={`${styles.sidebar} ${styles.sidebarLeft}`} style={{ width: leftSidebarWidth }}>
          <div className={styles.sidebarTop}>
            <NotebookExplorer />
            <ServerExplorer
              onAddServer={() => setShowAddServer(true)}
              onTableSelect={handleTableSelect}
            />
          </div>
          <div className={styles.tableDetailsWrapper} style={{ height: tableDetailsHeight }}>
            <div className={styles.verticalResizer} onMouseDown={handleResizeTableDetails} />
            <TableDetails
              serverId={selectedTable?.serverId || null}
              catalog={selectedTable?.catalog || null}
              schema={selectedTable?.schema || null}
              tableName={selectedTable?.tableName || null}
            />
          </div>
          <div className={styles.sidebarResizer} onMouseDown={handleResizeLeft} />
        </aside>

        {/* Main area */}
        <main className={styles.mainContent}>
          <NotebookView onCellSelect={(cell) => setSelectedCellId(cell?.id || null)} onRequestConnection={handleRequestConnection} />
        </main>

        {/* Right sidebar */}
        <aside className={`${styles.sidebar} ${styles.sidebarRight}`} style={{ width: rightSidebarWidth }}>
          <div className={`${styles.sidebarResizer} ${styles.left}`} onMouseDown={handleResizeRight} />
          <ResultSchema cell={selectedCell} />
        </aside>
      </div>

      {/* Add Server Dialog */}
      {showAddServer && (
        <AddServerDialog
          onClose={() => {
            setShowAddServer(false);
            setPendingExecuteCellId(null);
          }}
          onSuccess={handleServerConnected}
        />
      )}
    </div>
  );
}
