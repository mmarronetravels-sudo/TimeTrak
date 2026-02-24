import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', green: '#16a34a', red: '#dc2626' };

export default function LeaveApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [notification, setNotification] = useState(null);

  useEffect(() => { if (profile) loadRequests(); }, [profile]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadRequests = async () => {
    const { data: staffList } = await supabase
      .from('profiles')
      .select('id, full_name, position, building')
      .eq('supervisor_id', profile.id);
    if (!staffList || staffList.length === 0) { setRequests([]); return; }

    const staffIds = staffList.map(s => s.id);
    const { data } = await supabase
      .from('leave_requests')
      .select('*, leave_types(name, code)')
      .in('staff_id', staffIds)
      .order('created_at', { ascending: false });

    const enriched = (data || []).map(r => ({
      ...r,
      staff: staffList.find(s => s.id === r.staff_id),
    }));
    setRequests(enriched);
  };

  const handleAction = async (req, action) => {
    await supabase.from('leave_requests').update({
      status: action,
      reviewed_by: profile.id,
      reviewed_by_name: profile.full_name,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);

    // Notify staff member
    await supabase.from('notifications').insert({
      tenant_id: profile.tenant_id,
      recipient_id: req.staff_id,
      type: action === 'approved' ? 'leave_approved' : 'leave_denied',
      title: action === 'approved' ? 'Leave Request Approved' : 'Leave Request Denied',
      message: `Your ${req.leave_types?.name} request for ${req.start_date} (${req.total_hours} hours) was ${action} by ${profile.full_name}`,
      related_id: req.id,
    });

    showNotif(`Leave request ${action}!`);
    loadRequests();
  };

  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');

  const statusStyles = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    denied: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">{notification}</div>
      )}

      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Leave Approval</h2>
        <p className="text-sm text-gray-500 mt-0.5">Your assigned staff's leave requests</p>
      </div>

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Pending Requests ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-800">{r.staff?.full_name}</p>
                    <p className="text-xs text-gray-500">{r.staff?.position} · {r.staff?.building}</p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{r.leave_types?.name}</span>
                      <span>{r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}</span>
                      <span className="font-semibold">{r.total_hours} hours</span>
                    </div>
                    {r.reason && <p className="text-sm text-gray-500 mt-2 italic">"{r.reason}"</p>}
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    <button onClick={() => handleAction(r, 'approved')} className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all" style={{ background: C.green }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => handleAction(r, 'denied')} className="px-5 py-2 rounded-lg text-sm font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50 transition-all">
                      ✕ Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-12 text-center text-gray-400 mb-6">
          No pending leave requests from your assigned staff
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">History</h3>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Staff', 'Type', 'Dates', 'Hours', 'Status', 'Reviewed'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.staff?.full_name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{r.leave_types?.name}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}</td>
                    <td className="px-4 py-3 text-sm font-medium">{r.total_hours}h</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${statusStyles[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{r.reviewed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}