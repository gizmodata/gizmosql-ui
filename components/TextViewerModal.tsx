'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import styles from './TextViewerModal.module.css';

const Editor = dynamic(() => import('@monaco-editor/react').then(mod => mod.default), {
  ssr: false,
  loading: () => <div className={styles.editorLoading}>Loading editor...</div>,
});

interface TextViewerModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export function TextViewerModal({ title, content, onClose }: TextViewerModalProps) {
  const { state } = useApp();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Determine language for syntax highlighting
  const getLanguage = (): string => {
    if (title.toLowerCase().includes('sql')) return 'sql';
    if (title.toLowerCase().includes('param')) return 'json';
    return 'plaintext';
  };

  // Format JSON content if it looks like JSON
  const formatContent = (): string => {
    if (title.toLowerCase().includes('param')) {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    }
    return content;
  };

  return (
    <div className={styles.modalOverlay} onMouseDown={handleBackdropClick}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button className={styles.modalClose} onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className={styles.editorContainer}>
          <Editor
            height="100%"
            defaultLanguage={getLanguage()}
            value={formatContent()}
            theme={state.theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: 'none',
              scrollbar: { vertical: 'auto', horizontal: 'auto' },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              folding: true,
              glyphMargin: false,
            }}
          />
        </div>

        <div className={styles.modalFooter}>
          <button
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
