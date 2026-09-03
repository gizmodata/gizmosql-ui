'use client';

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useRef, useState } from 'react';
import { AppState, Theme, ServerConnection, ServerConfig, SavedConnection, Notebook, Cell, CellResult, InstrumentationInfo } from '@/lib/types';
import { api } from '@/lib/api';

// Generate unique IDs
const generateId = () => crypto.randomUUID();

// Initial state
const initialState: AppState = {
  theme: 'light',
  servers: [],
  savedConnections: [],
  notebooks: [],
  activeNotebookId: null,
};

// Action types
type Action =
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'ADD_SERVER'; server: ServerConnection }
  | { type: 'REMOVE_SERVER'; serverId: string }
  | { type: 'UPDATE_SERVER'; serverId: string; updates: Partial<ServerConnection> }
  | { type: 'ADD_SAVED_CONNECTION'; savedConnection: SavedConnection }
  | { type: 'REMOVE_SAVED_CONNECTION'; savedConnectionId: string }
  | { type: 'UPDATE_SAVED_CONNECTION'; savedConnectionId: string; updates: Partial<SavedConnection> }
  | { type: 'ADD_NOTEBOOK'; notebook: Notebook }
  | { type: 'REMOVE_NOTEBOOK'; notebookId: string }
  | { type: 'SET_ACTIVE_NOTEBOOK'; notebookId: string | null }
  | { type: 'UPDATE_NOTEBOOK'; notebookId: string; updates: Partial<Notebook> }
  | { type: 'ADD_CELL'; notebookId: string; cell: Cell; afterCellId?: string }
  | { type: 'REMOVE_CELL'; notebookId: string; cellId: string }
  | { type: 'UPDATE_CELL'; notebookId: string; cellId: string; updates: Partial<Cell> }
  | { type: 'LOAD_STATE'; state: AppState };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.theme };

    case 'ADD_SERVER':
      return { ...state, servers: [...state.servers, action.server] };

    case 'REMOVE_SERVER':
      return { ...state, servers: state.servers.filter(s => s.id !== action.serverId) };

    case 'UPDATE_SERVER':
      return {
        ...state,
        servers: state.servers.map(s =>
          s.id === action.serverId ? { ...s, ...action.updates } : s
        ),
      };

    case 'ADD_SAVED_CONNECTION':
      return { ...state, savedConnections: [...state.savedConnections, action.savedConnection] };

    case 'REMOVE_SAVED_CONNECTION':
      return { ...state, savedConnections: state.savedConnections.filter(c => c.id !== action.savedConnectionId) };

    case 'UPDATE_SAVED_CONNECTION':
      return {
        ...state,
        savedConnections: state.savedConnections.map(c =>
          c.id === action.savedConnectionId ? { ...c, ...action.updates } : c
        ),
      };

    case 'ADD_NOTEBOOK': {
      const newState = { ...state, notebooks: [...state.notebooks, action.notebook] };
      if (!state.activeNotebookId) {
        newState.activeNotebookId = action.notebook.id;
      }
      return newState;
    }

    case 'REMOVE_NOTEBOOK': {
      const newNotebooks = state.notebooks.filter(n => n.id !== action.notebookId);
      let newActiveId = state.activeNotebookId;
      if (state.activeNotebookId === action.notebookId) {
        newActiveId = newNotebooks.length > 0 ? newNotebooks[0].id : null;
      }
      return { ...state, notebooks: newNotebooks, activeNotebookId: newActiveId };
    }

    case 'SET_ACTIVE_NOTEBOOK':
      return { ...state, activeNotebookId: action.notebookId };

    case 'UPDATE_NOTEBOOK':
      return {
        ...state,
        notebooks: state.notebooks.map(n =>
          n.id === action.notebookId ? { ...n, ...action.updates, updatedAt: new Date() } : n
        ),
      };

    case 'ADD_CELL': {
      return {
        ...state,
        notebooks: state.notebooks.map(n => {
          if (n.id !== action.notebookId) return n;
          let newCells: Cell[];
          if (action.afterCellId) {
            const idx = n.cells.findIndex(c => c.id === action.afterCellId);
            newCells = [...n.cells.slice(0, idx + 1), action.cell, ...n.cells.slice(idx + 1)];
          } else {
            newCells = [...n.cells, action.cell];
          }
          return { ...n, cells: newCells, updatedAt: new Date() };
        }),
      };
    }

    case 'REMOVE_CELL':
      return {
        ...state,
        notebooks: state.notebooks.map(n =>
          n.id === action.notebookId
            ? { ...n, cells: n.cells.filter(c => c.id !== action.cellId), updatedAt: new Date() }
            : n
        ),
      };

    case 'UPDATE_CELL':
      return {
        ...state,
        notebooks: state.notebooks.map(n =>
          n.id === action.notebookId
            ? {
                ...n,
                cells: n.cells.map(c =>
                  c.id === action.cellId ? { ...c, ...action.updates } : c
                ),
                updatedAt: new Date(),
              }
            : n
        ),
      };

    case 'LOAD_STATE':
      return action.state;

    default:
      return state;
  }
}

// Default page size
const DEFAULT_PAGE_SIZE = 1000;

// Context
// Client-generated id for a statement, so it can be cancelled server-side.
// crypto.randomUUID needs a secure context; fall back for plain-HTTP hosts.
function newQueryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface AppContextType {
  state: AppState;
  // Runtime config (launch flags) — true when the TPC-H query selector is enabled
  enableTpch: boolean;
  // Theme
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  // Servers
  connectServer: (config: ServerConfig, name?: string) => Promise<ServerConnection>;
  disconnectServer: (serverId: string) => Promise<void>;
  // Saved Connections
  saveConnection: (config: ServerConfig, name: string) => SavedConnection;
  deleteSavedConnection: (savedConnectionId: string) => void;
  connectFromSaved: (savedConnectionId: string) => Promise<ServerConnection>;
  // Notebooks
  createNotebook: (name?: string) => Notebook;
  deleteNotebook: (notebookId: string) => void;
  renameNotebook: (notebookId: string, name: string) => void;
  setActiveNotebook: (notebookId: string) => void;
  // Cells
  addCell: (notebookId: string, afterCellId?: string) => Cell;
  removeCell: (notebookId: string, cellId: string) => void;
  updateCellSql: (notebookId: string, cellId: string, sql: string) => void;
  updateCellServer: (notebookId: string, cellId: string, serverId: string | null) => void;
  executeCell: (notebookId: string, cellId: string) => Promise<void>;
  cancelCell: (notebookId: string, cellId: string) => Promise<void>;
  fetchCellPage: (notebookId: string, cellId: string, page: number) => Promise<void>;
  // Schema
  getServerCatalogs: (serverId: string) => Promise<string[]>;
  getServerSchemas: (serverId: string, catalog?: string) => Promise<Array<{ catalog: string; schema: string }>>;
  getServerTables: (serverId: string, catalog?: string, schema?: string) => Promise<Array<{ catalog: string; schema: string; name: string; type: string }>>;
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const isFirstRender = useRef(true);
  const hasHydrated = useRef(false);
  const hasAutoConnected = useRef(false);
  const [enableTpch, setEnableTpch] = useState(false);
  // Server-side query id (plus the session it runs on) for each cell whose
  // statement is in flight, so cancelCell() can stop it
  const runningQueries = useRef(new Map<string, { queryId: string; sessionId: string }>());

  // Fetch runtime config (launch flags) once on mount
  useEffect(() => {
    api.getConfig()
      .then(config => setEnableTpch(config.enableTpch))
      .catch(() => { /* non-critical: feature stays disabled */ });
  }, []);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gizmosql-ui-state');
    let savedConnections: SavedConnection[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Restore dates
        parsed.notebooks = (parsed.notebooks || []).map((n: Notebook) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
        }));
        // Clear server sessions (they're not valid after restart)
        parsed.servers = [];
        // Ensure savedConnections exists (migration from older versions)
        parsed.savedConnections = parsed.savedConnections || [];
        savedConnections = parsed.savedConnections;
        dispatch({ type: 'LOAD_STATE', state: parsed });
      } catch (e) {
        console.error('Failed to load saved state:', e);
      }
    }
    // Mark as hydrated after a tick to ensure state has updated
    setTimeout(() => {
      hasHydrated.current = true;
    }, 0);

    // Auto-reconnect saved connections that have passwords (guard against StrictMode double-run)
    if (hasAutoConnected.current) {
      return;
    }
    hasAutoConnected.current = true;

    (async () => {
      const connectedServers = new Set<string>();
      for (const saved of savedConnections) {
        const isOAuth = saved.authType === 'oauth';
        // Only auto-connect if password is saved (or OAuth token is stored)
        if (!isOAuth && !saved.password) {
          continue;
        }
        if (isOAuth && !saved.oauthToken) {
          continue;
        }
        // De-dupe by host:port:authType (or host:port:username for password)
        const key = isOAuth
          ? `${saved.host}:${saved.port}:oauth`
          : `${saved.host}:${saved.port}:${saved.username}`;
        if (connectedServers.has(key)) {
          continue;
        }
        try {
          const response = await api.connect({
            host: saved.host,
            port: saved.port,
            username: isOAuth ? 'token' : saved.username,
            password: isOAuth ? saved.oauthToken : saved.password,
            useTls: saved.useTls,
            skipTlsVerify: saved.skipTlsVerify,
            queryTimeout: saved.queryTimeout,
          });
          const server: ServerConnection = {
            id: crypto.randomUUID(),
            name: saved.name,
            host: saved.host,
            port: saved.port,
            username: isOAuth ? undefined : saved.username,
            authType: saved.authType,
            oauthServerPort: saved.oauthServerPort,
            oauthUseTls: saved.oauthUseTls,
            useTls: saved.useTls,
            skipTlsVerify: saved.skipTlsVerify,
            queryTimeout: saved.queryTimeout,
            sessionId: response.sessionId,
            status: 'connected',
          };
          dispatch({ type: 'ADD_SERVER', server });
          connectedServers.add(key);
          // Fetch server metadata (non-blocking)
          api.getServerInfo(server.sessionId).then(data => {
            dispatch({
              type: 'UPDATE_SERVER',
              serverId: server.id,
              updates: { instrumentationInfo: data.instrumentationInfo },
            });
          }).catch(() => { /* non-critical */ });
        } catch {
          // Connection failed, skip silently (e.g., expired OAuth token)
        }
      }
    })();
  }, []);

  // Save state to localStorage on change (but only after hydration)
  useEffect(() => {
    // Skip the very first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Don't save until hydration is complete
    if (!hasHydrated.current) {
      return;
    }
    const toSave = {
      ...state,
      // Don't save server sessions
      servers: [],
    };
    localStorage.setItem('gizmosql-ui-state', JSON.stringify(toSave));
  }, [state]);

  // Close all server connections on browser tab/window close (best-effort via sendBeacon)
  const serversRef = useRef(state.servers);
  serversRef.current = state.servers;
  useEffect(() => {
    const handleBeforeUnload = () => {
      serversRef.current.forEach(server => {
        if (server.status === 'connected') {
          const blob = new Blob(
            [JSON.stringify({ sessionId: server.sessionId })],
            { type: 'application/json' }
          );
          navigator.sendBeacon('/api/disconnect', blob);
        }
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  // Theme actions
  const setTheme = useCallback((theme: Theme) => {
    dispatch({ type: 'SET_THEME', theme });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'SET_THEME', theme: state.theme === 'light' ? 'dark' : 'light' });
  }, [state.theme]);

  // Fetch server metadata (instrumentation info) — non-blocking
  const fetchServerInfo = useCallback(async (serverId: string, sessionId: string) => {
    try {
      const data = await api.getServerInfo(sessionId);
      dispatch({
        type: 'UPDATE_SERVER',
        serverId,
        updates: { instrumentationInfo: data.instrumentationInfo },
      });
    } catch {
      // Non-critical — failure doesn't prevent connection
    }
  }, []);

  // Server actions
  const connectServer = useCallback(async (config: ServerConfig, name?: string): Promise<ServerConnection> => {
    const response = await api.connect(config);
    const server: ServerConnection = {
      id: generateId(),
      name: name || `${config.host}:${config.port}`,
      host: config.host,
      port: config.port,
      username: config.authType === 'oauth' ? undefined : config.username,
      authType: config.authType,
      oauthServerPort: config.oauthServerPort,
      oauthUseTls: config.oauthUseTls,
      useTls: config.useTls,
      skipTlsVerify: config.skipTlsVerify,
      queryTimeout: config.queryTimeout,
      sessionId: response.sessionId,
      status: 'connected',
    };
    dispatch({ type: 'ADD_SERVER', server });

    // Fetch server metadata (non-blocking)
    fetchServerInfo(server.id, server.sessionId);

    // If this is the only server, auto-assign it to all cells without a server
    if (state.servers.length === 0) {
      state.notebooks.forEach(notebook => {
        notebook.cells.forEach(cell => {
          if (!cell.serverId) {
            dispatch({ type: 'UPDATE_CELL', notebookId: notebook.id, cellId: cell.id, updates: { serverId: server.id } });
          }
        });
      });
    }

    return server;
  }, [state.servers.length, state.notebooks, fetchServerInfo]);

  const disconnectServer = useCallback(async (serverId: string) => {
    const server = state.servers.find(s => s.id === serverId);
    if (server) {
      api.setSessionId(server.sessionId);
      await api.disconnect();
    }
    dispatch({ type: 'REMOVE_SERVER', serverId });
  }, [state.servers]);

  // Saved connection actions
  const saveConnection = useCallback((config: ServerConfig, name: string): SavedConnection => {
    // De-dup by host:port:authType (OAuth) or host:port:username (password)
    const existing = state.savedConnections.find(c => {
      if (config.authType === 'oauth') {
        return c.host === config.host && c.port === config.port && c.authType === 'oauth';
      }
      return c.host === config.host && c.port === config.port && c.username === config.username && c.authType !== 'oauth';
    });
    if (existing) {
      // Update existing, but preserve password if new config doesn't have one
      const updates = {
        ...config,
        name,
        password: config.password || existing.password,
        oauthToken: config.oauthToken || existing.oauthToken,
      };
      dispatch({
        type: 'UPDATE_SAVED_CONNECTION',
        savedConnectionId: existing.id,
        updates,
      });
      return { ...existing, ...updates };
    }
    // Create new
    const savedConnection: SavedConnection = {
      id: generateId(),
      name,
      host: config.host,
      port: config.port,
      username: config.authType === 'oauth' ? undefined : config.username,
      password: config.authType === 'oauth' ? undefined : config.password,
      authType: config.authType,
      oauthServerPort: config.oauthServerPort,
      oauthUseTls: config.oauthUseTls,
      oauthToken: config.oauthToken,
      useTls: config.useTls,
      skipTlsVerify: config.skipTlsVerify,
      queryTimeout: config.queryTimeout,
    };
    dispatch({ type: 'ADD_SAVED_CONNECTION', savedConnection });
    return savedConnection;
  }, [state.savedConnections]);

  const deleteSavedConnection = useCallback((savedConnectionId: string) => {
    dispatch({ type: 'REMOVE_SAVED_CONNECTION', savedConnectionId });
  }, []);

  const connectFromSaved = useCallback(async (savedConnectionId: string): Promise<ServerConnection> => {
    const saved = state.savedConnections.find(c => c.id === savedConnectionId);
    if (!saved) {
      throw new Error('Saved connection not found');
    }
    // For OAuth connections, use stored token via Basic Auth
    const isOAuth = saved.authType === 'oauth';
    const config: ServerConfig = {
      host: saved.host,
      port: saved.port,
      username: isOAuth ? 'token' : saved.username,
      password: isOAuth ? saved.oauthToken : saved.password,
      authType: saved.authType,
      oauthServerPort: saved.oauthServerPort,
      oauthUseTls: saved.oauthUseTls,
      oauthToken: saved.oauthToken,
      useTls: saved.useTls,
      skipTlsVerify: saved.skipTlsVerify,
      queryTimeout: saved.queryTimeout,
    };
    const response = await api.connect(config);
    const server: ServerConnection = {
      id: generateId(),
      name: saved.name,
      host: saved.host,
      port: saved.port,
      username: isOAuth ? undefined : saved.username,
      authType: saved.authType,
      oauthServerPort: saved.oauthServerPort,
      oauthUseTls: saved.oauthUseTls,
      useTls: saved.useTls,
      skipTlsVerify: saved.skipTlsVerify,
      queryTimeout: saved.queryTimeout,
      sessionId: response.sessionId,
      status: 'connected',
    };
    dispatch({ type: 'ADD_SERVER', server });

    // Fetch server metadata (non-blocking)
    fetchServerInfo(server.id, server.sessionId);

    // If this is the only server, auto-assign it to all cells without a server
    if (state.servers.length === 0) {
      state.notebooks.forEach(notebook => {
        notebook.cells.forEach(cell => {
          if (!cell.serverId) {
            dispatch({ type: 'UPDATE_CELL', notebookId: notebook.id, cellId: cell.id, updates: { serverId: server.id } });
          }
        });
      });
    }

    return server;
  }, [state.savedConnections, state.servers.length, state.notebooks, fetchServerInfo]);

  // Notebook actions
  const createNotebook = useCallback((name?: string): Notebook => {
    const notebook: Notebook = {
      id: generateId(),
      name: name || `Notebook ${state.notebooks.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      cells: [{
        id: generateId(),
        serverId: state.servers.length > 0 ? state.servers[0].id : null,
        sql: '',
        result: null,
        isExecuting: false,
        error: null,
      }],
    };
    dispatch({ type: 'ADD_NOTEBOOK', notebook });
    dispatch({ type: 'SET_ACTIVE_NOTEBOOK', notebookId: notebook.id });
    return notebook;
  }, [state.notebooks.length, state.servers]);

  const deleteNotebook = useCallback((notebookId: string) => {
    dispatch({ type: 'REMOVE_NOTEBOOK', notebookId });
  }, []);

  const renameNotebook = useCallback((notebookId: string, name: string) => {
    dispatch({ type: 'UPDATE_NOTEBOOK', notebookId, updates: { name } });
  }, []);

  const setActiveNotebook = useCallback((notebookId: string) => {
    dispatch({ type: 'SET_ACTIVE_NOTEBOOK', notebookId });
  }, []);

  // Cell actions
  const addCell = useCallback((notebookId: string, afterCellId?: string): Cell => {
    // Auto-assign server only if there's exactly one server
    const autoServerId = state.servers.length === 1 ? state.servers[0].id : null;
    const cell: Cell = {
      id: generateId(),
      serverId: autoServerId,
      sql: '',
      result: null,
      isExecuting: false,
      error: null,
    };
    dispatch({ type: 'ADD_CELL', notebookId, cell, afterCellId });
    return cell;
  }, [state.servers]);

  const removeCell = useCallback((notebookId: string, cellId: string) => {
    dispatch({ type: 'REMOVE_CELL', notebookId, cellId });
  }, []);

  const updateCellSql = useCallback((notebookId: string, cellId: string, sql: string) => {
    dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { sql } });
  }, []);

  const updateCellServer = useCallback((notebookId: string, cellId: string, serverId: string | null) => {
    dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { serverId } });
  }, []);

  const executeCell = useCallback(async (notebookId: string, cellId: string) => {
    const notebook = state.notebooks.find(n => n.id === notebookId);
    const cell = notebook?.cells.find(c => c.id === cellId);
    if (!cell || !cell.serverId || !cell.sql.trim()) return;

    const server = state.servers.find(s => s.id === cell.serverId);
    if (!server) return;

    dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { isExecuting: true, error: null } });

    const queryId = newQueryId();
    const runningKey = `${notebookId}:${cellId}`;
    runningQueries.current.set(runningKey, { queryId, sessionId: server.sessionId });

    try {
      api.setSessionId(server.sessionId);
      const result = await api.query(cell.sql, DEFAULT_PAGE_SIZE, 0, queryId);
      const cellResult: CellResult = {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalRows: null, // Unknown until we reach the end
        hasMore: result.hasMore,
        originalSql: cell.sql,
      };
      dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { result: cellResult, isExecuting: false } });
    } catch (e) {
      dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: {
        error: e instanceof Error ? e.message : 'Query failed',
        isExecuting: false,
      }});
    } finally {
      if (runningQueries.current.get(runningKey)?.queryId === queryId) {
        runningQueries.current.delete(runningKey);
      }
    }
  }, [state.notebooks, state.servers]);

  const cancelCell = useCallback(async (notebookId: string, cellId: string) => {
    const running = runningQueries.current.get(`${notebookId}:${cellId}`);
    if (!running) return;
    try {
      api.setSessionId(running.sessionId);
      await api.cancelQuery(running.queryId);
    } catch (e) {
      // The statement's own request reports the outcome; a failed cancel
      // just means it keeps running (e.g. the session is gone).
      console.warn('Cancel request failed:', e instanceof Error ? e.message : e);
    }
  }, []);

  const fetchCellPage = useCallback(async (notebookId: string, cellId: string, page: number) => {
    const notebook = state.notebooks.find(n => n.id === notebookId);
    const cell = notebook?.cells.find(c => c.id === cellId);
    if (!cell || !cell.serverId || !cell.result) return;

    const server = state.servers.find(s => s.id === cell.serverId);
    if (!server) return;

    dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { isExecuting: true, error: null } });

    const queryId = newQueryId();
    const runningKey = `${notebookId}:${cellId}`;
    runningQueries.current.set(runningKey, { queryId, sessionId: server.sessionId });

    try {
      api.setSessionId(server.sessionId);
      const offset = (page - 1) * cell.result.pageSize;
      const result = await api.query(cell.result.originalSql, cell.result.pageSize, offset, queryId);
      const cellResult: CellResult = {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
        page,
        pageSize: cell.result.pageSize,
        totalRows: cell.result.totalRows,
        hasMore: result.hasMore,
        originalSql: cell.result.originalSql,
      };
      dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: { result: cellResult, isExecuting: false } });
    } catch (e) {
      dispatch({ type: 'UPDATE_CELL', notebookId, cellId, updates: {
        error: e instanceof Error ? e.message : 'Failed to fetch page',
        isExecuting: false,
      }});
    } finally {
      if (runningQueries.current.get(runningKey)?.queryId === queryId) {
        runningQueries.current.delete(runningKey);
      }
    }
  }, [state.notebooks, state.servers]);

  // Schema actions
  const getServerCatalogs = useCallback(async (serverId: string): Promise<string[]> => {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return [];
    api.setSessionId(server.sessionId);
    return api.getCatalogs();
  }, [state.servers]);

  const getServerSchemas = useCallback(async (serverId: string, catalog?: string) => {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return [];
    api.setSessionId(server.sessionId);
    return api.getSchemas(catalog);
  }, [state.servers]);

  const getServerTables = useCallback(async (serverId: string, catalog?: string, schema?: string) => {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return [];
    api.setSessionId(server.sessionId);
    return api.getTables(catalog, schema);
  }, [state.servers]);

  const value: AppContextType = {
    state,
    enableTpch,
    setTheme,
    toggleTheme,
    connectServer,
    disconnectServer,
    saveConnection,
    deleteSavedConnection,
    connectFromSaved,
    createNotebook,
    deleteNotebook,
    renameNotebook,
    setActiveNotebook,
    addCell,
    removeCell,
    updateCellSql,
    updateCellServer,
    executeCell,
    cancelCell,
    fetchCellPage,
    getServerCatalogs,
    getServerSchemas,
    getServerTables,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
