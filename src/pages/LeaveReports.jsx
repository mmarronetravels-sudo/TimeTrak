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
  const [leavePolicies,    setLeavePolicies]     = useState([])
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
      { data: lp },
      { data: le },
      { data: pp },
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('leave_types').select('*').order('sort_order'),
      supabase.from('leave_balances').select('*').eq('school_year', selectedYear),
      supabase.from('leave_policies').select('*').eq('school_year', selectedYear),
      supabase.from('leave_entries').select('*').eq('school_year', selectedYear).order('start_date'),
      supabase.from('protected_leave_periods').select('*').order('period_start'),
    ])
    if (s)  setStaff(s)
    if (lt) setLeaveTypes(lt)
    if (lb) setLeaveBalances(lb)
    if (lp) setLeavePolicies(lp)
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

  // ── Individual staff XLSX export ──────────────────────────────────────
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
    const NAVY  = '2C3E7E'
    const LTBLUE = 'E8EDF7'
    const WHITE = 'FFFFFF'
    const WARN  = 'FFF3CD'
    const WARNRED = 'DC3545'
    const LOW   = 'FFF3CD'  // yellow: < 20% remaining
    const GONE  = 'FFDEDE'  // red-tint: 0 or negative remaining

    const cell = (v, opts = {}) => {
      const c = { v, t: typeof v === 'number' ? 'n' : 's' }
      const s = {}
      if (opts.sectionHeader)
        s.font = { bold: true, color: { rgb: WHITE }, sz: 11, name: 'Arial' }
      else if (opts.header)
        s.font = { bold: true, color: { rgb: NAVY }, sz: 10, name: 'Arial' }
      else if (opts.bold)
        s.font = { bold: true, sz: 10, name: 'Arial', color: { rgb: '000000' } }
      else
        s.font = { sz: 10, name: 'Arial', color: { rgb: opts.warn ? WARNRED : '333333' } }

      if (opts.sectionHeader)      s.fill = { fgColor: { rgb: NAVY },    patternType: 'solid' }
      else if (opts.header)        s.fill = { fgColor: { rgb: LTBLUE },  patternType: 'solid' }
      else if (opts.warnFill)      s.fill = { fgColor: { rgb: opts.warnFill }, patternType: 'solid' }
      else if (opts.altRow)        s.fill = { fgColor: { rgb: 'F8F9FA' }, patternType: 'solid' }

      s.alignment = { vertical: 'center', wrapText: false }
      if (opts.num) { s.numFmt = '0.00'; c.t = 'n' }
      c.s = s
      return c
    }

    const applyRow = (ws, rowIdx, cells) => {
      cells.forEach((c, i) => {
        if (c === null) return
        ws[XLSX.utils.encode_cell({ r: rowIdx, c: i })] = c
      })
    }

    const setRange = (ws, maxR, maxC) => {
      ws['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: maxR, c: maxC } })
    }

    // ── Entitlement lookup ─────────────────────────────────────────────────
    // Protected types (PLO/FMLA/OFLA): 480 hrs prorated by contract days / 260
    // School-provided: use leave_balance allocated amount, else leave_policy amount
    const PROTECTED_CODES = ['plo', 'fmla', 'ofla']
    const contractDays = parseFloat(person.contract_days) || 260
    const prorationPct = Math.min(contractDays / 260, 1)

    const getEntitlement = (lt) => {
      if (!lt) return null
      if (PROTECTED_CODES.includes(lt.code?.toLowerCase())) {
        return parseFloat((480 * prorationPct).toFixed(2))
      }
      // Check personal balance record first
      const bal = personBalances.find(b => b.leave_type_id === lt.id)
      if (bal) return parseFloat(bal.allocated) + parseFloat(bal.carried_over || 0)
      // Fall back to policy
      const pol = leavePolicies.find(p => p.leave_type_id === lt.id)
      if (pol) return parseFloat(pol.allocated_amount)
      return null
    }

    // Hours used per leave type from entries
    const hoursUsedByType = {}
    personEntries.forEach(e => {
      const hrs = e.tracking_unit === 'days'  ? parseFloat(e.amount) * 8
                : e.tracking_unit === 'weeks' ? parseFloat(e.amount) * 40
                : parseFloat(e.amount)
      hoursUsedByType[e.leave_type_id] = (hoursUsedByType[e.leave_type_id] || 0) + hrs
    })

    // ── Tab 1: Leave Summary ───────────────────────────────────────────────
    const wsSum = {}
    let r = 0

    // Title
    wsSum[XLSX.utils.encode_cell({ r, c:0 })] = cell('LEAVE SUMMARY — ' + person.full_name, { sectionHeader: true })
    for (let c = 1; c <= 4; c++) wsSum[XLSX.utils.encode_cell({ r, c })] = cell('', { sectionHeader: true })
    r++
    wsSum[XLSX.utils.encode_cell({ r, c:0 })] = cell('School Year: ' + selectedYear)
    wsSum[XLSX.utils.encode_cell({ r, c:1 })] = cell('Hire Date: ' + (fmtDate(person.hire_date) || '—'))
    wsSum[XLSX.utils.encode_cell({ r, c:2 })] = cell('Contract Days: ' + (person.contract_days || '—'))
    wsSum[XLSX.utils.encode_cell({ r, c:3 })] = cell('Generated: ' + new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }))
    r++; r++ // spacer

    // Column headers
    applyRow(wsSum, r, [
      cell('Leave Type', { header: true }),
      cell('Hours Used', { header: true }),
      cell('Entitlement (hrs)', { header: true }),
      cell('Hours Remaining', { header: true }),
      cell('Notes', { header: true }),
    ])
    r++

    // One row per leave type that has usage OR an entitlement
    const summaryLeaveTypes = leaveTypes.filter(lt => {
      const hasUsage = (hoursUsedByType[lt.id] || 0) > 0
      const hasEntitlement = getEntitlement(lt) !== null
      return hasUsage || hasEntitlement
    })

    if (summaryLeaveTypes.length === 0) {
      wsSum[XLSX.utils.encode_cell({ r, c:0 })] = cell('No leave activity or allocations for this school year.')
      r++
    } else {
      summaryLeaveTypes.forEach((lt, i) => {
        const used       = hoursUsedByType[lt.id] || 0
        const entitlement = getEntitlement(lt)
        const remaining  = entitlement !== null ? entitlement - used : null
        const isEven     = i % 2 === 0

        // Highlight: gone/negative = red-tint, low (< 20%) = yellow
        let warnFill = null
        if (remaining !== null) {
          if (remaining <= 0) warnFill = GONE
          else if (entitlement && (remaining / entitlement) < 0.2) warnFill = LOW
        }

        const note = PROTECTED_CODES.includes(lt.code?.toLowerCase())
          ? `Prorated from 480 hrs (${contractDays}/${260} days)`
          : (personBalances.find(b => b.leave_type_id === lt.id) ? 'From balance record' : 'From leave policy')

        applyRow(wsSum, r, [
          cell(lt.name, { altRow: isEven, warnFill }),
          cell(parseFloat(used.toFixed(2)), { num: true, altRow: isEven, warnFill }),
          cell(entitlement !== null ? entitlement : '—', { num: entitlement !== null, altRow: isEven, warnFill }),
          cell(remaining !== null ? parseFloat(remaining.toFixed(2)) : '—', { num: remaining !== null, altRow: isEven, warnFill, warn: remaining !== null && remaining <= 0 }),
          cell(note, { altRow: isEven, warnFill }),
        ])
        r++
      })
    }

    wsSum['!cols'] = [{ wch:28 }, { wch:14 }, { wch:18 }, { wch:16 }, { wch:38 }]
    wsSum['!merges'] = [{ s:{ r:0, c:0 }, e:{ r:0, c:4 } }]
    setRange(wsSum, r, 4)
    XLSX.utils.book_append_sheet(wb, wsSum, 'Leave Summary')

    // ── Tab 2: Leave Entries ───────────────────────────────────────────────
    const wsEnt = {}
    r = 0
    applyRow(wsEnt, r, ['Leave Type','Start Date','End Date','Hours','Concurrent Leave','Notes'].map(h => cell(h, { header: true })))
    r++
    if (personEntries.length === 0) {
      wsEnt[XLSX.utils.encode_cell({ r, c:0 })] = cell('No leave entries for this school year.')
      r++
    } else {
      personEntries.forEach((e, i) => {
        const lt     = ltById[e.leave_type_id]
        const concLt = e.concurrent_leave_type_id ? ltById[e.concurrent_leave_type_id] : null
        const startD = e.start_date ? new Date(e.start_date) : null
        const endD   = e.end_date   ? new Date(e.end_date)   : null
        const badDate = startD && endD && endD < startD
        const hrs = e.tracking_unit === 'days'  ? parseFloat(e.amount) * 8
                  : e.tracking_unit === 'weeks' ? parseFloat(e.amount) * 40
                  : parseFloat(e.amount)
        const isEven = i % 2 === 0
        applyRow(wsEnt, r, [
          cell(lt?.name || 'Unknown', { altRow: isEven }),
          cell(fmtDate(e.start_date), { altRow: isEven, warn: badDate }),
          cell(fmtDate(e.end_date),   { altRow: isEven, warn: badDate }),
          cell(parseFloat(hrs.toFixed(2)), { num: true, altRow: isEven }),
          cell(concLt ? concLt.name : '—', { altRow: isEven }),
          cell(e.reason || '—', { altRow: isEven }),
        ])
        r++
      })
    }
    wsEnt['!cols'] = [{ wch:26 },{ wch:14 },{ wch:14 },{ wch:10 },{ wch:22 },{ wch:30 }]
    setRange(wsEnt, r, 5)
    XLSX.utils.book_append_sheet(wb, wsEnt, 'Leave Entries')

    // ── Tab 3: Protected Periods (only if records exist) ───────────────────
    if (personPeriods.length > 0) {
      const wsPer = {}
      r = 0
      applyRow(wsPer, r, ['Leave Type','Period Start','Period End','Status','Entitlement (hrs)','Hours Used','Hours Remaining'].map(h => cell(h, { header: true })))
      r++
      personPeriods.forEach((p, i) => {
        const lt = ltById[p.leave_type_id]
        const remaining = p.hours_remaining != null ? parseFloat(p.hours_remaining) : null
        const isEven = i % 2 === 0
        let warnFill = null
        if (remaining !== null) {
          if (remaining <= 0) warnFill = GONE
          else if (remaining < 40) warnFill = LOW
        }
        applyRow(wsPer, r, [
          cell(lt?.name || 'Unknown', { altRow: isEven, warnFill }),
          cell(fmtDate(p.period_start), { altRow: isEven, warnFill }),
          cell(fmtDate(p.period_end),   { altRow: isEven, warnFill }),
          cell(p.status || '', { altRow: isEven, warnFill }),
          cell(p.prorated_entitlement_hours ? parseFloat(p.prorated_entitlement_hours) : '—', { num: !!p.prorated_entitlement_hours, altRow: isEven, warnFill }),
          cell(parseFloat(p.hours_used || 0), { num: true, altRow: isEven, warnFill }),
          cell(remaining !== null ? remaining : '—', { num: remaining !== null, altRow: isEven, warnFill, warn: remaining !== null && remaining <= 0 }),
        ])
        r++
      })
      wsPer['!cols'] = [{ wch:26 },{ wch:14 },{ wch:14 },{ wch:12 },{ wch:18 },{ wch:14 },{ wch:16 }]
      setRange(wsPer, r, 6)
      XLSX.utils.book_append_sheet(wb, wsPer, 'Protected Periods')
    }

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
