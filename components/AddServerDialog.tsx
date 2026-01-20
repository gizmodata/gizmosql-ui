'use client';

import { useState, FormEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { SavedConnection } from '@/lib/types';
import Image from 'next/image';
import styles from './AddServerDialog.module.css';

interface AddServerDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddServerDialog({ onClose, onSuccess }: AddServerDialogProps) {
  const { connectServer, saveConnection, deleteSavedConnection, connectFromSaved, state } = useApp();
  const [name, setName] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(31337);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useTls, setUseTls] = useState(true);
  const [skipTlsVerify, setSkipTlsVerify] = useState(false);
  const [queryTimeout, setQueryTimeout] = useState(0); // 0 = unlimited
  const [saveThisConnection, setSaveThisConnection] = useState(true);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);

  const loadSavedConnection = (saved: SavedConnection) => {
    setSelectedSavedId(saved.id);
    setName(saved.name);
    setHost(saved.host);
    setPort(saved.port);
    setUsername(saved.username || '');
    setPassword(saved.password || '');
    setUseTls(saved.useTls);
    setSkipTlsVerify(saved.skipTlsVerify);
    setQueryTimeout(saved.queryTimeout || 0);
    setRememberPassword(!!saved.password);
  };

  const handleDeleteSaved = (e: React.MouseEvent, savedId: string) => {
    e.stopPropagation();
    deleteSavedConnection(savedId);
    if (selectedSavedId === savedId) {
      setSelectedSavedId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setError(null);

    const config = {
      host,
      port,
      username: username || undefined,
      password: password || undefined,
      useTls,
      skipTlsVerify,
      queryTimeout: queryTimeout || undefined,
    };
    const displayName = name || `${host}:${port}`;

    try {
      await connectServer(config, displayName);
      // Save connection if checkbox is checked
      if (saveThisConnection) {
        // Only include password if user opted to remember it
        const configToSave = rememberPassword ? config : { ...config, password: undefined };
        saveConnection(configToSave, displayName);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.dialogOverlay} onMouseDown={handleBackdropClick}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <Image src="/gizmosql-logo.png" alt="GizmoSQL" className={styles.dialogLogo} width={32} height={32} />
          <h2>Add GizmoSQL Server</h2>
          <button className={styles.dialogClose} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.dialogForm}>
          {error && (
            <div className={styles.dialogError}>
              <span className={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          {state.savedConnections.length > 0 && (
            <div className={styles.savedConnections}>
              <label>Saved Connections</label>
              <div className={styles.savedConnectionsList}>
                {state.savedConnections.map((saved) => (
                  <div
                    key={saved.id}
                    className={`${styles.savedConnectionItem} ${selectedSavedId === saved.id ? styles.selected : ''}`}
                    onClick={() => loadSavedConnection(saved)}
                  >
                    <span className={styles.savedConnectionName}>{saved.name}</span>
                    <span className={styles.savedConnectionDetails}>
                      {saved.username}@{saved.host}:{saved.port}
                    </span>
                    <button
                      type="button"
                      className={styles.deleteSavedBtn}
                      onClick={(e) => handleDeleteSaved(e, saved.id)}
                      title="Delete saved connection"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="name">Display Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My GizmoSQL Server (optional)"
            />
          </div>

          <div className={styles.formRow}>
            <div className={`${styles.formGroup} ${styles.flex2}`}>
              <label htmlFor="host">Host</label>
              <input
                type="text"
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
                required
              />
            </div>
            <div className={`${styles.formGroup} ${styles.flex1}`}>
              <label htmlFor="port">Port</label>
              <input
                type="number"
                id="port"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 31337)}
                placeholder="31337"
                required
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={`${styles.formGroup} ${styles.flex1}`}>
              <label htmlFor="username">Username <span className={styles.required}>*</span></label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
            <div className={`${styles.formGroup} ${styles.flex1}`}>
              <label htmlFor="password">Password <span className={styles.required}>*</span></label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          <div className={`${styles.formRow} ${styles.checkboxRow}`}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={useTls}
                onChange={(e) => setUseTls(e.target.checked)}
              />
              <span>Use TLS</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={skipTlsVerify}
                onChange={(e) => setSkipTlsVerify(e.target.checked)}
                disabled={!useTls}
              />
              <span>Skip TLS Verification</span>
            </label>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="queryTimeout">Query Timeout (seconds)</label>
            <input
              type="number"
              id="queryTimeout"
              value={queryTimeout}
              onChange={(e) => setQueryTimeout(parseInt(e.target.value) || 0)}
              placeholder="0 (unlimited)"
              min={0}
            />
            <span className={styles.fieldHint}>0 = unlimited (no timeout)</span>
          </div>

          <div className={`${styles.formRow} ${styles.checkboxRow}`}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={saveThisConnection}
                onChange={(e) => setSaveThisConnection(e.target.checked)}
              />
              <span>Save connection for later</span>
            </label>
            {saveThisConnection && (
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                <span>Remember password</span>
              </label>
            )}
          </div>

          <div className={styles.dialogActions}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isConnecting || !host || !username || !password}
            >
              {isConnecting ? (
                <>
                  <span className="spinner"></span>
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
