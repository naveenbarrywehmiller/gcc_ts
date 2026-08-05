import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { Plus, Trash2, Calendar as CalIcon } from 'lucide-react';

export default function AdminHolidays() {
  const toast = useToast();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ date: '', name: '' });

  const load = () => {
    setLoading(true);
    api.get(`/holidays?year=${year}`).then(res => setHolidays(res.data.holidays)).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [year]);

  const handleSave = async () => {
    if (!form.date || !form.name) { toast.error('Date and name are required'); return; }
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added');
      setShowModal(false); setForm({ date: '', name: '' }); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this holiday?')) return;
    try { await api.delete(`/holidays/${id}`); toast.success('Holiday removed'); load(); } catch { toast.error('Failed'); }
  };

  const months = {};
  holidays.forEach(h => {
    const m = new Date(h.date + 'T00:00:00').toLocaleString('default', { month: 'long' });
    if (!months[m]) months[m] = [];
    months[m].push(h);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Holidays</h1>
          <select className="input-sm w-24" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Holiday</button>
      </div>

      {loading ? (
        <div className="card p-4"><div className="skeleton h-40 rounded-lg" /></div>
      ) : Object.keys(months).length === 0 ? (
        <div className="card p-8 text-center text-sm text-surface-400">
          <CalIcon className="w-8 h-8 mx-auto mb-2 text-surface-300" />
          No holidays set for {year}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(months).map(([monthName, days]) => (
            <div key={monthName} className="card p-4">
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3">{monthName}</h3>
              <div className="space-y-2">
                {days.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 group transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-surface-400 w-10">
                        {new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-sm text-surface-700 dark:text-surface-300">{h.name}</span>
                    </div>
                    <button onClick={() => handleDelete(h.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Holiday"
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button><button onClick={handleSave} className="btn-primary btn-sm">Add</button></>}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Date *</label>
            <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Holiday Name *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Independence Day" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
