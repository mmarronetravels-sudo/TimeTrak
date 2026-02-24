import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e' };

export default function LeaveEntries() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: lt } = await supabase.from('leave_types').select('*').order('sort_order');
    if (lt) setLeaveTypes(lt);
    const { data } = await supabase
      .from('leave_entries')
      .select('*, leave_types(name, code, category), profiles!leave_entries_staff_id_fkey(full_name, position)')
      .order('created_at', { ascending: false });
    if (data) setEntries(data);
  };

  const filtered = entries.filter(e => {
    if (filterType !== 'all' && e.leave_type_id !== filterType) return false;
    if (searchTerm && !e.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>All Leave Entries</h2>
          <p className="text-sm text-gray-500 mt-0.5">School Year 2025-2026 · {filtered.length} entries</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input type="text" placeholder="Search by staff name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
          <option value="all">All Leave Types</option>
          <optgroup label="School-Provided">
            {leaveTypes.filter(t => t.category === 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          <optgroup label="Protected Leave">
            {leaveTypes.filter(t => t.category !== 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Staff', 'Leave Type', 'Dates', 'Amount', 'Concurrent', 'Docs', 'Reason', 'Logged'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800">{entry.profiles?.full_name}</p>
                  <p className="text-xs text-gray-500">{entry.profiles?.position}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{entry.leave_types?.name}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {entry.start_date}{entry.end_date && entry.end_date !== entry.start_date ? ` → ${entry.end_date}` : ''}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-800">{entry.amount} {entry.tracking_unit}</td>
                <td className="px-4 py-3">
                  {entry.concurrent_leave_type_id
                    ? <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{leaveTypes.find(t => t.id === entry.concurrent_leave_type_id)?.name}</span>
                    : <span className="text-xs text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {entry.documentation_on_file
                    ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">📄 On File</span>
                    : <span className="text-xs text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{entry.reason || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No entries match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}