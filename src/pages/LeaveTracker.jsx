import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function LeaveTracker() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [staff, setStaff] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leavePolicies, setLeavePolicies] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [leaveEntries, setLeaveEntries] = useState([])
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [isCopyMode, setIsCopyMode] = useState(false)
  const [entryMode, setEntryMode] = useState('range') // 'range' | 'pick'
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [pickedDays, setPickedDays] = useState({}) // { 'YYYY-MM-DD': amount }
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [schoolYear] = useState('2025-2026')

  const [newEntry, setNewEntry] = useState({
    staff_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    amount: '',
    tracking_unit: 'days',
    concurrent_leave_type_id: '',
    reason: '',
    documentation_on_file: false
  })

  useEffect(() => {
    if (profile) {
      fetchAllData()
    }
  }, [profile])

  const fetchAllData = async () => {
    setLoading(true)

    // Fetch staff
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name')

    // Fetch leave types
    const { data: typesData } = await supabase
      .from('leave_types')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .order('sort_order')

    // Fetch leave policies
    const { data: policiesData } = await supabase
      .from('leave_policies')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)

    // Fetch leave balances
    const { data: balancesData } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)

    // Fetch leave entries
    const { data: entriesData } = await supabase
      .from('leave_entries')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('school_year', schoolYear)
      .order('start_date', { ascending: false })

    if (staffData) setStaff(staffData)
    if (typesData) setLeaveTypes(typesData)
    if (policiesData) setLeavePolicies(policiesData)
    if (balancesData) setLeaveBalances(balancesData)
    if (entriesData) setLeaveEntries(entriesData)

    setLoading(false)
  }

  // Initialize balances for a staff member (when they don't have any yet)
  const initializeBalances = async (staffId) => {
    const existingBalances = leaveBalances.filter(b => b.staff_id === staffId)
    if (existingBalances.length > 0) return // already initialized

    const newBalances = leaveTypes.map(lt => {
      const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
      return {
        tenant_id: profile.tenant_id,
        staff_id: staffId,
        leave_type_id: lt.id,
        school_year: schoolYear,
        allocated: policy?.days_per_year || policy?.weeks_per_year || 0,
        used: 0,
        carried_over: 0,
        tracking_unit: policy?.tracking_unit || 'days'
      }
    })

    const { data, error } = await supabase
      .from('leave_balances')
      .insert(newBalances)
      .select()

    if (!error && data) {
      setLeaveBalances(prev => [...prev, ...data])
    }
  }

  // Save a new leave entry
  const handleSaveEntry = async () => {
    if (!newEntry.staff_id || !newEntry.leave_type_id || !newEntry.start_date || !newEntry.end_date || !newEntry.amount) {
      alert('Please fill in all required fields.')
      return
    }

    const entryData = {
      tenant_id: profile.tenant_id,
      staff_id: newEntry.staff_id,
      leave_type_id: newEntry.leave_type_id,
      school_year: schoolYear,
      start_date: newEntry.start_date,
      end_date: newEntry.end_date,
      amount: parseFloat(newEntry.amount),
      tracking_unit: newEntry.tracking_unit,
      concurrent_leave_type_id: newEntry.concurrent_leave_type_id || null,
      reason: newEntry.reason || null,
      documentation_on_file: newEntry.documentation_on_file,
      entered_by: profile.id
    }

    const { data, error } = await supabase
      .from('leave_entries')
      .insert([entryData])
      .select()

    if (error) {
      alert('Error saving entry: ' + error.message)
      return
    }

    // Update the balance
    const existingBalance = leaveBalances.find(
      b => b.staff_id === newEntry.staff_id && b.leave_type_id === newEntry.leave_type_id && b.school_year === schoolYear
    )

    if (existingBalance) {
      const newUsed = parseFloat(existingBalance.used) + parseFloat(newEntry.amount)
      const { data: updatedBalance } = await supabase
        .from('leave_balances')
        .update({ used: newUsed })
        .eq('id', existingBalance.id)
        .select()

      if (updatedBalance) {
        setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b))
      }
    }

    setLeaveEntries(prev => [data[0], ...prev])
    resetModal()
  }

  // Delete a leave entry
  const handleDeleteEntry = async (entry) => {
    if (!confirm('Are you sure you want to delete this leave entry?')) return

    const { error } = await supabase
      .from('leave_entries')
      .delete()
      .eq('id', entry.id)

    if (!error) {
      // Update balance
      const existingBalance = leaveBalances.find(
        b => b.staff_id === entry.staff_id && b.leave_type_id === entry.leave_type_id && b.school_year === schoolYear
      )
      if (existingBalance) {
        const newUsed = Math.max(0, parseFloat(existingBalance.used) - parseFloat(entry.amount))
        const { data: updatedBalance } = await supabase
          .from('leave_balances')
          .update({ used: newUsed })
          .eq('id', existingBalance.id)
          .select()

        if (updatedBalance) {
          setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b))
        }
      }
      setLeaveEntries(prev => prev.filter(e => e.id !== entry.id))
    }
  }

  // Open staff detail view and initialize balances if needed
  const handleViewStaff = async (staffMember) => {
    setSelectedStaff(staffMember)
    await initializeBalances(staffMember.id)
    setShowDetailModal(true)
  }

  // Open entry modal pre-filled for a specific staff member
  const handleAddEntryForStaff = (staffMember) => {
    setNewEntry(prev => ({ ...prev, staff_id: staffMember.id }))
    setShowEntryModal(true)
  }

  // Open entry modal pre-filled from an existing entry (copy mode — dates cleared)
  const handleCopyEntry = (entry) => {
    setNewEntry({
      staff_id: entry.staff_id,
      leave_type_id: entry.leave_type_id,
      start_date: '',
      end_date: '',
      amount: entry.amount,
      tracking_unit: entry.tracking_unit,
      concurrent_leave_type_id: entry.concurrent_leave_type_id || '',
      reason: entry.reason || '',
      documentation_on_file: entry.documentation_on_file || false,
      qualifying_reason: entry.qualifying_reason || '',
      qualifying_relationship: entry.qualifying_relationship || '',
      relationship_name: entry.relationship_name || '',
      is_birthing_parent: entry.is_birthing_parent || false,
    })
    setIsCopyMode(true)
    setShowDetailModal(false)
    setShowEntryModal(true)
  }

  // ── Calendar / Pick-Days helpers ─────────────────────────────────────────

  const getCalendarDays = (monthDate) => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    // pad start so Mon=0 ... Sun=6 (ISO week)
    const startPad = (firstDay.getDay() + 6) % 7
    const days = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d))
    }
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
      if (prev[key] !== undefined) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      // default amount = same as newEntry.amount if set, else 1
      return { ...prev, [key]: newEntry.amount || 1 }
    })
  }

  const updatePickedDayAmount = (key, val) => {
    setPickedDays(prev => ({ ...prev, [key]: val }))
  }

  const resetModal = () => {
    setShowEntryModal(false)
    setIsCopyMode(false)
    setEntryMode('range')
    setPickedDays({})
    setCalendarMonth(new Date())
    setNewEntry({
      staff_id: '',
      leave_type_id: '',
      start_date: '',
      end_date: '',
      amount: '',
      tracking_unit: 'days',
      concurrent_leave_type_id: '',
      reason: '',
      documentation_on_file: false
    })
  }

  // Save one entry per picked day
  const handleSavePickedDays = async () => {
    const dayKeys = Object.keys(pickedDays).sort()
    if (!newEntry.staff_id || !newEntry.leave_type_id || dayKeys.length === 0) {
      alert('Please select a staff member, leave type, and at least one day.')
      return
    }
    for (const key of dayKeys) {
      if (!pickedDays[key] || parseFloat(pickedDays[key]) <= 0) {
        alert(`Please enter a valid amount for ${key}.`)
        return
      }
    }

    const inserts = dayKeys.map(key => ({
      tenant_id: profile.tenant_id,
      staff_id: newEntry.staff_id,
      leave_type_id: newEntry.leave_type_id,
      school_year: schoolYear,
      start_date: key,
      end_date: key,
      amount: parseFloat(pickedDays[key]),
      tracking_unit: newEntry.tracking_unit,
      concurrent_leave_type_id: newEntry.concurrent_leave_type_id || null,
      reason: newEntry.reason || null,
      documentation_on_file: newEntry.documentation_on_file,
      entered_by: profile.id,
    }))

    const { data, error } = await supabase
      .from('leave_entries')
      .insert(inserts)
      .select()

    if (error) {
      alert('Error saving entries: ' + error.message)
      return
    }

    // Deduct total from balance
    const totalAmount = dayKeys.reduce((sum, k) => sum + parseFloat(pickedDays[k]), 0)
    const existingBalance = leaveBalances.find(
      b => b.staff_id === newEntry.staff_id && b.leave_type_id === newEntry.leave_type_id && b.school_year === schoolYear
    )
    if (existingBalance) {
      const newUsed = parseFloat(existingBalance.used) + totalAmount
      const { data: updatedBalance } = await supabase
        .from('leave_balances')
        .update({ used: newUsed })
        .eq('id', existingBalance.id)
        .select()
      if (updatedBalance) {
        setLeaveBalances(prev => prev.map(b => b.id === existingBalance.id ? updatedBalance[0] : b))
      }
    }

    if (data) setLeaveEntries(prev => [...data, ...prev])
    resetModal()
  }

  // Helper functions
  const getTypeName = (typeId) => leaveTypes.find(t => t.id === typeId)?.name || 'Unknown'
  const getTypeCategory = (typeId) => leaveTypes.find(t => t.id === typeId)?.category || ''
  const getStaffName = (staffId) => staff.find(s => s.id === staffId)?.full_name || 'Unknown'

  const getStaffBalances = (staffId) => {
    return leaveTypes.map(lt => {
      const balance = leaveBalances.find(b => b.staff_id === staffId && b.leave_type_id === lt.id)
      const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
      return {
        type: lt,
        policy,
        balance: balance || { allocated: policy?.days_per_year || policy?.weeks_per_year || 0, used: 0, carried_over: 0 }
      }
    })
  }

  const getStaffEntries = (staffId) => {
    return leaveEntries.filter(e => e.staff_id === staffId)
  }

  const getCategoryColor = (category) => {
    switch (category) {
      case 'school_provided': return 'bg-blue-100 text-blue-800'
      case 'state': return 'bg-green-100 text-green-800'
      case 'federal': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getUsagePercent = (used, allocated) => {
    if (!allocated || allocated === 0) return 0
    return Math.min(100, Math.round((used / allocated) * 100))
  }

  const getBarColor = (percent) => {
    if (percent >= 90) return 'bg-red-500'
    if (percent >= 75) return 'bg-[#f3843e]'
    if (percent >= 50) return 'bg-yellow-400'
    return 'bg-green-500'
  }

  // Filter staff
  const filteredStaff = staff.filter(s => {
    const matchesSearch = s.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  // Summary stats
  const totalStaff = staff.length
  const staffWithLeave = [...new Set(leaveEntries.map(e => e.staff_id))].length
  const totalEntriesThisYear = leaveEntries.length
  const staffApproachingLimits = staff.filter(s => {
    const balances = getStaffBalances(s.id)
    return balances.some(b => {
      const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
      const used = parseFloat(b.balance.used)
      return allocated > 0 && (used / allocated) >= 0.75
    })
  }).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="flex items-center justify-center h-64">
          <p className="text-[#666666]">Loading leave data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Leave Tracker</h2>
            <p className="text-[#666666] text-sm mt-1">School Year: {schoolYear}</p>
          </div>
          <button
            onClick={() => setShowEntryModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#477fc1] transition-colors"
          >
            + Log Leave Entry
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Total Staff</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{totalStaff}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Staff With Leave Used</p>
            <p className="text-2xl font-bold text-[#477fc1]">{staffWithLeave}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Total Entries This Year</p>
            <p className="text-2xl font-bold text-green-600">{totalEntriesThisYear}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-[#666666] text-sm">Approaching Limits</p>
            <p className="text-2xl font-bold text-[#f3843e]">{staffApproachingLimits}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {[
            { id: 'dashboard', label: 'Staff Overview' },
            { id: 'entries', label: 'All Entries' },
            { id: 'compliance', label: 'Compliance Notes' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#2c3e7e] text-[#2c3e7e]'
                  : 'border-transparent text-[#666666] hover:text-[#2c3e7e]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Staff Overview / Dashboard */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
            </div>

            {/* Staff Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredStaff.map(s => {
                const balances = getStaffBalances(s.id)
                const schoolProvided = balances.filter(b => b.type.category === 'school_provided')
                const stateFederal = balances.filter(b => b.type.category !== 'school_provided')
                const entries = getStaffEntries(s.id)

                return (
                  <div key={s.id} className="bg-white rounded-lg shadow p-4">
                    {/* Staff Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-[#2c3e7e]">{s.full_name}</h3>
                        <p className="text-sm text-[#666666]">{s.position_type || s.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddEntryForStaff(s)}
                          className="text-xs bg-[#2c3e7e] text-white px-3 py-1 rounded hover:bg-[#477fc1] transition-colors"
                        >
                          + Log Leave
                        </button>
                        <button
                          onClick={() => handleViewStaff(s)}
                          className="text-xs bg-gray-100 text-[#2c3e7e] px-3 py-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>

                    {/* School-Provided Balances */}
                    <div className="space-y-2">
                      {schoolProvided.map(b => {
                        const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                        const used = parseFloat(b.balance.used)
                        const remaining = Math.max(0, allocated - used)
                        const percent = getUsagePercent(used, allocated)

                        return (
                          <div key={b.type.id}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[#666666]">{b.type.name}</span>
                              <span className="font-medium text-[#2c3e7e]">
                                {remaining} of {allocated} {b.balance.tracking_unit || b.policy?.tracking_unit || 'days'} remaining
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${getBarColor(percent)}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* State/Federal Usage Summary */}
                    {stateFederal.some(b => parseFloat(b.balance.used) > 0) && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-[#666666] font-medium mb-1">State/Federal Leave Used:</p>
                        <div className="flex flex-wrap gap-2">
                          {stateFederal.filter(b => parseFloat(b.balance.used) > 0).map(b => (
                            <span key={b.type.id} className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(b.type.category)}`}>
                              {b.type.name}: {b.balance.used} {b.type.category !== 'school_provided' ? 'hrs' : (b.policy?.tracking_unit || 'days')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent entries count */}
                    {entries.length > 0 && (
                      <p className="text-xs text-[#666666] mt-2">
                        {entries.length} leave {entries.length === 1 ? 'entry' : 'entries'} this year
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {filteredStaff.length === 0 && (
              <div className="text-center py-12 text-[#666666]">
                {searchTerm ? 'No staff match your search.' : 'No staff found.'}
              </div>
            )}
          </div>
        )}

        {/* Tab: All Entries */}
        {activeTab === 'entries' && (
          <div>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                placeholder="Search by staff name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              >
                <option value="all">All Leave Types</option>
                {leaveTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>

            {/* Entries Table */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Leave Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Dates</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Concurrent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Docs</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaveEntries
                    .filter(e => {
                      const matchesSearch = !searchTerm || getStaffName(e.staff_id).toLowerCase().includes(searchTerm.toLowerCase())
                      const matchesType = filterType === 'all' || e.leave_type_id === filterType
                      return matchesSearch && matchesType
                    })
                    .map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-[#2c3e7e]">{getStaffName(entry.staff_id)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                            {getTypeName(entry.leave_type_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {new Date(entry.start_date).toLocaleDateString()} â€“ {new Date(entry.end_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {entry.amount} {entry.tracking_unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#666666]">
                          {entry.concurrent_leave_type_id ? (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                              + {getTypeName(entry.concurrent_leave_type_id)}
                            </span>
                          ) : 'â€”'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {entry.documentation_on_file ? (
                            <span className="text-green-600">âœ“</span>
                          ) : (
                            <span className="text-gray-300">â€”</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleCopyEntry(entry)}
                              className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium"
                              title="Repeat this entry with new dates"
                            >
                              Repeat
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {leaveEntries.length === 0 && (
                <div className="text-center py-12 text-[#666666]">
                  No leave entries recorded yet. Click "Log Leave Entry" to add one.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Compliance Notes */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            {leaveTypes.map(lt => {
              const policy = leavePolicies.find(p => p.leave_type_id === lt.id)
              if (!policy && !lt.description) return null

              return (
                <div key={lt.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-[#2c3e7e]">{lt.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(lt.category)}`}>
                      {lt.category === 'school_provided' ? 'School' : lt.category === 'state' ? 'Oregon State' : 'Federal'}
                    </span>
                  </div>
                  {lt.description && (
                    <p className="text-sm text-[#666666] mb-2">{lt.description}</p>
                  )}
                  {policy?.eligibility_notes && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-2">
                      <p className="text-xs font-medium text-blue-800 mb-1">Eligibility:</p>
                      <p className="text-xs text-blue-700">{policy.eligibility_notes}</p>
                    </div>
                  )}
                  {policy?.compliance_notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
                      <p className="text-xs font-medium text-yellow-800 mb-1">Compliance Notes:</p>
                      <p className="text-xs text-yellow-700">{policy.compliance_notes}</p>
                    </div>
                  )}
                  {policy?.concurrent_with && policy.concurrent_with.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-3">
                      <p className="text-xs font-medium text-purple-800 mb-1">Can Run Concurrently With:</p>
                      <p className="text-xs text-purple-700">{policy.concurrent_with.join(', ')}</p>
                    </div>
                  )}
                  {policy && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#666666]">
                      {policy.days_per_year && <span>Allocation: {policy.days_per_year} days/year</span>}
                      {policy.weeks_per_year && <span>Allocation: {policy.weeks_per_year} weeks/year</span>}
                      {policy.carryover_max !== null && policy.carryover_max !== undefined && <span>Carryover: {policy.carryover_max === 0 ? 'None' : `Up to ${policy.carryover_max} days`}</span>}
                      {policy.transfer_max && <span>Transfer: Up to {policy.transfer_max} days between districts</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal: Log Leave Entry */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-[#2c3e7e]">
                  {isCopyMode ? 'Repeat Leave Entry' : 'Log Leave Entry'}
                </h3>
                <button onClick={resetModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {isCopyMode && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <span className="text-blue-500 text-lg leading-tight">⟳</span>
                  <div>
                    <p className="text-sm font-medium text-blue-800">Repeating a previous entry</p>
                    <p className="text-xs text-blue-600 mt-0.5">All fields have been copied from the original. Just update the dates and save.</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Staff Member */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Staff Member *</label>
                  <select
                    value={newEntry.staff_id}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, staff_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">Select staff member...</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Leave Type */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Leave Type *</label>
                  <select
                    value={newEntry.leave_type_id}
                    onChange={(e) => {
                      const lt = leaveTypes.find(t => t.id === e.target.value)
                      const policy = leavePolicies.find(p => p.leave_type_id === e.target.value)
                      setNewEntry(prev => ({
                        ...prev,
                        leave_type_id: e.target.value,
                        tracking_unit: policy?.tracking_unit || 'days'
                      }))
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">Select leave type...</option>
                    <optgroup label="School-Provided">
                      {leaveTypes.filter(t => t.category === 'school_provided').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Federal">
                      {leaveTypes.filter(t => t.category === 'federal').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Oregon State">
                      {leaveTypes.filter(t => t.category === 'state').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Mode Toggle */}
                {!isCopyMode && (
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      onClick={() => { setEntryMode('range'); setPickedDays({}) }}
                      className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${entryMode === 'range' ? 'bg-white text-[#2c3e7e] shadow-sm' : 'text-[#666666] hover:text-[#2c3e7e]'}`}
                    >
                      Date Range
                    </button>
                    <button
                      onClick={() => setEntryMode('pick')}
                      className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${entryMode === 'pick' ? 'bg-white text-[#2c3e7e] shadow-sm' : 'text-[#666666] hover:text-[#2c3e7e]'}`}
                    >
                      📅 Pick Days
                    </button>
                  </div>
                )}

                {/* Date Range Mode */}
                {(entryMode === 'range' || isCopyMode) && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">Start Date *</label>
                        <input
                          type="date"
                          value={newEntry.start_date}
                          onChange={(e) => setNewEntry(prev => ({ ...prev, start_date: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#666666] mb-1">End Date *</label>
                        <input
                          type="date"
                          value={newEntry.end_date}
                          onChange={(e) => setNewEntry(prev => ({ ...prev, end_date: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">
                        Amount ({newEntry.tracking_unit}) *
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={newEntry.amount}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder={`Number of ${newEntry.tracking_unit}`}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      />
                    </div>
                  </>
                )}

                {/* Pick Days Mode — Calendar */}
                {entryMode === 'pick' && !isCopyMode && (
                  <div>
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                        className="p-1.5 rounded hover:bg-gray-100 text-[#2c3e7e] font-bold"
                      >‹</button>
                      <span className="text-sm font-semibold text-[#2c3e7e]">
                        {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                        className="p-1.5 rounded hover:bg-gray-100 text-[#2c3e7e] font-bold"
                      >›</button>
                    </div>

                    {/* Day headers Mon–Fri only */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                        <div key={d} className={`text-center text-xs font-medium py-1 ${d === 'Sat' || d === 'Sun' ? 'text-gray-300' : 'text-[#666666]'}`}>{d}</div>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {getCalendarDays(calendarMonth).map((day, i) => {
                        if (!day) return <div key={`pad-${i}`} />
                        const key = toISO(day)
                        const weekend = isWeekend(day)
                        const picked = pickedDays[key] !== undefined
                        return (
                          <button
                            key={key}
                            disabled={weekend}
                            onClick={() => togglePickedDay(day)}
                            className={`
                              aspect-square flex items-center justify-center text-sm rounded-md font-medium transition-colors
                              ${weekend ? 'text-gray-200 cursor-not-allowed' : ''}
                              ${!weekend && picked ? 'bg-[#2c3e7e] text-white' : ''}
                              ${!weekend && !picked ? 'hover:bg-blue-50 text-[#2c3e7e]' : ''}
                            `}
                          >
                            {day.getDate()}
                          </button>
                        )
                      })}
                    </div>

                    {/* Per-day amount fields */}
                    {Object.keys(pickedDays).length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium text-[#666666] uppercase tracking-wide">
                          Amount per day ({newEntry.tracking_unit || 'days'})
                        </p>
                        {Object.keys(pickedDays).sort().map(key => {
                          const d = new Date(key + 'T00:00:00')
                          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-sm text-[#2c3e7e] w-32 shrink-0">{label}</span>
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                value={pickedDays[key]}
                                onChange={(e) => updatePickedDayAmount(key, e.target.value)}
                                className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                              />
                              <button
                                onClick={() => togglePickedDay(new Date(key + 'T00:00:00'))}
                                className="text-gray-400 hover:text-red-500 text-xs"
                              >✕</button>
                            </div>
                          )
                        })}
                        <p className="text-xs text-[#666666] pt-1">
                          Total: <span className="font-semibold text-[#2c3e7e]">
                            {Object.values(pickedDays).reduce((s, v) => s + parseFloat(v || 0), 0)} {newEntry.tracking_unit || 'days'}
                          </span> across {Object.keys(pickedDays).length} {Object.keys(pickedDays).length === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                    )}

                    {Object.keys(pickedDays).length === 0 && (
                      <p className="text-xs text-center text-[#666666] mt-3">Click weekdays to select leave days</p>
                    )}
                  </div>
                )}

                {/* Concurrent Leave */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Running Concurrently With (optional)</label>
                  <select
                    value={newEntry.concurrent_leave_type_id}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, concurrent_leave_type_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="">None</option>
                    {leaveTypes.filter(t => t.id !== newEntry.leave_type_id).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Notes / Reason (optional)</label>
                  <textarea
                    value={newEntry.reason}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, reason: e.target.value }))}
                    rows={2}
                    placeholder="Optional notes..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  />
                </div>

                {/* Documentation */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="docs"
                    checked={newEntry.documentation_on_file}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, documentation_on_file: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="docs" className="text-sm text-[#666666]">Documentation on file</label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={resetModal}
                  className="px-4 py-2 text-sm text-[#666666] border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={entryMode === 'pick' && !isCopyMode ? handleSavePickedDays : handleSaveEntry}
                  className="px-4 py-2 text-sm bg-[#2c3e7e] text-white rounded-lg hover:bg-[#477fc1] transition-colors"
                >
                  {isCopyMode ? 'Save Repeated Entry' : entryMode === 'pick' ? `Save ${Object.keys(pickedDays).length || ''} ${Object.keys(pickedDays).length === 1 ? 'Entry' : 'Entries'}`.trim() : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Staff Detail */}
      {showDetailModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#2c3e7e]">{selectedStaff.full_name}</h3>
                  <p className="text-sm text-[#666666]">{selectedStaff.position_type || selectedStaff.role} â€” {schoolYear}</p>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {/* Balances */}
              <h4 className="font-semibold text-[#2c3e7e] mb-3">Leave Balances</h4>
              <div className="space-y-3 mb-6">
                {getStaffBalances(selectedStaff.id).map(b => {
                  const allocated = parseFloat(b.balance.allocated) + parseFloat(b.balance.carried_over || 0)
                  const used = parseFloat(b.balance.used)
                  const remaining = Math.max(0, allocated - used)
                  const percent = getUsagePercent(used, allocated)
                  const isProtected = b.type.category !== 'school_provided'
                  const entitlement = isProtected ? 480 : allocated
                  const displayUnit = isProtected ? 'hrs' : (b.policy?.tracking_unit || 'days')
                  const displayUsed = isProtected ? (parseFloat(b.balance.used) * (b.policy?.tracking_unit === 'weeks' ? 40 : b.policy?.tracking_unit === 'days' ? 8 : 1)) : used
                  const displayRemaining = isProtected ? Math.max(0, entitlement - displayUsed) : remaining
                  const displayAllocated = isProtected ? entitlement : allocated
                  const displayPercent = displayAllocated > 0 ? Math.min(100, (displayUsed / displayAllocated) * 100) : 0

                  return (
                    <div key={b.type.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#2c3e7e]">{b.type.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(b.type.category)}`}>
                            {b.type.category === 'school_provided' ? 'School' : b.type.category === 'state' ? 'State' : 'Federal'}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-[#2c3e7e]">
                          {displayUsed} / {displayAllocated} {displayUnit} used
                        </span>
                      </div>
                      {displayAllocated > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                          <div
                            className={`h-2.5 rounded-full transition-all ${getBarColor(displayPercent)}`}
                            style={{ width: `${displayPercent}%` }}
                          />
                        </div>
                      )}
                      <div className="flex justify-between text-xs text-[#666666] mt-1">
                        <span>{displayRemaining} {displayUnit} remaining</span>
                        {parseFloat(b.balance.carried_over) > 0 && (
                          <span>(includes {b.balance.carried_over} carried over)</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Entry History */}
              <h4 className="font-semibold text-[#2c3e7e] mb-3">Leave History</h4>
              {getStaffEntries(selectedStaff.id).length === 0 ? (
                <p className="text-sm text-[#666666]">No leave entries recorded.</p>
              ) : (
                <div className="space-y-2">
                  {getStaffEntries(selectedStaff.id).map(entry => (
                    <div key={entry.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(getTypeCategory(entry.leave_type_id))}`}>
                            {getTypeName(entry.leave_type_id)}
                          </span>
                          <span className="text-sm text-[#666666]">
                            {new Date(entry.start_date).toLocaleDateString()} â€“ {new Date(entry.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-[#2c3e7e] font-medium mt-1">
                          {entry.amount} {entry.tracking_unit}
                          {entry.concurrent_leave_type_id && (
                            <span className="text-xs text-yellow-700 ml-2">
                              (concurrent with {getTypeName(entry.concurrent_leave_type_id)})
                            </span>
                          )}
                        </p>
                        {entry.reason && <p className="text-xs text-[#666666] mt-1">{entry.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.documentation_on_file && <span className="text-green-600 text-xs">Docs âœ“</span>}
                        <button
                          onClick={() => handleCopyEntry(entry)}
                          className="text-[#477fc1] hover:text-[#2c3e7e] text-xs font-medium"
                          title="Repeat this entry with new dates"
                        >
                          Repeat
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add entry button */}
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  handleAddEntryForStaff(selectedStaff)
                }}
                className="mt-4 w-full bg-[#2c3e7e] text-white py-2 rounded-lg hover:bg-[#477fc1] transition-colors text-sm"
              >
                + Log Leave Entry for {selectedStaff.full_name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaveTracker
