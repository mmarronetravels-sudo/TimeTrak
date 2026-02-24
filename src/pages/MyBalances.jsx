import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e' };

function getProration(contractDays) {
  if (!contractDays || contractDays === 0) return 0;
  return +((contractDays / 260) * 480).toFixed(2);
}

export default function MyBalances() {
  const { profile } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [periods, setPeriods] = useState([]);

  useEffect(() => { if (profile) loadData(); }, [profile]);

  const loadData = async () => {
    const { data: lt } = await supabase.from('leave_types').select('*').order('sort_order');
    if (lt) setLeaveTypes(lt);

    const { data: bal } = await supabase
      .from('leave_balances')
      .select('*, leave_types(name, code, category)')
      .eq('staff_id', profile.id)
      .eq('school_year', '2025-2026');
    if (bal) setBalances(bal);

    const { data: per } = await supabase
      .from('protected_leave_periods')
      .select('*, leave_types(name, code, category)')
      .eq('staff_id', profile.id)
      .eq('status', 'active');
    if (per) setPeriods(per);
  };

  const schoolBalances = balances.filter(b => b.leave_types?.category === 'school_provided');
  const entitlement = getProration(profile?.contract_days);

  const protectedTypes = leaveTypes.filter(lt => lt.category !== 'school_provided');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Leave Balances</h2>
        <p className="text-sm text-gray-500 mt-0.5">{profile?.full_name} · {profile?.position} · School Year 2025-2026</p>
      </div>

      {/* School-Provided Leave */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-5">
        <h3 className="font-bold text-lg mb-4" style={{ color: C.navy }}>School-Provided Leave</h3>
        <div className="space-y-5">
          {schoolBalances.map(bal => {
            const remaining = +(bal.allocated - bal.used).toFixed(1);
            const pct = bal.allocated > 0 ? (bal.used / bal.allocated) * 100 : 0;
            return (
              <div key={bal.id}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800">{bal.leave_types?.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">School</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: C.navy }}>{bal.used} / {bal.allocated} days used</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-green-400'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{remaining} days remaining ({(remaining * 8).toFixed(0)} hrs)</p>
              </div>
            );
          })}
          {schoolBalances.length === 0 && (
            <p className="text-sm text-gray-400">No school-provided leave balances found. Contact HR if this seems wrong.</p>
          )}
        </div>
      </div>

      {/* Protected Leave */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-lg mb-1" style={{ color: C.navy }}>Protected Leave (Rolling 12-Month Periods)</h3>
        <p className="text-xs text-gray-500 mb-4">
          {profile?.contract_days ? `${profile.contract_days}-day contract → ${entitlement} hrs entitlement (prorated from 480 hrs)` : 'Contract days not set — contact HR'}
        </p>
        <div className="space-y-5">
          {protectedTypes.map(lt => {
            const period = periods.find(p => p.leave_types?.code === lt.code);
            const remaining = period ? period.hours_remaining : entitlement;
            const used = period ? period.hours_used : 0;
            const total = period ? period.prorated_entitlement_hours : entitlement;
            const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;

            return (
              <div key={lt.id}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800">{lt.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${lt.category === 'federal' ? 'bg-green-50 text-green-700' : 'bg-teal-50 text-teal-700'}`}>
                      {lt.category === 'federal' ? 'Federal' : 'State'}
                    </span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: C.navy }}>{remaining.toFixed(1)} hrs available</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="h-3 rounded-full bg-green-400 transition-all duration-500" style={{ width: `${Math.max(0, 100 - pct)}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {used > 0
                    ? `${used} hrs used — period active (${period?.period_start} → ${period?.period_end})`
                    : 'No leave used yet — period starts when first entry is logged.'
                  }
                  {total > 0 && ` · ${total.toFixed(1)} hrs total entitlement`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}