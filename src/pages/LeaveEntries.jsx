import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const HOURS_PER_DAY = 8
const HOURS_PER_WEEK = 40

function toHours(amount, unit) {
  const n = parseFloat(amount) || 0
  if (unit === 'hours') return n
  if (unit === 'days')  return n * HOURS_PER_DAY
  if (unit === 'weeks') return n * HOURS_PER_WEEK
  return n
}

function toUnit(hours, unit) {
  if (unit === 'hours') return hours
  if (unit === 'days')  return hours / HOURS_PER_DAY
  if (unit === 'weeks') return hours / HOURS_PER_WEEK
  return hours
}

export default function LeaveEntries() {
  const { profile } = useAuth()
  const [loading, setLoading]   = useState(true)
  const [entries, setEntries]   = useState([])   // enriched: entry + .staff
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [protectedPeriods, setProtectedPeriods] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [saving, setSaving]     = useState(false)
  const [notification, setNotification] = useState(null)

  // ── Edit modal ──
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingEntry, setEditingEntry]   = useState(null)
  const [editForm, setEditForm] = useState({
    leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'hours',
    concurrent_leave_type_id: '', reason: '',
    documentation_on_file: false,
  })

  // ── Delete modal ──
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingEntry, setDeletingEntry]     = useState(null)

  const schoolYear = '2025-2026'

  useEffect(() => { if (profile) loadData() }, [profile])

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3500)
  }

  // ── Load data — Session 27 two-step pattern, no FK joins on profiles ──
  const loadData = async () => {
    setLoading(true)

    const { data: lt } = await supabase
      .from('leave_types').select('*').order('sort_order')
    if (lt) setLeaveTypes(lt)

    const { data: lb } = await supabase
      .from('leave_balances').select('*').eq('school_year', schoolYear)
    if (lb) setLeaveBalances(lb)

    const { data: pp } = await supabase
      .from('protected_leave_periods').select('*')
    if (pp) setProtectedPeriods(pp)

    const { data: raw, error } = await supabase
      .from('leave_entries').select('*')
      .order('created_at', { ascending: false })

    if (error) { console.error(error); setLoading(false); return }

    if (raw?.length > 0) {
      const ids = [...new Set(raw.map(e => e.staff_id))]
      // Always select('*') — comma columns cause 400 errors (Session 27)
      const { data: staffData } = await supabase
        .from('profiles').select('*').in('id', ids)
      const map = {}
      staffData?.forEach(s => { map[s.id] = s })
      setEntries(raw.map(e => ({ ...e, staff: map[e.staff_id] || null })))
    } else {
      setEntries([])
    }

    setLoading(false)
  }

  // ── Helpers ──
  const getType     = (id) => leaveTypes.find(t => t.id === id)
  const getTypeName = (id) => getType(id)?.name || '—'
  const getTypeCat  = (id) => getType(id)?.category || ''
  const isProtectedType = (id) => {
    const cat = getTypeCat(id)
    return cat === 'federal' || cat === 'state'
  }

  const catColor = (cat) => {
    if (cat === 'federal') return 'bg-blue-100 text-blue-800'
    if (cat === 'state')   return 'bg-teal-100 text-teal-800'
    return 'bg-gray-100 text-gray-700'
  }

  const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString() : '—'
  const fmtAmt = (amount, unit) => {
    const n = parseFloat(amount)
    if (unit === 'hours') return `${n} hrs`
    if (unit === 'days')  return `${n} day${n !== 1 ? 's' : ''}`
    if (unit === 'weeks') return `${n} wk${n !== 1 ? 's' : ''}`
    return `${n} ${unit}`
  }

  const filtered = entries.filter(e => {
    const name = (e.staff?.full_name || '').toLowerCase()
    return (!searchTerm || name.includes(searchTerm.toLowerCase()))
        && (filterType === 'all' || e.leave_type_id === filterType)
  })

  // ── EDIT ──
  const openEdit = (entry) => {
    setEditingEntry(entry)
    setEditForm({
      leave_type_id:            entry.leave_type_id || '',
      start_date:               entry.start_date || '',
      end_date:                 entry.end_date || '',
      amount:                   entry.amount?.toString() || '',
      tracking_unit:            entry.tracking_unit || 'hours',
      concurrent_leave_type_id: entry.concurrent_leave_type_id || '',
      reason:                   entry.reason || '',
      documentation_on_file:    entry.documentation_on_file || false,
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm.leave_type_id || !editForm.start_date || !editForm.amount) {
      showNotif('Leave type, start date, and amount are required.', 'error')
      return
    }
    setSaving(true)

    const { data, error } = await supabase
      .from('leave_entries')
      .update({
        leave_type_id:            editForm.leave_type_id,
        start_date:               editForm.start_date,
        end_date:                 editForm.end_date || null,
        amount:                   parseFloat(editForm.amount),
        tracking_unit:            editForm.tracking_unit,
        concurrent_leave_type_id: editForm.concurrent_leave_type_id || null,
        reason:                   editForm.reason || null,
        documentation_on_file:    editForm.documentation_on_file,
      })
      .eq('id', editingEntry.id)
      .select()

    setSaving(false)

    if (error) { showNotif('Error saving: ' + error.message, 'error'); return }

    // Merge back, keeping .staff enrichment
    const updated = { ...data[0], staff: editingEntry.staff }
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setShowEditModal(false)
    setEditingEntry(null)
    showNotif('Entry updated. Note: balances are not auto-adjusted — update them in Leave Tracker if the amount changed.')
  }

  // ── DELETE with balance + protected period reversal ──
  const openDelete = (entry) => {
    setDeletingEntry(entry)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return
    setSaving(true)

    const { error } = await supabase
      .from('leave_entries').delete().eq('id', deletingEntry.id)

    if (error) {
      showNotif('Error deleting: ' + error.message, 'error')
      setSaving(false)
      setShowDeleteModal(false)
      return
    }

    // 1. Reverse leave_balances.used (school-provided + state/federal)
    const balance = leaveBalances.find(b =>
      b.staff_id     === deletingEntry.staff_id &&
      b.leave_type_id === deletingEntry.leave_type_id &&
      b.school_year  === schoolYear
    )
    if (balance) {
      // Convert entry amount to balance's stored unit
      const entryHours   = toHours(deletingEntry.amount, deletingEntry.tracking_unit)
      const reverseAmt   = toUnit(entryHours, balance.tracking_unit || deletingEntry.tracking_unit)
      const newUsed      = Math.max(0, parseFloat(balance.used) - reverseAmt)

      const { data: updatedBal } = await supabase
        .from('leave_balances')
        .update({ used: +newUsed.toFixed(2) })
        .eq('id', balance.id)
        .select()
      if (updatedBal) {
        setLeaveBalances(prev => prev.map(b => b.id === balance.id ? updatedBal[0] : b))
      }
    }

    // 2. Reverse protected_leave_periods.hours_used (FMLA/OFLA/PLO)
    if (isProtectedType(deletingEntry.leave_type_id)) {
      const entryHours = toHours(deletingEntry.amount, deletingEntry.tracking_unit)
      // Find the most recent active/exhausted period for this staff + leave type
      const period = protectedPeriods
        .filter(p =>
          p.staff_id      === deletingEntry.staff_id &&
          p.leave_type_id === deletingEntry.leave_type_id &&
          p.status        !== 'expired'
        )
        .sort((a, b) => new Date(b.period_start) - new Date(a.period_start))[0]

      if (period) {
        const newHoursUsed  = Math.max(0, parseFloat(period.hours_used) - entryHours)
        const entitlement   = parseFloat(period.prorated_entitlement_hours)
        const newRemaining  = Math.max(0, entitlement - newHoursUsed)
        const newStatus     = newHoursUsed >= entitlement ? 'exhausted' : 'active'

        const { data: updatedPeriod } = await supabase
          .from('protected_leave_periods')
          .update({
            hours_used:      +newHoursUsed.toFixed(2),
            hours_remaining: +newRemaining.toFixed(2),
            status:          newStatus,
          })
          .eq('id', period.id)
          .select()
        if (updatedPeriod) {
          setProtectedPeriods(prev => prev.map(p => p.id === period.id ? updatedPeriod[0] : p))
        }
      }
    }

    // 3. Remove from local state
    setEntries(prev => prev.filter(e => e.id !== deletingEntry.id))
    setSaving(false)
    setShowDeleteModal(false)
    setDeletingEntry(null)
    showNotif('Entry deleted and balances adjusted.')
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-50">
   
      {/* Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm ${
          notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {notification.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#2c3e7e]">All Leave Entries</h1>
          <p className="text-[#666666] text-sm mt-1">
            HR-logged leave entries for all staff · {filtered.length} of {entries.length} shown
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="text"
            placeholder="Search by staff name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] min-w-[220px]"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
          >
            <option value="all">All Leave Types</option>
            {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-[#666666]">Loading entries…</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Staff', 'Leave Type', 'Dates', 'Amount', 'Concurrent', 'Docs', 'Notes', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[#666666] text-sm">
                      {entries.length === 0 ? 'No leave entries recorded yet.' : 'No entries match your search.'}
                    </td>
                  </tr>
                ) : filtered.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-[#2c3e7e]">
                      {entry.staff?.full_name || '—'}
                      {entry.staff?.position && (
                        <div className="text-xs text-[#666666] font-normal">{entry.staff.position}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColor(getTypeCat(entry.leave_type_id))}`}>
                        {getTypeName(entry.leave_type_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">
                      {fmt(entry.start_date)}
                      {entry.end_date && entry.end_date !== entry.start_date && <> – {fmt(entry.end_date)}</>}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">
                      {fmtAmt(entry.amount, entry.tracking_unit)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {entry.concurrent_leave_type_id
                        ? <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">+ {getTypeName(entry.concurrent_leave_type_id)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {entry.documentation_on_file
                        ? <span className="text-green-600 font-bold">✓</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666] max-w-[160px] truncate" title={entry.reason || ''}>
                      {entry.reason || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <button onClick={() => openEdit(entry)}
                        className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium mr-3 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => openDelete(entry)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── EDIT MODAL ── */}
      {showEditModal && editingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-xl font-bold text-[#2c3e7e]">Edit Leave Entry</h2>
                  <p className="text-sm text-[#666666] mt-0.5">{editingEntry.staff?.full_name}</p>
                </div>
                <button onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              {/* Balance disclaimer */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800">
                ⚠️ Editing an entry does not automatically adjust leave balances. If the amount changed, update balances manually in the Leave Tracker.
              </div>

              <div className="space-y-4">
                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select value={editForm.leave_type_id}
                    onChange={e => setEditForm(p => ({ ...p, leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select leave type…</option>
                    {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                    <input type="date" value={editForm.start_date}
                      onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">End Date</label>
                    <input type="date" value={editForm.end_date}
                      onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                </div>

                {/* Amount + Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Amount *</label>
                    <input type="number" min="0" step="0.5" value={editForm.amount}
                      onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
                    <select value={editForm.tracking_unit}
                      onChange={e => setEditForm(p => ({ ...p, tracking_unit: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                </div>

                {/* Concurrent Leave */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Concurrent Leave (optional)</label>
                  <select value={editForm.concurrent_leave_type_id}
                    onChange={e => setEditForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== editForm.leave_type_id)
                      .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea rows={2} value={editForm.reason}
                    onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="Optional notes…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="edit-docs"
                    checked={editForm.documentation_on_file}
                    onChange={e => setEditForm(p => ({ ...p, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300" />
                  <label htmlFor="edit-docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {showDeleteModal && deletingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-[#2c3e7e] mb-2">Delete Leave Entry?</h2>
            <p className="text-sm text-[#666666] mb-3">
              You're about to delete this entry for <strong>{deletingEntry.staff?.full_name}</strong>:
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">
              <div className="font-medium text-red-800">{getTypeName(deletingEntry.leave_type_id)}</div>
              <div className="text-red-700 mt-0.5">
                {fmt(deletingEntry.start_date)}
                {deletingEntry.end_date && deletingEntry.end_date !== deletingEntry.start_date
                  && <> – {fmt(deletingEntry.end_date)}</>}
                {' · '}{fmtAmt(deletingEntry.amount, deletingEntry.tracking_unit)}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-5 text-xs text-blue-800">
              ✓ Leave balances will be automatically adjusted.
              {isProtectedType(deletingEntry.leave_type_id) && ' Protected leave period hours will also be reversed.'}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletingEntry(null) }}
                className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleConfirmDelete} disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {saving ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
