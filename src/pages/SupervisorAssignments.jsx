import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1' };

export default function SupervisorAssignments() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => { loadData(); }, []);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadData = async () => {
    const { data: all } = await supabase.from('profiles').select('*').eq('is_active', true).order('full_name');
    if (all) {
      setStaff(all.filter(p => p.role === 'staff'));
      setSupervisors(all.filter(p => ['supervisor', 'admin'].includes(p.role)));
    }
  };

  const updateSupervisor = async (staffId, supervisorId) => {
    await supabase.from('profiles').update({ supervisor_id: supervisorId || null }).eq('id', staffId);
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, supervisor_id: supervisorId || null } : s));
    const staffMember = staff.find(s => s.id === staffId);
    setEditing(null);
    showNotif(`Supervisor updated for ${staffMember?.full_name}`);
  };

  // Count staff per supervisor
  const supCounts = {};
  supervisors.forEach(s => { supCounts[s.id] = staff.filter(st => st.supervisor_id === s.id).length; });
  const unassigned = staff.filter(s => !s.supervisor_id).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">{notification}</div>
      )}

      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Supervisor Assignments</h2>
        <p className="text-sm text-gray-500 mt-0.5">Assign supervisors to approve timecards and leave requests</p>
      </div>

      {/* Workflow Reference */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-bold text-sm mb-3" style={{ color: C.navy }}>Approval Workflow</h3>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold">Staff submits</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-semibold">Assigned Supervisor reviews</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 font-semibold">Supervisor Approves</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-semibold">HR Verifies ✓ → Payroll</span>
        </div>
      </div>

      {/* Supervisor Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {supervisors.map(sup => (
          <div key={sup.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4" style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
            <p className="font-bold text-sm" style={{ color: C.navy }}>{sup.full_name}</p>
            <p className="text-xs text-gray-500">{sup.position || sup.role}</p>
            <p className="text-lg font-bold mt-2" style={{ color: C.blue }}>
              {supCounts[sup.id] || 0} <span className="text-xs font-normal text-gray-500">staff assigned</span>
            </p>
          </div>
        ))}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-orange-300">
          <p className="font-bold text-sm text-orange-700">Unassigned</p>
          <p className="text-xs text-gray-500">No supervisor assigned</p>
          <p className="text-lg font-bold mt-2 text-orange-600">
            {unassigned} <span className="text-xs font-normal text-gray-500">staff</span>
          </p>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Staff Member', 'Position', 'Building', 'Assigned Supervisor', 'Action'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.map(s => {
              const assigned = supervisors.find(sup => sup.id === s.supervisor_id);
              const isEditing = editing === s.id;
              return (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-800">{s.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.position || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.building || '—'}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={s.supervisor_id || ''}
                        onChange={e => updateSupervisor(s.id, e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] w-full"
                      >
                        <option value="">— Unassigned —</option>
                        {supervisors.map(sup => (
                          <option key={sup.id} value={sup.id}>{sup.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-sm font-medium ${assigned ? 'text-indigo-700' : 'text-orange-600'}`}>
                        {assigned?.full_name || '⚠ Unassigned'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors">
                        ✓ Done
                      </button>
                    ) : (
                      <button onClick={() => setEditing(s.id)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors">
                        Change
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}