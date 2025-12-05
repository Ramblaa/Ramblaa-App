import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  MessageSquare, 
  CheckSquare2, 
  AlertTriangle, 
  Layers, 
  Building2, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  X,
  PlayCircle,
  User,
  Calendar,
  UserCog
} from 'lucide-react'
import { Button } from './ui/button'
import { useAuth } from '../contexts/AuthContext'

const navigation = [
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare2 },
  { name: 'Sandbox', href: '/sandbox', icon: PlayCircle },
  { name: 'Escalations', href: '/escalations', icon: AlertTriangle },
  { name: 'Resources', href: '/resources', icon: Layers },
  { name: 'Properties', href: '/properties', icon: Building2 },
  { name: 'Bookings', href: '/bookings', icon: Calendar },
  { name: 'Staff', href: '/staff', icon: UserCog },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ease-linear duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
        
        <div className={`relative flex-1 flex flex-col max-w-xs w-full bg-brand-dark transform ease-in-out duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebarOpen && (
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
          )}
          
          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div className="flex h-16 items-center px-6 border-b border-brand-mid-gray/20">
              <h1 className="text-xl font-bold text-white">Ramble</h1>
            </div>
            <nav className="mt-5 px-2 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-brand-purple text-white'
                        : 'text-brand-light-gray hover:bg-brand-mid-gray/20 hover:text-white'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>
          
          {/* User info and logout */}
          <div className="flex-shrink-0 flex border-t border-brand-mid-gray/20 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-brand-purple flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-brand-light-gray">
                  {user?.email}
                </p>
                {isAdmin() && (
                  <p className="text-xs text-brand-vanilla font-medium">
                    Admin
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="ml-auto text-brand-light-gray hover:text-white hover:bg-brand-mid-gray/20"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 bg-brand-dark">
            {/* Logo */}
            <div className="flex h-16 items-center px-6 border-b border-brand-mid-gray/20">
              <h1 className="text-xl font-bold text-white">Ramble</h1>
            </div>
            
            {/* Navigation */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <nav className="flex-1 px-2 py-4 space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-brand-purple text-white'
                          : 'text-brand-light-gray hover:bg-brand-mid-gray/20 hover:text-white'
                      }`}
                    >
                      <Icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
              
              {/* User info and logout */}
              <div className="flex-shrink-0 flex border-t border-brand-mid-gray/20 p-4">
                <div className="flex items-center w-full">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-brand-purple flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-white">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-brand-light-gray">
                      {user?.email}
                    </p>
                    {isAdmin() && (
                      <p className="text-xs text-brand-vanilla font-medium">
                        Admin
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-brand-light-gray hover:text-white hover:bg-brand-mid-gray/20"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden">
          <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
            <button
              type="button"
              className="px-4 border-r border-gray-200 text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-purple md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex-1 px-4 flex justify-between">
              <div className="flex-1 flex">
                <div className="w-full flex md:ml-0">
                  <div className="flex items-center text-lg font-semibold text-brand-dark">
                    Ramble
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
} 