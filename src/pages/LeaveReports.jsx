import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const C = { navy: '#2c3e7e', orange: '#f3843e', gray: '#666666' }
const SCHOOL_YEAR = '2025-2026'

// ── CSV helpers ────────────────────────────────────────────────────────────
function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}
function toCSV(rows) { return rows.map(r => r.map(csvEscape).join(',')).join('\n') }
function downloadCSV(filename, rows) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}

function fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '' }
function fmtNum(n)  { return n != null ? parseFloat(n).toFixed(2) : '' }

export default function LeaveReports() {
  const { profile: currentProfile } = useAuth()

  const [staff,            setStaff]            = useState([])
  const [leaveTypes,       setLeaveTypes]        = useState([])
  const [leaveBalances,    setLeaveBalances]     = useState([])
  const [leaveEntries,     setLeaveEntries]      = useState([])
  const [protectedPeriods, setProtectedPeriods] = useState([])
  const [loading,          setLoading]           = useState(true)
  const [exporting,        setExporting]         = useState(null) // 'all' | staffId
  const [searchTerm,       setSearchTerm]        = useState('')
  const [selectedYear,     setSelectedYear]      = useState(SCHOOL_YEAR)

  useEffect(() => { if (currentProfile) loadData() }, [currentProfile?.id, selectedYear])

  const loadData = async () => {
    setLoading(true)
    const [
      { data: s  },
      { data: lt },
      { data: lb },
      { data: le },
      { data: pp },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('leave_types').select('*').order('sort_order'),
      supabase.from('leave_balances').select('*').eq('school_year', selectedYear),
      supabase.from('leave_entries').select('*').eq('school_year', selectedYear).order('start_date'),
      supabase.from('protected_leave_periods').select('*').order('period_start'),
    ])
    if (s)  setStaff(s)
    if (lt) setLeaveTypes(lt)
    if (lb) setLeaveBalances(lb)
    if (le) setLeaveEntries(le)
    if (pp) setProtectedPeriods(pp)
    setLoading(false)
  }

  // ── Build lookup maps ──────────────────────────────────────────────────
  const ltById   = Object.fromEntries(leaveTypes.map(t => [t.id, t]))
  const staffById = Object.fromEntries(staff.map(s => [s.id, s]))

  // Per-staff entry summary: { staffId: { leaveTypeId: { hours, count } } }
  const entrySummary = {}
  leaveEntries.forEach(e => {
    if (!entrySummary[e.staff_id]) entrySummary[e.staff_id] = {}
    if (!entrySummary[e.staff_id][e.leave_type_id]) entrySummary[e.staff_id][e.leave_type_id] = { hours: 0, count: 0 }
    const hours = e.tracking_unit === 'days' ? parseFloat(e.amount) * 8
                : e.tracking_unit === 'weeks' ? parseFloat(e.amount) * 40
                : parseFloat(e.amount)
    entrySummary[e.staff_id][e.leave_type_id].hours += hours
    entrySummary[e.staff_id][e.leave_type_id].count += 1
  })

  // Count distinct leave types used per staff (for "breadth" indicator)
  const leaveTypeBreadth = {}
  Object.entries(entrySummary).forEach(([sid, ltMap]) => {
    leaveTypeBreadth[sid] = Object.keys(ltMap).filter(ltid => entrySummary[sid][ltid].count > 0).length
  })

  // ── All-staff CSV export ───────────────────────────────────────────────
  const exportAllStaff = () => {
    setExporting('all')
    // Header row: Name, Position, Building, Contract Days, then per leave type: "TypeName (hrs used)", "TypeName (entries)", then totals
    const ltCols = leaveTypes.map(lt => lt.name)
    const header = [
      'Staff Name', 'Position', 'Building', 'Contract Days', 'Hire Date',
      ...leaveTypes.flatMap(lt => [`${lt.name} - Hrs Used`, `${lt.name} - # Entries`]),
      'Total Leave Types Used', 'Total Hours Used', 'Concurrent Leave Entries',
    ]

    const rows = [header]
    staff.forEach(person => {
      const ltData  = entrySummary[person.id] || {}
      const totalHrs  = Object.values(ltData).reduce((s, v) => s + v.hours, 0)
      const totalTypes = Object.keys(ltData).filter(id => ltData[id].count > 0).length
      // Count concurrent entries for this staff
      const concurrentCount = leaveEntries.filter(e =>
        e.staff_id === person.id && e.concurrent_leave_type_id
      ).length

      rows.push([
        person.full_name,
        person.position || '',
        person.building || '',
        person.contract_days || '',
        person.hire_date || '',
        ...leaveTypes.flatMap(lt => [
          ltData[lt.id] ? fmtNum(ltData[lt.id].hours) : '0.00',
          ltData[lt.id] ? ltData[lt.id].count : '0',
        ]),
        totalTypes,
        fmtNum(totalHrs),
        concurrentCount,
      ])
    })

    // Sort by total leave types used desc (most complex patterns first)
    const dataRows = rows.slice(1).sort((a, b) => {
      const aTypes = parseInt(a[a.length - 3]) || 0
      const bTypes = parseInt(b[b.length - 3]) || 0
      return bTypes - aTypes
    })

    downloadCSV(`leave-report-all-staff-${selectedYear}.csv`, [header, ...dataRows])
    setExporting(null)
  }

  // ── Individual staff CSV export ────────────────────────────────────────
  const exportIndividual = async (person) => {
    setExporting(person.id)

    // Dynamically load SheetJS from CDN
    let XLSX
    try {
      const script = document.createElement('script')
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
      await new Promise((resolve, reject) => {
        script.onload = resolve; script.onerror = reject
        document.head.appendChild(script)
      })
      XLSX = window.XLSX
    } catch {
      // fallback to CSV if SheetJS fails to load
      alert('Could not load Excel library. Try again or check your connection.')
      setExporting(null)
      return
    }

    const wb = XLSX.utils.book_new()

    // ── Tab 1: Summary ────────────────────────────────────────────────────
    const personEntries  = leaveEntries.filter(e => e.staff_id === person.id)
    const personBalances = leaveBalances.filter(b => b.staff_id === person.id)
    const personPeriods  = protectedPeriods.filter(p => p.staff_id === person.id)
    const totalHrsUsed   = personEntries.reduce((sum, e) => {
      const hrs = e.tracking_unit === 'days' ? parseFloat(e.amount) * 8
                : e.tracking_unit === 'weeks' ? parseFloat(e.amount) * 40
                : parseFloat(e.amount)
      return sum + hrs
    }, 0)
    const typesUsed = new Set(personEntries.map(e => e.leave_type_id)).size
    const concurrentCount = personEntries.filter(e => e.concurrent_leave_type_id).length

    const summaryData = [
      ['LEAVE REPORT', ''],
      ['Generated', new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })],
      ['School Year', selectedYear],
      ['', ''],
      ['STAFF INFORMATION', ''],
      ['Name',          person.full_name],
      ['Email',         person.email || ''],
      ['Position',      person.position || ''],
      ['Building',      person.building || ''],
      ['Hire Date',     fmtDate(person.hire_date)],
      ['Contract Days', person.contract_days || ''],
      ['', ''],
      ['LEAVE SUMMARY', ''],
      ['Total Leave Entries',     personEntries.length],
      ['Total Hours Used',        parseFloat(totalHrsUsed.toFixed(2))],
      ['Leave Types Used',        typesUsed],
      ['Concurrent Leave Entries', concurrentCount],
      ['Protected Leave Periods', personPeriods.length],
    ]
    const wsSum = XLSX.utils.aoa_to_sheet(summaryData)
    wsSum['!cols'] = [{ wch: 28 }, { wch: 35 }]
    XLSX.utils.book_append_sheet(wb, wsSum, 'Summary')

    // ── Tab 2: Leave Balances ─────────────────────────────────────────────
    const balHeader = ['Leave Type', 'Category', 'Allocated', 'Used', 'Carried Over', 'Remaining', 'Unit']
    const balRows = personBalances.length === 0
      ? [['No balance records for this school year']]
      : personBalances.map(b => {
          const lt = ltById[b.leave_type_id]
          const remaining = parseFloat(b.allocated) + parseFloat(b.carried_over || 0) - parseFloat(b.used)
          return [
            lt?.name || 'Unknown',
            lt?.category?.replace(/_/g, ' ') || '',
            parseFloat(b.allocated),
            parseFloat(b.used),
            parseFloat(b.carried_over || 0),
            parseFloat(remaining.toFixed(2)),
            b.tracking_unit || lt?.tracking_unit || 'hours',
          ]
        })
    const wsBal = XLSX.utils.aoa_to_sheet([balHeader, ...balRows])
    wsBal['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, wsBal, 'Leave Balances')

    // ── Tab 3: Leave Entries ──────────────────────────────────────────────
    const entHeader = [
      'Date Logged', 'Leave Type', 'Start Date', 'End Date',
      'Amount', 'Unit', 'Concurrent Leave',
      'Qualifying Reason', 'Qualifying Relationship', 'Family Member',
      'Documentation on File', 'Notes',
    ]
    const entRows = personEntries.length === 0
      ? [['No leave entries for this school year']]
      : personEntries.map(e => {
          const lt     = ltById[e.leave_type_id]
          const concLt = e.concurrent_leave_type_id ? ltById[e.concurrent_leave_type_id] : null
          return [
            fmtDate(e.created_at?.split('T')[0]),
            lt?.name || 'Unknown',
            fmtDate(e.start_date),
            fmtDate(e.end_date),
            parseFloat(e.amount),
            e.tracking_unit || '',
            concLt ? concLt.name : '',
            e.qualifying_reason ? e.qualifying_reason.replace(/_/g, ' ') : '',
            e.qualifying_relationship ? e.qualifying_relationship.replace(/_/g, ' ') : '',
            e.relationship_name || '',
            e.documentation_on_file ? 'Yes' : 'No',
            e.reason || '',
          ]
        })
    const wsEnt = XLSX.utils.aoa_to_sheet([entHeader, ...entRows])
    wsEnt['!cols'] = [
      { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 14 },
      { wch: 9 },  { wch: 8 },  { wch: 22 },
      { wch: 28 }, { wch: 28 }, { wch: 20 },
      { wch: 22 }, { wch: 30 },
    ]
    XLSX.utils.book_append_sheet(wb, wsEnt, 'Leave Entries')

    // ── Tab 4: Protected Leave Periods ────────────────────────────────────
    const perHeader = [
      'Leave Type', 'Period Start', 'Period End', 'Status',
      'Contract Days', 'Proration %', 'Entitlement (hrs)',
      'Hours Used', 'Hours Remaining',
      'Qualifying Reason', 'Qualifying Relationship', 'Family Member',
    ]
    const perRows = personPeriods.length === 0
      ? [['No protected leave periods on record']]
      : personPeriods.map(p => {
          const lt = ltById[p.leave_type_id]
          return [
            lt?.name || 'Unknown',
            fmtDate(p.period_start),
            fmtDate(p.period_end),
            p.status || '',
            p.contract_days || '',
            p.proration_pct != null ? parseFloat(parseFloat(p.proration_pct).toFixed(1)) : '',
            p.prorated_entitlement_hours ? parseFloat(p.prorated_entitlement_hours) : '',
            p.hours_used ? parseFloat(p.hours_used) : 0,
            p.hours_remaining ? parseFloat(p.hours_remaining) : '',
            p.qualifying_reason ? p.qualifying_reason.replace(/_/g, ' ') : '',
            p.qualifying_relationship ? p.qualifying_relationship.replace(/_/g, ' ') : '',
            p.relationship_name || '',
          ]
        })
    const wsPer = XLSX.utils.aoa_to_sheet([perHeader, ...perRows])
    wsPer['!cols'] = [
      { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 12 }, { wch: 18 },
      { wch: 12 }, { wch: 16 },
      { wch: 28 }, { wch: 28 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsPer, 'Protected Leave Periods')

    // ── Download ──────────────────────────────────────────────────────────
    const safeName = person.full_name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    XLSX.writeFile(wb, `leave-report-${safeName}-${selectedYear}.xlsx`)
    setExporting(null)
  }

  // ── Stats for the summary cards ────────────────────────────────────────
  const staffWithMultipleTypes = staff.filter(s => (leaveTypeBreadth[s.id] || 0) >= 3).length
  const staffWithConcurrent    = new Set(leaveEntries.filter(e => e.concurrent_leave_type_id).map(e => e.staff_id)).size
  const totalEntries           = leaveEntries.length

  const filteredStaff = staff.filter(p =>
    !searchTerm ||
    (p.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.position  || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:C.navy }}>Leave Reports</h1>
            <p style={{ margin:'4px 0 0', fontSize:13, color:C.gray }}>Export leave data for payroll, compliance, and pattern review</p>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, color:C.navy, background:'#fff' }}>
              <option value="2025-2026">2025–2026</option>
              <option value="2024-2025">2024–2025</option>
              <option value="2023-2024">2023–2024</option>
            </select>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginBottom:24 }}>
            {[
              { label:'Total Staff', value:staff.length, color:C.navy },
              { label:'Total Leave Entries', value:totalEntries, color:C.navy },
              { label:'Using 3+ Leave Types', value:staffWithMultipleTypes, color:C.orange,
                note:'Worth reviewing' },
              { label:'Concurrent Leave Users', value:staffWithConcurrent, color:C.orange,
                note:'FMLA/OFLA/PLO overlap' },
            ].map(card => (
              <div key={card.label} style={{ background:'#fff', borderRadius:9, padding:'14px 16px',
                boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`3px solid ${card.color}` }}>
                <div style={{ fontSize:22, fontWeight:700, color:card.color }}>{card.value}</div>
                <div style={{ fontSize:12, fontWeight:600, color:C.navy, marginTop:2 }}>{card.label}</div>
                {card.note && <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{card.note}</div>}
              </div>
            ))}
          </div>
        )}

        {/* All-staff export */}
        <div style={{ background:'#fff', borderRadius:10, padding:'18px 20px',
          boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>All-Staff Leave Summary</div>
              <div style={{ fontSize:12, color:C.gray, marginTop:3, maxWidth:520 }}>
                One row per staff member. Columns for every leave type showing hours used and entry count side-by-side —
                ideal for spotting intermittent use patterns and staff drawing from multiple leave types.
                Sorted by number of leave types used (most complex patterns first).
              </div>
            </div>
            <button
              onClick={exportAllStaff}
              disabled={loading || exporting === 'all'}
              style={{ padding:'9px 20px', borderRadius:7, fontSize:13, fontWeight:600,
                background: exporting==='all' ? '#94a3b8' : C.navy, color:'#fff',
                border:'none', cursor: exporting==='all' ? 'not-allowed' : 'pointer',
                whiteSpace:'nowrap', flexShrink:0 }}>
              {exporting==='all' ? 'Exporting…' : '⬇ Export All Staff CSV'}
            </button>
          </div>
        </div>

        {/* Individual staff exports */}
        <div style={{ background:'#fff', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'hidden' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f1f3',
            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>Individual Staff Reports</div>
              <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>
                Full detail: balances, every leave entry with qualifying info, and protected leave periods.
              </div>
            </div>
            <input type="text" placeholder="Search staff…" value={searchTerm}
              onChange={e=>setSearchTerm(e.target.value)}
              style={{ padding:'7px 12px', borderRadius:6, border:'1px solid #d1d5db',
                fontSize:13, outline:'none', width:220 }} />
          </div>

          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:C.gray }}>Loading…</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f8f9fa' }}>
                  {['Name', 'Position', 'Building', 'Leave Types Used', 'Total Entries', 'Concurrent', 'Export'].map(h => (
                    <th key={h} style={{ padding:'9px 14px', fontSize:11, fontWeight:600,
                      color:C.gray, textAlign:'left', textTransform:'uppercase',
                      letterSpacing:'0.04em', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((person, i) => {
                  const typesUsed   = leaveTypeBreadth[person.id] || 0
                  const entryCount  = leaveEntries.filter(e => e.staff_id === person.id).length
                  const concCount   = leaveEntries.filter(e => e.staff_id === person.id && e.concurrent_leave_type_id).length
                  const isHighlight = typesUsed >= 3 || concCount > 0
                  return (
                    <tr key={person.id}
                      style={{ background: isHighlight ? '#fffbeb' : i%2===0 ? '#fff' : '#fafbfc',
                        borderBottom:'1px solid #f0f1f3' }}>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ fontWeight:600, fontSize:13, color:C.navy }}>{person.full_name}</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{person.email}</div>
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:C.gray }}>{person.position||'—'}</td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:C.gray }}>{person.building||'—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{
                          fontWeight:700, fontSize:13,
                          color: typesUsed >= 3 ? C.orange : typesUsed > 0 ? C.navy : '#9ca3af'
                        }}>
                          {typesUsed}
                          {typesUsed >= 3 && <span style={{ fontSize:11, marginLeft:4 }}>⚑</span>}
                        </span>
                      </td>
                      <td style={{ padding:'10px 14px', fontSize:13, color:C.navy, fontWeight:600 }}>{entryCount}</td>
                      <td style={{ padding:'10px 14px' }}>
                        {concCount > 0
                          ? <span style={{ fontSize:12, fontWeight:600, color:C.orange }}>{concCount} concurrent</span>
                          : <span style={{ fontSize:12, color:'#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <button
                          onClick={() => exportIndividual(person)}
                          disabled={exporting === person.id}
                          style={{ padding:'5px 12px', borderRadius:5, fontSize:12, fontWeight:600,
                            background: exporting===person.id ? '#94a3b8' : C.navy,
                            color:'#fff', border:'none',
                            cursor: exporting===person.id ? 'not-allowed' : 'pointer' }}>
                          {exporting===person.id ? '…' : '⬇ XLSX'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filteredStaff.length === 0 && (
                  <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:C.gray }}>No staff found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
