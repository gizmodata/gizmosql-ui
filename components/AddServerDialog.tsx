'use client';

import { useState, useRef, useCallback, FormEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { SavedConnection } from '@/lib/types';
import Image from 'next/image';
import styles from './AddServerDialog.module.css';

interface AddServerDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

type AuthMode = 'password' | 'oauth';

export function AddServerDialog({ onClose, onSuccess }: AddServerDialogProps) {
  const { connectServer, saveConnection, deleteSavedConnection, connectFromSaved, state } = useApp();
  const [name, setName] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(31337);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [oauthServerPort, setOauthServerPort] = useState(31339);
  const [oauthUseTls, setOauthUseTls] = useState(false);
  const [useTls, setUseTls] = useState(true);
  const [skipTlsVerify, setSkipTlsVerify] = useState(false);
  const [queryTimeout, setQueryTimeout] = useState(0); // 0 = unlimited
  const [saveThisConnection, setSaveThisConnection] = useState(true);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [oauthManualUrl, setOauthManualUrl] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef = useRef<Window | null>(null);

  const loadSavedConnection = (saved: SavedConnection) => {
    setSelectedSavedId(saved.id);
    setName(saved.name);
    setHost(saved.host);
    setPort(saved.port);
    setUsername(saved.username || '');
    setPassword(saved.password || '');
    setAuthMode(saved.authType === 'oauth' ? 'oauth' : 'password');
    setOauthServerPort(saved.oauthServerPort || 31339);
    setOauthUseTls(saved.oauthUseTls ?? false);
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

  const cleanupOauth = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  const pollForToken = useCallback(async (sessionUuid: string, oauthBaseUrl: string | null): Promise<string> => {
    const maxAttempts = 120; // 2 minutes at 1s intervals
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        attempts++;
        if (attempts > maxAttempts) {
          reject(new Error('SSO login timed out. Please try again.'));
          return;
        }

        try {
          const response = await fetch('/api/oauth/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              oauthBaseUrl,
              host: oauthBaseUrl ? undefined : host,
              oauthServerPort: oauthBaseUrl ? undefined : oauthServerPort,
              useTls: oauthBaseUrl ? undefined : oauthUseTls,
              sessionUuid,
            }),
          });

          const data = await response.json();

          if (data.status === 'complete' && data.token) {
            resolve(data.token);
            return;
          }

          if (data.status === 'error' || data.error) {
            reject(new Error(data.error || 'OAuth authentication failed'));
            return;
          }

          // Still pending, poll again
          pollTimerRef.current = setTimeout(poll, 1000);
        } catch {
          // Network error, retry
          pollTimerRef.current = setTimeout(poll, 2000);
        }
      };

      poll();
    });
  }, [host, oauthServerPort, oauthUseTls]);

  const handleOAuthLogin = async () => {
    setIsConnecting(true);
    setError(null);
    setOauthStatus('Discovering OAuth server...');
    setOauthManualUrl(null);
    cleanupOauth();

    try {
      // Step 1: Try OAuth URL discovery via Flight handshake
      let oauthBaseUrl: string | null = null;
      try {
        const discoverResponse = await fetch('/api/oauth/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host, port, useTls, skipTlsVerify }),
        });
        if (discoverResponse.ok) {
          const discoverData = await discoverResponse.json();
          oauthBaseUrl = discoverData.oauthUrl;
        }
      } catch {
        // Discovery failed, fall back to manual config
      }

      setOauthStatus('Starting SSO...');

      // Step 2: Initiate OAuth flow (use discovered URL or manual config)
      const initiateResponse = await fetch('/api/oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oauthBaseUrl,
          host: oauthBaseUrl ? undefined : host,
          oauthServerPort: oauthBaseUrl ? undefined : oauthServerPort,
          useTls: oauthBaseUrl ? undefined : oauthUseTls,
        }),
      });

      if (!initiateResponse.ok) {
        const data = await initiateResponse.json();
        throw new Error(data.error || 'Failed to start OAuth flow');
      }

      const { session_uuid, auth_url } = await initiateResponse.json();

      // Step 3: Open popup for IdP login
      const popup = window.open(auth_url, 'gizmosql-sso', 'width=500,height=700,popup=yes');
      popupRef.current = popup;

      if (!popup || popup.closed) {
        // Popup was blocked
        setOauthManualUrl(auth_url);
        setOauthStatus('Popup blocked. Please click the link below to log in, then return here.');
      } else {
        setOauthStatus('Waiting for login...');
      }

      // Step 4: Poll for token
      const token = await pollForToken(session_uuid, oauthBaseUrl);

      // Close popup if still open
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      setOauthStatus('Connecting...');

      // Step 5: Connect using the token via Basic Auth (username="token", password=<jwt>)
      const config = {
        host,
        port,
        username: 'token',
        password: token,
        authType: 'oauth' as const,
        oauthServerPort,
        oauthUseTls,
        oauthToken: token,
        useTls,
        skipTlsVerify,
        queryTimeout: queryTimeout || undefined,
      };
      const displayName = name || `${host}:${port}`;

      await connectServer(config, displayName);

      if (saveThisConnection) {
        saveConnection(config, displayName);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth login failed');
    } finally {
      setIsConnecting(false);
      setOauthStatus(null);
      setOauthManualUrl(null);
      cleanupOauth();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (authMode === 'oauth') {
      await handleOAuthLogin();
      return;
    }

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
      cleanupOauth();
      onClose();
    }
  };

  const handleClose = () => {
    cleanupOauth();
    onClose();
  };

  const isPasswordFormValid = host && username && password;
  const isOAuthFormValid = host && port;

  return (
    <div className={styles.dialogOverlay} onMouseDown={handleBackdropClick}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <Image src="/gizmosql-logo.png" alt="GizmoSQL" className={styles.dialogLogo} width={32} height={32} />
          <h2>Add GizmoSQL Server</h2>
          <button className={styles.dialogClose} onClick={handleClose}>×</button>
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
                      {saved.authType === 'oauth' ? 'SSO' : saved.username}@{saved.host}:{saved.port}
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

          <div className={styles.authModeRow}>
            <label>Authentication</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="authMode"
                  checked={authMode === 'password'}
                  onChange={() => setAuthMode('password')}
                />
                <span>Username &amp; Password</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="authMode"
                  checked={authMode === 'oauth'}
                  onChange={() => setAuthMode('oauth')}
                />
                <span>SSO / OAuth</span>
              </label>
            </div>
          </div>

          {authMode === 'password' && (
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
          )}

          {authMode === 'oauth' && (
            <details className={styles.oauthAdvanced}>
              <summary className={styles.oauthAdvancedSummary}>OAuth server override (auto-discovered by default)</summary>
              <div className={styles.formRow}>
                <div className={`${styles.formGroup} ${styles.flex2}`}>
                  <label htmlFor="oauthServerPort">OAuth Server Port</label>
                  <input
                    type="number"
                    id="oauthServerPort"
                    value={oauthServerPort}
                    onChange={(e) => setOauthServerPort(parseInt(e.target.value) || 31339)}
                    placeholder="31339"
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.flex1}`} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '16px' }}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={oauthUseTls}
                      onChange={(e) => setOauthUseTls(e.target.checked)}
                    />
                    <span>OAuth TLS</span>
                  </label>
                </div>
              </div>
            </details>
          )}

          {oauthStatus && (
            <div className={styles.oauthStatus}>
              <span className="spinner"></span>
              {oauthStatus}
              {oauthManualUrl && (
                <span className={styles.oauthManualLink}>
                  <a href={oauthManualUrl} target="_blank" rel="noopener noreferrer">
                    Open login page
                  </a>
                </span>
              )}
            </div>
          )}

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
            {saveThisConnection && authMode === 'password' && (
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
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            {authMode === 'password' ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isConnecting || !isPasswordFormValid}
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
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isConnecting || !isOAuthFormValid}
              >
                {isConnecting ? (
                  <>
                    <span className="spinner"></span>
                    {oauthStatus || 'Connecting...'}
                  </>
                ) : (
                  'Login with SSO'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
