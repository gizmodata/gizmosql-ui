'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import styles from './NotebookExplorer.module.css';

export function NotebookExplorer() {
  const { state, createNotebook, deleteNotebook, renameNotebook, setActiveNotebook } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    createNotebook();
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const handleFinishRename = (id: string) => {
    if (editName.trim()) {
      renameNotebook(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.notebooks.length > 1) {
      deleteNotebook(id);
    }
  };

  return (
    <div className={styles.notebookExplorer}>
      <div className={styles.explorerHeader}>
        <span className={styles.explorerTitle}>Notebooks</span>
        <button className="btn btn-ghost btn-icon" onClick={handleCreate} title="New Notebook">
          +
        </button>
      </div>
      <div className={styles.notebookList}>
        {state.notebooks.map(notebook => (
          <div
            key={notebook.id}
            className={`${styles.notebookItem} ${notebook.id === state.activeNotebookId ? styles.active : ''}`}
            onClick={() => setActiveNotebook(notebook.id)}
          >
            <span className={styles.notebookIcon}>📓</span>
            {editingId === notebook.id ? (
              <input
                type="text"
                className={styles.notebookNameInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => handleFinishRename(notebook.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFinishRename(notebook.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className={styles.notebookName}
                onDoubleClick={() => handleStartRename(notebook.id, notebook.name)}
              >
                {notebook.name}
              </span>
            )}
            {state.notebooks.length > 1 && (
              <button
                className={`${styles.notebookDelete} btn btn-ghost btn-icon`}
                onClick={e => handleDelete(notebook.id, e)}
                title="Delete Notebook"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
