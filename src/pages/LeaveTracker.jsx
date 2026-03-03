import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1', green: '#16a34a' };
const FULL_TIME_DAYS = 260;
const BASE_ENTITLEMENT_HOURS = 480; // 12 weeks × 40 hrs
const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;

function getProration(contractDays) {
  if (!contractDays || contractDays === 0) return 0;
  return +((contractDays / FULL_TIME_DAYS) * BASE_ENTITLEMENT_HOURS).toFixed(2);
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

function isProtectedLeaveType(leaveType) {
  if (!leaveType) return false;
  if (typeof leaveType === 'object') {
    return leaveType.category === 'federal' || leaveType.category === 'state';
  }
  const name = String(leaveType).toLowerCase();
  return name.includes('fmla') || name.includes('ofla') || name.includes('plo') || name.includes('oregon sick');
}

function toHours(amount, unit) {
  const num = parseFloat(amount);
  if (unit === 'hours') return num;
  if (unit === 'days') return num * HOURS_PER_DAY;
  if (unit === 'weeks') return num * HOURS_PER_WEEK;
  return num;
}

export default function LeaveTracker() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leavePolicies, setLeavePolicies] = useState([]);
  const [protectedPeriods, setProtectedPeriods] = useState([]);
  const [qualifyingReasons, setQualifyingReasons] = useState([]);
  const [qualifyingRelationships, setQualifyingRelationships] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalStaff, setModalStaff] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const schoolYear = '2025-2026';

  const [form, setForm] = useState({
    staff_id: '', leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'hours', concurrent_leave_type_id: '',
    reason: '', documentation_on_file: false,
    qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
  });

  useEffect(() => { loadData(); }, []);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const loadData = async () => {
    const [
      { data: s }, { data: lt }, { data: le }, { data: lb }, { data: lp },
      { data: pp }, { data: qr }, { data: qrel }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('leave_types').select('*').order('sort_order'),
      supabase.from('leave_entries').select('*, leave_types(name, code, category)').order('created_at', { ascending: false }),
      supabase.from('leave_balances').select('*').eq('school_year', schoolYear),
      supabase.from('leave_policies').select('*').eq('school_year', schoolYear),
      supabase.from('protected_leave_periods').select('*').order('period_start_date', { ascending: false }),
      supabase.from('leave_qualifying_reasons').select('*').order('sort_order'),
      supabase.from('leave_qualifying_relationships').select('*').order('sort_order'),
    ]);
    if (s) setStaff(s);
    if (lt) setLeaveTypes(lt);
    if (le) setLeaveEntries(le);
    if (lb) setLeaveBalances(lb);
    if (lp) setLeavePolicies(lp);
    if (pp) setProtectedPeriods(pp);
    if (qr) setQualifyingReasons(qr);
    if (qrel) setQualifyingRelationships(qrel);
  };

  // ── Protected Leave Period Helpers ──────────────────────

  const getContractDays = (staffId) => {
    const s = staff.find(st => st.id === staffId);
    return s?.contract_days || FULL_TIME_DAYS;
  };

  const getActivePeriod = (staffId, leaveTypeId) => {
    const now = new Date();
    return protectedPeriods.find(p =>
      p.staff_id === staffId &&
      p.leave_type_id === leaveTypeId &&
      p.status === 'active' &&
      new Date(p.period_end_date) >= now
    ) || null;
  };

  const createProtectedPeriod = async (staffId, leaveTypeId, startDate) => {
    const contractDays = getContractDays(staffId);
    const ratio = contractDays / FULL_TIME_DAYS;
    const proratedHours = Math.round((ratio * BASE_ENTITLEMENT_HOURS) * 100) / 100;

    const start = new Date(startDate);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);

    const periodData = {
      tenant_id: profile.tenant_id,
      staff_id: staffId,
      leave_type_id: leaveTypeId,
      period_start_date: startDate,
      period_end_date: end.toISOString().split('T')[0],
      contract_days: contractDays,
      full_time_days: FULL_TIME_DAYS,
      base_entitlement_hours: BASE_ENTITLEMENT_HOURS,
      prorated_entitlement_hours: proratedHours,
      hours_used: 0,
      status: 'active',
      created_by: profile.id,
    };

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .insert([periodData])
      .select();

    if (error) {
      console.error('Error creating protected leave period:', error);
      return null;
    }
    if (data?.[0]) {
      setProtectedPeriods(prev => [data[0], ...prev]);
      return data[0];
    }
    return null;
  };

  const updatePeriodHours = async (periodId, additionalHours) => {
    const period = protectedPeriods.find(p => p.id === periodId);
    if (!period) return;
    const newHoursUsed = parseFloat(period.hours_used) + additionalHours;
    const newStatus = newHoursUsed >= parseFloat(period.prorated_entitlement_hours) ? 'exhausted' : 'active';

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .update({ hours_used: newHoursUsed, status: newStatus })
      .eq('id', periodId)
      .select();

    if (!error && data) {
      setProtectedPeriods(prev => prev.map(p => p.id === periodId ? data[0] : p));
    }
  };

  const reversePeriodHours = async (periodId, hoursToReverse) => {
    const period = protectedPeriods.find(p => p.id === periodId);
    if (!period) return;
    const newHoursUsed = Math.max(0, parseFloat(period.hours_used) - hoursToReverse);
    const newStatus = newHoursUsed >= parseFloat(period.prorated_entitlement_hours) ? 'exhausted' : 'active';

    const { data, error } = await supabase
      .from('protected_leave_periods')
      .update({ hours_used: newHoursUsed, status: newStatus })
      .eq('id', periodId)
      .select();

    if (!error && data) {
      setProtectedPeriods(prev => prev.map(p => p.id === periodId ? data[0] : p));
    }
  };

  // ── Form Helpers ──────────────────────────────────

  const resetForm = (staffId = '') => ({
    staff_id: staffId, leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'hours', concurrent_leave_type_id: '',
    reason: '', documentation_on_file: false,
    qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
  });

  const openEntryForStaff = (s) => {
    setModalStaff(s);
    setForm(resetForm(s.id));
    setShowModal(true);
  };

  const openEntryBlank = () => {
    setModalStaff(null);
    setForm(resetForm());
    setShowModal(true);
  };

  // Derived state for qualifying fields
  const selectedLeaveType = leaveTypes.find(t => t.id === form.leave_type_id);
  const isProtected = selectedLeaveType ? isProtectedLeaveType(selectedLeaveType) : false;
  const leaveTypeCode = selectedLeaveType?.code || '';
  const filteredReasons = qualifyingReasons.filter(r => r.leave_type_code === leaveTypeCode);
  const filteredRelationships = qualifyingRelationships.filter(r => r.leave_type_code === leaveTypeCode);
  const isSelfRelationship = form.qualifying_relationship === 'self';

  // ── Submit Entry ──────────────────────────────────

  const submitEntry = async () => {
    if (!form.staff_id || !form.leave_type_id || !form.start_date || !form.amount) return;
    setSaving(true);

    const leaveType = leaveTypes.find(t => t.id === form.leave_type_id);
    const isProtectedEntry = leaveType ? isProtectedLeaveType(leaveType) : false;
    const hoursAmount = toHours(form.amount, form.tracking_unit);

    // For protected leave: check/create rolling period
    let periodId = null;
    if (isProtectedEntry) {
      let activePeriod = getActivePeriod(form.staff_id, form.leave_type_id);

      if (!activePeriod) {
        activePeriod = await createProtectedPeriod(form.staff_id, form.leave_type_id, form.start_date);
        if (!activePeriod) {
          alert('Error creating protected leave period. Please try again.');
          setSaving(false);
          return;
        }
      }

      // Check if hours would exceed entitlement
      const remaining = parseFloat(activePeriod.prorated_entitlement_hours) - parseFloat(activePeriod.hours_used);
      if (hoursAmount > remaining) {
        const proceed = confirm(
          `This entry (${hoursAmount.toFixed(2)} hrs) would exceed the remaining entitlement ` +
          `(${remaining.toFixed(2)} hrs of ${parseFloat(activePeriod.prorated_entitlement_hours).toFixed(2)} hrs).\n\n` +
          `Period: ${new Date(activePeriod.period_start_date).toLocaleDateString()} – ` +
          `${new Date(activePeriod.period_end_date).toLocaleDateString()}\n\nContinue anyway?`
        );
        if (!proceed) { setSaving(false); return; }
      }

      periodId = activePeriod.id;
    }

    // Build insert data
    const insertData = {
      tenant_id: profile.tenant_id,
      staff_id: form.staff_id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      amount: parseFloat(form.amount),
      tracking_unit: form.tracking_unit,
      concurrent_leave_type_id: form.concurrent_leave_type_id || null,
      reason: form.reason || null,
      documentation_on_file: form.documentation_on_file,
      logged_by: profile.id,
      school_year: schoolYear,
    };

    // Include qualifying fields for protected leave
    if (isProtectedEntry) {
      insertData.qualifying_reason = form.qualifying_reason || null;
      insertData.qualifying_relationship = form.qualifying_relationship || null;
      insertData.relationship_name = form.relationship_name || null;
    }

    const { data, error } = await supabase.from('leave_entries').insert([insertData]).select();
    if (error) {
      alert('Error saving entry: ' + error.message);
      setSaving(false);
      return;
    }

    // Update protected leave period hours
    if (isProtectedEntry && periodId) {
      await updatePeriodHours(periodId, hoursAmount);
    }

    // Update school-provided balance (non-protected leave types)
    if (!isProtectedEntry) {
      const existingBalance = leaveBalances.find(
        b => b.staff_id === form.staff_id && b.leave_type_id === form.leave_type_id && b.school_year === schoolYear
      );
      if (existingBalance) {
        const balanceUnit = existingBalance.tracking_unit || 'days';
        let amountInBalanceUnit = parseFloat(form.amount);
        if (form.tracking_unit === 'hours' && balanceUnit === 'days') {
          amountInBalanceUnit = parseFloat(form.amount) / HOURS_PER_DAY;
        } else if (form.tracking_unit === 'days' && balanceUnit === 'hours') {
          amountInBalanceUnit = parseFloat(form.amount) * HOURS_PER_DAY;
        }
        const newUsed = parseFloat(existingBalance.used) + amountInBalanceUnit;
        const { data: updatedBalance } = await supabase
          .from('leave_balances')
          .update({ used: newUsed })
          .eq('id', existingBalance.id)
          .select();
        if (updatedBalance) {
          setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b));
        }
      }
    }

    // Handle concurrent leave — deduct from concurrent period too
    if (form.concurrent_leave_type_id) {
      const concurrentType = leaveTypes.find(t => t.id === form.concurrent_leave_type_id);
      if (concurrentType && isProtectedLeaveType(concurrentType)) {
        let concurrentPeriod = getActivePeriod(form.staff_id, form.concurrent_leave_type_id);
        if (!concurrentPeriod) {
          concurrentPeriod = await createProtectedPeriod(form.staff_id, form.concurrent_leave_type_id, form.start_date);
        }
        if (concurrentPeriod) {
          await updatePeriodHours(concurrentPeriod.id, hoursAmount);
        }
      }
    }

    if (data?.[0]) {
      setLeaveEntries(prev => [data[0], ...prev]);
    }

    setShowModal(false);
    setModalStaff(null);
    const s = staff.find(st => st.id === form.staff_id);
    showNotif(`${leaveType?.name} entry logged for ${s?.full_name}`);
    setSaving(false);
  };

  // ── Delete Entry ──────────────────────────────────

  const handleDeleteEntry = async (entry) => {
    if (!confirm('Delete this leave entry? This will reverse the balance/period usage.')) return;

    const leaveType = leaveTypes.find(t => t.id === entry.leave_type_id);
    const isProtectedEntry = leaveType ? isProtectedLeaveType(leaveType) : false;
    const hoursAmount = toHours(entry.amount, entry.tracking_unit);

    const { error } = await supabase.from('leave_entries').delete().eq('id', entry.id);
    if (error) return;

    // Reverse protected leave period hours
    if (isProtectedEntry) {
      const relevantPeriod = protectedPeriods.find(p =>
        p.staff_id === entry.staff_id &&
        p.leave_type_id === entry.leave_type_id &&
        new Date(entry.start_date) >= new Date(p.period_start_date) &&
        new Date(entry.start_date) <= new Date(p.period_end_date)
      );
      if (relevantPeriod) {
        await reversePeriodHours(relevantPeriod.id, hoursAmount);
      }
    }

    // Reverse school-provided balance
    if (!isProtectedEntry) {
      const existingBalance = leaveBalances.find(
        b => b.staff_id === entry.staff_id && b.leave_type_id === entry.leave_type_id && b.school_year === schoolYear
      );
      if (existingBalance) {
        const balanceUnit = existingBalance.tracking_unit || 'days';
        let amountInBalanceUnit = parseFloat(entry.amount);
        if (entry.tracking_unit === 'hours' && balanceUnit === 'days') {
          amountInBalanceUnit = parseFloat(entry.amount) / HOURS_PER_DAY;
        } else if (entry.tracking_unit === 'days' && balanceUnit === 'hours') {
          amountInBalanceUnit = parseFloat(entry.amount) * HOURS_PER_DAY;
        }
        const newUsed = Math.max(0, parseFloat(existingBalance.used) - amountInBalanceUnit);
        const { data: updatedBalance } = await supabase
          .from('leave_balances')
          .update({ used: newUsed })
          .eq('id', existingBalance.id)
          .select();
        if (updatedBalance) {
          setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b));
        }
      }
    }

    // Reverse concurrent period hours too
    if (entry.concurrent_leave_type_id) {
      const concurrentType = leaveTypes.find(t => t.id === entry.concurrent_leave_type_id);
      if (concurrentType && isProtectedLeaveType(concurrentType)) {
        const concurrentPeriod = protectedPeriods.find(p =>
          p.staff_id === entry.staff_id &&
          p.leave_type_id === entry.concurrent_leave_type_id &&
          new Date(entry.start_date) >= new Date(p.period_start_date) &&
          new Date(entry.start_date) <= new Date(p.period_end_date)
        );
        if (concurrentPeriod) {
          await reversePeriodHours(concurrentPeriod.id, hoursAmount);
        }
      }
    }

    setLeaveEntries(prev => prev.filter(e => e.id !== entry.id));
    showNotif('Leave entry deleted');
  };

  // ── Display Helpers ──────────────────────────────────

  const getReasonDisplayName = (reasonEnum) => {
    const match = qualifyingReasons.find(r => r.qualifying_reason === reasonEnum);
    return match?.display_name || reasonEnum?.replace(/_/g, ' ') || '';
  };

  const getRelationshipDisplayName = (relEnum) => {
    const match = qualifyingRelationships.find(r => r.qualifying_relationship === relEnum);
    return match?.display_name || relEnum?.replace(/_/g, ' ') || '';
  };

  const filtered = staff.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    s.role !== 'admin'
  );

  // ── Render ──────────────────────────────────

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

              {/* Protected leave summary — read from periods */}
              <div className="space-y-1.5">
                {leaveTypes.filter(lt => lt.category !== 'school_provided').map(lt => {
                  const period = protectedPeriods.find(p => p.staff_id === s.id && p.leave_type_id === lt.id && p.status === 'active');
                  const used = period ? parseFloat(period.hours_used) || 0 : 0;
                  const ent = period ? parseFloat(period.prorated_entitlement_hours) : entitlement;
                  return (
                    <div key={lt.id} className="flex justify-between text-xs">
                      <span className={`font-medium ${lt.category === 'federal' ? 'text-green-700' : 'text-teal-700'}`}>{lt.name}</span>
                      <span className="text-gray-500">{(ent - used).toFixed(1)} hrs available{used > 0 ? ` · ${used.toFixed(1)} hrs used` : ''}</span>
                    </div>
                  );
                })}
              </div>

              {/* School-provided leave summary */}
              <div className="space-y-1.5 mt-1.5">
                {leaveTypes.filter(lt => lt.category === 'school_provided').map(lt => {
                  const balance = leaveBalances.find(b => b.staff_id === s.id && b.leave_type_id === lt.id);
                  if (!balance) return null;
                  const allocated = parseFloat(balance.allocated) + parseFloat(balance.carried_over || 0);
                  const used = parseFloat(balance.used);
                  if (allocated === 0 && used === 0) return null;
                  return (
                    <div key={lt.id} className="flex justify-between text-xs">
                      <span className="font-medium text-blue-700">{lt.name}</span>
                      <span className="text-gray-500">{Math.max(0, allocated - used).toFixed(1)} / {allocated} {balance.tracking_unit || 'days'} remaining</span>
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setModalStaff(null); }}>
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
                <select value={form.leave_type_id} onChange={e => {
                  const lt = leaveTypes.find(t => t.id === e.target.value);
                  setForm(p => ({
                    ...p,
                    leave_type_id: e.target.value,
                    tracking_unit: lt && lt.category !== 'school_provided' ? 'hours' : 'days',
                    concurrent_leave_type_id: '',
                    qualifying_reason: '', qualifying_relationship: '', relationship_name: '',
                  }));
                }} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                  <option value="">Select leave type...</option>
                  <optgroup label="School-Provided Leave">
                    {leaveTypes.filter(t => t.category === 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                  <optgroup label="Protected Leave (Federal/State)">
                    {leaveTypes.filter(t => t.category !== 'school_provided').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                </select>
              </div>

              {/* ═══ Protected Leave Info Banner ═══ */}
              {isProtected && form.staff_id && (() => {
                const activePeriod = getActivePeriod(form.staff_id, form.leave_type_id);
                const ent = getProration(getContractDays(form.staff_id));
                const used = activePeriod ? parseFloat(activePeriod.hours_used) : 0;
                const remaining = (activePeriod ? parseFloat(activePeriod.prorated_entitlement_hours) : ent) - used;
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-indigo-800">{selectedLeaveType?.name} Entitlement</span>
                      <span className="text-indigo-600 font-medium">{remaining.toFixed(1)} hrs remaining</span>
                    </div>
                    <p className="text-xs text-indigo-500 mt-0.5">
                      {used.toFixed(1)} used of {activePeriod ? parseFloat(activePeriod.prorated_entitlement_hours).toFixed(1) : ent.toFixed(1)} hrs
                      {activePeriod && ` · Period: ${new Date(activePeriod.period_start_date + 'T00:00:00').toLocaleDateString()} – ${new Date(activePeriod.period_end_date + 'T00:00:00').toLocaleDateString()}`}
                      {!activePeriod && ' · New period will be created'}
                    </p>
                  </div>
                );
              })()}

              {/* ═══ Qualifying Information (Protected Leave Only) ═══ */}
              {isProtected && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-700 text-sm font-bold">Qualifying Information</span>
                    <span className="text-xs text-blue-500 font-medium px-2 py-0.5 bg-blue-100 rounded-full">
                      {selectedLeaveType?.name}
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-800 mb-1">Qualifying Reason</label>
                    <select
                      value={form.qualifying_reason}
                      onChange={e => setForm(p => ({ ...p, qualifying_reason: e.target.value }))}
                      className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">Select reason...</option>
                      {filteredReasons.map(r => (
                        <option key={r.id} value={r.qualifying_reason}>{r.display_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-800 mb-1">Relationship</label>
                    <select
                      value={form.qualifying_relationship}
                      onChange={e => setForm(p => ({ ...p, qualifying_relationship: e.target.value, relationship_name: e.target.value === 'self' ? '' : p.relationship_name }))}
                      className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">Select relationship...</option>
                      {filteredRelationships.map(r => (
                        <option key={r.id} value={r.qualifying_relationship}>{r.display_name}</option>
                      ))}
                    </select>
                  </div>

                  {form.qualifying_relationship && !isSelfRelationship && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-800 mb-1">
                        Family Member Name <span className="font-normal text-blue-500">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.relationship_name}
                        onChange={e => setForm(p => ({ ...p, relationship_name: e.target.value }))}
                        placeholder="e.g. Maria Santos — Mother"
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}

                  {form.qualifying_relationship === 'affinity' && (
                    <div className="bg-blue-100 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-700">
                      <strong>Oregon "Person by Affinity":</strong> Under Oregon law, employees may designate one person with whom they have a significant personal bond as equivalent to a family member for OFLA/PLO purposes. No documentation required — employee attestation is sufficient.
                    </div>
                  )}
                </div>
              )}

              {/* Concurrent Leave (protected leave only) */}
              {isProtected && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Concurrent Leave Type <span className="font-normal text-gray-400">(optional)</span></label>
                  <select value={form.concurrent_leave_type_id} onChange={e => setForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.category !== 'school_provided' && t.id !== form.leave_type_id).map(t => {
                      const isOflaPlo = (selectedLeaveType?.code === 'ofla' && t.code === 'plo') || (selectedLeaveType?.code === 'plo' && t.code === 'ofla');
                      return <option key={t.id} value={t.id} disabled={isOflaPlo}>{t.name}{isOflaPlo ? ' (no longer concurrent)' : ''}</option>;
                    })}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Hours will be deducted from both leave types' rolling periods</p>
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
                  {/* Live conversion hint */}
                  {form.amount && (
                    <p className="text-xs text-gray-400 mt-1">
                      = {form.tracking_unit === 'hours' ? `${(parseFloat(form.amount) / HOURS_PER_DAY).toFixed(1)} days` : form.tracking_unit === 'days' ? `${(parseFloat(form.amount) * HOURS_PER_DAY).toFixed(1)} hours` : `${(parseFloat(form.amount) * HOURS_PER_WEEK).toFixed(1)} hours`}
                    </p>
                  )}
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
              <button onClick={submitEntry} disabled={saving || !form.staff_id || !form.leave_type_id || !form.start_date || !form.amount} className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: C.navy }}>
                {saving ? 'Saving...' : 'Log Leave Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
