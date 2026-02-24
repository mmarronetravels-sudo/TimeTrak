import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1', green: '#16a34a' };

function getProration(contractDays) {
  if (!contractDays || contractDays === 0) return 0;
  return +((contractDays / 260) * 480).toFixed(2);
}

function getTenure(hireDate) {
  if (!hireDate) return '—';
  const hire = new Date(hireDate);
  const now = new Date();
  const years = Math.floor((now - hire) / (365.25 * 86400000));
  const months = Math.floor(((now - hire) / (30.44 * 86400000)) % 12);
  if (years > 0) return `${years}y ${months}m`;
  return `${months}m`;
}

export default function LeaveTracker() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalStaff, setModalStaff] = useState(null);
  const [form, setForm] = useState({
    staff_id: '', leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'hours', concurrent_leave_type_id: '',
    reason: '', documentation_on_file: false,
  });
  const [notification, setNotification] = useState(null);

  useEffect(() => { loadData(); }, []);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadData = async () => {
    const { data: s } = await supabase.from('profiles').select('*').eq('is_active', true).order('full_name');
    if (s) setStaff(s);
    const { data: lt } = await supabase.from('leave_types').select('*').order('sort_order');
    if (lt) setLeaveTypes(lt);
    const { data: le } = await supabase.from('leave_entries').select('*, leave_types(name, code, category)').order('created_at', { ascending: false });
    if (le) setLeaveEntries(le);
  };

  const openEntryForStaff = (s) => {
    setModalStaff(s);
    setForm({ staff_id: s.id, leave_type_id: '', start_date: '', end_date: '', amount: '', tracking_unit: 'hours', concurrent_leave_type_id: '', reason: '', documentation_on_file: false });
    setShowModal(true);
  };

  const openEntryBlank = () => {
    setModalStaff(null);
    setForm({ staff_id: '', leave_type_id: '', start_date: '', end_date: '', amount: '', tracking_unit: 'hours', concurrent_leave_type_id: '', reason: '', documentation_on_file: false });
    setShowModal(true);
  };

  const submitEntry = async () => {
    if (!form.staff_id || !form.leave_type_id || !form.start_date || !form.amount) return;
    const { error } = await supabase.from('leave_entries').insert({
      tenant_id: profile.tenant_id,
      staff_id: form.staff_id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      amount: parseFloat(form.amount),
      tracking_unit: form.tracking_unit,
      concurrent_leave_type_id: form.concurrent_leave_type_id || null,
      reason: form.reason,
      documentation_on_file: form.documentation_on_file,
      logged_by: profile.id,
      school_year: '2025-2026',
    });
    if (!error) {
      setShowModal(false);
      setModalStaff(null);
      const lt = leaveTypes.find(t => t.id === form.leave_type_id);
      const s = staff.find(st => st.id === form.staff_id);
      showNotif(`${lt?.name} entry logged for ${s?.full_name}`);
      loadData();
    }
  };

  const filtered = staff.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    s.role !== 'admin'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {notification && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">{notification}</div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Leave Tracker</h2>
          <p className="text-sm text-gray-500 mt-0.5">Staff overview · {filtered.length} staff</p>
        </div>
        <div className="flex gap-3">
          <input type="text" placeholder="Search staff..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] w-64" />
          <button onClick={openEntryBlank} className="px-4 py-2.5 rounded-lg text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all" style={{ background: C.navy }}>
            + Log Leave Entry
          </button>
        </div>
      </div>

      {/* Staff Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(s => {
          const staffEntries = leaveEntries.filter(e => e.staff_id === s.id);
          const entitlement = getProration(s.contract_days);

          return (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-base" style={{ color: C.navy }}>{s.full_name}</h3>
                  <p className="text-sm text-gray-500">
                    {s.position}
                    <span className="mx-1.5 text-gray-300">·</span>
                    {s.building}
                    <span className="mx-1.5 text-gray-300">·</span>
                    {getTenure(s.hire_date)}
                    {s.contract_days && <><span className="mx-1.5 text-gray-300">·</span>{s.contract_days}-day</>}
                  </p>
                </div>
                <button onClick={() => openEntryForStaff(s)} className="text-xs bg-[#2c3e7e] text-white px-3 py-1.5 rounded-lg hover:bg-[#477fc1] transition-colors font-medium">
                  + Log Leave
                </button>
              </div>

              {/* Protected leave summary */}
              <div className="space-y-1.5">
                {leaveTypes.filter(lt => lt.category !== 'school_provided').map(lt => {
                  const used = staffEntries.filter(e => e.leave_type_id === lt.id).reduce((sum, e) => sum + e.amount, 0);
                  return (
                    <div key={lt.id} className="flex justify-between text-xs">
                      <span className={`font-medium ${lt.category === 'federal' ? 'text-green-700' : 'text-teal-700'}`}>{lt.name}</span>
                      <span className="text-gray-500">{(entitlement - used).toFixed(1)} hrs available{used > 0 ? ` · ${used} hrs used` : ''}</span>
                    </div>
                  );
                })}
              </div>

              {staffEntries.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">{staffEntries.length} leave {staffEntries.length === 1 ? 'entry' : 'entries'} this year</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Log Leave Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-xl font-bold" style={{ color: C.navy }}>Log Leave Entry</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {modalStaff ? `${modalStaff.full_name} · ${modalStaff.position}` : 'Select a staff member below'}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Staff Selector */}
              {!modalStaff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Staff Member</label>
                  <select value={form.staff_id} onChange={e => { setForm(p => ({ ...p, staff_id: e.target.value })); setModalStaff(staff.find(s => s.id === e.target.value) || null); }} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select staff member...</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.position}</option>)}
                  </select>
                </div>
              )}

              {/* Leave Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Leave Type</label>
                <select value={form.leave_type_id} onChange={e => { const lt = leaveTypes.find(t => t.id === e.target.value); setForm(p => ({ ...p, leave_type_id: e.target.value, tracking_unit: lt?.category !== 'school_provided' ? 'hours' : 'days', concurrent_leave_type_id: '' })); }} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                  <option value="">Select leave type...</option>
                  <optgroup label="School-Provided Leave">
                    {leaveTypes.filter(t => t.category === 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                  <optgroup label="Protected Leave (Federal/State)">
                    {leaveTypes.filter(t => t.category !== 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                </select>
              </div>

              {/* Concurrent Leave */}
              {form.leave_type_id && leaveTypes.find(t => t.id === form.leave_type_id)?.category !== 'school_provided' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Concurrent Leave Type <span className="font-normal text-gray-400">(optional)</span></label>
                  <select value={form.concurrent_leave_type_id} onChange={e => setForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.category !== 'school_provided' && t.id !== form.leave_type_id).map(t => {
                      const isOflaPlo = (leaveTypes.find(lt => lt.id === form.leave_type_id)?.code === 'ofla' && t.code === 'plo') || (leaveTypes.find(lt => lt.id === form.leave_type_id)?.code === 'plo' && t.code === 'ofla');
                      return <option key={t.id} value={t.id} disabled={isOflaPlo}>{t.name}{isOflaPlo ? ' (no longer concurrent)' : ''}</option>;
                    })}
                  </select>
                </div>
              )}

              {/* Dates */}
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

              {/* Amount + Unit */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount</label>
                  <input type="number" step="0.5" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder={form.tracking_unit === 'hours' ? 'e.g. 40' : 'e.g. 5'} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <select value={form.tracking_unit} onChange={e => setForm(p => ({ ...p, tracking_unit: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reason / Notes</label>
                <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none" />
              </div>

              {/* Documentation */}
              <label className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors">
                <input type="checkbox" checked={form.documentation_on_file} onChange={e => setForm(p => ({ ...p, documentation_on_file: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
                <div>
                  <span className="text-sm font-semibold text-gray-700">Documentation on file</span>
                  <p className="text-xs text-gray-500">Medical certification, FMLA paperwork, etc.</p>
                </div>
              </label>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowModal(false); setModalStaff(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button onClick={submitEntry} disabled={!form.staff_id || !form.leave_type_id || !form.start_date || !form.amount} className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: C.navy }}>
                Log Leave Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}