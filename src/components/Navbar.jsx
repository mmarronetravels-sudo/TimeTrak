import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const C = {
  navy: '#2c3e7e',
  orange: '#f3843e',
};

export default function Navbar() {
  const { profile, signOut, isAdmin, isHR, isSupervisor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Close mobile menu on any route change or re-render trigger ──
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!profile) return null;
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const links = [];

  // Everyone gets these
  links.push({ to: '/dashboard', label: 'Dashboard', icon: '📊' });
  links.push({ to: '/my-timecard', label: 'My Timecard', icon: '⏱' });
  links.push({ to: '/my-leave', label: 'Leave Requests', icon: '📋' });
  links.push({ to: '/my-balances', label: 'Leave Balances', icon: '📊' });

  // Supervisor gets these
  if (isSupervisor) {
    links.push({ to: '/review-timecards', label: 'Review Timecards', icon: '✅' });
    links.push({ to: '/leave-approval', label: 'Leave Approval', icon: '📋' });
    links.push({ to: '/weekly-leave', label: 'Weekly Leave', icon: '📅' });
  }

  // HR gets these
  if (isHR) {
    links.push({ to: '/leave-tracker', label: 'Leave Tracker', icon: '👥' });
    links.push({ to: '/leave-entries', label: 'All Entries', icon: '📝' });
    links.push({ to: '/weekly-leave', label: 'Weekly Leave', icon: '📅' });
    links.push({ to: '/hr-timecards', label: 'Timecard Review', icon: '⏱' });
    links.push({ to: '/supervisor-assignments', label: 'Assignments', icon: '🔗' });
    links.push({ to: '/compliance', label: 'Compliance', icon: '⚖️' });
  }

  // Admin gets staff directory
  if (isAdmin) {
    links.push({ to: '/staff', label: 'Staff', icon: '👤' });
  }

  const isActive = (path) => location.pathname === path;

  return (
    <nav style={{ background: C.navy }} className="shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-14">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: C.orange }}>TT</div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">TimeTrak</span>
              <span className="text-blue-200 text-xs ml-2 hidden sm:inline">ScholarPath Systems</span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  isActive(link.to)
                    ? 'bg-white/20 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side: product switcher + user info + sign out + mobile menu */}
          <div className="flex items-center gap-3">
            {/* Product Switcher */}
            <a
              href="https://stafftrak.scholarpathsystems.org"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors"
              title="Switch to StaffTrak"
            >
              <span>StaffTrak</span>
              <span>→</span>
            </a>
            <div className="hidden sm:block text-right">
              <p className="text-white text-sm font-medium">{profile.full_name}</p>
              <p className="text-blue-200 text-[10px] uppercase tracking-wide">{profile.timetrak_role}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="hidden sm:block px-3 py-1.5 rounded-md text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-all"
            >
              Sign Out
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/10"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen
                  ? <path d="M18 6L6 18M6 6l12 12" />
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
                }
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-white/10 px-4 py-3 space-y-1">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
                isActive(link.to)
                  ? 'bg-white/20 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="mr-2">{link.icon}</span>
              {link.label}
            </Link>
          ))}
          <div className="border-t border-white/10 pt-2 mt-2">
            <p className="text-blue-200 text-xs px-3 mb-1">{profile.full_name} · {profile.timetrak_role}</p>
            <a
              href="https://stafftrak.scholarpathsystems.org"
              className="block px-3 py-2 rounded-md text-sm font-semibold text-[#f3843e] hover:text-white hover:bg-white/10 transition-all"
            >
              Switch to StaffTrak →
            </a>
            <button onClick={handleSignOut} className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10">
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
