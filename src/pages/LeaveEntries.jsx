import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

export default function LeaveEntries() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])       // enriched with .staff
  const [leaveTypes, setLeaveTypes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState(null)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editForm, setEditForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    amount: '',
    tracking_unit: 'hours',
    concurrent_leave_type_id: '',
    reason: '',
    documentation_on_file: false,
  })

  // Delete confirm state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState(null)

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3500)
  }

  // ── Data loading (Session 27 two-step pattern — never join profiles) ──
  const loadData = async () => {
    setLoading(true)

    const { data: lt } = await supabase
      .from('leave_types')
      .select('*')
      .order('sort_order')
    if (lt) setLeaveTypes(lt)

    const { data: entriesRaw, error } = await supabase
      .from('leave_entries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading entries:', error)
      setLoading(false)
      return
    }

    if (entriesRaw && entriesRaw.length > 0) {
      const staffIds = [...new Set(entriesRaw.map(e => e.staff_id))]
      // Always use select('*') — comma-separated columns cause 400 errors
      const { data: staffData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', staffIds)

      const staffMap = {}
      if (staffData) staffData.forEach(s => { staffMap[s.id] = s })

      setEntries(entriesRaw.map(e => ({ ...e, staff: staffMap[e.staff_id] || null })))
    } else {
      setEntries([])
    }

    setLoading(false)
  }

  // ── Helpers ──
  const getTypeName = (id) => leaveTypes.find(t => t.id === id)?.name || '—'
  const getTypeCategory = (id) => leaveTypes.find(t => t.id === id)?.category || ''

  const getCategoryColor = (cat) => {
    if (cat === 'federal') return 'bg-blue-100 text-blue-800'
    if (cat === 'state') return 'bg-teal-100 text-teal-800'
    return 'bg-gray-100 text-gray-700'
  }

  const formatAmount = (amount, unit) => {
    const n = parseFloat(amount)
    if (unit === 'hours') return `${n} hrs`
    if (unit === 'days') return `${n} day${n !== 1 ? 's' : ''}`
    if (unit === 'weeks') return `${n} wk${n !== 1 ? 's' : ''}`
    return `${n} ${unit}`
  }

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString() : '—'

  // ── Filtered entries ──
  const filtered = entries.filter(e => {
    const name = e.staff?.full_name?.toLowerCase() || ''
    const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase())
    const matchType = filterType === 'all' || e.leave_type_id === filterType
    return matchSearch && matchType
  })

  // ── EDIT ──
  const openEdit = (entry) => {
    setEditingEntry(entry)
    setEditForm({
      leave_type_id: entry.leave_type_id || '',
      start_date: entry.start_date || '',
      end_date: entry.end_date || '',
      amount: entry.amount?.toString() || '',
      tracking_unit: entry.tracking_unit || 'hours',
      concurrent_leave_type_id: entry.concurrent_leave_type_id || '',
      reason: entry.reason || '',
      documentation_on_file: entry.documentation_on_file || false,
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm.leave_type_id || !editForm.start_date || !editForm.amount) {
      showNotif('Please fill in Leave Type, Start Date, and Amount.', 'error')
      return
    }
    setSaving(true)

    const { data, error } = await supabase
      .from('leave_entries')
      .update({
        leave_type_id: editForm.leave_type_id,
        start_date: editForm.start_date,
        end_date: editForm.end_date || null,
        amount: parseFloat(editForm.amount),
        tracking_unit: editForm.tracking_unit,
        concurrent_leave_type_id: editForm.concurrent_leave_type_id || null,
        reason: editForm.reason || null,
        documentation_on_file: editForm.documentation_on_file,
      })
      .eq('id', editingEntry.id)
      .select()

    setSaving(false)

    if (error) {
      showNotif('Error saving: ' + error.message, 'error')
      return
    }

    // Merge updated entry back into state (keep .staff enrichment)
    const updated = { ...data[0], staff: editingEntry.staff }
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setShowEditModal(false)
    setEditingEntry(null)
    showNotif('Entry updated successfully.')
  }

  // ── DELETE ──
  const openDelete = (entry) => {
    setDeletingEntry(entry)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return
    setSaving(true)

    const { error } = await supabase
      .from('leave_entries')
      .delete()
      .eq('id', deletingEntry.id)

    setSaving(false)

    if (error) {
      showNotif('Error deleting: ' + error.message, 'error')
      setShowDeleteConfirm(false)
      return
    }

    setEntries(prev => prev.filter(e => e.id !== deletingEntry.id))
    setShowDeleteConfirm(false)
    setDeletingEntry(null)
    showNotif('Entry deleted.')
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Toast notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
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
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Staff</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Leave Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Concurrent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Docs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[#666666] text-sm">
                      {entries.length === 0 ? 'No leave entries recorded yet.' : 'No entries match your search.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-[#2c3e7e]">
                        {entry.staff?.full_name || '—'}
                        {entry.staff?.position && (
                          <div className="text-xs text-[#666666] font-normal">{entry.staff.position}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                          {getTypeName(entry.leave_type_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">
                        {fmtDate(entry.start_date)}
                        {entry.end_date && entry.end_date !== entry.start_date && (
                          <> – {fmtDate(entry.end_date)}</>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">
                        {formatAmount(entry.amount, entry.tracking_unit)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666666]">
                        {entry.concurrent_leave_type_id ? (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                            + {getTypeName(entry.concurrent_leave_type_id)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {entry.documentation_on_file
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#666666] max-w-[180px] truncate">
                        {entry.reason || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <button
                          onClick={() => openEdit(entry)}
                          className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium mr-3 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openDelete(entry)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
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
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-xl font-bold text-[#2c3e7e]">Edit Leave Entry</h2>
                  <p className="text-sm text-[#666666] mt-0.5">{editingEntry.staff?.full_name}</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select
                    value={editForm.leave_type_id}
                    onChange={e => setEditForm(p => ({ ...p, leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">Select leave type…</option>
                    {leaveTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">End Date</label>
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>
                </div>

                {/* Amount + Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Amount *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={editForm.amount}
                      onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
                    <select
                      value={editForm.tracking_unit}
                      onChange={e => setEditForm(p => ({ ...p, tracking_unit: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                </div>

                {/* Concurrent Leave */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Concurrent Leave (optional)</label>
                  <select
                    value={editForm.concurrent_leave_type_id}
                    onChange={e => setEditForm(p => ({ ...p, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">None</option>
                    {leaveTypes
                      .filter(t => t.id !== editForm.leave_type_id)
                      .map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                </div>

                {/* Reason / Notes */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea
                    rows={2}
                    value={editForm.reason}
                    onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="Optional notes…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-docs"
                    checked={editForm.documentation_on_file}
                    onChange={e => setEditForm(p => ({ ...p, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="edit-docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {showDeleteConfirm && deletingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-[#2c3e7e] mb-2">Delete Leave Entry?</h2>
            <p className="text-sm text-[#666666] mb-1">
              You're about to delete this entry for <strong>{deletingEntry.staff?.full_name}</strong>:
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-4 text-sm">
              <div className="font-medium text-red-800">{getTypeName(deletingEntry.leave_type_id)}</div>
              <div className="text-red-700 mt-0.5">
                {fmtDate(deletingEntry.start_date)}
                {deletingEntry.end_date && deletingEntry.end_date !== deletingEntry.start_date && <> – {fmtDate(deletingEntry.end_date)}</>}
                {' · '}{formatAmount(deletingEntry.amount, deletingEntry.tracking_unit)}
              </div>
            </div>
            <p className="text-xs text-[#666666] mb-5">
              ⚠️ This removes the record only. Leave balances are not automatically adjusted — update them manually in the Leave Tracker if needed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletingEntry(null) }}
                className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
