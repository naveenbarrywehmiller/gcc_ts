import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { ShieldAlert, DatabaseBackup, Power, Key, Link as LinkIcon, Download, Upload } from 'lucide-react';

export default function SystemMaintenance() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tokenExpiry, setTokenExpiry] = useState('30d');
  const [generatedToken, setGeneratedToken] = useState('');

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

  // Database Backup
  const backupDb = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/backup');
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message || 'Backup completed successfully', 'success');
    },
    onError: () => {
      showToast('Database backup failed', 'error');
    }
  });

  // Database Restore
  const restoreDb = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/restore');
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message || 'Restore completed successfully', 'success');
    },
    onError: () => {
      showToast('Database restore failed', 'error');
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
    { method: 'POST', path: '/api/system/backup', desc: 'Trigger DB backup' },
    { method: 'POST', path: '/api/system/restore', desc: 'Trigger DB restore' },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldAlert className="w-8 h-8 mr-3 text-red-500" />
          System Maintenance
        </h1>
      </div>
      <p className="text-gray-600 dark:text-gray-400">
        This page is exclusively for system administration. Enable maintenance mode before taking backups or restoring the database.
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <DatabaseBackup className="w-5 h-5 mr-2 text-blue-500" /> Database Management
        </h2>
        {!maintenanceData?.enabled && (
          <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm">
            <strong>Warning:</strong> It is highly recommended to enable Maintenance Mode before performing a backup or restore.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => backupDb.mutate()}
            disabled={backupDb.isPending}
            className="flex items-center justify-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-5 h-5 mr-2" />
            {backupDb.isPending ? 'Backing up...' : 'Backup Database'}
          </button>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to restore the database? This will overwrite the current database and cannot be undone!')) {
                restoreDb.mutate();
              }
            }}
            disabled={restoreDb.isPending}
            className="flex items-center justify-center py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-5 h-5 mr-2" />
            {restoreDb.isPending ? 'Restoring...' : 'Restore Database'}
          </button>
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
