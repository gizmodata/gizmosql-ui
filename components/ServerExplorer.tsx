'use client';

import { useState, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { ServerConnection } from '@/lib/types';
import { VscFolder, VscTable, VscEye } from 'react-icons/vsc';
import { Database, Server, Lock, LockOpen } from 'lucide-react';
import styles from './ServerExplorer.module.css';

interface TreeNode {
  type: 'server' | 'catalog' | 'schema' | 'table';
  name: string;
  serverId: string;
  catalog?: string;
  schema?: string;
  tableType?: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

interface ServerExplorerProps {
  onAddServer: () => void;
  onTableSelect?: (serverId: string, catalog: string, schema: string, table: string) => void;
}

export function ServerExplorer({ onAddServer, onTableSelect }: ServerExplorerProps) {
  const { state, disconnectServer, getServerCatalogs, getServerSchemas, getServerTables } = useApp();
  // Store tree state per server
  const [serverTrees, setServerTrees] = useState<Record<string, TreeNode>>({});

  const toggleNode = useCallback(async (
    serverId: string,
    path: string[], // path to the node, e.g., ['catalog1', 'schema1']
    node: TreeNode
  ) => {
    const updateTree = (tree: TreeNode, pathIndex: number): TreeNode => {
      // If we're at the target node
      if (pathIndex === path.length) {
        // Toggle expansion
        if (node.isExpanded) {
          return { ...tree, isExpanded: false };
        }
        // Need to load children
        return { ...tree, isLoading: true };
      }

      // Navigate to the correct child
      if (!tree.children) return tree;
      const childName = path[pathIndex];
      return {
        ...tree,
        children: tree.children.map(child =>
          child.name === childName ? updateTree(child, pathIndex + 1) : child
        ),
      };
    };

    // If collapsing, just toggle
    if (node.isExpanded) {
      setServerTrees(prev => ({
        ...prev,
        [serverId]: updateTree(prev[serverId] || { type: 'server', name: '', serverId, isExpanded: true }, 0),
      }));
      return;
    }

    // Set loading state
    setServerTrees(prev => ({
      ...prev,
      [serverId]: updateTree(prev[serverId] || { type: 'server', name: '', serverId }, 0),
    }));

    try {
      let children: TreeNode[] = [];

      if (node.type === 'server') {
        const catalogs = await getServerCatalogs(serverId);
        // Filter out system and temp catalogs
        const filteredCatalogs = catalogs.filter(
          cat => cat !== 'system' && cat !== 'temp'
        );
        children = filteredCatalogs.map(cat => ({
          type: 'catalog' as const,
          name: cat,
          serverId,
          catalog: cat,
        }));
      } else if (node.type === 'catalog') {
        const schemas = await getServerSchemas(serverId, node.catalog);
        children = schemas.map(s => ({
          type: 'schema' as const,
          name: s.schema,
          serverId,
          catalog: s.catalog,
          schema: s.schema,
        }));
      } else if (node.type === 'schema') {
        const tables = await getServerTables(serverId, node.catalog, node.schema);
        children = tables.map(t => ({
          type: 'table' as const,
          name: t.name,
          serverId,
          catalog: t.catalog,
          schema: t.schema,
          tableType: t.type,
        }));
      }

      // Update tree with children
      const updateWithChildren = (tree: TreeNode, pathIndex: number): TreeNode => {
        if (pathIndex === path.length) {
          return { ...tree, children, isExpanded: true, isLoading: false };
        }
        if (!tree.children) return tree;
        const childName = path[pathIndex];
        return {
          ...tree,
          children: tree.children.map(child =>
            child.name === childName ? updateWithChildren(child, pathIndex + 1) : child
          ),
        };
      };

      setServerTrees(prev => ({
        ...prev,
        [serverId]: updateWithChildren(
          prev[serverId] || { type: 'server', name: '', serverId },
          0
        ),
      }));
    } catch (error) {
      console.error('Failed to load children:', error);
      // Clear loading state
      const clearLoading = (tree: TreeNode, pathIndex: number): TreeNode => {
        if (pathIndex === path.length) {
          return { ...tree, isLoading: false, isExpanded: true, children: [] };
        }
        if (!tree.children) return tree;
        const childName = path[pathIndex];
        return {
          ...tree,
          children: tree.children.map(child =>
            child.name === childName ? clearLoading(child, pathIndex + 1) : child
          ),
        };
      };
      setServerTrees(prev => ({
        ...prev,
        [serverId]: clearLoading(prev[serverId] || { type: 'server', name: '', serverId }, 0),
      }));
    }
  }, [getServerCatalogs, getServerSchemas, getServerTables]);

  const handleTableClick = (node: TreeNode) => {
    if (node.type === 'table' && node.catalog && node.schema && onTableSelect) {
      onTableSelect(node.serverId, node.catalog, node.schema, node.name);
    }
  };

  const handleDisconnect = async (server: ServerConnection, e: React.MouseEvent) => {
    e.stopPropagation();
    await disconnectServer(server.id);
    // Clean up tree state
    setServerTrees(prev => {
      const next = { ...prev };
      delete next[server.id];
      return next;
    });
  };

  const renderNode = (node: TreeNode, level: number, path: string[]) => {
    const hasChildren = node.type !== 'table';
    const isExpanded = node.isExpanded || false;
    const isLoading = node.isLoading || false;
    const children = node.children || [];

    const getIcon = () => {
      switch (node.type) {
        case 'server': return <Server className={`${styles.nodeIconSvg} ${styles.iconServer}`} size={16} />;
        case 'catalog': return <Database className={`${styles.nodeIconSvg} ${styles.iconCatalog}`} size={16} />;
        case 'schema': return <VscFolder className={`${styles.nodeIconSvg} ${styles.iconSchema}`} />;
        case 'table': return node.tableType === 'VIEW'
          ? <VscEye className={`${styles.nodeIconSvg} ${styles.iconView}`} />
          : <VscTable className={`${styles.nodeIconSvg} ${styles.iconTable}`} />;
        default: return <VscTable className={styles.nodeIconSvg} />;
      }
    };

    const nodePath = node.type === 'server' ? [] : [...path, node.name];

    return (
      <div key={`${node.type}-${node.name}`} className={styles.treeNode}>
        <div
          className={`${styles.treeNodeContent} ${styles[node.type]} ${node.type === 'table' ? styles.clickable : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleNode(node.serverId, nodePath, node);
            }
            if (node.type === 'table') {
              handleTableClick(node);
            }
          }}
        >
          {hasChildren && (
            <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
              {isLoading ? <span className={styles.loadingSpinner}>⟳</span> : '▶'}
            </span>
          )}
          <span className={styles.nodeIcon}>{getIcon()}</span>
          <span className={styles.nodeName}>{node.name}</span>
          {node.type === 'table' && node.tableType === 'VIEW' && (
            <span className={styles.nodeBadge}>VIEW</span>
          )}
        </div>
        {isExpanded && children.length > 0 && (
          <div className={styles.treeChildren}>
            {children.map(child => renderNode(child, level + 1, nodePath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.serverExplorer}>
      <div className={styles.explorerHeader}>
        <span className={styles.explorerTitle}>Attached Servers</span>
        <button className="btn btn-ghost btn-icon" onClick={onAddServer} title="Add Server">
          +
        </button>
      </div>
      <div className={styles.serverList}>
        {state.servers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No servers attached</p>
            <button className="btn btn-primary btn-sm" onClick={onAddServer}>
              Add Server
            </button>
          </div>
        ) : (
          state.servers.map(server => {
            const tree = serverTrees[server.id] || {
              type: 'server' as const,
              name: server.name,
              serverId: server.id,
            };
            const isExpanded = tree.isExpanded || false;
            const isLoading = tree.isLoading || false;
            const children = tree.children || [];

            return (
              <div key={server.id} className={styles.serverGroup}>
                <div
                  className={styles.serverItem}
                  onClick={() => toggleNode(server.id, [], {
                    type: 'server',
                    name: server.name,
                    serverId: server.id,
                    isExpanded,
                    isLoading,
                    children,
                  })}
                >
                  <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
                    {isLoading ? <span className={styles.loadingSpinner}>⟳</span> : '▶'}
                  </span>
                  <Server className={`${styles.nodeIconSvg} ${styles.iconServer}`} size={16} />
                  {/* TLS status icon */}
                  {server.useTls ? (
                    <span title={server.skipTlsVerify ? 'TLS enabled (certificate not verified)' : 'TLS enabled (certificate verified)'}>
                      <Lock
                        className={`${styles.tlsIcon} ${server.skipTlsVerify ? styles.tlsWarning : styles.tlsSecure}`}
                        size={12}
                      />
                    </span>
                  ) : (
                    <span title="Connection is not encrypted (insecure)">
                      <LockOpen
                        className={`${styles.tlsIcon} ${styles.tlsInsecure}`}
                        size={12}
                      />
                    </span>
                  )}
                  <span className={styles.serverStatusDot} data-status={server.status}></span>
                  <span className={styles.serverName}>{server.name}</span>
                  <button
                    className={`${styles.serverDisconnect} btn btn-ghost btn-icon`}
                    onClick={e => handleDisconnect(server, e)}
                    title="Disconnect"
                  >
                    ×
                  </button>
                </div>
                {isExpanded && (
                  <div className={styles.serverChildren}>
                    {children.map(node => renderNode(node, 1, []))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
