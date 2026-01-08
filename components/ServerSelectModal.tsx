'use client';

import { ServerConnection } from '@/lib/types';
import styles from './ServerSelectModal.module.css';

interface ServerSelectModalProps {
  servers: ServerConnection[];
  onSelect: (serverId: string) => void;
  onCancel: () => void;
}

export function ServerSelectModal({ servers, onSelect, onCancel }: ServerSelectModalProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className={styles.serverSelectOverlay} onClick={handleBackdropClick}>
      <div className={styles.serverSelectModal}>
        <div className={styles.serverSelectHeader}>
          <h3>Select a Server</h3>
          <p>Choose which server to run this query on:</p>
        </div>
        <div className={styles.serverSelectList}>
          {servers.map(server => (
            <button
              key={server.id}
              className={styles.serverSelectItem}
              onClick={() => onSelect(server.id)}
            >
              <span className={styles.serverSelectDot} data-status={server.status}></span>
              <span className={styles.serverSelectName}>{server.name}</span>
              <span className={styles.serverSelectHost}>{server.host}:{server.port}</span>
            </button>
          ))}
        </div>
        <div className={styles.serverSelectFooter}>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
