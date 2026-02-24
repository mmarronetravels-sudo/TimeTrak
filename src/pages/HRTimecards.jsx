import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', green: '#16a34a', red: '#dc2626' };
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function StatusBadge({ status }) {
  const styles = {
    submitted: 'bg-blue-100 text-blue-700',
    supervisor_approved: 'bg-indigo-100 text-indigo-700',
    verified: 'bg-emerald-100 text-emerald-800',
    returned: 'bg-orange-100 text-orange-700',
  };
  const labels = { supervisor_approved: 'Sup. Approved', verified: 'HR Verified' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function HRTimecards() {
  const { profile } = useAuth();
  const [timecards, setTimecards] = useState([]);
  const [entries, setEntries] = useState({});
  const [approvals, setApprovals] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [filterStatus, setFilterStatus] = useState('supervisor_approved');
  const [returnNote, setReturnNote] = useState('');
  const [notification, setNotification] = useState(null);

  useEffect(() => { if (profile) loadTimecards(); }, [profile, filterStatus]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadTimecards = async () => {
    let query = supabase
      .from('timecards')
      .select('*, profiles!timecards_staff_id_fkey(full_name, position, building, supervisor_id)')
      .order('week_start', { ascending: false });

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data } = await query;
    setTimecards(data || []);
  };

  const loadEntries = async (timecardId) => {
    if (entries[timecardId]) return;
    const { data } = await supabase
      .from('timecard_entries')
      .select('*, leave_types(name, code)')
      .eq('timecard_id', timecardId)
      .order('entry_date');
    setEntries(prev => ({ ...prev, [timecardId]: data || [] }));

    const { data: appr } = await supabase
      .from('timecard_approvals')
      .select('*')
      .eq('timecard_id', timecardId)
      .order('created_at');
    setApprovals(prev => ({ ...prev, [timecardId]: appr || [] }));
  };

  const toggleExpand = (tcId) => {
    if (expanded === tcId) { setExpanded(null); return; }
    setExpanded(tcId);
    loadEntries(tcId);
  };

  const handleVerify = async (tc) => {
    await supabase.from('timecards').update({ status: 'verified' }).eq('id', tc.id);
    await supabase.from('timecard_approvals').insert({
      timecard_id: tc.id,
      action: 'verified',
      action_by: profile.id,
      action_by_name: profile.full_name,
      action_by_role: profile.role,
    });
    // Notify staff
    await supabase.from('notifications').insert({
      tenant_id: profile.tenant_id,
      recipient_id: tc.staff_id,
      type: 'timecard_verified',
      title: 'Timecard Verified ✓',
      message: `Your timecard for week of ${tc.week_start} has been verified by HR and sent to payroll`,
      related_id: tc.id,
    });
    showNotif(`Timecard verified for ${tc.profiles?.full_name}`);
    setExpanded(null);
    loadTimecards();
  };

  const handleReturn = async (tc) => {
    await supabase.from('timecards').update({ status: 'returned' }).eq('id', tc.id);
    await supabase.from('timecard_approvals').insert({
      timecard_id: tc.id,
      action: 'returned',
      action_by: profile.id,
      action_by_name: profile.full_name,
      action_by_role: profile.role,
      note: returnNote,
    });
    await supabase.from('notifications').insert({
      tenant_id: profile.tenant_id,
      recipient_id: tc.staff_id,
      type: 'timecard_returned',
      title: 'Timecard Returned',
      message: `Your timecard was returned by HR. Please correct and resubmit.`,
      related_id: tc.id,
    });
    setReturnNote('');
    showNotif(`Timecard returned to ${tc.profiles?.full_name}`);
    setExpanded(null);
    loadTimecards();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">{notification}</div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Timecard Review (HR)</h2>
          <p className="text-sm text-gray-500 mt-0.5">Final verification before payroll</p>
        </div>
        <div className="flex gap-2">
          {['all', 'supervisor_approved', 'verified', 'returned'].map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === f ? 'bg-[#2c3e7e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f === 'all' ? 'All' : f === 'supervisor_approved' ? 'Awaiting HR' : f === 'verified' ? 'Verified' : 'Returned'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {timecards.map(tc => (
          <div key={tc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div onClick={() => toggleExpand(tc.id)} className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors">
              <div>
                <p className="font-semibold text-gray-800">{tc.profiles?.full_name}</p>
                <p className="text-xs text-gray-500">{tc.profiles?.position} · {tc.profiles?.building} · Week of {tc.week_start}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm" style={{ color: tc.total_hours > 40 ? C.red : C.navy }}>{tc.total_hours?.toFixed(1) || '0.0'} hrs</span>
                <StatusBadge status={tc.status} />
                <span className="text-gray-400 text-sm">{expanded === tc.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === tc.id && (
              <div className="border-t border-gray-100 px-5 py-4">
                {/* Daily entries */}
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {(entries[tc.id] || []).map((e, i) => (
                    <div key={e.id} className={`rounded-lg p-3 text-center ${e.leave_type_id ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <p className="text-xs font-semibold text-gray-500">{DAY_ABBR[i]}</p>
                      <p className="text-lg font-bold text-gray-800">{(e.hours || 0).toFixed(1)}</p>
                      {e.leave_type_id && <p className="text-[10px] text-amber-600 font-medium">{e.leave_types?.name || 'Leave'}</p>}
                      {!e.leave_type_id && e.time_in && <p className="text-[10px] text-gray-400">{e.time_in}–{e.time_out}</p>}
                    </div>
                  ))}
                </div>

                {/* Approval History */}
                {(approvals[tc.id] || []).length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Approval History</p>
                    {(approvals[tc.id] || []).map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-xs mb-1">
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          a.action === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                          a.action === 'approved' ? 'bg-green-100 text-green-700' :
                          a.action === 'returned' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{a.action}</span>
                        <span className="text-gray-700">{a.action_by_name}</span>
                        <span className="text-gray-400">{a.action_by_role} · {new Date(a.created_at).toLocaleDateString()}</span>
                        {a.note && <span className="text-gray-500 italic">"{a.note}"</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {tc.status === 'supervisor_approved' && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-100">
                    <button onClick={() => handleVerify(tc)} className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all" style={{ background: C.green }}>
                      ✓ Verify & Send to Payroll
                    </button>
                    <div className="flex-1 flex gap-2">
                      <input type="text" value={returnNote} onChange={e => setReturnNote(e.target.value)} placeholder="Return note (optional)..." className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                      <button onClick={() => handleReturn(tc)} className="px-5 py-2 rounded-lg text-sm font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50 transition-all">
                        ↩ Return
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {timecards.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-12 text-center text-gray-400">
            No timecards found with this filter
          </div>
        )}
      </div>
    </div>
  );
}