import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e' };

export default function Staff() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadStaff(); }, []);

  const loadStaff = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, supervisor:profiles!profiles_supervisor_id_fkey(full_name)')
      .order('full_name');
    if (data) setStaff(data);
  };

  const filtered = staff.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.position || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Staff Directory</h2>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} staff members</p>
        </div>
        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] w-64" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Email', 'Role', 'Position', 'Building', 'Hire Date', 'Contract', 'Supervisor', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-semibold text-gray-800">{s.full_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    s.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    s.role === 'hr' ? 'bg-blue-100 text-blue-700' :
                    s.role === 'supervisor' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{s.role}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.position || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.building || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.hire_date || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.contract_days ? `${s.contract_days}-day` : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.supervisor?.full_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}