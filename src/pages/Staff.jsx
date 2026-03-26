import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const C = { navy: '#2c3e7e', orange: '#f3843e', gray: '#666666' }

const ROLE_LABELS  = { admin: 'Admin', hr: 'HR', supervisor: 'Supervisor', staff: 'Staff' }
const ROLE_COLORS  = {
  admin:      { bg: '#fce7f3', fg: '#9d174d' },
  hr:         { bg: '#dbeafe', fg: '#1e40af' },
  supervisor: { bg: '#d1fae5', fg: '#065f46' },
  staff:      { bg: '#f3f4f6', fg: '#374151' },
}

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.staff
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4,
      fontSize:11, fontWeight:600, background:c.bg, color:c.fg }}>
      {ROLE_LABELS[role] || role || '—'}
    </span>
  )
}

const EMPTY_FORM = {
  full_name:'', email:'', position:'', building:'',
  timetrak_role:'staff', supervisor_id:'', contract_days:'', hire_date:'', is_active:true,
  sched_in:'07:30', sched_lunch_out:'12:00', sched_lunch_in:'12:30', sched_out:'16:00',
}

function scheduleFromProfile(p) {
  const s = p.default_schedule || {}
  return { sched_in: s.in||'07:30', sched_lunch_out: s.lunchOut||'12:00',
           sched_lunch_in: s.lunchIn||'12:30', sched_out: s.out||'16:00' }
}

export default function Staff() {
  const { profile: currentProfile } = useAuth()
  const [staff,        setStaff]        = useState([])
  const [supervisors,  setSupervisors]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [searchTerm,   setSearchTerm]   = useState('')
  const [filterRole,   setFilterRole]   = useState('all')
  const [filterStatus, setFilterStatus] = useState('active') // 'active' | 'archived' | 'all'
  const [editingStaff, setEditingStaff] = useState(null)
  const [addingNew,    setAddingNew]    = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [confirm,      setConfirm]      = useState(null) // { type, person }
  const [toast,        setToast]        = useState(null)

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  useEffect(() => { if (currentProfile) fetchStaff() }, [currentProfile?.id])

  const fetchStaff = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*')
      .eq('tenant_id', currentProfile.tenant_id).order('full_name')
    if (error) console.error('Failed to load staff')
    if (data) {
      setStaff(data)
      setSupervisors(data.filter(p => ['admin','hr','supervisor'].includes(p.timetrak_role)))
    }
    setLoading(false)
  }

  // ── Open edit modal ──────────────────────────────────────────────────────
  const openEdit = (person) => {
    setAddingNew(false)
    setEditingStaff(person)
    setForm({ full_name:person.full_name||'', email:person.email||'',
              position:person.position||'', building:person.building||'',
              timetrak_role:person.timetrak_role||'staff',
              supervisor_id:person.supervisor_id||'',
              contract_days:person.contract_days!=null ? String(person.contract_days) : '',
              hire_date:person.hire_date||'', is_active:person.is_active!==false,
              ...scheduleFromProfile(person) })
  }

  // ── Open add modal ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingStaff(null)
    setAddingNew(true)
    setForm(EMPTY_FORM)
  }

  const closeModal = () => { setEditingStaff(null); setAddingNew(false); setForm(EMPTY_FORM) }

  // ── Save (edit) ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.full_name.trim()) return
    setSaving(true)
    const default_schedule = { in:form.sched_in, lunchOut:form.sched_lunch_out,
                                lunchIn:form.sched_lunch_in, out:form.sched_out }
    const updates = {
      full_name:     form.full_name.trim(),
      position:      form.position.trim()||null,
      building:      form.building.trim()||null,
      timetrak_role: form.timetrak_role||null,
      supervisor_id: form.supervisor_id||null,
      contract_days: form.contract_days ? parseInt(form.contract_days) : null,
      hire_date:     form.hire_date||null,
      is_active:     form.is_active,
      default_schedule,
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', editingStaff.id)
    if (error) { showToast('Error saving staff member. Please try again.', 'error') }
    else { showToast(`${form.full_name} updated`); await fetchStaff(); closeModal() }
    setSaving(false)
  }

  // ── Add new staff ────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.full_name.trim() || !form.email.trim()) return
    setSaving(true)
    const default_schedule = { in:form.sched_in, lunchOut:form.sched_lunch_out,
                                lunchIn:form.sched_lunch_in, out:form.sched_out }
    // Insert profile row — note: no auth.users row yet, so they can't log in until
    // an auth account is created manually in Supabase Auth dashboard.
    const { error } = await supabase.from('profiles').insert([{
      id:            crypto.randomUUID(), // placeholder — must match auth.uid() when account is created
      tenant_id:     currentProfile.tenant_id,
      email:         form.email.trim().toLowerCase(),
      full_name:     form.full_name.trim(),
      position:      form.position.trim()||null,
      building:      form.building.trim()||null,
      timetrak_role: form.timetrak_role||'staff',
      supervisor_id: form.supervisor_id||null,
      contract_days: form.contract_days ? parseInt(form.contract_days) : null,
      hire_date:     form.hire_date||null,
      is_active:     true,
      default_schedule,
    }])
    if (error) { showToast('Error adding staff member. Please try again.', 'error') }
    else {
      showToast(`${form.full_name} added — create their auth account in Supabase to enable login`, 'info')
      await fetchStaff(); closeModal()
    }
    setSaving(false)
  }

  // ── Archive (toggle is_active) ───────────────────────────────────────────
  const handleArchive = async (person) => {
    const newActive = !person.is_active
    const { error } = await supabase.from('profiles')
      .update({ is_active: newActive }).eq('id', person.id)
    if (error) { showToast('Error updating staff status. Please try again.', 'error') }
    else {
      showToast(`${person.full_name} ${newActive ? 'restored' : 'archived'}`)
      await fetchStaff()
    }
    setConfirm(null)
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (person) => {
    // Check for any timecards or leave entries first
    const [{ count: tcCount }, { count: leCount }] = await Promise.all([
      supabase.from('timecards').select('*', { count:'exact', head:true }).eq('staff_id', person.id),
      supabase.from('leave_entries').select('*', { count:'exact', head:true }).eq('staff_id', person.id),
    ])
    if ((tcCount || 0) > 0 || (leCount || 0) > 0) {
      showToast(
        `Cannot delete ${person.full_name} — they have ${tcCount||0} timecard(s) and ${leCount||0} leave entry(ies). Archive instead.`,
        'error'
      )
      setConfirm(null)
      return
    }
    const { error } = await supabase.from('profiles').delete().eq('id', person.id)
    if (error) { showToast('Error deleting staff member. Please try again.', 'error') }
    else { showToast(`${person.full_name} deleted`); await fetchStaff() }
    setConfirm(null)
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = staff.filter(p => {
    const matchSearch = !searchTerm ||
      (p.full_name||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.position||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.building||'').toLowerCase().includes(searchTerm.toLowerCase())
    const matchRole   = filterRole === 'all' || p.timetrak_role === filterRole
    const matchStatus = filterStatus === 'all' ? true
                      : filterStatus === 'active' ? p.is_active !== false
                      : p.is_active === false
    return matchSearch && matchRole && matchStatus
  })

  const activeCount   = staff.filter(p => p.is_active !== false).length
  const archivedCount = staff.filter(p => p.is_active === false).length

  const getSupervisorName = (id) => staff.find(p => p.id === id)?.full_name || '—'
  const isModalOpen = editingStaff || addingNew

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px 20px' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:C.navy }}>Staff Directory</h1>
            <p style={{ margin:'4px 0 0', fontSize:13, color:C.gray }}>
              {activeCount} active · {archivedCount} archived
            </p>
          </div>
          <button onClick={openAdd} style={{
            padding:'9px 18px', borderRadius:7, fontSize:13, fontWeight:600,
            background:C.navy, color:'#fff', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6,
          }}>
            + Add Staff
          </button>
        </div>

        {/* Status tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:14 }}>
          {[['active','Active',activeCount],['archived','Archived',archivedCount],['all','All',staff.length]].map(([val,label,count])=>(
            <button key={val} onClick={()=>setFilterStatus(val)} style={{
              padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
              background: filterStatus===val ? C.navy : '#e5e7eb',
              color: filterStatus===val ? '#fff' : C.gray,
            }}>
              {label} <span style={{ opacity:0.7, marginLeft:4 }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          <input type="text" placeholder="Search by name, position, building…"
            value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
            style={{ flex:1, minWidth:220, padding:'8px 12px', borderRadius:6,
              border:'1px solid #e2e4e9', fontSize:13, outline:'none', color:C.navy }} />
          <select value={filterRole} onChange={e=>setFilterRole(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:6, border:'1px solid #e2e4e9',
              fontSize:13, color:C.navy, background:'#fff' }}>
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="hr">HR</option>
            <option value="supervisor">Supervisor</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:C.gray }}>Loading staff…</div>
        ) : (
          <div style={{ background:'#fff', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {['Name','Position','Building','Role','Supervisor','Contract','Schedule','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px', fontSize:11, fontWeight:600, color:'#fff',
                      textAlign:'left', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((person, i) => (
                  <tr key={person.id}
                    style={{ background: person.is_active===false ? '#fafafa' : i%2===0 ? '#fff' : '#fafbfc',
                      borderBottom:'1px solid #f0f1f3',
                      opacity: person.is_active===false ? 0.65 : 1 }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600, fontSize:13, color:C.navy }}>{person.full_name}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>{person.email}</div>
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:13, color:C.gray }}>{person.position||'—'}</td>
                    <td style={{ padding:'10px 12px', fontSize:13, color:C.gray }}>{person.building||'—'}</td>
                    <td style={{ padding:'10px 12px' }}><RoleBadge role={person.timetrak_role} /></td>
                    <td style={{ padding:'10px 12px', fontSize:13, color:C.gray }}>{getSupervisorName(person.supervisor_id)}</td>
                    <td style={{ padding:'10px 12px', fontSize:13, color:C.gray }}>
                      {person.contract_days ? `${person.contract_days}d` : '—'}
                    </td>
                    <td style={{ padding:'10px 12px' }}>
                      {person.default_schedule
                        ? <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>✓ Set</span>
                        : <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600 }}>Not set</span>}
                    </td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontSize:11, fontWeight:600,
                        color: person.is_active!==false ? '#16a34a' : '#9ca3af' }}>
                        {person.is_active!==false ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={()=>openEdit(person)} style={btnStyle(C.navy)}>Edit</button>
                        {person.is_active !== false ? (
                          <button onClick={()=>setConfirm({type:'archive',person})} style={btnStyle('#f59e0b')}>Archive</button>
                        ) : (
                          <button onClick={()=>handleArchive(person)} style={btnStyle('#16a34a')}>Restore</button>
                        )}
                        <button onClick={()=>setConfirm({type:'delete',person})} style={btnStyle('#dc2626')}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding:40, textAlign:'center', color:C.gray, fontSize:13 }}>
                    No staff found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      {isModalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:600,
            maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #e2e4e9',
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:C.navy }}>
                  {addingNew ? 'Add New Staff Member' : 'Edit Staff Member'}
                </div>
                {!addingNew && <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{editingStaff?.email}</div>}
              </div>
              <button onClick={closeModal} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:C.gray }}>×</button>
            </div>

            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Add-only auth note */}
              {addingNew && (
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:7,
                  padding:'10px 14px', fontSize:12, color:'#92400e' }}>
                  ⚠️ This creates a profile record only. To enable login, you must also create an auth account
                  in <strong>Supabase Dashboard → Authentication → Add User</strong> using the same email address.
                </div>
              )}

              {/* Basic Info */}
              <Section title="Basic Information">
                <Row>
                  <Field label="Full Name" required>
                    <input value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}
                      style={inputStyle} placeholder="Full name" />
                  </Field>
                  {addingNew && (
                    <Field label="Email" required>
                      <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                        style={inputStyle} placeholder="name@school.org" />
                    </Field>
                  )}
                </Row>
                <Row>
                  <Field label="Position">
                    <input value={form.position} onChange={e=>setForm(f=>({...f,position:e.target.value}))}
                      style={inputStyle} placeholder="e.g. Paraprofessional" />
                  </Field>
                  <Field label="Building">
                    <input value={form.building} onChange={e=>setForm(f=>({...f,building:e.target.value}))}
                      style={inputStyle} placeholder="e.g. Main Office" />
                  </Field>
                </Row>
                <Row>
                  <Field label="Hire Date">
                    <input type="date" value={form.hire_date} onChange={e=>setForm(f=>({...f,hire_date:e.target.value}))}
                      style={inputStyle} />
                  </Field>
                  <Field label="Contract Days">
                    <input type="number" value={form.contract_days}
                      onChange={e=>setForm(f=>({...f,contract_days:e.target.value}))}
                      style={inputStyle} placeholder="e.g. 192, 260" min={0} max={365} />
                  </Field>
                </Row>
              </Section>

              {/* TimeTrak Access */}
              <Section title="TimeTrak Access">
                <Row>
                  <Field label="TimeTrak Role">
                    <select value={form.timetrak_role} onChange={e=>setForm(f=>({...f,timetrak_role:e.target.value}))} style={inputStyle}>
                      <option value="staff">Staff</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="hr">HR</option>
                      <option value="admin">Admin</option>
                    </select>
                  </Field>
                  <Field label="Supervisor">
                    <select value={form.supervisor_id} onChange={e=>setForm(f=>({...f,supervisor_id:e.target.value}))} style={inputStyle}>
                      <option value="">— None —</option>
                      {supervisors
                        .filter(s => !editingStaff || s.id !== editingStaff.id)
                        .map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </Field>
                </Row>
                {!addingNew && (
                  <Field label="Status">
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={form.is_active}
                        onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} />
                      Active (uncheck to archive)
                    </label>
                  </Field>
                )}
              </Section>

              {/* Default Schedule */}
              <Section title="Default Schedule" subtitle='Used by the "Fill Default Schedule" button on timecards'>
                <Row>
                  <Field label="Time In">
                    <input type="time" value={form.sched_in}
                      onChange={e=>setForm(f=>({...f,sched_in:e.target.value}))} style={inputStyle} />
                  </Field>
                  <Field label="Lunch Out">
                    <input type="time" value={form.sched_lunch_out}
                      onChange={e=>setForm(f=>({...f,sched_lunch_out:e.target.value}))} style={inputStyle} />
                  </Field>
                </Row>
                <Row>
                  <Field label="Lunch In">
                    <input type="time" value={form.sched_lunch_in}
                      onChange={e=>setForm(f=>({...f,sched_lunch_in:e.target.value}))} style={inputStyle} />
                  </Field>
                  <Field label="Time Out">
                    <input type="time" value={form.sched_out}
                      onChange={e=>setForm(f=>({...f,sched_out:e.target.value}))} style={inputStyle} />
                  </Field>
                </Row>
                <div style={{ background:'#f0f4ff', borderRadius:6, padding:'8px 12px', fontSize:12, color:C.navy }}>
                  📋 {fmt12(form.sched_in)} → Lunch {fmt12(form.sched_lunch_out)}–{fmt12(form.sched_lunch_in)} → {fmt12(form.sched_out)}
                  <span style={{ marginLeft:8, color:C.gray }}>
                    ({calcHours(form.sched_in,form.sched_lunch_out,form.sched_lunch_in,form.sched_out)} hrs/day)
                  </span>
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div style={{ padding:'14px 24px', borderTop:'1px solid #e2e4e9',
              display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={closeModal} style={{ padding:'8px 18px', borderRadius:6, fontSize:13,
                fontWeight:600, background:'#f3f4f6', color:C.navy, border:'none', cursor:'pointer' }}>
                Cancel
              </button>
              <button
                onClick={addingNew ? handleAdd : handleSave}
                disabled={saving || !form.full_name.trim() || (addingNew && !form.email.trim())}
                style={{ padding:'8px 20px', borderRadius:6, fontSize:13, fontWeight:600,
                  background: saving ? '#94a3b8' : C.navy, color:'#fff',
                  border:'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : addingNew ? 'Add Staff Member' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, maxWidth:400, width:'100%',
            boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            {confirm.type === 'archive' ? (
              <>
                <div style={{ fontSize:15, fontWeight:700, color:C.navy, marginBottom:8 }}>
                  Archive {confirm.person.full_name}?
                </div>
                <div style={{ fontSize:13, color:C.gray, marginBottom:20, lineHeight:1.5 }}>
                  They will no longer appear in active staff lists and won't be able to submit timecards.
                  All historical data is preserved. You can restore them at any time.
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                  <button onClick={()=>setConfirm(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={()=>handleArchive(confirm.person)}
                    style={{ ...btnStyle('#f59e0b'), padding:'8px 18px', fontSize:13 }}>
                    Archive
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:15, fontWeight:700, color:'#dc2626', marginBottom:8 }}>
                  Delete {confirm.person.full_name}?
                </div>
                <div style={{ fontSize:13, color:C.gray, marginBottom:20, lineHeight:1.5 }}>
                  This permanently removes their profile. If they have any timecards or leave entries,
                  the delete will be blocked and you'll be asked to archive instead.
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                  <button onClick={()=>setConfirm(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={()=>handleDelete(confirm.person)}
                    style={{ ...btnStyle('#dc2626'), padding:'8px 18px', fontSize:13 }}>
                    Delete Permanently
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:3000,
          padding:'12px 20px', borderRadius:8, fontSize:13, fontWeight:600,
          background: toast.type==='error' ? '#dc2626' : toast.type==='info' ? '#2c3e7e' : '#16a34a',
          color:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,0.2)', maxWidth:380 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.navy, textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>
        {subtitle && <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{children}</div>
    </div>
  )
}
function Row({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>{children}</div>
}
function Field({ label, required, children }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>
        {label}{required && <span style={{ color:'#dc2626', marginLeft:2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}
const inputStyle = { width:'100%', padding:'7px 10px', borderRadius:6,
  border:'1px solid #d1d5db', fontSize:13, outline:'none', color:'#111827', boxSizing:'border-box' }
const btnStyle = (bg) => ({
  padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600,
  background:bg, color:'#fff', border:'none', cursor:'pointer', whiteSpace:'nowrap',
})
const cancelBtnStyle = { padding:'8px 18px', borderRadius:6, fontSize:13, fontWeight:600,
  background:'#f3f4f6', color:C.gray, border:'none', cursor:'pointer' }

function fmt12(t) {
  if (!t) return '—'
  const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
function calcHours(i,lo,li,o) {
  const m = t => { if(!t) return 0; const [h,mm]=t.split(':').map(Number); return h*60+mm }
  const total = (m(lo)-m(i)+m(o)-m(li))/60
  return total>0 ? total.toFixed(1) : '—'
}
