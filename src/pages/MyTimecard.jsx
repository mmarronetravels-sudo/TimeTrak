import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1', orange: '#f3843e', green: '#16a34a', red: '#dc2626' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function getWeekDates(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDate(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function formatFull(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function toDateStr(d) { return d.toISOString().split('T')[0]; }

function calcHours(tIn, lOut, lIn, tOut) {
  if (!tIn || !tOut) return 0;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let total = toMin(tOut) - toMin(tIn);
  if (lOut && lIn) total -= (toMin(lIn) - toMin(lOut));
  return Math.max(0, +(total / 60).toFixed(2));
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-blue-100 text-blue-700',
    supervisor_approved: 'bg-indigo-100 text-indigo-700',
    verified: 'bg-emerald-100 text-emerald-800',
    returned: 'bg-orange-100 text-orange-700',
  };
  const labels = { supervisor_approved: 'Sup. Approved', verified: 'HR Verified' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  );
}

export default function MyTimecard() {
  const { profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [timecard, setTimecard] = useState(null);
  const [entries, setEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = `${formatFull(weekDates[0])} — ${formatFull(weekDates[4])}`;
  const weekStart = toDateStr(weekDates[0]);

  useEffect(() => { loadLeaveTypes(); }, []);
  useEffect(() => { if (profile) loadTimecard(); }, [profile, weekStart]);

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadLeaveTypes = async () => {
    const { data } = await supabase.from('leave_types').select('*').order('sort_order');
    if (data) setLeaveTypes(data);
  };

  const loadTimecard = async () => {
    // Try to find existing timecard for this week
    const { data: tc } = await supabase
      .from('timecards')
      .select('*')
      .eq('staff_id', profile.id)
      .eq('week_start', weekStart)
      .single();

    if (tc) {
      setTimecard(tc);
      // Load entries
      const { data: ent } = await supabase
        .from('timecard_entries')
        .select('*')
        .eq('timecard_id', tc.id)
        .order('entry_date');
      setEntries(ent || []);
      // Load approval history
      const { data: appr } = await supabase
        .from('timecard_approvals')
        .select('*')
        .eq('timecard_id', tc.id)
        .order('created_at');
      setApprovals(appr || []);
    } else {
      // Create a new draft timecard
      const { data: newTc, error } = await supabase
        .from('timecards')
        .insert({
          tenant_id: profile.tenant_id,
          staff_id: profile.id,
          week_start: weekStart,
          status: 'draft',
        })
        .select()
        .single();

      if (newTc) {
        setTimecard(newTc);
        // Create blank entries for each day
        const newEntries = weekDates.map((d, i) => ({
          timecard_id: newTc.id,
          entry_date: toDateStr(d),
          day_of_week: DAYS[i],
          hours: 0,
        }));
        const { data: created } = await supabase.from('timecard_entries').insert(newEntries).select();
        setEntries(created || []);
      }
      setApprovals([]);
    }
  };

  const updateEntry = async (entryId, field, value) => {
    // Update locally first
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const updated = { ...e, [field]: value };
      // If setting leave type, clear times
      if (field === 'leave_type_id' && value) {
        updated.time_in = null;
        updated.lunch_out = null;
        updated.lunch_in = null;
        updated.time_out = null;
      }
      // Recalculate hours
      if (updated.leave_type_id) {
        const sched = profile.default_schedule;
        updated.hours = sched ? calcHours(sched.in, sched.lunchOut, sched.lunchIn, sched.out) : 8;
      } else {
        updated.hours = calcHours(updated.time_in, updated.lunch_out, updated.lunch_in, updated.time_out);
      }
      return updated;
    }));
  };

  const saveEntries = async () => {
    setSaving(true);
    for (const entry of entries) {
      await supabase.from('timecard_entries').update({
        time_in: entry.time_in || null,
        lunch_out: entry.lunch_out || null,
        lunch_in: entry.lunch_in || null,
        time_out: entry.time_out || null,
        leave_type_id: entry.leave_type_id || null,
        hours: entry.hours,
      }).eq('id', entry.id);
    }
    // Update timecard totals
    const totalHrs = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    await supabase.from('timecards').update({
      total_hours: totalHrs,
      overtime_hours: Math.max(0, totalHrs - 40),
    }).eq('id', timecard.id);
    setSaving(false);
    showNotif('Timecard saved!');
  };

  const fillDefault = () => {
    const sched = profile.default_schedule;
    if (!sched) return showNotif('No default schedule set');
    setEntries(prev => prev.map(e => {
      if (e.leave_type_id) return e;
      return {
        ...e,
        time_in: sched.in,
        lunch_out: sched.lunchOut,
        lunch_in: sched.lunchIn,
        time_out: sched.out,
        hours: calcHours(sched.in, sched.lunchOut, sched.lunchIn, sched.out),
      };
    }));
    showNotif('Default schedule filled');
  };

  const submitTimecard = async () => {
    await saveEntries();
    await supabase.from('timecards').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', timecard.id);
    // Log approval record
    await supabase.from('timecard_approvals').insert({
      timecard_id: timecard.id,
      action: 'submitted',
      action_by: profile.id,
      action_by_name: profile.full_name,
      action_by_role: profile.role,
    });
    // Notify supervisor
    if (profile.supervisor_id) {
      await supabase.from('notifications').insert({
        tenant_id: profile.tenant_id,
        recipient_id: profile.supervisor_id,
        type: 'timecard_submitted',
        title: 'Timecard Submitted',
        message: `${profile.full_name} submitted their timecard for ${weekLabel}`,
        related_id: timecard.id,
      });
    }
    setTimecard(prev => ({ ...prev, status: 'submitted' }));
    showNotif('Timecard submitted for approval!');
    loadTimecard();
  };

  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const overtime = Math.max(0, totalHours - 40);
  const editable = !timecard || timecard.status === 'draft' || timecard.status === 'returned';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">
          {notification}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>My Timecard</h2>
          <p className="text-sm text-gray-500 mt-0.5">{profile?.full_name} · {profile?.position}</p>
        </div>
        {timecard && <StatusBadge status={timecard.status} />}
      </div>

      {/* Week Navigator */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3 mb-5">
        <button onClick={() => setWeekOffset(p => p - 1)} className="text-sm font-medium hover:text-[#2c3e7e] text-gray-500">← Previous</button>
        <div className="text-center">
          <p className="font-semibold text-gray-800">{weekLabel}</p>
        </div>
        <button onClick={() => setWeekOffset(p => p + 1)} className="text-sm font-medium hover:text-[#2c3e7e] text-gray-500">Next →</button>
      </div>

      {/* Actions */}
      {editable && (
        <div className="flex gap-3 mb-4">
          <button onClick={fillDefault} className="text-sm px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 hover:border-[#477fc1] hover:text-[#477fc1] hover:bg-blue-50 transition-all font-medium">
            ⏰ Fill Default Schedule
          </button>
        </div>
      )}

      {/* Timecard Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_100px_80px] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="px-4 py-3">Day</div>
          <div className="px-3 py-3">Time In</div>
          <div className="px-3 py-3">Lunch Out</div>
          <div className="px-3 py-3">Lunch In</div>
          <div className="px-3 py-3">Time Out</div>
          <div className="px-3 py-3 text-center">Hours</div>
          <div className="px-3 py-3 text-center">Leave</div>
        </div>

        {entries.map((entry, i) => {
          const isLeave = !!entry.leave_type_id;
          return (
            <div key={entry.id} className={`grid grid-cols-[120px_1fr_1fr_1fr_1fr_100px_80px] border-b border-gray-100 ${isLeave ? 'bg-amber-50/50' : 'hover:bg-gray-50'}`}>
              <div className="px-4 py-3">
                <p className="font-semibold text-sm text-gray-800">{DAY_ABBR[i]}</p>
                <p className="text-xs text-gray-400">{weekDates[i] ? formatDate(weekDates[i]) : ''}</p>
              </div>
              {['time_in', 'lunch_out', 'lunch_in', 'time_out'].map(field => (
                <div key={field} className="px-3 py-2.5">
                  <input
                    type="time"
                    value={entry[field] || ''}
                    onChange={(e) => updateEntry(entry.id, field, e.target.value)}
                    disabled={!editable || isLeave}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              ))}
              <div className="px-3 py-3 text-center">
                <span className={`text-sm font-bold ${entry.hours > 8 ? 'text-red-600' : 'text-gray-800'}`}>
                  {(entry.hours || 0).toFixed(1)}
                </span>
              </div>
              <div className="px-2 py-2.5">
                <select
                  value={entry.leave_type_id || ''}
                  onChange={(e) => updateEntry(entry.id, 'leave_type_id', e.target.value || null)}
                  disabled={!editable}
                  className="w-full border border-gray-200 rounded-lg px-1 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-100"
                >
                  <option value="">—</option>
                  {leaveTypes.map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.code}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}

        {/* Totals Row */}
        <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_100px_80px] bg-gray-50 border-t-2 border-gray-200">
          <div className="px-4 py-3 font-bold text-sm" style={{ color: C.navy }}>Total</div>
          <div className="col-span-4" />
          <div className="px-3 py-3 text-center">
            <span className="text-lg font-bold" style={{ color: totalHours > 40 ? C.red : C.navy }}>{totalHours.toFixed(1)}</span>
          </div>
          <div />
        </div>
        {overtime > 0 && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs font-semibold">
            ⚠ {overtime.toFixed(1)} overtime hours (over 40)
          </div>
        )}
      </div>

      {/* Save / Submit Buttons */}
      <div className="flex gap-3 mb-6">
        {editable && (
          <>
            <button onClick={saveEntries} disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50">
              {saving ? 'Saving...' : '💾 Save Draft'}
            </button>
            <button onClick={submitTimecard} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all" style={{ background: C.navy }}>
              ✓ Submit for Approval
            </button>
          </>
        )}
      </div>

      {/* Approval History */}
      {approvals.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-sm mb-3" style={{ color: C.navy }}>Approval History</h3>
          <div className="space-y-2">
            {approvals.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  a.action === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                  a.action === 'approved' ? 'bg-green-100 text-green-700' :
                  a.action === 'returned' ? 'bg-orange-100 text-orange-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{a.action}</span>
                <span className="text-gray-700 font-medium">{a.action_by_name}</span>
                <span className="text-gray-400 text-xs">{a.action_by_role}</span>
                <span className="text-gray-400 text-xs">{new Date(a.created_at).toLocaleDateString()}</span>
                {a.note && <span className="text-gray-500 italic text-xs">"{a.note}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}