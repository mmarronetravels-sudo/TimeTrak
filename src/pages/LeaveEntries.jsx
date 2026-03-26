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

  // ── Copy / Repeat modal ──
  const [showRepeatModal, setShowRepeatModal] = useState(false)
  const [repeatEntry, setRepeatEntry]         = useState(null)
  const [entryMode, setEntryMode]             = useState('range') // 'range' | 'pick'
  const [calendarMonth, setCalendarMonth]     = useState(new Date())
  const [pickedDays, setPickedDays]           = useState({})
  const [repeatForm, setRepeatForm] = useState({
    leave_type_id: '', start_date: '', end_date: '',
    amount: '', tracking_unit: 'hours',
    concurrent_leave_type_id: '', reason: '',
    documentation_on_file: false,
  })

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

  // ── Load data — two-step pattern, no FK joins on profiles ──
  const loadData = async () => {
    setLoading(true)

    const tid = profile.tenant_id

    const { data: lt } = await supabase
      .from('leave_types').select('*').eq('tenant_id', tid).order('sort_order')
    if (lt) setLeaveTypes(lt)

    const { data: lb } = await supabase
      .from('leave_balances').select('*').eq('tenant_id', tid).eq('school_year', schoolYear)
    if (lb) setLeaveBalances(lb)

    const { data: pp } = await supabase
      .from('protected_leave_periods').select('*').eq('tenant_id', tid)
    if (pp) setProtectedPeriods(pp)

    const { data: raw, error } = await supabase
      .from('leave_entries').select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })

    if (error) { console.error('Failed to load leave entries'); setLoading(false); return }

    if (raw?.length > 0) {
      const ids = [...new Set(raw.map(e => e.staff_id))]
      const { data: staffData } = await supabase
        .from('profiles').select('*').in('id', ids).eq('tenant_id', tid)
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
    if (parseFloat(editForm.amount) <= 0) {
      showNotif('Amount must be greater than zero.', 'error')
      return
    }
    if (editForm.end_date && editForm.end_date < editForm.start_date) {
      showNotif('End date cannot be before start date.', 'error')
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

    if (error) { showNotif('Error saving entry. Please try again.', 'error'); return }

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

    // Delete the entry first
    const { error } = await supabase
      .from('leave_entries').delete().eq('id', deletingEntry.id)

    if (error) {
      showNotif('Error deleting entry. Please try again.', 'error')
      setSaving(false)
      setShowDeleteModal(false)
      return
    }

    // 1. Reverse leave_balances.used — fetch FRESH from DB to guarantee accuracy
    //    (never rely on state array, which may be stale or missing the row)
    const { data: freshBalance } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('staff_id', deletingEntry.staff_id)
      .eq('leave_type_id', deletingEntry.leave_type_id)
      .eq('school_year', schoolYear)
      .maybeSingle()

    if (freshBalance) {
      const entryHours = toHours(deletingEntry.amount, deletingEntry.tracking_unit)
      const balUnit    = freshBalance.tracking_unit || deletingEntry.tracking_unit
      const reverseAmt = toUnit(entryHours, balUnit)
      const newUsed    = Math.max(0, parseFloat(freshBalance.used) - reverseAmt)

      const { data: updatedBal } = await supabase
        .from('leave_balances')
        .update({ used: +newUsed.toFixed(2) })
        .eq('id', freshBalance.id)
        .select()
      if (updatedBal) {
        setLeaveBalances(prev => prev.map(b => b.id === freshBalance.id ? updatedBal[0] : b))
      }
    }

    // 2. Reverse protected_leave_periods.hours_used (FMLA/OFLA/PLO) — also fetch fresh
    if (isProtectedType(deletingEntry.leave_type_id)) {
      const entryHours = toHours(deletingEntry.amount, deletingEntry.tracking_unit)

      const { data: freshPeriods } = await supabase
        .from('protected_leave_periods')
        .select('*')
        .eq('staff_id', deletingEntry.staff_id)
        .eq('leave_type_id', deletingEntry.leave_type_id)
        .neq('status', 'expired')
        .order('period_start', { ascending: false })
        .limit(1)

      const period = freshPeriods?.[0]

      if (period) {
        const newHoursUsed = Math.max(0, parseFloat(period.hours_used) - entryHours)
        const entitlement  = parseFloat(period.prorated_entitlement_hours)
        const newRemaining = Math.max(0, entitlement - newHoursUsed)
        const newStatus    = newHoursUsed >= entitlement ? 'exhausted' : 'active'

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

  // ── Calendar / Pick-Days helpers ────────────────────────────────────────
  const getCalendarDays = (monthDate) => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const startPad = (firstDay.getDay() + 6) % 7
    const days = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
    return days
  }

  const toISO = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6

  const togglePickedDay = (d) => {
    const key = toISO(d)
    setPickedDays(prev => {
      if (prev[key] !== undefined) { const n = { ...prev }; delete n[key]; return n }
      return { ...prev, [key]: 8 }
    })
  }

  const resetRepeatModal = () => {
    setShowRepeatModal(false)
    setRepeatEntry(null)
    setEntryMode('range')
    setPickedDays({})
    setCalendarMonth(new Date())
    setRepeatForm({
      leave_type_id: '', start_date: '', end_date: '',
      amount: '', tracking_unit: 'hours',
      concurrent_leave_type_id: '', reason: '',
      documentation_on_file: false,
    })
  }

  // ── Open Repeat modal pre-filled from source entry ────────────────────
  const openRepeat = (entry) => {
    setRepeatEntry(entry)
    setRepeatForm({
      leave_type_id:            entry.leave_type_id || '',
      start_date:               '',
      end_date:                 '',
      amount:                   entry.amount?.toString() || '',
      tracking_unit:            entry.tracking_unit || 'hours',
      concurrent_leave_type_id: entry.concurrent_leave_type_id || '',
      reason:                   entry.reason || '',
      documentation_on_file:    entry.documentation_on_file || false,
    })
    setEntryMode('range')
    setPickedDays({})
    setShowRepeatModal(true)
  }

  // ── Save repeated entry (date range mode) ────────────────────────────
  const handleSaveRepeat = async () => {
    if (!repeatForm.leave_type_id || !repeatForm.start_date || !repeatForm.amount) {
      showNotif('Leave type, start date, and amount are required.', 'error'); return
    }
    setSaving(true)
    const entryData = {
      tenant_id:                repeatEntry.tenant_id,
      staff_id:                 repeatEntry.staff_id,
      leave_type_id:            repeatForm.leave_type_id,
      school_year:              schoolYear,
      start_date:               repeatForm.start_date,
      end_date:                 repeatForm.end_date || repeatForm.start_date,
      amount:                   parseFloat(repeatForm.amount),
      tracking_unit:            repeatForm.tracking_unit,
      concurrent_leave_type_id: repeatForm.concurrent_leave_type_id || null,
      reason:                   repeatForm.reason || null,
      documentation_on_file:    repeatForm.documentation_on_file,
      logged_by:                profile.id,
    }
    const { data, error } = await supabase.from('leave_entries').insert([entryData]).select()
    setSaving(false)
    if (error) { showNotif('Error saving entry. Please try again.', 'error'); return }
    if (data?.[0]) {
      const enriched = { ...data[0], staff: repeatEntry.staff }
      setEntries(prev => [enriched, ...prev])
    }
    resetRepeatModal()
    showNotif('Repeated entry saved.')
  }

  // ── Save picked days (one entry per day) ─────────────────────────────
  const handleSavePickedDays = async () => {
    const dayKeys = Object.keys(pickedDays).sort()
    if (!repeatForm.leave_type_id || dayKeys.length === 0) {
      showNotif('Select a leave type and at least one day.', 'error'); return
    }
    for (const key of dayKeys) {
      if (!pickedDays[key] || parseFloat(pickedDays[key]) <= 0) {
        showNotif(`Enter a valid amount for ${key}.`, 'error'); return
      }
    }
    setSaving(true)
    const inserts = dayKeys.map(key => ({
      tenant_id:                repeatEntry.tenant_id,
      staff_id:                 repeatEntry.staff_id,
      leave_type_id:            repeatForm.leave_type_id,
      school_year:              schoolYear,
      start_date:               key,
      end_date:                 key,
      amount:                   parseFloat(pickedDays[key]),
      tracking_unit:            'hours',
      concurrent_leave_type_id: repeatForm.concurrent_leave_type_id || null,
      reason:                   repeatForm.reason || null,
      documentation_on_file:    repeatForm.documentation_on_file,
      logged_by:                profile.id,
    }))
    const { data, error } = await supabase.from('leave_entries').insert(inserts).select()
    setSaving(false)
    if (error) { showNotif('Error saving entry. Please try again.', 'error'); return }
    if (data) {
      const enriched = data.map(e => ({ ...e, staff: repeatEntry.staff }))
      setEntries(prev => [...enriched, ...prev])
    }
    resetRepeatModal()
    showNotif(`${dayKeys.length} ${dayKeys.length === 1 ? 'entry' : 'entries'} saved.`)
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
                      <button onClick={() => openRepeat(entry)}
                        className="text-green-600 hover:text-green-800 text-xs font-medium mr-3 transition-colors">
                        Repeat
                      </button>
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

      {/* ── REPEAT MODAL ── */}
      {showRepeatModal && repeatEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-xl font-bold text-[#2c3e7e]">Repeat Leave Entry</h2>
                  <p className="text-sm text-[#666666] mt-0.5">{repeatEntry.staff?.full_name}</p>
                </div>
                <button onClick={resetRepeatModal}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>

              {/* Info banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4 text-xs text-blue-800">
                All fields have been copied from the original entry. Update the dates and save.
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => { setEntryMode('range'); setPickedDays({}) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${entryMode === 'range' ? 'bg-[#2c3e7e] text-white border-[#2c3e7e]' : 'text-[#666666] border-gray-300 hover:bg-gray-50'}`}>
                  Date Range
                </button>
                <button
                  onClick={() => setEntryMode('pick')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${entryMode === 'pick' ? 'bg-[#2c3e7e] text-white border-[#2c3e7e]' : 'text-[#666666] border-gray-300 hover:bg-gray-50'}`}>
                  📅 Pick Days
                </button>
              </div>

              <div className="space-y-4">
                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select value={repeatForm.leave_type_id}
                    onChange={e => setRepeatForm(p => ({ ...p, leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">Select leave type…</option>
                    {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {entryMode === 'range' ? (
                  /* ── Date Range fields ── */
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                        <input type="date" value={repeatForm.start_date}
                          onChange={e => setRepeatForm(p => ({ ...p, start_date: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">End Date</label>
                        <input type="date" value={repeatForm.end_date}
                          onChange={e => setRepeatForm(p => ({ ...p, end_date: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">Amount *</label>
                        <input type="number" min="0" step="0.5" value={repeatForm.amount}
                          onChange={e => setRepeatForm(p => ({ ...p, amount: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
                        <select value={repeatForm.tracking_unit}
                          onChange={e => setRepeatForm(p => ({ ...p, tracking_unit: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ── Pick Days calendar ── */
                  <div>
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                        className="px-2 py-1 text-sm text-[#666666] hover:text-[#2c3e7e]">&#8249;</button>
                      <span className="text-sm font-medium text-[#2c3e7e]">
                        {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                        className="px-2 py-1 text-sm text-[#666666] hover:text-[#2c3e7e]">&#8250;</button>
                    </div>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                        <div key={d} className="text-center text-xs text-[#666666] font-medium py-1">{d}</div>
                      ))}
                    </div>
                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {getCalendarDays(calendarMonth).map((day, i) => {
                        if (!day) return <div key={`pad-${i}`} />
                        const key = toISO(day)
                        const weekend = isWeekend(day)
                        const picked  = pickedDays[key] !== undefined
                        return (
                          <button key={key}
                            disabled={weekend}
                            onClick={() => togglePickedDay(day)}
                            className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                              weekend ? 'text-gray-300 cursor-not-allowed' :
                              picked  ? 'bg-[#2c3e7e] text-white' :
                              'hover:bg-blue-50 text-[#333333]'
                            }`}>
                            {day.getDate()}
                          </button>
                        )
                      })}
                    </div>
                    {/* Per-day amount inputs */}
                    {Object.keys(pickedDays).length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-xs font-medium text-[#666666] mb-1">Hours per day:</div>
                        {Object.keys(pickedDays).sort().map(key => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-xs text-[#666666] w-24">
                              {new Date(key + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <input type="number" min="0.5" max="12" step="0.5"
                              value={pickedDays[key]}
                              onChange={e => setPickedDays(prev => ({ ...prev, [key]: e.target.value }))}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#477fc1]" />
                            <span className="text-xs text-[#666666]">hrs</span>
                          </div>
                        ))}
                        <div className="text-xs text-[#2c3e7e] font-medium pt-1">
                          Total: {Object.values(pickedDays).reduce((s, v) => s + (parseFloat(v) || 0), 0)} hrs across {Object.keys(pickedDays).length} {Object.keys(pickedDays).length === 1 ? 'day' : 'days'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Concurrent Leave */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Concurrent Leave (optional)</label>
                  <select value={repeatForm.concurrent_leave_type_id}
                    onChange={e => setRepeatForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]">
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== repeatForm.leave_type_id)
                      .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea rows={2} value={repeatForm.reason}
                    onChange={e => setRepeatForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="Optional notes…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]" />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="repeat-docs"
                    checked={repeatForm.documentation_on_file}
                    onChange={e => setRepeatForm(p => ({ ...p, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300" />
                  <label htmlFor="repeat-docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={resetRepeatModal}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={entryMode === 'pick' ? handleSavePickedDays : handleSaveRepeat}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' :
                    entryMode === 'pick'
                      ? `Save ${Object.keys(pickedDays).length || ''} ${Object.keys(pickedDays).length === 1 ? 'Entry' : 'Entries'}`
                      : 'Save Repeated Entry'}
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
