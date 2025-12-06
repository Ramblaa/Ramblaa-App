import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import LoginPage from './pages/LoginPage'
import EmailVerificationPage from './pages/EmailVerificationPage'
import MessagesPage from './pages/MessagesPage'
import TasksPage from './pages/TasksPage'
import TaskDetailPage from './pages/TaskDetailPage'
import EscalationsPage from './pages/EscalationsPage'
import ResourcesPage from './pages/ResourcesPage'
import PropertiesPage from './pages/PropertiesPage'
import StaffPage from './pages/StaffPage'
import BookingsPage from './pages/BookingsPage'
import ScheduledMessagesPage from './pages/ScheduledMessagesPage'
import SettingsPage from './pages/SettingsPage'
import SandboxPage from './pages/SandboxPage'
import Layout from './components/Layout'
import { NotificationProvider } from './contexts/NotificationContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-ink-900">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppContent() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<EmailVerificationPage />} />
        
        {/* Protected Routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/messages" replace />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
                <Route path="/sandbox" element={<SandboxPage />} />
                <Route path="/escalations" element={<EscalationsPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/faqs" element={<Navigate to="/resources" replace />} />
                <Route path="/properties" element={<PropertiesPage />} />
                <Route path="/bookings" element={<BookingsPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/scheduled" element={<ScheduledMessagesPage />} />
                <Route path="/contacts" element={<Navigate to="/staff" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  )
}

function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </NotificationProvider>
  )
}

export default App
