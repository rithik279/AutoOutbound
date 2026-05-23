import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import Landing  from './pages/Landing.jsx'
import AppShell from './pages/AppShell.jsx'
import SignInPage from './pages/SignInPage.jsx'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_KEY) {
  console.warn('[auth] VITE_CLERK_PUBLISHABLE_KEY not set — auth will not work')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY || 'pk_test_placeholder'}>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<Landing />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/app/*"    element={<AppShell />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
)
