import { useState, useEffect, useMemo } from 'react'
import { Search, ExternalLink, RefreshCw, Download, CheckCircle, Mail, Eye, MessageSquare, AlertCircle } from 'lucide-react'
import { exportCSV } from '../../utils.js'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function OutreachTracker({ currentUser, profile }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Google Sheets sync state
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncStatus, setSyncStatus]   = useState(null)
  const [sheetInfo, setSheetInfo]     = useState(null)

  // Load contacts with emails on mount
  useEffect(() => {
    if (!currentUser) return
    loadData()
  }, [currentUser])

  // Load Google Sheets status
  useEffect(() => {
    if (!currentUser) return
    fetch(`${API_URL}/api/gsheets/status`, {
      headers: { 'x-user-id': currentUser.userId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSheetInfo(data) })
      .catch(() => {})
  }, [currentUser])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/contacts`, {
        headers: { 'x-user-id': currentUser.userId },
      })
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts || [])
      }
    } catch (e) {
      console.error('Failed to load contacts:', e)
    }
    setLoading(false)
  }

  // Build flat rows: each sent email becomes a row
  const rows = useMemo(() => {
    const result = []
    for (const contact of contacts) {
      const emails = contact.emails || []
      const sentEmails = emails.filter(e => e.sentAt)
      if (sentEmails.length === 0) continue

      for (const email of sentEmails) {
        result.push({
          company: contact.company || '',
          contactName: contact.name || '',
          email: contact.email,
          title: contact.title || '',
          status: email.repliedAt ? 'replied'
            : email.openCount > 0 ? 'opened'
            : email.failedAt ? 'failed'
            : 'sent',
          sentAt: email.sentAt,
          subject: email.subject,
          openCount: email.openCount || 0,
          repliedAt: email.repliedAt,
        })
      }
    }
    // Sort by sent date descending
    result.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    return result
  }, [contacts])

  // Filter rows
  const filtered = useMemo(() => {
    let r = rows
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row =>
        row.company.toLowerCase().includes(q) ||
        row.contactName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      r = r.filter(row => row.status === statusFilter)
    }
    return r
  }, [rows, search, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const total = rows.length
    const sent = rows.filter(r => r.status === 'sent').length
    const opened = rows.filter(r => r.status === 'opened').length
    const replied = rows.filter(r => r.status === 'replied').length
    const companies = new Set(rows.map(r => r.company)).size
    return { total, sent, opened, replied, companies }
  }, [rows])

  async function handleSync() {
    setSyncLoading(true)
    setSyncStatus(null)
    try {
      const res = await fetch(`${API_URL}/api/gsheets/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
      })
      const data = await res.json()
      if (res.ok) {
        setSyncStatus({ ok: true, message: `Synced ${data.rowCount} rows to Google Sheets` })
        setSheetInfo(prev => ({ ...prev, connected: true, sheetUrl: data.sheetUrl, lastSyncAt: new Date().toISOString() }))
      } else {
        setSyncStatus({ ok: false, message: data.error || 'Sync failed' })
      }
    } catch (e) {
      setSyncStatus({ ok: false, message: e.message })
    }
    setSyncLoading(false)
    setTimeout(() => setSyncStatus(null), 5000)
  }

  function handleExportCSV() {
    const csvRows = filtered.map(r => ({
      Company: r.company,
      'Contact Name': r.contactName,
      Email: r.email,
      Title: r.title,
      Status: r.status,
      'Sent Date': r.sentAt ? new Date(r.sentAt).toLocaleDateString() : '',
      Subject: r.subject,
      'Open Count': r.openCount,
      'Replied': r.repliedAt ? new Date(r.repliedAt).toLocaleDateString() : '',
    }))
    exportCSV(csvRows, 'outreach-tracker')
  }

  const statusColors = {
    sent:    'bg-blue-50 text-blue-700',
    opened:  'bg-amber-50 text-amber-700',
    replied: 'bg-green-50 text-green-700',
    failed:  'bg-red-50 text-red-700',
  }

  const statusIcons = {
    sent:    <Mail size={11} />,
    opened:  <Eye size={11} />,
    replied: <MessageSquare size={11} />,
    failed:  <AlertCircle size={11} />,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading outreach data…</span>
      </div>
    )
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Companies', value: stats.companies, color: 'text-gray-900' },
          { label: 'Total Sent', value: stats.total, color: 'text-blue-600' },
          { label: 'Sent', value: stats.sent, color: 'text-gray-500' },
          { label: 'Opened', value: stats.opened, color: 'text-amber-600' },
          { label: 'Replied', value: stats.replied, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3.5 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company, contact, or email…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="replied">Replied</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
        >
          <Download size={13} /> CSV
        </button>

        <button
          onClick={handleSync}
          disabled={syncLoading || !profile?.hasGmailToken}
          title={!profile?.hasGmailToken ? 'Connect Gmail in Settings first' : 'Sync to Google Sheets'}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 rounded-lg transition-all"
        >
          <RefreshCw size={13} className={syncLoading ? 'animate-spin' : ''} />
          {syncLoading ? 'Syncing…' : 'Sync to Sheets'}
        </button>
      </div>

      {/* Sync status */}
      {syncStatus && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-medium mb-4 ${
          syncStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {syncStatus.message}
        </div>
      )}

      {/* Google Sheets link */}
      {sheetInfo?.sheetUrl && (
        <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl">
          <CheckCircle size={13} className="text-green-600 flex-shrink-0" />
          <span className="text-xs text-gray-600">
            Synced to{' '}
            <a
              href={sheetInfo.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 font-semibold hover:underline"
            >
              Google Sheets <ExternalLink size={10} className="inline" />
            </a>
            {sheetInfo.lastSyncAt && (
              <span className="text-gray-400 ml-1.5">
                · last sync {new Date(sheetInfo.lastSyncAt).toLocaleString()}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Mail size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            {rows.length === 0 ? 'No emails sent yet' : 'No results match your filters'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {rows.length === 0 ? 'Your outreach tracker will populate after you send your first campaign.' : 'Try adjusting your search or status filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Company</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Sent</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Opens</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Replied</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.company || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.contactName}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono">{row.email}</td>
                    <td className="px-4 py-3 text-gray-500">{row.title || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[row.status] || 'bg-gray-50 text-gray-500'}`}>
                        {statusIcons[row.status]} {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.sentAt ? new Date(row.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.openCount > 0 ? (
                        <span className="text-amber-600 font-semibold">{row.openCount}×</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.repliedAt ? (
                        <span className="text-green-600 font-semibold">
                          {new Date(row.repliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 font-semibold">
            Showing {filtered.length} of {rows.length} emails across {stats.companies} companies
          </div>
        </div>
      )}
    </div>
  )
}
