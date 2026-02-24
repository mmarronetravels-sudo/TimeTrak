import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1', green: '#16a34a' };

export default function MyLeave() {
  const { profile } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', total_hours: '', reason: '' });
  const [notification, setNotification] = useState(null);

  useEffect(() => { loadData(); }, [profile]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadData = async () => {
    if (!profile) return;
    const { data: lt } = await supabase.from('leave_types').select('*').order('sort_order');
    if (lt) setLeaveTypes(lt);
    const { data: reqs } = await supabase
      .from('leave_requests')
      .select('*, leave_types(name, code)')
      .eq('staff_id', profile.id)
      .order('created_at', { ascending: false });
    if (reqs) setRequests(reqs);
  };

  const submitRequest = async () => {
    if (!form.leave_type_id || !form.start_date || !form.total_hours) return;
    const { error } = await supabase.from('leave_requests').insert({
      tenant_id: profile.tenant_id,
      staff_id: profile.id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      total_hours: parseFloat(form.total_hours),
      reason: form.reason,
      status: 'pending',
    });
    if (!error) {
      // Notify supervisor
      if (profile.supervisor_id) {
        const lt = leaveTypes.find(t => t.id === form.leave_type_id);
        await supabase.from('notifications').insert({
          tenant_id: profile.tenant_id,
          recipient_id: profile.supervisor_id,
          type: 'leave_requested',
          title: 'Leave Request',
          message: `${profile.full_name} requested ${form.total_hours} hours of ${lt?.name || 'leave'} (${form.start_date})`,
        });
      }
      setShowModal(false);
      setForm({ leave_type_id: '', start_date: '', end_date: '', total_hours: '', reason: '' });
      showNotif('Leave request submitted!');
      loadData();
    }
  };

  const statusStyles = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    denied: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">{notification}</div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Leave Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">{profile?.full_name} · {profile?.position}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2.5 rounded-lg text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all" style={{ background: C.navy }}>
          + Request Leave
        </button>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Type', 'Dates', 'Hours', 'Reason', 'Status', 'Submitted', 'Reviewed By'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{r.leave_types?.name || '—'}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.total_hours}h</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${statusStyles[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.reviewed_by_name || '—'}</td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No leave requests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Request Leave Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-xl font-bold" style={{ color: C.navy }}>Request Leave</h3>
              <p className="text-sm text-gray-500 mt-0.5">{profile?.full_name} · {profile?.position}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Leave Type</label>
                <select value={form.leave_type_id} onChange={e => setForm(p => ({ ...p, leave_type_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                  <option value="">Select leave type...</option>
                  {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total Hours</label>
                <input type="number" step="0.5" value={form.total_hours} onChange={e => setForm(p => ({ ...p, total_hours: e.target.value }))} placeholder="e.g. 8" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reason</label>
                <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button onClick={submitRequest} disabled={!form.leave_type_id || !form.start_date || !form.total_hours} className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: C.navy }}>
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}