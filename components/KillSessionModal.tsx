'use client';

import { useState } from 'react';
import styles from './KillSessionModal.module.css';

interface KillSessionModalProps {
  serverSessionId: string;
  targetSessionId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ResultState = null | { success: true; message?: string } | { success: false; error: string };

export function KillSessionModal({
  serverSessionId,
  targetSessionId,
  onClose,
  onSuccess,
}: KillSessionModalProps) {
  const [killing, setKilling] = useState(false);
  const [result, setResult] = useState<ResultState>(null);

  const handleKill = async () => {
    setKilling(true);
    setResult(null);

    try {
      const sql = `KILL SESSION '${targetSessionId}'`;

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': serverSessionId,
        },
        body: JSON.stringify({ sessionId: serverSessionId, sql }),
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to kill session';

        // If the session was not found, it was killed successfully (or was already gone)
        if (errorMsg.toLowerCase().includes('session not found')) {
          setResult({ success: true });
          onSuccess();
          return;
        }

        throw new Error(errorMsg);
      }

      setResult({ success: true });
      onSuccess();
    } catch (err) {
      console.error('Failed to kill session:', err);
      setResult({ success: false, error: err instanceof Error ? err.message : 'Failed to kill session' });
    } finally {
      setKilling(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.modalOverlay} onMouseDown={handleBackdropClick}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.warningIcon}>⚠</span>
          <h3>Kill Session</h3>
          <button className={styles.modalClose} onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className={styles.modalContent}>
          {result === null ? (
            <>
              <p className={styles.confirmMessage}>
                Are you sure you want to kill this session? This action cannot be undone and may interrupt running queries.
              </p>
              <div className={styles.sessionIdDisplay}>
                {targetSessionId}
              </div>
            </>
          ) : result.success ? (
            <div className={`${styles.resultMessage} ${styles.success}`}>
              <span className={styles.resultIcon}>✓</span>
              <span>{result.message || 'Session killed successfully.'}</span>
            </div>
          ) : (
            <div className={`${styles.resultMessage} ${styles.error}`}>
              <span className={styles.resultIcon}>✕</span>
              <span>{'error' in result ? result.error : 'Unknown error'}</span>
            </div>
          )}
        </div>

        <div className={styles.modalActions}>
          {result === null ? (
            <>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.killBtn}
                onClick={handleKill}
                disabled={killing}
              >
                {killing && <span className={styles.spinner}>⟳</span>}
                {killing ? 'Killing...' : 'Kill Session'}
              </button>
            </>
          ) : (
            <button className={styles.cancelBtn} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
