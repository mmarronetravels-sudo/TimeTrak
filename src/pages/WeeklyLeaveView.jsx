import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// ─── Leave type display config (keyed by leave_types.code) ──────────
const LEAVE_DISPLAY = {
  sick:        { name: 'Sick',        short: 'SK',  bg: '#dbeafe', fg: '#1e40af', dot: '#3b82f6' },
  personal:    { name: 'Personal',    short: 'PD',  bg: '#ede9fe', fg: '#5b21b6', dot: '#8b5cf6' },
  bereavement: { name: 'Bereavement', short: 'BV',  bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' },
  or_sick:     { name: 'OR Sick',     short: 'ORS', bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b' },
  fmla:        { name: 'FMLA',        short: 'FM',  bg: '#d1fae5', fg: '#065f46', dot: '#10b981' },
  ofla:        { name: 'OFLA',        short: 'OF',  bg: '#ccfbf1', fg: '#115e59', dot: '#14b8a6' },
  plo:         { name: 'PLO',         short: 'PLO', bg: '#fce7f3', fg: '#9d174d', dot: '#ec4899' },
}

const DEFAULT_DISPLAY = { name: '?', short: '?', bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af' }

// ─── Date helpers ───────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getMondayOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtDate(d) {
  return d.toISOString().split('T')[0]
}

function fmtShort(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtMedium(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getWeekRange(monday) {
  const fri = addDays(monday, 4)
  return `${fmtMedium(monday)} – ${fmtMedium(fri)}, ${monday.getFullYear()}`
}

function getSchoolYear(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth()
  if (month >= 6) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

// ─── LeaveChip Component ────────────────────────────────────────────
function LeaveChip({ code, hours, compact = false }) {
  const display = LEAVE_DISPLAY[code] || DEFAULT_DISPLAY
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: compact ? 2 : 4,
      padding: compact ? '1px 6px' : '2px 8px', borderRadius: 4,
      fontSize: compact ? 10 : 11, fontWeight: 600,
      background: display.bg, color: display.fg,
      letterSpacing: '0.02em', lineHeight: compact ? '16px' : '18px', whiteSpace: 'nowrap',
    }}>
      {display.short}
      {hours != null && (
        <span style={{ fontWeight: 400, opacity: 0.8, fontSize: compact ? 9 : 10 }}>
          {Math.round(hours * 100) / 100}h
        </span>
      )}
    </span>
  )
}

// ─── Shared styles ──────────────────────────────────────────────────
const thStyle = {
  padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#fff',
  textAlign: 'center', borderBottom: 'none',
}

const tdStyle = {
  padding: '10px 8px', borderBottom: '1px solid #f0f1f3', fontSize: 13,
}

const weekNavBtn = {
  background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer',
  fontSize: 16, color: '#2c3e7e', fontWeight: 600,
}

const navBtn = {
  background: 'none', border: '1px solid #e2e4e9', borderRadius: 6, width: 32, height: 32,
  cursor: 'pointer', fontSize: 18, color: '#2c3e7e', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ─── Staff Calendar Drill-Down ──────────────────────────────────────
function StaffCalendar({ staff, allLeaveEvents, leaveTypes, leaveBalances, leavePolicies, protectedPeriods, typeIdToCode, schoolYear, onBack }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const today = new Date()

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPad = (firstDay.getDay() + 6) % 7
    const days = []
    for (let i = 0; i < startPad; i++) {
      days.push({ date: addDays(firstDay, -(startPad - i)), inMonth: false })
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), inMonth: true })
    }
    const remaining = 7 - (days.length % 7)
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push({ date: addDays(lastDay, i), inMonth: false })
      }
    }
    return days
  }, [viewMonth])

  const staffEvents = useMemo(() => {
    const map = {}
    Object.entries(allLeaveEvents).forEach(([key, events]) => {
      if (key.startsWith(staff.id + '-')) {
        const date = key.substring(staff.id.length + 1)
        map[date] = events
      }
    })
    return map
  }, [allLeaveEvents, staff.id])

  const staffBalances = useMemo(() => {
    const map = {}
    leaveBalances
      .filter(b => b.staff_id === staff.id && b.school_year === schoolYear)
      .forEach(b => {
        const code = typeIdToCode[b.leave_type_id]
        if (code) {
          map[code] = {
            allocated: parseFloat(b.allocated) || 0,
            used: parseFloat(b.used) || 0,
            carried_over: parseFloat(b.carried_over) || 0,
          }
        }
      })
    return map
  }, [leaveBalances, staff.id, schoolYear, typeIdToCode])

  const policyMap = useMemo(() => {
    const map = {}
    leavePolicies.forEach(p => {
      const code = typeIdToCode[p.leave_type_id]
      if (code) {
        map[code] = {
          allocated: parseFloat(p.allocated_amount) || 0,
          unit: p.tracking_unit,
        }
      }
    })
    return map
  }, [leavePolicies, typeIdToCode])

  const staffProtectedPeriods = useMemo(() => {
    return protectedPeriods.filter(p => p.staff_id === staff.id && p.status === 'active')
  }, [protectedPeriods, staff.id])

  const entitlementHours = staff.contract_days > 0 ? +((staff.contract_days / 260) * 480).toFixed(0) : 0

  const schoolLeaveTypes = leaveTypes.filter(lt => lt.category === 'school_provided')
  const protectedLeaveTypes = leaveTypes.filter(lt => lt.category === 'federal' || lt.category === 'state')

  const recentActivity = useMemo(() => {
    const items = []
    Object.entries(staffEvents).forEach(([date, events]) => {
      events.forEach(e => {
        items.push({ date, code: e.code, hours: e.hours })
      })
    })
    items.sort((a, b) => b.date.localeCompare(a.date))
    return items.slice(0, 10)
  }, [staffEvents])

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid #e2e4e9', borderRadius: 6, padding: '6px 12px',
          cursor: 'pointer', fontSize: 13, color: '#2c3e7e', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← Back to Grid
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2c3e7e' }}>{staff.full_name}</h2>
          <div style={{ fontSize: 13, color: '#666' }}>
            {staff.position || 'Staff'}{staff.building ? ` · ${staff.building}` : ''}
            {staff.hire_date ? ` · Hired ${new Date(staff.hire_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          </div>
        </div>
        {staff.contract_days > 0 && (
          <div style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: '#dbeafe', color: '#1e40af',
          }}>
            {staff.contract_days}-day contract
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>
        <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={prevMonth} style={navBtn}>‹</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2c3e7e' }}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button onClick={nextMonth} style={navBtn}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#666',
                padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calendarDays.map((cd, i) => {
              const dateStr = fmtDate(cd.date)
              const events = staffEvents[dateStr] || []
              const isWeekend = cd.date.getDay() === 0 || cd.date.getDay() === 6
              const isConcurrent = events.length > 1
              const isToday = dateStr === fmtDate(today)

              let cellBg = '#fff'
              if (!cd.inMonth) cellBg = '#f9fafb'
              else if (isWeekend) cellBg = '#fafbfc'
              else if (events.length > 0) {
                cellBg = isConcurrent
                  ? 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)'
                  : (LEAVE_DISPLAY[events[0].code]?.bg || '#f3f4f6')
              }

              return (
                <div key={i} style={{
                  minHeight: 64, borderRadius: 6, padding: '4px 6px',
                  background: cellBg,
                  border: isToday ? '2px solid #f3843e' : '1px solid #f0f1f3',
                  opacity: cd.inMonth ? 1 : 0.35,
                  position: 'relative',
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#f3843e' : events.length > 0 ? '#2c3e7e' : '#94a3b8',
                    marginBottom: 3,
                  }}>
                    {cd.date.getDate()}
                  </div>
                  {events.length > 0 && !isWeekend && cd.inMonth && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {events.map(e => (
                        <LeaveChip key={e.code} code={e.code} hours={e.hours} compact />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2c3e7e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              School-Provided Leave
            </div>
            {schoolLeaveTypes.map(lt => {
              const display = LEAVE_DISPLAY[lt.code] || DEFAULT_DISPLAY
              const balance = staffBalances[lt.code]
              const policy = policyMap[lt.code]
              const allocated = balance?.allocated || policy?.allocated || 0
              const used = balance?.used || 0
              const unit = lt.tracking_unit === 'hours' ? 'hrs' : 'days'
              const pct = allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0
              return (
                <div key={lt.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: display.fg }}>{lt.name}</span>
                    <span style={{ color: '#666' }}>{used} / {allocated} {unit}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#f0f1f3', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 3, background: display.dot,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )
            })}
            {schoolLeaveTypes.length === 0 && (
              <div style={{ fontSize: 12, color: '#999' }}>No school-provided leave types configured</div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2c3e7e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Protected Leave (Hours)
            </div>
            {protectedLeaveTypes.map(lt => {
              const display = LEAVE_DISPLAY[lt.code] || DEFAULT_DISPLAY
              const period = staffProtectedPeriods.find(p => p.leave_type_id === lt.id)
              const used = period ? parseFloat(period.hours_used) || 0 : 0
              const entitlement = period ? parseFloat(period.prorated_entitlement_hours) || entitlementHours : entitlementHours
              const pct = entitlement > 0 ? Math.min(100, (used / entitlement) * 100) : 0
              return (
                <div key={lt.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: display.fg }}>{lt.name}</span>
                    <span style={{ color: '#666' }}>{used} / {entitlement} hrs</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#f0f1f3', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 3, background: display.dot,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  {period && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      Period: {new Date(period.period_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – {new Date(period.period_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )
            })}
            {entitlementHours > 0 && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, borderTop: '1px solid #f0f1f3', paddingTop: 6 }}>
                Prorated: {staff.contract_days}/260 days = {entitlementHours} hrs entitlement
              </div>
            )}
            {protectedLeaveTypes.length === 0 && (
              <div style={{ fontSize: 12, color: '#999' }}>No protected leave types configured</div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2c3e7e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Recent Activity
            </div>
            {recentActivity.length === 0 ? (
              <div style={{ fontSize: 12, color: '#999' }}>No leave recorded yet</div>
            ) : (
              recentActivity.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid #f5f5f5' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: (LEAVE_DISPLAY[ev.code] || DEFAULT_DISPLAY).dot, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 11, color: '#2c3e7e' }}>
                      {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <LeaveChip code={ev.code} hours={ev.hours} compact />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────
function WeeklyLeaveView() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [filterBuilding, setFilterBuilding] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const [staff, setStaff] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leavePolicies, setLeavePolicies] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [leaveEntries, setLeaveEntries] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [timecardLeave, setTimecardLeave] = useState([])
  const [protectedPeriods, setProtectedPeriods] = useState([])

  const today = new Date()
  const currentMonday = useMemo(() => {
    const base = getMondayOfWeek(today)
    return addDays(base, weekOffset * 7)
  }, [weekOffset])
  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(currentMonday, i)), [currentMonday])
  const schoolYear = getSchoolYear(today)

  const fetchData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    try {
      const staffQuery = supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .order('full_name')

      if (profile.role === 'supervisor') {
        staffQuery.eq('supervisor_id', profile.id)
      }

      const { data: staffData } = await staffQuery

      const { data: typesData } = await supabase
        .from('leave_types')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .order('sort_order')

      const { data: policiesData } = await supabase
        .from('leave_policies')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('school_year', schoolYear)

      const { data: balancesData } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('school_year', schoolYear)

      const { data: entriesData } = await supabase
        .from('leave_entries')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('school_year', schoolYear)
        .order('start_date', { ascending: false })

      const { data: requestsData } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('status', 'approved')
        .order('start_date', { ascending: false })

      const { data: timecardsData } = await supabase
        .from('timecards')
        .select(`
          id,
          staff_id,
          week_start,
          timecard_entries (
            id,
            entry_date,
            leave_type_id,
            hours
          )
        `)
        .eq('tenant_id', profile.tenant_id)

      const { data: periodsData } = await supabase
        .from('protected_leave_periods')
        .select('*')
        .eq('tenant_id', profile.tenant_id)

      setStaff(staffData || [])
      setLeaveTypes(typesData || [])
      setLeavePolicies(policiesData || [])
      setLeaveBalances(balancesData || [])
      setLeaveEntries(entriesData || [])
      setLeaveRequests(requestsData || [])
      setProtectedPeriods(periodsData || [])

      const tcLeave = []
      ;(timecardsData || []).forEach(tc => {
        ;(tc.timecard_entries || []).forEach(entry => {
          if (entry.leave_type_id) {
            tcLeave.push({
              staff_id: tc.staff_id,
              date: entry.entry_date,
              leave_type_id: entry.leave_type_id,
              hours: parseFloat(entry.hours) || 8,
            })
          }
        })
      })
      setTimecardLeave(tcLeave)
    } catch (err) {
      console.error('Error fetching weekly leave data:', err)
    } finally {
      setLoading(false)
    }
  }, [profile, schoolYear])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const typeIdToCode = useMemo(() => {
    const map = {}
    leaveTypes.forEach(lt => { map[lt.id] = lt.code })
    return map
  }, [leaveTypes])

  const allLeaveEvents = useMemo(() => {
    const map = {}

    const addEvent = (staffId, date, code, hours) => {
      const key = `${staffId}-${date}`
      if (!map[key]) map[key] = []
      if (!map[key].find(e => e.code === code)) {
        map[key].push({ code, hours })
      }
    }

    timecardLeave.forEach(e => {
      const code = typeIdToCode[e.leave_type_id]
      if (code) addEvent(e.staff_id, e.date, code, e.hours)
    })

    leaveEntries.forEach(e => {
      const code = typeIdToCode[e.leave_type_id]
      if (!code) return
      const start = new Date(e.start_date + 'T00:00:00')
      const end = e.end_date ? new Date(e.end_date + 'T00:00:00') : start
      let current = new Date(start)
      while (current <= end) {
        const dow = current.getDay()
        if (dow >= 1 && dow <= 5) {
          addEvent(e.staff_id, fmtDate(current), code, parseFloat(e.amount) || 8)
          if (e.concurrent_leave_type_id) {
            const concCode = typeIdToCode[e.concurrent_leave_type_id]
            if (concCode) addEvent(e.staff_id, fmtDate(current), concCode, parseFloat(e.amount) || 8)
          }
        }
        current = addDays(current, 1)
      }
    })

    leaveRequests.forEach(r => {
      const code = typeIdToCode[r.leave_type_id]
      if (!code) return
      const start = new Date(r.start_date + 'T00:00:00')
      const end = new Date(r.end_date + 'T00:00:00')
      let current = new Date(start)
      const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1)
      const dailyHours = parseFloat(r.total_hours) / totalDays || 8
      while (current <= end) {
        const dow = current.getDay()
        if (dow >= 1 && dow <= 5) {
          addEvent(r.staff_id, fmtDate(current), code, dailyHours)
        }
        current = addDays(current, 1)
      }
    })

    return map
  }, [timecardLeave, leaveEntries, leaveRequests, typeIdToCode])

  const filteredStaff = useMemo(() => {
    let s = staff.filter(p => p.role === 'staff' || p.role === 'supervisor')
    if (filterBuilding && filterBuilding !== 'all') {
      s = s.filter(p => p.building === filterBuilding)
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      s = s.filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q)
      )
    }
    return s
  }, [staff, filterBuilding, searchTerm])

  const buildings = useMemo(() => {
    const set = new Set()
    staff.forEach(s => { if (s.building) set.add(s.building) })
    return ['all', ...Array.from(set).sort()]
  }, [staff])

  const weekStats = useMemo(() => {
    const todayStr = fmtDate(today)
    const staffOutToday = new Set()
    let totalLeaveHours = 0
    let concurrentDays = 0

    weekDates.forEach(d => {
      const dateStr = fmtDate(d)
      filteredStaff.forEach(s => {
        const events = allLeaveEvents[`${s.id}-${dateStr}`]
        if (events && events.length > 0) {
          if (dateStr === todayStr) staffOutToday.add(s.id)
          totalLeaveHours += events[0].hours || 8
          if (events.length > 1) concurrentDays++
        }
      })
    })

    return {
      staffOutToday: staffOutToday.size,
      totalLeaveHours,
      concurrentDays,
      staffTracked: filteredStaff.length,
    }
  }, [weekDates, filteredStaff, allLeaveEvents])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Loading Weekly Leave View...</div>
          <div style={{ fontSize: 13 }}>Fetching staff and leave data</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {selectedStaff ? (
          <StaffCalendar
            staff={selectedStaff}
            allLeaveEvents={allLeaveEvents}
            leaveTypes={leaveTypes}
            leaveBalances={leaveBalances}
            leavePolicies={leavePolicies}
            protectedPeriods={protectedPeriods}
            typeIdToCode={typeIdToCode}
            schoolYear={schoolYear}
            onBack={() => setSelectedStaff(null)}
          />
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#2c3e7e' }}>Weekly Leave View</h1>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>
                  {profile.role === 'supervisor' ? 'Your assigned staff' : 'All staff'} — Click any row to view their calendar and balances
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex', alignItems: 'center', background: '#fff',
                borderRadius: 8, border: '1px solid #e2e4e9', overflow: 'hidden',
              }}>
                <button onClick={() => setWeekOffset(o => o - 1)} style={weekNavBtn}>‹</button>
                <div style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#2c3e7e',
                  minWidth: 180, textAlign: 'center', borderLeft: '1px solid #e2e4e9', borderRight: '1px solid #e2e4e9',
                }}>
                  {getWeekRange(currentMonday)}
                </div>
                <button onClick={() => setWeekOffset(o => o + 1)} style={weekNavBtn}>›</button>
              </div>

              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: weekOffset === 0 ? '#2c3e7e' : '#fff',
                  color: weekOffset === 0 ? '#fff' : '#2c3e7e',
                  border: `1px solid ${weekOffset === 0 ? '#2c3e7e' : '#e2e4e9'}`,
                }}
              >
                This Week
              </button>

              <div style={{ flex: 1 }} />

              <select
                value={filterBuilding}
                onChange={e => setFilterBuilding(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e4e9',
                  fontSize: 12, color: '#2c3e7e', background: '#fff', cursor: 'pointer',
                }}
              >
                {buildings.map(b => (
                  <option key={b} value={b}>{b === 'all' ? 'All Buildings' : b}</option>
                ))}
              </select>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 32px', borderRadius: 6, border: '1px solid #e2e4e9',
                    fontSize: 12, width: 180, outline: 'none', color: '#2c3e7e',
                  }}
                />
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: '#94a3b8',
                }}>⌕</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Staff Out Today', value: weekStats.staffOutToday, accent: '#f3843e' },
                { label: 'Leave Hours This Week', value: Math.round(weekStats.totalLeaveHours * 100) / 100, accent: '#477fc1' },
                { label: 'Concurrent Leave Days', value: weekStats.concurrentDays, accent: '#0d9488' },
                { label: 'Staff Tracked', value: weekStats.staffTracked, accent: '#2c3e7e' },
              ].map((card, i) => (
                <div key={i} style={{
                  background: '#fff', borderRadius: 8, padding: '14px 16px',
                  borderLeft: `4px solid ${card.accent}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#2c3e7e' }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {filteredStaff.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No staff found</div>
                  <div style={{ fontSize: 13 }}>
                    {searchTerm || filterBuilding !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No staff are assigned to you yet'}
                  </div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#2c3e7e' }}>
                      <th style={{ ...thStyle, width: 200, textAlign: 'left', paddingLeft: 16 }}>Staff Member</th>
                      {weekDates.map((d, i) => (
                        <th key={i} style={{ ...thStyle, width: '15%' }}>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>{DAYS[i]}</div>
                          <div style={{ fontSize: 13 }}>{fmtShort(d)}</div>
                        </th>
                      ))}
                      <th style={{ ...thStyle, width: 80 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((s, si) => {
                      let weekLeaveHours = 0
                      const rowCells = weekDates.map((d, di) => {
                        const dateStr = fmtDate(d)
                        const events = allLeaveEvents[`${s.id}-${dateStr}`] || []
                        const dayHours = events.length > 0 ? (events[0].hours || 8) : 0
                        if (dayHours > 0) weekLeaveHours += dayHours
                        const isConcurrent = events.length > 1
                        const isToday = dateStr === fmtDate(today)
                        return (
                          <td key={di} style={{
                            ...tdStyle,
                            background: events.length > 0
                              ? isConcurrent
                                ? 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)'
                                : (LEAVE_DISPLAY[events[0].code]?.bg || '#f3f4f6') + '66'
                              : si % 2 === 0 ? '#fff' : '#fafbfc',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            borderLeft: isToday ? '2px solid #f3843e' : 'none',
                            borderRight: isToday ? '2px solid #f3843e' : 'none',
                          }}>
                            {events.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                {events.map(e => (
                                  <LeaveChip key={e.code} code={e.code} hours={dayHours} compact />
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        )
                      })
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedStaff(s)}
                          style={{
                            cursor: 'pointer',
                            background: si % 2 === 0 ? '#fff' : '#fafbfc',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                          onMouseLeave={e => e.currentTarget.style.background = si % 2 === 0 ? '#fff' : '#fafbfc'}
                        >
                          <td style={{ ...tdStyle, paddingLeft: 16 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#2c3e7e' }}>{s.full_name}</div>
                            <div style={{ fontSize: 11, color: '#666' }}>
                              {s.position || 'Staff'}{s.building ? ` · ${s.building}` : ''}
                            </div>
                          </td>
                          {rowCells}
                          <td style={{
                            ...tdStyle,
                            textAlign: 'center',
                            fontWeight: weekLeaveHours > 0 ? 700 : 400,
                            color: weekLeaveHours >= 40 ? '#dc2626' : weekLeaveHours > 0 ? '#2c3e7e' : '#cbd5e1',
                            fontSize: 13,
                          }}>
                {weekLeaveHours > 0 ? `${Math.round(weekLeaveHours * 100) / 100}h` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingLeft: 4 }}>
              {leaveTypes.map(lt => {
                const display = LEAVE_DISPLAY[lt.code] || DEFAULT_DISPLAY
                return (
                  <div key={lt.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: display.dot, display: 'inline-block' }} />
                    {lt.name}
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', marginLeft: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 3, display: 'inline-block',
                  background: 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)',
                  border: '1px solid #e5e7eb',
                }} />
                Concurrent leave
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WeeklyLeaveView
