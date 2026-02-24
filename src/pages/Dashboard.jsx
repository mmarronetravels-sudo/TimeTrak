import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const C = { navy: '#2c3e7e', blue: '#477fc1', orange: '#f3843e', green: '#16a34a', red: '#dc2626', amber: '#d97706' };

export default function Dashboard() {
  const { profile, isHR, isSupervisor } = useAuth();
  const [pendingTimecards, setPendingTimecards] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [hrPending, setHrPending] = useState(0);
  const [myTimecardStatus, setMyTimecardStatus] = useState(null);

  useEffect(() => {
    loadCounts();
  }, [profile]);

  const loadCounts = async () => {
    if (!profile) return;

    // My latest timecard status
    const { data: myTc } = await supabase
      .from('timecards')
      .select('status')
      .eq('staff_id', profile.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .single();
    if (myTc) setMyTimecardStatus(myTc.status);

    // Supervisor: pending timecards from assigned staff
    if (isSupervisor) {
      const { count: tcCount } = await supabase
        .from('timecards')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted')
        .in('staff_id', (await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)).data?.map(p => p.id) || []);
      setPendingTimecards(tcCount || 0);

      const { count: leaveCount } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .in('staff_id', (await supabase.from('profiles').select('id').eq('supervisor_id', profile.id)).data?.map(p => p.id) || []);
      setPendingLeave(leaveCount || 0);
    }

    // HR: supervisor-approved timecards waiting for verification
    if (isHR) {
      const { count: hrCount } = await supabase
        .from('timecards')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'supervisor_approved');
      setHrPending(hrCount || 0);
    }
  };

  const statusLabel = {
    draft: 'In Progress',
    submitted: 'Submitted — Awaiting Approval',
    supervisor_approved: 'Supervisor Approved — Awaiting HR',
    verified: 'Verified ✓',
    returned: 'Returned — Needs Correction',
  };

  const statusColor = {
    draft: C.navy,
    submitted: C.blue,
    supervisor_approved: C.blue,
    verified: C.green,
    returned: C.orange,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.navy }}>Welcome, {profile?.full_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{profile?.position} · {profile?.building} · {profile?.role}</p>
      </div>

      {/* My Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Link to="/my-timecard" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: statusColor[myTimecardStatus] || C.navy }}>
          <p className="text-sm text-gray-500">My Timecard</p>
          <p className="text-lg font-bold mt-1" style={{ color: statusColor[myTimecardStatus] || C.navy }}>
            {myTimecardStatus ? statusLabel[myTimecardStatus] : 'No timecard this week'}
          </p>
        </Link>
        <Link to="/my-leave" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
          <p className="text-sm text-gray-500">Leave Requests</p>
          <p className="text-lg font-bold mt-1" style={{ color: C.blue }}>View & Request</p>
        </Link>
        <Link to="/my-balances" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: C.green }}>
          <p className="text-sm text-gray-500">Leave Balances</p>
          <p className="text-lg font-bold mt-1" style={{ color: C.green }}>View Balances</p>
        </Link>
      </div>

      {/* Supervisor Cards */}
      {isSupervisor && (
        <>
          <h2 className="text-lg font-bold mb-3" style={{ color: C.navy }}>Supervisor Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Link to="/review-timecards" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: pendingTimecards > 0 ? C.red : C.navy }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Timecards to Review</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: pendingTimecards > 0 ? C.red : C.navy }}>{pendingTimecards}</p>
                </div>
                <span className="text-2xl">📝</span>
              </div>
            </Link>
            <Link to="/leave-approval" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: pendingLeave > 0 ? C.orange : C.navy }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Pending Leave Requests</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: pendingLeave > 0 ? C.orange : C.navy }}>{pendingLeave}</p>
                </div>
                <span className="text-2xl">📋</span>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* HR Cards */}
      {isHR && (
        <>
          <h2 className="text-lg font-bold mb-3" style={{ color: C.navy }}>HR / Payroll</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Link to="/hr-timecards" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: hrPending > 0 ? C.amber : C.navy }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Awaiting HR Verification</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: hrPending > 0 ? C.amber : C.navy }}>{hrPending}</p>
                </div>
                <span className="text-2xl">⏱</span>
              </div>
            </Link>
            <Link to="/leave-tracker" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
              <p className="text-sm text-gray-500">Leave Tracker</p>
              <p className="text-lg font-bold mt-1" style={{ color: C.blue }}>Manage Staff Leave</p>
            </Link>
            <Link to="/supervisor-assignments" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
              <p className="text-sm text-gray-500">Supervisor Assignments</p>
              <p className="text-lg font-bold mt-1" style={{ color: C.blue }}>Manage Assignments</p>
            </Link>
          </div>
        </>
      )}

      {/* Approval Workflow Reference */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-sm mb-3" style={{ color: C.navy }}>Timecard Approval Workflow</h3>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold">Draft</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-semibold">Submitted</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 font-semibold">Supervisor Approved</span>
          <span className="text-gray-400">→</span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-semibold">HR Verified ✓</span>
          <span className="mx-2 text-gray-300">|</span>
          <span className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 font-semibold">↩ Returned</span>
          <span className="text-gray-400 text-[10px]">(at any step)</span>
        </div>
      </div>
    </div>
  );
}