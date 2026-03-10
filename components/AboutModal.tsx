'use client';

import Image from 'next/image';
import styles from './AboutModal.module.css';
import packageJson from '../package.json';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const year = new Date().getFullYear();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.logo}>
          <Image src="/gizmosql-logo.png" alt="GizmoSQL" width={80} height={80} />
        </div>
        <h2 className={styles.appName}>GizmoSQL UI</h2>
        <p className={styles.version}>Version {packageJson.version}</p>
        <hr className={styles.divider} />
        <p className={styles.copyright}>&copy; {year} GizmoData LLC. All rights reserved.</p>
        <p className={styles.license}>Licensed under the Apache License 2.0</p>
        <button className={`btn btn-primary btn-sm ${styles.closeBtn}`} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
