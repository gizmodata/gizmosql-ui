'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Cell } from './Cell';
import { Cell as CellType } from '@/lib/types';
import styles from './NotebookView.module.css';

interface NotebookViewProps {
  onCellSelect: (cell: CellType | null) => void;
  onRequestConnection?: (cellId: string) => void;
}

export function NotebookView({ onCellSelect, onRequestConnection }: NotebookViewProps) {
  const { state, addCell, createNotebook, renameNotebook } = useApp();
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const activeNotebook = state.notebooks.find(n => n.id === state.activeNotebookId);

  const handleCellActivate = useCallback((cell: CellType) => {
    setActiveCellId(cell.id);
    onCellSelect(cell);
  }, [onCellSelect]);

  const handleAddCell = useCallback((afterCellId?: string) => {
    if (activeNotebook) {
      const newCell = addCell(activeNotebook.id, afterCellId);
      setActiveCellId(newCell.id);
      onCellSelect(newCell);
    }
  }, [activeNotebook, addCell, onCellSelect]);

  const startEditingName = () => {
    if (activeNotebook) {
      setEditingName(activeNotebook.name);
      setIsEditingName(true);
    }
  };

  const saveNotebookName = () => {
    if (activeNotebook && editingName.trim()) {
      renameNotebook(activeNotebook.id, editingName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveNotebookName();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Create initial notebook if none exists
  if (state.notebooks.length === 0) {
    return (
      <div className={`${styles.notebookView} ${styles.empty}`}>
        <div className={styles.emptyNotebookPrompt}>
          <h2>Welcome to GizmoSQL UI</h2>
          <p>Create a notebook to start writing SQL queries</p>
          <button className="btn btn-primary" onClick={() => createNotebook()}>
            Create Notebook
          </button>
        </div>
      </div>
    );
  }

  if (!activeNotebook) {
    return (
      <div className={`${styles.notebookView} ${styles.empty}`}>
        <p>Select a notebook from the sidebar</p>
      </div>
    );
  }

  return (
    <div className={styles.notebookView}>
      <div className={styles.notebookHeader}>
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            className={styles.notebookTitleInput}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={saveNotebookName}
            onKeyDown={handleNameKeyDown}
          />
        ) : (
          <>
            <h1 className={styles.notebookTitle}>{activeNotebook.name}</h1>
            <button
              className={`btn btn-ghost btn-icon ${styles.editNameBtn}`}
              onClick={startEditingName}
              title="Edit notebook name"
            >
              ✎
            </button>
          </>
        )}
      </div>

      <div className={styles.notebookCells}>
        {activeNotebook.cells.map((cell) => (
          <Cell
            key={cell.id}
            notebookId={activeNotebook.id}
            cell={cell}
            isActive={cell.id === activeCellId}
            onActivate={() => handleCellActivate(cell)}
            onAddCellBelow={() => handleAddCell(cell.id)}
            onRequestConnection={onRequestConnection}
          />
        ))}

        {/* Add Cell button immediately after the last cell */}
        <button
          className={`btn btn-ghost ${styles.addCellBottom}`}
          onClick={() => handleAddCell()}
        >
          + Add Cell
        </button>
      </div>
    </div>
  );
}
