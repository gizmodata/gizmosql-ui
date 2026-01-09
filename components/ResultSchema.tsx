'use client';

import { Cell } from '@/lib/types';
import styles from './ResultSchema.module.css';

interface ResultSchemaProps {
  cell: Cell | null;
}

export function ResultSchema({ cell }: ResultSchemaProps) {
  if (!cell || !cell.result) {
    return (
      <div className={`${styles.resultSchema} ${styles.empty}`}>
        <p>Run a query to see the result schema</p>
      </div>
    );
  }

  const { columns, rowCount } = cell.result;

  // Get type icon
  const getTypeIcon = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('numeric')) {
      return '123';
    }
    if (lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('text') || lowerType.includes('string')) {
      return 'T';
    }
    if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
      return '📅';
    }
    if (lowerType.includes('bool')) {
      return '✓';
    }
    if (lowerType.includes('blob') || lowerType.includes('binary')) {
      return '📦';
    }
    if (lowerType.includes('json') || lowerType.includes('struct') || lowerType.includes('map')) {
      return '{}';
    }
    if (lowerType.includes('array') || lowerType.includes('list')) {
      return '[]';
    }
    return '?';
  };

  // Get type color
  const getTypeColor = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('decimal') || lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('numeric')) {
      return styles.typeNumber;
    }
    if (lowerType.includes('varchar') || lowerType.includes('char') || lowerType.includes('text') || lowerType.includes('string')) {
      return styles.typeString;
    }
    if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
      return styles.typeDate;
    }
    if (lowerType.includes('bool')) {
      return styles.typeBool;
    }
    return styles.typeOther;
  };

  return (
    <div className={styles.resultSchema}>
      <div className={styles.schemaHeader}>
        <div className={styles.schemaStats}>
          <span className={styles.statValue}>{rowCount}</span>
          <span className={styles.statLabel}>Rows</span>
        </div>
        <div className={styles.schemaStats}>
          <span className={styles.statValue}>{columns.length}</span>
          <span className={styles.statLabel}>Columns</span>
        </div>
      </div>

      <div className={styles.schemaColumns}>
        <div className={styles.columnsHeader}>
          <span>Columns</span>
        </div>
        <div className={styles.columnsList}>
          {columns.map((col, idx) => (
            <div key={idx} className={styles.columnItem}>
              <span className={`${styles.typeIcon} ${getTypeColor(col.type)}`}>
                {getTypeIcon(col.type)}
              </span>
              <div className={styles.columnInfo}>
                <span className={styles.columnName}>{col.name}</span>
                <span className={styles.columnType}>{col.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
