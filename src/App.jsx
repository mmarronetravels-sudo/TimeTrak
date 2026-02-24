import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import MyTimecard from './pages/MyTimecard';
import MyLeave from './pages/MyLeave';
import MyBalances from './pages/MyBalances';
import ReviewTimecards from './pages/ReviewTimecards';
import LeaveApproval from './pages/LeaveApproval';
import LeaveTracker from './pages/LeaveTracker';
import LeaveEntries from './pages/LeaveEntries';
import HRTimecards from './pages/HRTimecards';
import SupervisorAssignments from './pages/SupervisorAssignments';
import Compliance from './pages/Compliance';
import Staff from './pages/Staff';

function Layout({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<Navigate to="/dashboard" />} />

          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/my-timecard" element={<ProtectedRoute><Layout><MyTimecard /></Layout></ProtectedRoute>} />
          <Route path="/my-leave" element={<ProtectedRoute><Layout><MyLeave /></Layout></ProtectedRoute>} />
          <Route path="/my-balances" element={<ProtectedRoute><Layout><MyBalances /></Layout></ProtectedRoute>} />

          <Route path="/review-timecards" element={<ProtectedRoute roles={['supervisor', 'admin']}><Layout><ReviewTimecards /></Layout></ProtectedRoute>} />
          <Route path="/leave-approval" element={<ProtectedRoute roles={['supervisor', 'admin']}><Layout><LeaveApproval /></Layout></ProtectedRoute>} />

          <Route path="/leave-tracker" element={<ProtectedRoute roles={['hr', 'admin']}><Layout><LeaveTracker /></Layout></ProtectedRoute>} />
          <Route path="/leave-entries" element={<ProtectedRoute roles={['hr', 'admin']}><Layout><LeaveEntries /></Layout></ProtectedRoute>} />
          <Route path="/hr-timecards" element={<ProtectedRoute roles={['hr', 'admin']}><Layout><HRTimecards /></Layout></ProtectedRoute>} />
          <Route path="/supervisor-assignments" element={<ProtectedRoute roles={['hr', 'admin']}><Layout><SupervisorAssignments /></Layout></ProtectedRoute>} />
          <Route path="/compliance" element={<ProtectedRoute roles={['hr', 'admin']}><Layout><Compliance /></Layout></ProtectedRoute>} />

          <Route path="/staff" element={<ProtectedRoute roles={['admin']}><Layout><Staff /></Layout></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}