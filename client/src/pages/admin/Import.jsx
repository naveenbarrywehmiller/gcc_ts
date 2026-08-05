import { useState, useRef } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react';

export default function AdminImport() {
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedType, setSelectedType] = useState('projects');
  const fileRef = useRef(null);

  const importTypes = [
    { value: 'projects', label: 'Projects', desc: 'Import project codes, names, customers, activities' },
    { value: 'users', label: 'Users', desc: 'Import employee names, emails, divisions' },
    { value: 'tasks', label: 'Tasks', desc: 'Import task categories and classifications' },
    { value: 'divisions', label: 'Divisions', desc: 'Import division list' },
  ];

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Please upload an Excel file (.xlsx, .xls, .csv)');
      return;
    }

    setImporting(true);
    setResults(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/import/${selectedType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(res.data);
      toast.success(`Imported ${res.data.imported} ${selectedType} successfully`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
      setResults({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 dark:text-white">Import Data</h1>

      {/* Type selector */}
      <div className="grid grid-cols-2 gap-3">
        {importTypes.map(t => (
          <button
            key={t.value}
            onClick={() => { setSelectedType(t.value); setResults(null); }}
            className={`card p-4 text-left transition-all cursor-pointer ${
              selectedType === t.value
                ? 'ring-2 ring-brand-500 border-brand-500 dark:border-brand-400'
                : 'hover:border-surface-300 dark:hover:border-surface-600'
            }`}
          >
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{t.label}</p>
            <p className="text-xs text-surface-400 mt-0.5">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`card border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
          dragOver
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20'
            : 'border-surface-300 dark:border-surface-700 hover:border-surface-400 dark:hover:border-surface-600'
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {importing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-sm text-surface-500">Importing {selectedType}...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
              <Upload className="w-6 h-6 text-surface-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
                Drop your Excel file here or click to browse
              </p>
              <p className="text-xs text-surface-400 mt-1">
                Supports .xlsx, .xls, .csv • Max 10MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results && !results.error && (
        <div className="card p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Import Complete</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{results.imported}</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Imported</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{results.skipped}</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Skipped</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
              <p className="text-2xl font-bold text-surface-600 dark:text-surface-300">{results.total}</p>
              <p className="text-xs text-surface-400">Total Rows</p>
            </div>
          </div>
          {results.errors?.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Errors:</p>
              {results.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-500 truncate">{err}</p>
              ))}
            </div>
          )}
          {results.defaultPassword && (
            <p className="mt-3 text-xs text-surface-500">Default password for imported users: <code className="px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 rounded text-brand-600 dark:text-brand-400">{results.defaultPassword}</code></p>
          )}
        </div>
      )}

      {results?.error && (
        <div className="card p-5 border-red-200 dark:border-red-800 animate-slide-up">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{results.error}</p>
          </div>
        </div>
      )}

      {/* Column guide */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3">Expected Column Headers</h3>
        <div className="text-xs text-surface-500 space-y-1">
          {selectedType === 'projects' && (
            <p>Project Code, Project Name, Customer Name, Activity, Division, Team Type</p>
          )}
          {selectedType === 'users' && (
            <p>Name, Email, Role, Division, Core, Team Type</p>
          )}
          {selectedType === 'tasks' && (
            <p>Classification, Task Category, Task Description</p>
          )}
          {selectedType === 'divisions' && (
            <p>Division (or Name)</p>
          )}
        </div>
      </div>
    </div>
  );
}
