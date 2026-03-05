import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const C = { navy: '#2c3e7e', orange: '#f3843e', gray: '#666666' }

const ROLE_LABELS = {
  admin:      'Admin',
  hr:         'HR',
  supervisor: 'Supervisor',
  staff:      'Staff',
}

const ROLE_COLORS = {
  admin:      { bg: '#fce7f3', fg: '#9d174d' },
  hr:         { bg: '#dbeafe', fg: '#1e40af' },
  supervisor: { bg: '#d1fae5', fg: '#065f46' },
  staff:      { bg: '#f3f4f6', fg: '#374151' },
}

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.staff
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg,
    }}>
      {ROLE_LABELS[role] || role}
    </span>
  )
}

const EMPTY_FORM = {
  full_name:        '',
  position:         '',
  building:         '',
  timetrak_role:    'staff',
  supervisor_id:    '',
  contract_days:    '',
  hire_date:        '',
  is_active:        true,
  // default_schedule fields (stored as JSONB)
  sched_in:         '07:30',
  sched_lunch_out:  '12:00',
  sched_lunch_in:   '12:30',
  sched_out:        '16:00',
}

function scheduleFromProfile(profile) {
  const s = profile.default_schedule || {}
  return {
    sched_in:        s.in        || '07:30',
    sched_lunch_out: s.lunchOut  || '12:00',
    sched_lunch_in:  s.lunchIn   || '12:30',
    sched_out:       s.out       || '16:00',
  }
}

export default function Staff() {
  const { profile: currentProfile } = useAuth()
  const [staff,       setStaff]       = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [searchTerm,  setSearchTerm]  = useState('')
  const [filterRole,  setFilterRole]  = useState('all')
  const [editingStaff, setEditingStaff] = useState(null)  // profile object being edited
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => { if (currentProfile) fetchStaff() }, [currentProfile?.id])

  const fetchStaff = async () => {
    setLoading(true)
    // Let RLS handle tenant scoping server-side via get_my_tenant_id().
    // Avoids issues if currentProfile.tenant_id is null on first render.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    if (error) console.error('Staff fetch error:', error)
    if (data) {
      setStaff(data)
      setSupervisors(data.filter(p => ['admin', 'hr', 'supervisor'].includes(p.timetrak_role)))
    }
    setLoading(false)
  }

  const openEdit = (person) => {
    setEditingStaff(person)
    setForm({
      full_name:     person.full_name     || '',
      position:      person.position      || '',
      building:      person.building      || '',
      timetrak_role: person.timetrak_role || 'staff',
      supervisor_id: person.supervisor_id || '',
      contract_days: person.contract_days != null ? String(person.contract_days) : '',
      hire_date:     person.hire_date     || '',
      is_active:     person.is_active !== false,
      ...scheduleFromProfile(person),
    })
  }

  const closeEdit = () => { setEditingStaff(null); setForm(EMPTY_FORM) }

  const handleSave = async () => {
    if (!form.full_name.trim()) return
    setSaving(true)

    const default_schedule = {
      in:       form.sched_in,
      lunchOut: form.sched_lunch_out,
      lunchIn:  form.sched_lunch_in,
      out:      form.sched_out,
    }

    const updates = {
      full_name:        form.full_name.trim(),
      position:         form.position.trim() || null,
      building:         form.building.trim() || null,
      timetrak_role:    form.timetrak_role || null,
      supervisor_id:    form.supervisor_id || null,
      contract_days:    form.contract_days ? parseInt(form.contract_days) : null,
      hire_date:        form.hire_date || null,
      is_active:        form.is_active,
      default_schedule,
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', editingStaff.id)

    if (error) {
      showToast('Error saving: ' + error.message, 'error')
    } else {
      showToast(`${form.full_name} updated`)
      await fetchStaff()
      closeEdit()
    }
    setSaving(false)
  }

  const filtered = staff.filter(p => {
    const matchSearch = !searchTerm ||
      (p.full_name  || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.position   || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.building   || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchRole = filterRole === 'all' || p.timetrak_role === filterRole
    return matchSearch && matchRole
  })

  const getSupervisorName = (id) => {
    if (!id) return '—'
    const s = staff.find(p => p.id === id)
    return s ? s.full_name : '—'
  }

  const hasSchedule = (p) => !!p.default_schedule

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.navy }}>Staff Directory</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.gray }}>
            {staff.length} staff members · Click Edit to update schedule, role, or contract details
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name, position, building…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 6,
              border: '1px solid #e2e4e9', fontSize: 13, outline: 'none', color: C.navy,
            }}
          />
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e4e9', fontSize: 13, color: C.navy, background: '#fff' }}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="hr">HR</option>
            <option value="supervisor">Supervisor</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.gray }}>Loading staff…</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  {['Name', 'Position', 'Building', 'Role', 'Supervisor', 'Contract', 'Schedule', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#fff',
                      textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((person, i) => (
                  <tr
                    key={person.id}
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f0f1f3' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.navy }}>{person.full_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{person.email}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: C.gray }}>{person.position || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: C.gray }}>{person.building || '—'}</td>
                    <td style={{ padding: '10px 12px' }}><RoleBadge role={person.timetrak_role} /></td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: C.gray }}>{getSupervisorName(person.supervisor_id)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: C.gray }}>
                      {person.contract_days ? `${person.contract_days}d` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {hasSchedule(person) ? (
                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Set</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Not set</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: person.is_active ? '#16a34a' : '#dc2626',
                      }}>
                        {person.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => openEdit(person)}
                        style={{
                          padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                          background: C.navy, color: '#fff', border: 'none', cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: C.gray, fontSize: 13 }}>
                      No staff found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Modal ─────────────────────────────────────────── */}
      {editingStaff && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #e2e4e9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>Edit Staff Member</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{editingStaff.email}</div>
              </div>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gray }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Basic Info */}
              <Section title="Basic Information">
                <Field label="Full Name" required>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Full name"
                  />
                </Field>
                <Row>
                  <Field label="Position">
                    <input
                      value={form.position}
                      onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                      style={inputStyle}
                      placeholder="e.g. Paraprofessional"
                    />
                  </Field>
                  <Field label="Building">
                    <input
                      value={form.building}
                      onChange={e => setForm(f => ({ ...f, building: e.target.value }))}
                      style={inputStyle}
                      placeholder="e.g. Main Office"
                    />
                  </Field>
                </Row>
                <Row>
                  <Field label="Hire Date">
                    <input
                      type="date"
                      value={form.hire_date}
                      onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Contract Days">
                    <input
                      type="number"
                      value={form.contract_days}
                      onChange={e => setForm(f => ({ ...f, contract_days: e.target.value }))}
                      style={inputStyle}
                      placeholder="e.g. 192, 260"
                      min={0} max={365}
                    />
                  </Field>
                </Row>
              </Section>

              {/* TimeTrak Role & Supervisor */}
              <Section title="TimeTrak Access">
                <Row>
                  <Field label="TimeTrak Role">
                    <select
                      value={form.timetrak_role}
                      onChange={e => setForm(f => ({ ...f, timetrak_role: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="staff">Staff</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="hr">HR</option>
                      <option value="admin">Admin</option>
                    </select>
                  </Field>
                  <Field label="Supervisor">
                    <select
                      value={form.supervisor_id}
                      onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">— None —</option>
                      {supervisors
                        .filter(s => s.id !== editingStaff.id)
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.full_name}</option>
                        ))
                      }
                    </select>
                  </Field>
                </Row>
                <Field label="Status">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active (uncheck to deactivate)
                  </label>
                </Field>
              </Section>

              {/* Default Schedule */}
              <Section title="Default Schedule" subtitle='Used by the "Fill Default Schedule" button on timecards'>
                <Row>
                  <Field label="Time In">
                    <input
                      type="time"
                      value={form.sched_in}
                      onChange={e => setForm(f => ({ ...f, sched_in: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Lunch Out">
                    <input
                      type="time"
                      value={form.sched_lunch_out}
                      onChange={e => setForm(f => ({ ...f, sched_lunch_out: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                </Row>
                <Row>
                  <Field label="Lunch In">
                    <input
                      type="time"
                      value={form.sched_lunch_in}
                      onChange={e => setForm(f => ({ ...f, sched_lunch_in: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Time Out">
                    <input
                      type="time"
                      value={form.sched_out}
                      onChange={e => setForm(f => ({ ...f, sched_out: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                </Row>
                {/* Preview */}
                <div style={{
                  background: '#f0f4ff', borderRadius: 6, padding: '8px 12px',
                  fontSize: 12, color: C.navy, marginTop: 4,
                }}>
                  📋 Preview: {fmt12(form.sched_in)} → Lunch {fmt12(form.sched_lunch_out)}–{fmt12(form.sched_lunch_in)} → {fmt12(form.sched_out)}
                  <span style={{ marginLeft: 8, color: C.gray }}>
                    ({calcHours(form.sched_in, form.sched_lunch_out, form.sched_lunch_in, form.sched_out)} hrs/day)
                  </span>
                </div>
              </Section>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #e2e4e9',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              <button onClick={closeEdit} style={{
                padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: '#f3f4f6', color: C.navy, border: 'none', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.full_name.trim()}
                style={{
                  padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: saving ? '#94a3b8' : C.navy, color: '#fff',
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.type === 'error' ? '#dc2626' : '#16a34a',
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Small layout helpers ───────────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Field({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
  color: '#111827', boxSizing: 'border-box',
}

// ── Time helpers ───────────────────────────────────────────────────────────
function fmt12(time24) {
  if (!time24) return '—'
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function calcHours(timeIn, lunchOut, lunchIn, timeOut) {
  const toMins = t => {
    if (!t) return 0
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const morningMins  = toMins(lunchOut) - toMins(timeIn)
  const afternoonMins = toMins(timeOut) - toMins(lunchIn)
  const total = (morningMins + afternoonMins) / 60
  return total > 0 ? total.toFixed(1) : '—'
}
