import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// ─── Brand Colors ──────────────────────────────────────────────────────────
const C = {
  navy:      '#2c3e7e',
  blue:      '#477fc1',
  orange:    '#f3843e',
  gray:      '#666666',
  lightGray: '#f7f8fa',
  white:     '#ffffff',
  green:     '#16a34a',
  red:       '#dc2626',
  amber:     '#d97706',
  teal:      '#0d9488',
}

// ─── Leave type display config keyed by leave_types.code ──────────────────
// Covers both the standard codes used in leave_types and concurrent_leave text
const LEAVE_CONFIG = {
  sick:             { name: 'Sick Leave',            short: 'SK',  bg: '#dbeafe', fg: '#1e40af', dot: '#3b82f6' },
  personal:         { name: 'Personal Days',         short: 'PD',  bg: '#ede9fe', fg: '#5b21b6', dot: '#8b5cf6' },
  bereavement:      { name: 'Bereavement',           short: 'BV',  bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' },
  oregon_sick:      { name: 'Oregon Sick Time',      short: 'ORS', bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b' },
  fmla:             { name: 'FMLA',                  short: 'FM',  bg: '#d1fae5', fg: '#065f46', dot: '#10b981' },
  ofla:             { name: 'OFLA',                  short: 'OF',  bg: '#ccfbf1', fg: '#115e59', dot: '#14b8a6' },
  plo:              { name: 'Paid Leave Oregon',     short: 'PLO', bg: '#fce7f3', fg: '#9d174d', dot: '#ec4899' },
  // Fallback for unknown codes
  unknown:          { name: 'Leave',                 short: 'LV',  bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af' },
}

function getLeaveConfig(code) {
  if (!code) return LEAVE_CONFIG.unknown
  const normalized = code.toLowerCase().replace(/[- ]/g, '_')
  return LEAVE_CONFIG[normalized] || LEAVE_CONFIG.unknown
}

// ─── Unit conversion helpers ───────────────────────────────────────────────
const HOURS_PER_DAY  = 8
const HOURS_PER_WEEK = 40

function toHours(amount, unit) {
  const n = parseFloat(amount) || 0
  if (unit === 'hours') return n
  if (unit === 'days')  return n * HOURS_PER_DAY
  if (unit === 'weeks') return n * HOURS_PER_WEEK
  return n
}

// ─── Date helpers ──────────────────────────────────────────────────────────
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function getMondayOfCurrentWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtDate(d) {
  // Returns YYYY-MM-DD in local time
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

// Given a leave entry's start/end dates and amount/unit,
// expand it into individual dates with per-day hours.
// Returns array of { date: 'YYYY-MM-DD', hours: number }
function expandEntryToDays(entry) {
  const start = new Date(entry.start_date + 'T00:00:00')
  const end   = new Date(entry.end_date   + 'T00:00:00')
  const totalHours = toHours(entry.amount, entry.tracking_unit)

  // Count weekdays in range to distribute hours evenly
  let weekdays = 0
  const d = new Date(start)
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) weekdays++
    d.setDate(d.getDate() + 1)
  }
  if (weekdays === 0) return []

  const hoursPerDay = totalHours / weekdays
  const days = []
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) {
      days.push({ date: fmtDate(cur), hours: hoursPerDay })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// ─── Leave Chip ────────────────────────────────────────────────────────────
function LeaveChip({ code, hours, compact = false }) {
  const lt = getLeaveConfig(code)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: compact ? 2 : 4,
      padding: compact ? '1px 6px' : '2px 8px', borderRadius: 4,
      fontSize: compact ? 10 : 11, fontWeight: 600,
      background: lt.bg, color: lt.fg,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {lt.short}
      {hours != null && (
        <span style={{ fontWeight: 400, opacity: 0.8, fontSize: compact ? 9 : 10 }}>
          {Math.round(hours * 10) / 10}h
        </span>
      )}
    </span>
  )
}

// ─── Shared table styles ───────────────────────────────────────────────────
const thStyle = {
  padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#fff',
  textAlign: 'center', borderBottom: 'none',
}
const tdStyle = {
  padding: '10px 8px', borderBottom: '1px solid #f0f1f3', fontSize: 13,
}
const weekNavBtn = {
  background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer',
  fontSize: 16, color: C.navy, fontWeight: 600,
}
const navBtn = {
  background: 'none', border: '1px solid #e2e4e9', borderRadius: 6,
  width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: C.navy,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ─── Weekly Grid ───────────────────────────────────────────────────────────
function WeeklyLeaveGrid({ weekStart, staff, leaveEventsByStaffDate, leaveTypesByCode, onSelectStaff, filterBuilding, searchTerm }) {
  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart])

  const filteredStaff = useMemo(() => {
    let s = [...staff]
    if (filterBuilding && filterBuilding !== 'all') {
      s = s.filter(st => (st.building || '') === filterBuilding)
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      s = s.filter(st =>
        (st.full_name || '').toLowerCase().includes(q) ||
        (st.position || '').toLowerCase().includes(q)
      )
    }
    return s
  }, [staff, filterBuilding, searchTerm])

  // Summary stats
  const today = fmtDate(new Date())

  const staffOutToday = useMemo(() => {
    const ids = new Set()
    staff.forEach(st => {
      const key = `${st.id}-${today}`
      if (leaveEventsByStaffDate[key]?.length > 0) ids.add(st.id)
    })
    return ids.size
  }, [staff, leaveEventsByStaffDate, today])

  const eventsThisWeek = useMemo(() => {
    const map = {}
    filteredStaff.forEach(st => {
      weekDates.forEach(d => {
        const key = `${st.id}-${fmtDate(d)}`
        if (leaveEventsByStaffDate[key]) map[key] = leaveEventsByStaffDate[key]
      })
    })
    return map
  }, [filteredStaff, weekDates, leaveEventsByStaffDate])

  const totalLeaveHours = useMemo(() => {
    let total = 0
    Object.values(eventsThisWeek).forEach(evs => {
      // Sum unique leave type hours (avoid double-counting concurrent)
      const seen = new Set()
      evs.forEach(e => {
        if (!seen.has(e.entryId)) { total += e.hours; seen.add(e.entryId) }
      })
    })
    return Math.round(total * 10) / 10
  }, [eventsThisWeek])

  const concurrentCount = useMemo(() => {
    let count = 0
    Object.values(eventsThisWeek).forEach(evs => {
      const types = new Set(evs.map(e => e.code))
      if (types.size > 1) count++
    })
    return count
  }, [eventsThisWeek])

  if (filteredStaff.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.gray }}>
        No staff found{filterBuilding !== 'all' ? ` in ${filterBuilding}` : ''}{searchTerm ? ` matching "${searchTerm}"` : ''}.
      </div>
    )
  }

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Staff Out Today',        value: staffOutToday,        accent: C.orange },
          { label: 'Leave Hours This Week',  value: totalLeaveHours,      accent: C.blue   },
          { label: 'Concurrent Leave Days',  value: concurrentCount,      accent: C.teal   },
          { label: 'Staff Tracked',          value: filteredStaff.length, accent: C.navy   },
        ].map((card, i) => (
          <div key={i} style={{
            background: C.white, borderRadius: 8, padding: '14px 16px',
            borderLeft: `4px solid ${card.accent}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.navy }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ background: C.white, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.navy }}>
              <th style={{ ...thStyle, width: 200, textAlign: 'left', paddingLeft: 16 }}>Staff Member</th>
              {weekDates.map((d, i) => {
                const isToday = fmtDate(d) === today
                return (
                  <th key={i} style={{ ...thStyle, width: '15%' }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{DAYS[i]}</div>
                    <div style={{
                      fontSize: 13,
                      background: isToday ? 'rgba(243,132,62,0.4)' : 'none',
                      borderRadius: 4, padding: '1px 4px', display: 'inline-block'
                    }}>{fmtShort(d)}</div>
                  </th>
                )
              })}
              <th style={{ ...thStyle, width: 80 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.map((st, si) => {
              let weekLeaveHours = 0
              const rowCells = weekDates.map((d, di) => {
                const key = `${st.id}-${fmtDate(d)}`
                const events = eventsThisWeek[key] || []
                const uniqueCodes = [...new Set(events.map(e => e.code))]
                const isConcurrent = uniqueCodes.length > 1
                const dayHours = events.length > 0 ? events[0].hours : 0
                if (dayHours > 0) weekLeaveHours += dayHours

                return (
                  <td key={di} style={{
                    ...tdStyle,
                    background: events.length > 0
                      ? isConcurrent
                        ? 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)'
                        : (getLeaveConfig(uniqueCodes[0])?.bg + '44')
                      : si % 2 === 0 ? C.white : '#fafbfc',
                    textAlign: 'center', verticalAlign: 'middle',
                  }}>
                    {events.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        {uniqueCodes.map(code => (
                          <LeaveChip key={code} code={code} hours={dayHours} compact />
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
                  key={st.id}
                  onClick={() => onSelectStaff(st)}
                  style={{ cursor: 'pointer', background: si % 2 === 0 ? C.white : '#fafbfc', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = si % 2 === 0 ? C.white : '#fafbfc'}
                >
                  <td style={{ ...tdStyle, paddingLeft: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.navy }}>{st.full_name}</div>
                    <div style={{ fontSize: 11, color: C.gray }}>{st.position || ''}{st.building ? ` · ${st.building}` : ''}</div>
                  </td>
                  {rowCells}
                  <td style={{
                    ...tdStyle, textAlign: 'center',
                    fontWeight: weekLeaveHours > 0 ? 700 : 400,
                    color: weekLeaveHours >= 40 ? C.red : weekLeaveHours > 0 ? C.navy : '#cbd5e1',
                    fontSize: 13,
                  }}>
                    {weekLeaveHours > 0 ? `${Math.round(weekLeaveHours * 10) / 10}h` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingLeft: 4 }}>
        {Object.entries(LEAVE_CONFIG).filter(([k]) => k !== 'unknown').map(([code, lt]) => (
          <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.gray }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: lt.dot, display: 'inline-block' }} />
            {lt.name}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.gray, marginLeft: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 3, display: 'inline-block',
            background: 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)',
            border: '1px solid #e5e7eb',
          }} />
          Concurrent leave
        </div>
      </div>
    </div>
  )
}

// ─── Staff Calendar Drill-Down ─────────────────────────────────────────────
function StaffCalendar({ staff, allLeaveEvents, leaveBalances, leavePolicies, protectedPeriods, onBack }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const today = fmtDate(new Date())

  // Build per-date event map for this staff member
  const staffDateMap = useMemo(() => {
    const map = {}
    allLeaveEvents
      .filter(e => e.staffId === staff.id)
      .forEach(e => {
        if (!map[e.date]) map[e.date] = []
        map[e.date].push(e)
      })
    return map
  }, [allLeaveEvents, staff.id])

  // Calendar grid
  const calendarDays = useMemo(() => {
    const year  = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const startPad = (firstDay.getDay() + 6) % 7 // Mon=0
    const days = []
    for (let i = 0; i < startPad; i++) days.push({ date: addDays(firstDay, -(startPad - i)), inMonth: false })
    for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), inMonth: true })
    const remaining = 7 - (days.length % 7)
    if (remaining < 7) for (let i = 1; i <= remaining; i++) days.push({ date: addDays(lastDay, i), inMonth: false })
    return days
  }, [viewMonth])

  // All leave events for this staff member as a flat list for Recent Activity
  const staffEvents = useMemo(() => {
    return allLeaveEvents
      .filter(e => e.staffId === staff.id)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [allLeaveEvents, staff.id])

  const contractDays = staff.contract_days || 260
  const fmlaEntitlement = Math.round((contractDays / 260) * 480)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid #e2e4e9', borderRadius: 6, padding: '6px 12px',
          cursor: 'pointer', fontSize: 13, color: C.navy,
        }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.navy }}>{staff.full_name}</h2>
          <div style={{ fontSize: 13, color: C.gray }}>
            {[staff.position, staff.building].filter(Boolean).join(' · ')}
          </div>
        </div>
        {contractDays > 0 && (
          <div style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#dbeafe', color: '#1e40af' }}>
            {contractDays}-day contract
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>
        {/* Calendar */}
        <div style={{ background: C.white, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} style={navBtn}>‹</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} style={navBtn}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.gray, padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calendarDays.map((cd, i) => {
              const dateStr = fmtDate(cd.date)
              const events = staffDateMap[dateStr] || []
              const isWeekend = cd.date.getDay() === 0 || cd.date.getDay() === 6
              const uniqueCodes = [...new Set(events.map(e => e.code))]
              const isConcurrent = uniqueCodes.length > 1
              const isToday = dateStr === today

              return (
                <div key={i} style={{
                  minHeight: 64, borderRadius: 6, padding: '4px 6px',
                  background: !cd.inMonth ? '#f9fafb'
                    : isWeekend    ? '#fafbfc'
                    : events.length > 0
                      ? isConcurrent
                        ? 'linear-gradient(135deg, #fef3c7 0%, #d1fae5 100%)'
                        : getLeaveConfig(uniqueCodes[0])?.bg
                      : C.white,
                  border: isToday ? `2px solid ${C.orange}` : '1px solid #f0f1f3',
                  opacity: cd.inMonth ? 1 : 0.35,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 500,
                    color: isToday ? C.orange : events.length > 0 ? C.navy : '#94a3b8',
                    marginBottom: 3,
                  }}>
                    {cd.date.getDate()}
                  </div>
                  {events.length > 0 && !isWeekend && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {uniqueCodes.map(code => (
                        <LeaveChip key={code} code={code} hours={events[0].hours} compact />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar: Balances + Recent Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* School-Provided Leave Balances */}
          {leaveBalances.length > 0 && (
            <div style={{ background: C.white, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                Leave Balances
              </div>
              {leaveBalances.map(b => {
                const cfg = getLeaveConfig(b.code)
                const alloc  = parseFloat(b.allocated) || 0
                const used   = parseFloat(b.used) || 0
                const remaining = Math.max(0, alloc - used)
                const pct = alloc > 0 ? Math.min(100, (used / alloc) * 100) : 0
                const unit = b.tracking_unit || 'days'
                return (
                  <div key={b.leave_type_id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: cfg.fg }}>{b.leave_type_name || cfg.name}</span>
                      <span style={{ color: C.gray }}>{remaining} / {alloc} {unit}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: '#f0f1f3', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: cfg.dot, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Protected Leave Periods */}
          {protectedPeriods.length > 0 && (
            <div style={{ background: C.white, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                Protected Leave
              </div>
              {protectedPeriods.map((p, i) => {
                const cfg = getLeaveConfig(p.code)
                const used = parseFloat(p.hours_used) || 0
                const entitlement = parseFloat(p.base_entitlement_hours) || fmlaEntitlement
                const remaining = Math.max(0, entitlement - used)
                const pct = entitlement > 0 ? Math.min(100, (used / entitlement) * 100) : 0
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: cfg.fg }}>{p.leave_type_name || cfg.name}</span>
                      <span style={{ color: C.gray }}>{remaining} / {entitlement} hrs</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: '#f0f1f3', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: cfg.dot, transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {p.period_start_date} – {p.period_end_date}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent Leave Activity */}
          <div style={{ background: C.white, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Recent Leave
            </div>
            {staffEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: C.gray }}>No leave entries found.</div>
            ) : (
              // Dedupe by entry to avoid one row per expanded day
              [...new Map(staffEvents.map(e => [e.entryId, e])).values()].slice(0, 8).map((ev, i, arr) => (
                <div key={ev.entryId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid #f5f5f5' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: getLeaveConfig(ev.code)?.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.navy }}>{ev.startDate}</span>
                  </div>
                  <LeaveChip code={ev.code} hours={ev.totalHours} compact />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function WeeklyLeaveView() {
  const { profile, isAdmin, isHR, isSupervisor } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Data from Supabase
  const [staff,          setStaff]          = useState([])
  const [allLeaveEvents, setAllLeaveEvents] = useState([])  // flat expanded day events
  const [staffBalances,  setStaffBalances]  = useState({})  // staffId → [balances]
  const [staffProtected, setStaffProtected] = useState({})  // staffId → [periods]

  // UI state
  const baseMonday           = useMemo(() => getMondayOfCurrentWeek(), [])
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [filterBuilding, setFilterBuilding] = useState('all')
  const [searchTerm,    setSearchTerm]    = useState('')

  const currentMonday = useMemo(() => addDays(baseMonday, weekOffset * 7), [baseMonday, weekOffset])

  // ── Fetch all data ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)

    try {
      const tenantId = profile.tenant_id

      // 1. Fetch staff (supervisor sees only their assigned staff)
      let staffQuery = supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('full_name')

      if (isSupervisor && !isAdmin && !isHR) {
        staffQuery = staffQuery.eq('supervisor_id', profile.id)
      }

      const { data: staffData, error: staffErr } = await staffQuery
      if (staffErr) throw staffErr

      const staffList = staffData || []
      setStaff(staffList)

      if (staffList.length === 0) {
        setLoading(false)
        return
      }

      const staffIds = staffList.map(s => s.id)

      // 2. Fetch leave types for this tenant
      const { data: leaveTypesData, error: ltErr } = await supabase
        .from('leave_types')
        .select('id, name, code, category, tracking_unit')
        .eq('tenant_id', tenantId)
      if (ltErr) throw ltErr

      const leaveTypeById   = {}
      const leaveTypeByName = {} // fallback lookup by name
      ;(leaveTypesData || []).forEach(lt => {
        leaveTypeById[lt.id]   = lt
        leaveTypeByName[(lt.name || '').toLowerCase()] = lt
      })

      // Helper: resolve a leave_entries row to a code
      const resolveCode = (entry) => {
        // Prefer leave_type_id FK
        if (entry.leave_type_id && leaveTypeById[entry.leave_type_id]) {
          return leaveTypeById[entry.leave_type_id].code
        }
        // Fall back to leave_type text field
        if (entry.leave_type) {
          const norm = entry.leave_type.toLowerCase()
          if (leaveTypeByName[norm]) return leaveTypeByName[norm].code
          // Try partial match
          for (const [name, lt] of Object.entries(leaveTypeByName)) {
            if (norm.includes(name) || name.includes(norm)) return lt.code
          }
          // Direct use if it looks like a code already
          return norm.replace(/[- ]/g, '_')
        }
        return 'unknown'
      }

      // 3. Fetch leave_entries for all staff in this tenant
      const { data: entriesData, error: entErr } = await supabase
        .from('leave_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('staff_id', staffIds)
      if (entErr) throw entErr

      // 4. Expand entries into per-day events
      const expandedEvents = []
      ;(entriesData || []).forEach(entry => {
        const code      = resolveCode(entry)
        const totalHours = toHours(entry.amount, entry.tracking_unit)
        const days      = expandEntryToDays(entry)
        days.forEach(({ date, hours }) => {
          expandedEvents.push({
            entryId:    entry.id,
            staffId:    entry.staff_id,
            date,
            code,
            hours,
            totalHours,
            startDate:  entry.start_date,
            endDate:    entry.end_date,
          })
        })
        // Also track concurrent leave if present
        if (entry.concurrent_leave) {
          // concurrent_leave is a text field (e.g. "FMLA"), map it too
          const concNorm = (entry.concurrent_leave || '').toLowerCase()
          let concCode   = null
          if (leaveTypeByName[concNorm]) {
            concCode = leaveTypeByName[concNorm].code
          } else {
            for (const [name, lt] of Object.entries(leaveTypeByName)) {
              if (concNorm.includes(name) || name.includes(concNorm)) { concCode = lt.code; break }
            }
          }
          if (concCode && concCode !== code) {
            days.forEach(({ date, hours }) => {
              expandedEvents.push({
                entryId:   `${entry.id}-conc`,
                staffId:   entry.staff_id,
                date,
                code:      concCode,
                hours,
                totalHours,
                startDate: entry.start_date,
                endDate:   entry.end_date,
              })
            })
          }
        }
      })
      setAllLeaveEvents(expandedEvents)

      // 5. Fetch leave balances for all staff
      const { data: balData, error: balErr } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('staff_id', staffIds)
      if (balErr) throw balErr

      const balMap = {}
      ;(balData || []).forEach(b => {
        const lt = leaveTypeById[b.leave_type_id]
        if (!balMap[b.staff_id]) balMap[b.staff_id] = []
        balMap[b.staff_id].push({
          ...b,
          code:            lt?.code || 'unknown',
          leave_type_name: lt?.name || '',
          tracking_unit:   lt?.tracking_unit || b.tracking_unit || 'days',
        })
      })
      setStaffBalances(balMap)

      // 6. Fetch protected leave periods for all staff
      const { data: ppData, error: ppErr } = await supabase
        .from('protected_leave_periods')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('staff_id', staffIds)
      if (ppErr) throw ppErr

      const ppMap = {}
      ;(ppData || []).forEach(p => {
        const lt = leaveTypeById[p.leave_type_id]
        if (!ppMap[p.staff_id]) ppMap[p.staff_id] = []
        ppMap[p.staff_id].push({
          ...p,
          code:            lt?.code || 'unknown',
          leave_type_name: lt?.name || '',
        })
      })
      setStaffProtected(ppMap)

    } catch (err) {
      console.error('WeeklyLeaveView fetch error:', err)
      setError(err.message || 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [profile, isAdmin, isHR, isSupervisor])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Build leaveEventsByStaffDate lookup for the grid ────────────────────
  const leaveEventsByStaffDate = useMemo(() => {
    const map = {}
    allLeaveEvents.forEach(ev => {
      const key = `${ev.staffId}-${ev.date}`
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [allLeaveEvents])

  // ── Buildings list for filter dropdown ───────────────────────────────────
  const buildings = useMemo(() => {
    const set = new Set(staff.map(s => s.building).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [staff])

  // ── Staff detail data ─────────────────────────────────────────────────────
  const selectedBalances  = selectedStaff ? (staffBalances[selectedStaff.id]  || []) : []
  const selectedProtected = selectedStaff ? (staffProtected[selectedStaff.id] || []) : []

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center', color: C.gray }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Loading leave data…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center', color: C.red }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, marginBottom: 12 }}>{error}</div>
          <button onClick={fetchData} style={{ padding: '8px 16px', borderRadius: 6, background: C.navy, color: C.white, border: 'none', cursor: 'pointer', fontSize: 13 }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>

        {selectedStaff ? (
          <StaffCalendar
            staff={selectedStaff}
            allLeaveEvents={allLeaveEvents}
            leaveBalances={selectedBalances}
            leavePolicies={[]}
            protectedPeriods={selectedProtected}
            onBack={() => setSelectedStaff(null)}
          />
        ) : (
          <>
            {/* Page Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.navy }}>Weekly Leave View</h1>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: C.gray }}>
                  All staff — Click any row to view their calendar and balances
                </p>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* Week navigator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0, background: C.white,
                borderRadius: 8, border: '1px solid #e2e4e9', overflow: 'hidden',
              }}>
                <button onClick={() => setWeekOffset(o => o - 1)} style={weekNavBtn}>‹</button>
                <div style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, color: C.navy,
                  minWidth: 200, textAlign: 'center',
                  borderLeft: '1px solid #e2e4e9', borderRight: '1px solid #e2e4e9',
                }}>
                  {getWeekRange(currentMonday)}
                </div>
                <button onClick={() => setWeekOffset(o => o + 1)} style={weekNavBtn}>›</button>
              </div>

              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: weekOffset === 0 ? C.navy : C.white,
                  color: weekOffset === 0 ? C.white : C.navy,
                  border: `1px solid ${weekOffset === 0 ? C.navy : '#e2e4e9'}`,
                }}
              >
                This Week
              </button>

              <div style={{ flex: 1 }} />

              {/* Building filter */}
              <select
                value={filterBuilding}
                onChange={e => setFilterBuilding(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e4e9', fontSize: 12, color: C.navy, background: C.white, cursor: 'pointer' }}
              >
                {buildings.map(b => (
                  <option key={b} value={b}>{b === 'all' ? 'All Buildings' : b}</option>
                ))}
              </select>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ padding: '8px 12px 8px 32px', borderRadius: 6, border: '1px solid #e2e4e9', fontSize: 12, width: 180, outline: 'none', color: C.navy }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8' }}>⌕</span>
              </div>
            </div>

            <WeeklyLeaveGrid
              weekStart={currentMonday}
              staff={staff}
              leaveEventsByStaffDate={leaveEventsByStaffDate}
              leaveTypesByCode={{}}
              onSelectStaff={setSelectedStaff}
              filterBuilding={filterBuilding}
              searchTerm={searchTerm}
            />
          </>
        )}
      </div>
    </div>
  )
}
