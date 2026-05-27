import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser, SignOutButton } from '@clerk/clerk-react'
import {
  Zap, Plus, Users, Mail, Settings,
  LogOut, Menu, X
} from 'lucide-react'
import { cn } from '../lib/cn.js'
import App from '../App.jsx'

const NAV = [
  { icon: Plus,     label: 'New Campaign', phase: 'entry' },
  { icon: Users,    label: 'My Contacts',  phase: 'my_contacts' },
  { icon: Mail,     label: 'Sent Emails',  phase: 'sent_history' },
  { icon: Settings, label: 'Settings',     phase: 'settings' },
]

export default function AppShell() {
  const navigate   = useNavigate()
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth()
  const { user }   = useUser()

  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [phaseController, setPhaseController] = useState(null)
  const [activePhase,    setActivePhase]    = useState('entry')

  // ── Redirect to sign-in if not authenticated ──────────────────────────────
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/sign-in')
    }
  }, [isLoaded, isSignedIn, navigate])

  // ── Global fetch interceptor — injects Authorization: Bearer <token> ──────
  // This means App.jsx's 30+ fetch calls need zero changes.
  useEffect(() => {
    if (!isSignedIn) return

    const originalFetch = window.fetch.bind(window)

    window.fetch = async (url, opts = {}) => {
      // Only intercept our own API calls
      if (typeof url === 'string' && (url.startsWith('/api') || url.includes(import.meta.env.VITE_API_URL || ''))) {
        try {
          const token = await getToken()
          if (token) {
            opts = {
              ...opts,
              headers: {
                ...opts?.headers,
                Authorization: `Bearer ${token}`,
              },
            }
          }
        } catch {}
      }
      return originalFetch(url, opts)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [isSignedIn, getToken])

  // Build currentUser shape from Clerk user (matches what App.jsx expects)
  const currentUser = user ? {
    userId: user.id,
    name:   [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '',
    email:  user.primaryEmailAddress?.emailAddress || '',
    imageUrl: user.imageUrl,
  } : null

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) return null

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={cn(
        'fixed lg:relative inset-y-0 left-0 z-30 w-56 bg-white border-r border-surface-200 flex flex-col transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-surface-100">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">FirstShot</span>
          </button>
          <button className="ml-auto lg:hidden text-gray-400 hover:text-gray-600" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <button
              key={item.label}
              onClick={() => { phaseController?.setPhase(item.phase); setActivePhase(item.phase); setSidebarOpen(false) }}
              className={cn('sidebar-link w-full text-left', activePhase === item.phase && 'active')}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-surface-100">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-50 mb-1">
            {currentUser?.imageUrl ? (
              <img src={currentUser.imageUrl} className="w-7 h-7 rounded-full flex-shrink-0 object-cover" alt="" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(currentUser?.name || currentUser?.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-900 truncate">{currentUser?.name || 'User'}</div>
              <div className="text-[10px] text-gray-400 truncate">{currentUser?.email}</div>
            </div>
          </div>
          <SignOutButton signOutCallback={() => navigate('/')}>
            <button className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
              <LogOut size={12} /> Sign out
            </button>
          </SignOutButton>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden h-14 flex items-center gap-3 px-4 bg-white border-b border-surface-200">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">FirstShot</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <App
            currentUserOverride={currentUser}
            onPhaseChange={setActivePhase}
            onPhaseControllerReady={setPhaseController}
            onUserChange={() => {}} // handled by Clerk now
          />
        </div>
      </div>
    </div>
  )
}
