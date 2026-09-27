import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import {
  ShieldAlert,
  DatabaseBackup,
  Power,
  Key,
  Link as LinkIcon,
  Download,
  Upload,
  HardDriveDownload,
  HardDriveUpload,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
} from 'lucide-react';

export default function SystemMaintenance() {
  const toast = useToast();
  const showToast = (msg, type = 'success') => {
    if (toast && typeof toast[type] === 'function') {
      toast[type](msg);
    } else if (toast && typeof toast.info === 'function') {
      toast.info(msg);
    }
  };

  const queryClient = useQueryClient();
  const [tokenExpiry, setTokenExpiry] = useState('30d');
  const [generatedToken, setGeneratedToken] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoringUpload, setIsRestoringUpload] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState('');
  const fileInputRef = useRef(null);

  // Fetch Maintenance Status
  const { data: maintenanceData, isLoading } = useQuery({
    queryKey: ['maintenanceStatus'],
    queryFn: async () => {
      const res = await api.get('/system/maintenance');
      return res.data;
    }
  });

  // Toggle Maintenance Mode
  const toggleMaintenance = useMutation({
    mutationFn: async (enabled) => {
      const res = await api.post('/system/maintenance', { enabled });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['maintenanceStatus'], { enabled: data.enabled });
      showToast(`Maintenance mode ${data.enabled ? 'enabled' : 'disabled'}`, 'success');
    },
    onError: () => {
      showToast('Failed to toggle maintenance mode', 'error');
    }
  });

function getFormattedTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

  // Direct Download to PC
  const handleDownloadToPc = async () => {
    setIsDownloading(true);
    try {
      showToast('Preparing live database snapshot...', 'info');
      const res = await api.get('/system/database/download', {
        responseType: 'blob',
      });

      // Extract filename from content-disposition header if available
      let filename = `timesheet-backup-${getFormattedTimestamp()}.db`;
      const disposition = res.headers?.['content-disposition'];
      if (disposition && disposition.includes('filename=')) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/x-sqlite3' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      showToast(`Database downloaded successfully: ${filename}`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      showToast(err.response?.data?.error || 'Failed to download database to PC', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // Direct Restore from PC Upload
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so user can re-select the same file if needed
    e.target.value = '';

    const sizeKb = (file.size / 1024).toFixed(1);
    const confirmed = window.confirm(
      `⚠️ OVERWRITE LIVE DATABASE?\n\n` +
      `File: ${file.name} (${sizeKb} KB)\n\n` +
      `This will completely replace all live database tables with the contents of this file.\n` +
      `A safety backup will be automatically saved on the server before applying.\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) return;

    setIsRestoringUpload(true);
    setRestoreSuccessMsg('');
    showToast(`Uploading ${file.name} and restoring database...`, 'info');

    const formData = new FormData();
    formData.append('database', file);

    try {
      const res = await api.post('/system/database/restore-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const msg = res.data?.message || `Database successfully restored from ${file.name}!`;
      setRestoreSuccessMsg(msg);
      showToast(msg, 'success');
      queryClient.invalidateQueries();

      // Automatically reload page after 2 seconds so the entire app reflects restored data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Restore upload error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to restore database from uploaded file';
      showToast(errMsg, 'error');
    } finally {
      setIsRestoringUpload(false);
    }
  };

  // Server-Side Database Backup
  const backupDb = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/backup');
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message || 'Server-side backup completed successfully', 'success');
    },
    onError: () => {
      showToast('Server-side database backup failed', 'error');
    }
  });

  // Server-Side Database Restore
  const restoreDb = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/restore');
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message || 'Server-side restore completed successfully', 'success');
    },
    onError: () => {
      showToast('Server-side database restore failed', 'error');
    }
  });

  // Generate Token
  const generateToken = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/tokens', { expiresIn: tokenExpiry, role: 'system admin' });
      return res.data;
    },
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      showToast('Token generated successfully', 'success');
    },
    onError: () => {
      showToast('Failed to generate token', 'error');
    }
  });

  const apiLinks = [
    { method: 'POST', path: '/api/auth/login', desc: 'Login to get access token' },
    { method: 'GET', path: '/api/timesheets', desc: 'Get timesheet data' },
    { method: 'POST', path: '/api/timesheets', desc: 'Submit a timesheet' },
    { method: 'GET', path: '/api/system/maintenance', desc: 'Check maintenance status' },
    { method: 'GET', path: '/api/system/database/download', desc: 'Direct download SQLite database to PC' },
    { method: 'POST', path: '/api/system/database/restore-upload', desc: 'Upload and restore SQLite database from PC' },
    { method: 'POST', path: '/api/system/backup', desc: 'Trigger server-side DB backup' },
    { method: 'POST', path: '/api/system/restore', desc: 'Trigger server-side DB restore' },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldAlert className="w-8 h-8 mr-3 text-red-500" />
          System Maintenance
        </h1>
      </div>
      <p className="text-gray-600 dark:text-gray-400">
        This portal is exclusively for system administration. Enable maintenance mode before taking backups or restoring the database.
      </p>

      {/* Maintenance Mode Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Power className="w-5 h-5 mr-2 text-indigo-500" /> Maintenance Mode
        </h2>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">System Availability</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              When enabled, all API endpoints except system APIs will return a 503 Service Unavailable error.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={maintenanceData?.enabled || false}
              disabled={isLoading || toggleMaintenance.isPending}
              onChange={(e) => toggleMaintenance.mutate(e.target.checked)}
            />
            <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
          </label>
        </div>
      </div>

      {/* Database Management Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
            <DatabaseBackup className="w-5 h-5 mr-2 text-blue-500" /> Database Backup & Restore
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Download database snapshots directly to your PC, or restore from a previously downloaded .db file.
          </p>
        </div>

        {!maintenanceData?.enabled && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Recommended Precaution:</strong> It is highly recommended to enable <strong>Maintenance Mode</strong> above before performing a database restore to prevent concurrent writes.
            </div>
          </div>
        )}

        {restoreSuccessMsg && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Database Restored Successfully</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{restoreSuccessMsg} Page will reload shortly...</p>
            </div>
          </div>
        )}

        {/* Option 1: Direct PC Transfer (Featured) */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-1.5">
            <HardDriveDownload className="w-4 h-4" /> Direct PC Transfer (Recommended)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Download directly to PC */}
            <div className="p-5 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <HardDriveDownload className="w-5 h-5" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white text-base">Download Database to PC</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4 leading-relaxed">
                  Generates an online point-in-time snapshot and downloads the complete SQLite database (<code className="px-1 bg-white/70 dark:bg-gray-800 rounded">.db</code>) directly to your local computer.
                </p>
              </div>
              <button
                onClick={handleDownloadToPc}
                disabled={isDownloading || isRestoringUpload}
                className="w-full flex items-center justify-center py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Preparing Download...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download .db to PC
                  </>
                )}
              </button>
            </div>

            {/* Restore directly from PC */}
            <div className="p-5 rounded-xl border border-purple-100 dark:border-purple-900/50 bg-gradient-to-br from-purple-50/50 to-pink-50/30 dark:from-purple-950/20 dark:to-pink-950/10 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                  <HardDriveUpload className="w-5 h-5" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white text-base">Restore Database from PC</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4 leading-relaxed">
                  Select a <code className="px-1 bg-white/70 dark:bg-gray-800 rounded">.db</code> file from your computer. Validates schema integrity, saves an automated safety backup, and replaces the live database.
                </p>
              </div>

              {/* Hidden file input */}
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".db,.sqlite,.sqlite3" 
                className="hidden" 
                onChange={handleFileSelected} 
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isDownloading || isRestoringUpload}
                className="w-full flex items-center justify-center py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                {isRestoringUpload ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Uploading & Restoring...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Select & Restore .db File
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Option 2: Server-Side Storage */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700/60">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
            <Server className="w-4 h-4" /> Server Host Storage (/backup)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => backupDb.mutate()}
              disabled={backupDb.isPending || isDownloading || isRestoringUpload}
              className="flex items-center justify-center py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              {backupDb.isPending ? 'Backing up on server...' : 'Save Backup on Server'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to restore the latest server backup? This will overwrite the current live database!')) {
                  restoreDb.mutate();
                }
              }}
              disabled={restoreDb.isPending || isDownloading || isRestoringUpload}
              className="flex items-center justify-center py-2.5 px-4 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              {restoreDb.isPending ? 'Restoring on server...' : 'Restore Latest Server Backup'}
            </button>
          </div>
        </div>
      </div>

      {/* Token Generation Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Key className="w-5 h-5 mr-2 text-green-500" /> API Token Generation
        </h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <select
              value={tokenExpiry}
              onChange={(e) => setTokenExpiry(e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
            >
              <option value="1h">1 Hour</option>
              <option value="1d">1 Day</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="never">No Expiry</option>
            </select>
            <button
              onClick={() => generateToken.mutate()}
              disabled={generateToken.isPending}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Generate Token
            </button>
          </div>
          
          {generatedToken && (
            <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
              <p className="text-sm text-gray-400 mb-2">Generated Token (Copy this now, it won't be shown again):</p>
              <div className="flex items-center">
                <code className="text-green-400 break-all text-sm flex-1 font-mono">
                  {generatedToken}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedToken);
                    showToast('Token copied to clipboard', 'success');
                  }}
                  className="ml-4 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* API Reference Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <LinkIcon className="w-5 h-5 mr-2 text-purple-500" /> REST API Links
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                <th className="py-3 px-4 font-medium">Method</th>
                <th className="py-3 px-4 font-medium">Endpoint</th>
                <th className="py-3 px-4 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700 dark:text-gray-300">
              {apiLinks.map((link, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      link.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      link.method === 'POST' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {link.method}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-900 dark:text-white">{link.path}</td>
                  <td className="py-3 px-4">{link.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
