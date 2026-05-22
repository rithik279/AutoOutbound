import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Zap, LayoutDashboard, Users, Mail, Settings,
  LogOut, Plus, ChevronRight, Menu, X
} from 'lucide-react'
import { cn } from '../lib/cn.js'
import App from '../App.jsx'

// Sidebar nav items — map to App.jsx phases
const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',   phase: 'entry' },
  { icon: Plus,            label: 'New Campaign', phase: 'entry' },
  { icon: Users,           label: 'My Contacts',  phase: 'my_contacts' },
  { icon: Mail,            label: 'Sent Emails',  phase: 'sent_history' },
  { icon: Settings,        label: 'Settings',     phase: 'settings' },
]

export default function AppShell() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // AppShell wraps the existing App.jsx — which handles all auth + phase logic internally.
  // We render App.jsx inside the shell and pass a phase controller via a bridge pattern.
  // The sidebar calls into App via a shared phaseController ref that App exposes.
  const [phaseController, setPhaseController] = useState(null)
  const [activePhase, setActivePhase] = useState('entry')
  const [currentUser, setCurrentUser] = useState(null)

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && currentUser && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR — only when logged in */}
      {currentUser && (
      <aside className={cn(
        'fixed lg:relative inset-y-0 left-0 z-30 w-56 bg-white border-r border-surface-200 flex flex-col transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-surface-100">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">FirstShot</span>
          </button>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const isActive = activePhase === item.phase
            return (
              <button
                key={item.label}
                onClick={() => {
                  phaseController?.setPhase(item.phase)
                  setActivePhase(item.phase)
                  setSidebarOpen(false)
                }}
                className={cn(
                  'sidebar-link w-full text-left',
                  isActive && 'active'
                )}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* User footer */}
        {currentUser && (
          <div className="p-3 border-t border-surface-100">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-50">
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(currentUser.name || currentUser.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{currentUser.name || 'User'}</div>
                <div className="text-[10px] text-gray-400 truncate">{currentUser.email}</div>
              </div>
            </div>
          </div>
        )}
      </aside>
      )}

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar — mobile only */}
        <div className="lg:hidden h-14 flex items-center gap-3 px-4 bg-white border-b border-surface-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">FirstShot</span>
          </div>
        </div>

        {/* App content — existing App.jsx fills this area */}
        <div className="flex-1 overflow-y-auto">
          <App
            onPhaseChange={setActivePhase}
            onPhaseControllerReady={setPhaseController}
            onUserChange={setCurrentUser}
          />
        </div>
      </div>
    </div>
  )
}
