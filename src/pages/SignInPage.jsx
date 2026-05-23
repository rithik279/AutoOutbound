import { SignIn } from '@clerk/clerk-react'
import { Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function SignInPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center px-4 overflow-hidden">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand mark */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 mb-10 hover:opacity-80 transition-opacity -translate-x-[45px]"
        >
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
            <Zap size={15} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">FirstShot</span>
        </button>

        {/* Clerk handles: Google SSO, email/password, forgot password, MFA */}
        <SignIn
          routing="path"
          path="/sign-in"
          afterSignInUrl="/app"
          afterSignUpUrl="/app"
          appearance={{
            variables: {
              colorPrimary:       '#6366f1',
              colorBackground:    '#ffffff',
              colorText:          '#111827',
              colorInputBackground: '#f9fafb',
              borderRadius:       '12px',
              fontFamily:         'Inter, sans-serif',
            },
            elements: {
              rootBox:          'w-full self-stretch',
              card:             'shadow-2xl border-0 rounded-2xl',
              headerTitle:      'text-xl font-black text-gray-900',
              headerSubtitle:   'text-sm text-gray-400',
              socialButtonsBlockButton: 'border border-gray-200 hover:bg-gray-50 transition-all font-semibold',
              formButtonPrimary: 'bg-brand-500 hover:bg-brand-600 font-semibold',
              footerActionLink:  'text-brand-500 hover:text-brand-600 font-semibold',
            },
          }}
        />

        <p className="mt-8 text-xs text-white/30 text-center">
          Free during beta · Unlimited sends · No credit card
        </p>
      </div>
    </div>
  )
}
