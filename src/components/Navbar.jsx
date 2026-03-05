import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', orange: '#f3843e' };

// ── Dropdown component ────────────────────────────────────────────────────
function Dropdown({ label, icon, items, isAnyActive }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          isAnyActive
            ? 'bg-white/20 text-white'
            : 'text-blue-200 hover:text-white hover:bg-white/10'
        }`}
      >
        <span>{icon}</span>
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          style={{ marginLeft: 2, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: '#fff', borderRadius: 8, minWidth: 210,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
          border: '1px solid #e5e7eb', overflow: 'hidden',
        }}>
          {items.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', fontSize: 13, fontWeight: 500,
                  color: active ? C.navy : '#374151',
                  background: active ? '#EEF2FF' : 'transparent',
                  textDecoration: 'none',
                  borderLeft: active ? `3px solid ${C.navy}` : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────
function UserMenu({ profile, onSignOut, onSwitchToStaffTrak }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = (profile.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: C.orange,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ textAlign: 'left' }} className="hidden sm:block">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
            {profile.full_name?.split(' ')[0]}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {profile.timetrak_role}
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', borderRadius: 8, minWidth: 210,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
          border: '1px solid #e5e7eb', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f1f3', background: '#f8f9fa' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{profile.full_name}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{profile.email}</div>
            <div style={{
              display: 'inline-block', marginTop: 5, padding: '2px 7px', borderRadius: 4,
              fontSize: 10, fontWeight: 700, background: '#EEF2FF', color: C.navy,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {profile.timetrak_role}
            </div>
          </div>

          {/* Switch to StaffTrak */}
          <a
            href="https://stafftrak.scholarpathsystems.org"
            onClick={(e) => { setOpen(false); onSwitchToStaffTrak(e); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              fontSize: 13, fontWeight: 500, color: C.orange, textDecoration: 'none',
              borderBottom: '1px solid #f0f1f3', transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff7f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>🔀</span>
            <span>Switch to StaffTrak</span>
            <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 12 }}>→</span>
          </a>

          {/* Sign out */}
          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#dc2626',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────
export default function Navbar() {
  const { profile, signOut, isAdmin, isHR, isSupervisor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  if (!profile) return null;

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const handleSwitchToStaffTrak = async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    window.location.href = session
      ? `https://stafftrak.scholarpathsystems.org/dashboard?token=${session.access_token}&refresh=${session.refresh_token}`
      : 'https://stafftrak.scholarpathsystems.org';
  };

  const isActive = (path) => location.pathname === path;

  // ── Nav groups ────────────────────────────────────────────────────────
  const myLeaveItems = [
    { to: '/my-leave',    label: 'Leave Requests', icon: '📋' },
    { to: '/my-balances', label: 'Leave Balances',  icon: '📊' },
  ];

  const leaveItems = [];
  if (isSupervisor || isHR || isAdmin) {
    leaveItems.push({ to: '/weekly-leave',   label: 'Weekly Leave',   icon: '📅' });
    leaveItems.push({ to: '/leave-approval', label: 'Leave Approval', icon: '✅' });
  }
  if (isHR || isAdmin) {
    leaveItems.push({ to: '/leave-tracker',  label: 'Leave Tracker',  icon: '👥' });
    leaveItems.push({ to: '/leave-entries',  label: 'All Entries',    icon: '📝' });
    leaveItems.push({ to: '/leave-reports',  label: 'Leave Reports',  icon: '📊' });
  }

  const timecardItems = [];
  if (isSupervisor || isAdmin) timecardItems.push({ to: '/review-timecards', label: 'Review Timecards', icon: '✅' });
  if (isHR || isAdmin)        timecardItems.push({ to: '/hr-timecards',      label: 'HR Timecards',     icon: '⏱' });

  const adminItems = [];
  if (isHR || isAdmin) {
    adminItems.push({ to: '/supervisor-assignments', label: 'Assignments',    icon: '🔗' });
    adminItems.push({ to: '/compliance',             label: 'Compliance',     icon: '⚖️' });
  }
  if (isAdmin) adminItems.push({ to: '/staff', label: 'Staff Directory', icon: '👤' });

  // Mobile: flat list with section dividers
  const mobileItems = [
    { to: '/dashboard',   label: 'Dashboard',  icon: '🏠' },
    { to: '/my-timecard', label: 'My Timecard', icon: '⏱' },
    ...myLeaveItems,
    ...(leaveItems.length    ? [{ divider: 'Leave Management' },    ...leaveItems]    : []),
    ...(timecardItems.length ? [{ divider: 'Timecards' },           ...timecardItems] : []),
    ...(adminItems.length    ? [{ divider: 'Admin' },               ...adminItems]    : []),
  ];

  return (
    <nav style={{ background: C.navy }} className="shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-14">

          {/* Logo */}
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.orange,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff' }}>
              TT
            </div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>TimeTrak</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5 mx-4">
            <Link to="/dashboard"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive('/dashboard') ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}>
              🏠 Dashboard
            </Link>

            <Link to="/my-timecard"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive('/my-timecard') ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}>
              ⏱ My Timecard
            </Link>

            <Dropdown label="My Leave" icon="📋" items={myLeaveItems}
              isAnyActive={myLeaveItems.some(i => isActive(i.to))} />

            {leaveItems.length > 0 && (
              <Dropdown label="Leave" icon="👥" items={leaveItems}
                isAnyActive={leaveItems.some(i => isActive(i.to))} />
            )}

            {timecardItems.length > 0 && (
              <Dropdown label="Timecards" icon="✅" items={timecardItems}
                isAnyActive={timecardItems.some(i => isActive(i.to))} />
            )}

            {adminItems.length > 0 && (
              <Dropdown label="Admin" icon="⚙️" items={adminItems}
                isAnyActive={adminItems.some(i => isActive(i.to))} />
            )}
          </div>

          {/* Right: user menu + mobile hamburger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="hidden lg:block">
              <UserMenu profile={profile} onSignOut={handleSignOut} onSwitchToStaffTrak={handleSwitchToStaffTrak} />
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen
                  ? <path d="M18 6L6 18M6 6l12 12"/>
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-white/10 px-4 py-3 space-y-0.5">
          {mobileItems.map((item, i) =>
            item.divider ? (
              <div key={i} style={{ paddingTop: 10, paddingBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 12 }}>
                  {item.divider}
                </span>
              </div>
            ) : (
              <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive(item.to) ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}>
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          )}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', paddingLeft: 12, paddingBottom: 6 }}>
              {profile.full_name} · {profile.timetrak_role}
            </div>
            <a href="https://stafftrak.scholarpathsystems.org"
              onClick={(e) => { setMobileOpen(false); handleSwitchToStaffTrak(e); }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-all"
              style={{ color: C.orange, textDecoration: 'none' }}>
              🔀 Switch to StaffTrak →
            </a>
            <button onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10">
              🚪 Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
