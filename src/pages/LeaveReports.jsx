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
      supabase.from('profiles').select('*').order('full_name'),
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
      'Staff Name', 'Contract Days', 'Hire Date', 'Status',
      ...leaveTypes.map(lt => `${lt.name} - Hrs Used`),
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
        person.contract_days || '',
        person.hire_date || '',
        person.is_active === false ? 'Archived' : 'Active',
        ...leaveTypes.map(lt => ltData[lt.id] ? fmtNum(ltData[lt.id].hours) : '0.00'),
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

    // Load SheetJS
    let XLSX
    if (window.XLSX) {
      XLSX = window.XLSX
    } else {
      try {
        const script = document.createElement('script')
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
        await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.appendChild(script) })
        XLSX = window.XLSX
      } catch {
        alert('Could not load Excel library.'); setExporting(null); return
      }
    }

    const wb = XLSX.utils.book_new()
    const personEntries  = leaveEntries.filter(e => e.staff_id === person.id)
    const personBalances = leaveBalances.filter(b => b.staff_id === person.id)
    const personPeriods  = protectedPeriods.filter(p => p.staff_id === person.id)

    // ── Styling helpers ────────────────────────────────────────────────────
    const NAVY   = '2C3E7E'
    const ORANGE = 'F3843E'
    const LTBLUE = 'E8EDF7'
    const LTORANGE = 'FEF3EC'
    const WHITE  = 'FFFFFF'
    const WARN   = 'FFF3CD'
    const WARNBORDER = 'DC3545'

    const cell = (v, opts = {}) => {
      const c = { v, t: typeof v === 'number' ? 'n' : 's' }
      const s = {}
      if (opts.bold || opts.header || opts.sectionHeader)
        s.font = { bold: true, color: { rgb: opts.sectionHeader ? WHITE : opts.header ? NAVY : '000000' }, sz: opts.sectionHeader ? 11 : opts.header ? 10 : 10, name: 'Arial' }
      else
        s.font = { sz: 10, name: 'Arial', color: { rgb: opts.warn ? WARNBORDER : '333333' } }
      if (opts.sectionHeader)
        s.fill = { fgColor: { rgb: NAVY }, patternType: 'solid' }
      else if (opts.header)
        s.fill = { fgColor: { rgb: LTBLUE }, patternType: 'solid' }
      else if (opts.altRow)
        s.fill = { fgColor: { rgb: 'F8F9FA' }, patternType: 'solid' }
      else if (opts.warn)
        s.fill = { fgColor: { rgb: WARN }, patternType: 'solid' }
      s.alignment = { vertical: 'center', wrapText: false }
      if (opts.num) { s.numFmt = '0.00'; c.t = 'n' }
      if (opts.pct) { s.numFmt = '0.0"%"'; c.t = 'n' }
      c.s = s
      return c
    }

    const applyRow = (ws, rowIdx, cells, colStart = 0) => {
      cells.forEach((c, i) => {
        if (c === null) return
        const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colStart + i })
        ws[ref] = c
      })
    }

    const setRange = (ws, maxR, maxC) => {
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
    }

    // ── Tab 1: Summary ─────────────────────────────────────────────────────
    const wsSum = {}
    let r = 0

    // Title row
    wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell('LEAVE REPORT — ' + person.full_name, { sectionHeader: true })
    wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell('', { sectionHeader: true })
    r++
    wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell('School Year: ' + selectedYear, { bold: false })
    wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell('Generated: ' + new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }), { bold: false })
    r++; r++ // spacer

    // Staff info section
    wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell('STAFF INFORMATION', { sectionHeader: true })
    wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell('', { sectionHeader: true })
    r++
    const infoRows = [
      ['Name', person.full_name],
      ['Email', person.email || '—'],
      ['Position', person.position || '—'],
      ['Building', person.building || '—'],
      ['Hire Date', fmtDate(person.hire_date)],
      ['Contract Days', person.contract_days || '—'],
    ]
    infoRows.forEach((row, i) => {
      wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell(row[0], { bold: true })
      wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell(String(row[1]))
      r++
    })
    r++ // spacer

    // Leave summary section
    wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell('LEAVE SUMMARY', { sectionHeader: true })
    wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell('', { sectionHeader: true })
    r++
    const typesUsed = new Set(personEntries.map(e => e.leave_type_id)).size
    const concurrentCount = personEntries.filter(e => e.concurrent_leave_type_id).length
    const totalDays = personEntries.filter(e => e.tracking_unit === 'days').reduce((s,e) => s + parseFloat(e.amount), 0)
    const totalHrs  = personEntries.filter(e => e.tracking_unit === 'hours').reduce((s,e) => s + parseFloat(e.amount), 0)

    const summaryRows = [
      ['Total Leave Entries', personEntries.length],
      ['Total Days Used', totalDays > 0 ? totalDays.toFixed(2) : '0'],
      ['Total Hours Used', totalHrs > 0 ? totalHrs.toFixed(2) : '0'],
      ['Distinct Leave Types Used', typesUsed],
      ['Entries with Concurrent Leave', concurrentCount],
      ['Protected Leave Periods', personPeriods.length],
    ]
    summaryRows.forEach((row, i) => {
      const isEven = i % 2 === 0
      wsSum[XLSX.utils.encode_cell({ r, c: 0 })] = cell(row[0], { bold: true, altRow: isEven })
      wsSum[XLSX.utils.encode_cell({ r, c: 1 })] = cell(String(row[1]), { altRow: isEven })
      r++
    })

    wsSum['!cols'] = [{ wch: 30 }, { wch: 36 }]
    wsSum['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    ]
    setRange(wsSum, r, 1)
    XLSX.utils.book_append_sheet(wb, wsSum, 'Summary')

    // ── Tab 2: Leave Balances ──────────────────────────────────────────────
    const wsBal = {}
    r = 0
    const balHeaders = ['Leave Type', 'Category', 'Allocated', 'Used', 'Carried Over', 'Remaining', 'Unit']
    applyRow(wsBal, r, balHeaders.map(h => cell(h, { header: true })))
    r++
    if (personBalances.length === 0) {
      wsBal[XLSX.utils.encode_cell({ r, c: 0 })] = cell('No balance records for this school year — PLO/FMLA/OFLA are protected leave types and do not use school-provided balance pools.', { bold: false })
      r++
    } else {
      personBalances.forEach((b, i) => {
        const lt = ltById[b.leave_type_id]
        const remaining = parseFloat(b.allocated) + parseFloat(b.carried_over || 0) - parseFloat(b.used)
        const isEven = i % 2 === 0
        const rowData = [
          cell(lt?.name || 'Unknown', { altRow: isEven }),
          cell(lt?.category?.replace(/_/g, ' ') || '', { altRow: isEven }),
          cell(parseFloat(b.allocated), { num: true, altRow: isEven }),
          cell(parseFloat(b.used), { num: true, altRow: isEven }),
          cell(parseFloat(b.carried_over || 0), { num: true, altRow: isEven }),
          cell(parseFloat(remaining.toFixed(2)), { num: true, altRow: isEven, warn: remaining < 0 }),
          cell(b.tracking_unit || lt?.tracking_unit || 'hours', { altRow: isEven }),
        ]
        applyRow(wsBal, r, rowData); r++
      })
    }
    wsBal['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 8 }]
    setRange(wsBal, r, 6)
    XLSX.utils.book_append_sheet(wb, wsBal, 'Leave Balances')

    // ── Tab 3: Leave Entries ───────────────────────────────────────────────
    const wsEnt = {}
    r = 0
    const entHeaders = ['Date Logged','Leave Type','Start Date','End Date','Amount','Unit','Concurrent Leave','Qualifying Reason','Qualifying Relationship','Family Member','Documentation','Notes']
    applyRow(wsEnt, r, entHeaders.map(h => cell(h, { header: true })))
    r++
    if (personEntries.length === 0) {
      wsEnt[XLSX.utils.encode_cell({ r, c: 0 })] = cell('No leave entries for this school year.')
      r++
    } else {
      personEntries.forEach((e, i) => {
        const lt     = ltById[e.leave_type_id]
        const concLt = e.concurrent_leave_type_id ? ltById[e.concurrent_leave_type_id] : null
        // Flag bad dates: end before start
        const startD = e.start_date ? new Date(e.start_date) : null
        const endD   = e.end_date   ? new Date(e.end_date)   : null
        const badDate = startD && endD && endD < startD
        const isEven = i % 2 === 0
        const rowData = [
          cell(fmtDate(e.created_at?.split('T')[0]), { altRow: isEven }),
          cell(lt?.name || 'Unknown', { altRow: isEven }),
          cell(fmtDate(e.start_date), { altRow: isEven, warn: badDate }),
          cell(fmtDate(e.end_date),   { altRow: isEven, warn: badDate }),
          cell(parseFloat(e.amount),  { num: true, altRow: isEven }),
          cell(e.tracking_unit || '', { altRow: isEven }),
          cell(concLt ? concLt.name : '', { altRow: isEven }),
          cell(e.qualifying_reason ? e.qualifying_reason.replace(/_/g, ' ') : '', { altRow: isEven }),
          cell(e.qualifying_relationship ? e.qualifying_relationship.replace(/_/g, ' ') : '', { altRow: isEven }),
          cell(e.relationship_name || '', { altRow: isEven }),
          cell(e.documentation_on_file ? 'Yes' : 'No', { altRow: isEven }),
          cell(e.reason || '', { altRow: isEven }),
        ]
        applyRow(wsEnt, r, rowData); r++
      })
    }
    wsEnt['!cols'] = [{ wch:14 },{ wch:26 },{ wch:14 },{ wch:14 },{ wch:9 },{ wch:8 },{ wch:22 },{ wch:28 },{ wch:28 },{ wch:20 },{ wch:14 },{ wch:30 }]
    setRange(wsEnt, r, 11)
    XLSX.utils.book_append_sheet(wb, wsEnt, 'Leave Entries')

    // ── Tab 4: Protected Leave Periods ────────────────────────────────────
    const wsPer = {}
    r = 0
    const perHeaders = ['Leave Type','Period Start','Period End','Status','Contract Days','Proration %','Entitlement (hrs)','Hours Used','Hours Remaining','Qualifying Reason','Qualifying Relationship','Family Member']
    applyRow(wsPer, r, perHeaders.map(h => cell(h, { header: true })))
    r++
    if (personPeriods.length === 0) {
      wsPer[XLSX.utils.encode_cell({ r, c: 0 })] = cell('No protected leave periods on record.')
      r++
    } else {
      personPeriods.forEach((p, i) => {
        const lt = ltById[p.leave_type_id]
        const nearExhausted = p.hours_remaining != null && parseFloat(p.hours_remaining) < 40
        const isEven = i % 2 === 0
        const rowData = [
          cell(lt?.name || 'Unknown', { altRow: isEven }),
          cell(fmtDate(p.period_start), { altRow: isEven }),
          cell(fmtDate(p.period_end), { altRow: isEven }),
          cell(p.status || '', { altRow: isEven }),
          cell(p.contract_days ? parseFloat(p.contract_days) : '', { num: !!p.contract_days, altRow: isEven }),
          cell(p.proration_pct != null ? parseFloat(parseFloat(p.proration_pct).toFixed(1)) : '', { pct: p.proration_pct != null, altRow: isEven }),
          cell(p.prorated_entitlement_hours ? parseFloat(p.prorated_entitlement_hours) : '', { num: !!p.prorated_entitlement_hours, altRow: isEven }),
          cell(p.hours_used ? parseFloat(p.hours_used) : 0, { num: true, altRow: isEven }),
          cell(p.hours_remaining != null ? parseFloat(p.hours_remaining) : '', { num: p.hours_remaining != null, altRow: isEven, warn: nearExhausted }),
          cell(p.qualifying_reason ? p.qualifying_reason.replace(/_/g, ' ') : '', { altRow: isEven }),
          cell(p.qualifying_relationship ? p.qualifying_relationship.replace(/_/g, ' ') : '', { altRow: isEven }),
          cell(p.relationship_name || '', { altRow: isEven }),
        ]
        applyRow(wsPer, r, rowData); r++
      })
    }
    wsPer['!cols'] = [{ wch:26 },{ wch:14 },{ wch:14 },{ wch:12 },{ wch:14 },{ wch:12 },{ wch:18 },{ wch:12 },{ wch:16 },{ wch:28 },{ wch:28 },{ wch:20 }]
    setRange(wsPer, r, 11)
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
