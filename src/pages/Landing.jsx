import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Zap, Clock, Target, Mail, ArrowRight, CheckCircle,
  TrendingUp, Users, ChevronDown, Star, Briefcase, Code, BarChart2
} from 'lucide-react'

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}
const stagger = (delay = 0) => ({
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay } },
})

function Section({ children, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} variants={fadeUp} initial="hidden" animate={inView ? 'show' : 'hidden'} className={className}>
      {children}
    </motion.div>
  )
}

// ── Email cards with varied, realistic personalized openers ───────────────────
const EMAIL_CARDS = [
  {
    name: 'Marcus Webb',
    role: 'Head of Eng',
    company: 'Rippling',
    color: '#6366F1',
    preview: "Hi Marcus, saw Rippling's latest payroll infra post — the distributed approach you described is exactly the kind of problem I've been working on in my side projects...",
    pos: 'top-12 right-4',
  },
  {
    name: 'Aisha Okonkwo',
    role: 'Partner',
    company: 'Y Combinator',
    color: '#f97316',
    preview: "Hi Aisha, I came across your essay on founder-market fit and it completely reframed how I think about my projects. I'm a first-year CS student building...",
    pos: 'top-48 left-0',
  },
  {
    name: 'Daniel Cho',
    role: 'CTO',
    company: 'Deel',
    color: '#10b981',
    preview: "Hi Daniel, noticed Deel just crossed $500M ARR — the compliance infrastructure challenge at that scale is fascinating. I'd love to learn how your team...",
    pos: 'bottom-24 right-8',
  },
  {
    name: 'Priya Mehta',
    role: 'Eng Lead',
    company: 'Notion',
    color: '#8b5cf6',
    preview: "Hi Priya, your talk on block-based architecture was genuinely the clearest explanation I've seen. I'm a first-year studying CS and I've been experimenting with...",
    pos: 'bottom-44 left-2',
  },
]

function EmailCard({ card, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute ${card.pos} w-60 rounded-2xl p-4 border border-white/10 backdrop-blur-md`}
      style={{
        background: 'rgba(15, 22, 41, 0.85)',
        animation: `float ${5 + delay * 0.8}s ease-in-out infinite`,
        animationDelay: `${delay * 0.4}s`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: card.color }}
        >
          {card.name[0]}
        </div>
        <div className="min-w-0">
          <div className="text-white text-xs font-semibold truncate">{card.name}</div>
          <div className="text-gray-400 text-[10px] truncate">{card.role} · {card.company}</div>
        </div>
      </div>
      <p className="text-gray-300 text-[11px] leading-relaxed line-clamp-3">{card.preview}</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-medium">Sent · personalized</span>
      </div>
    </motion.div>
  )
}

// ── Mouse-tracking spotlight background ───────────────────────────────────────
function SpotlightBackground() {
  const [pos, setPos] = useState({ x: 50, y: 30 })
  const animRef = useRef(null)
  const targetRef = useRef({ x: 50, y: 30 })
  const currentRef = useRef({ x: 50, y: 30 })

  const animate = useCallback(() => {
    const dx = targetRef.current.x - currentRef.current.x
    const dy = targetRef.current.y - currentRef.current.y
    currentRef.current.x += dx * 0.06
    currentRef.current.y += dy * 0.06
    setPos({ x: currentRef.current.x, y: currentRef.current.y })
    animRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      targetRef.current = {
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      }
    }
    window.addEventListener('mousemove', onMove)
    animRef.current = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(animRef.current)
    }
  }, [animate])

  return (
    <>
      {/* Mouse spotlight */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${pos.x}% ${pos.y}%, rgba(99,102,241,0.10), transparent 70%)`,
        }}
      />
      {/* Static orbs */}
      <div className="pointer-events-none fixed top-[-120px] left-[-200px] w-[700px] h-[700px] rounded-full bg-brand-500/10 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[100px]" />
      {/* Grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />
    </>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const faqs = [
    {
      q: 'Is this spam?',
      a: "No. Every email is personalized to the recipient's role, company, and current focus — written in your voice, sent from your real Gmail or Outlook. It reads like you wrote it yourself.",
    },
    {
      q: 'How does AI find the right people?',
      a: 'You describe the type of company and role you want. FirstShot identifies decision-makers — hiring managers, team leads, founders — and finds their professional contact info. No manual searching.',
    },
    {
      q: 'What email providers work?',
      a: 'Gmail and Outlook. Connect via OAuth — we never touch your password. Emails send from your real address so replies land directly in your inbox.',
    },
    {
      q: "What if I don't have much experience yet?",
      a: "That's exactly who this is built for. FirstShot helps you lead with what you do have — your drive, your side projects, your perspective — and matches it to what a company is actually working on right now.",
    },
    {
      q: 'Is it really free?',
      a: "Yes. Unlimited sends during our beta period — no credit card, no catch. We're in early access and want you to land the internship first.",
    },
  ]

  return (
    <div className="bg-navy-900 text-white min-h-screen overflow-x-hidden">
      <SpotlightBackground />

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-navy-900/80 backdrop-blur-xl border-b border-white/[0.06]' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-white tracking-tight text-lg">FirstShot</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/sign-in')}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/sign-in')}
              className="text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-all duration-200"
            >
              Get started free →
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 flex flex-col lg:flex-row items-center gap-16">

          {/* Left — copy */}
          <div className="flex-1 text-center lg:text-left max-w-2xl">
            <motion.div
              variants={stagger(0.1)} initial="hidden" animate="show"
              className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.10] rounded-full px-4 py-1.5 text-xs text-gray-300 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Free during beta · Unlimited sends
            </motion.div>

            <motion.h1 variants={stagger(0.2)} initial="hidden" animate="show"
              className="text-6xl lg:text-[76px] font-black tracking-tight leading-[1.0] mb-6"
            >
              Take your
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-violet-400">
                shot.
              </span>
            </motion.h1>

            <motion.blockquote variants={stagger(0.28)} initial="hidden" animate="show"
              className="text-sm text-gray-500 italic mb-2 lg:text-left text-center"
            >
              "You miss 100% of the shots you don't take."
              <span className="not-italic text-gray-600 ml-1">— Wayne Gretzky</span>
            </motion.blockquote>

            <motion.p variants={stagger(0.35)} initial="hidden" animate="show"
              className="text-lg text-gray-300 leading-relaxed mb-10 mt-6 max-w-xl"
            >
              FirstShot finds decision-makers at the startups and firms you actually want to work at,
              and sends them a personalized email in your voice — in under 5 minutes, not 2 hours.
            </motion.p>

            <motion.div variants={stagger(0.45)} initial="hidden" animate="show"
              className="flex items-center gap-3 justify-center lg:justify-start"
            >
              <button
                onClick={() => navigate('/sign-in')}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 hover:shadow-glow hover:-translate-y-px text-sm"
              >
                Take your first shot <ArrowRight size={15} />
              </button>
              <button
                onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-2 text-gray-400 hover:text-white font-medium text-sm transition-colors px-2 py-3"
              >
                See how it works <ChevronDown size={14} />
              </button>
            </motion.div>

            <motion.div variants={stagger(0.52)} initial="hidden" animate="show"
              className="mt-7 flex items-center gap-5 justify-center lg:justify-start"
            >
              {['No credit card', 'Free beta access', '2-min setup'].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle size={12} className="text-green-500" />
                  {t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — floating email cards */}
          <div className="flex-1 relative hidden lg:block h-[500px] w-full max-w-sm">
            {EMAIL_CARDS.map((card, i) => (
              <EmailCard key={card.name} card={card} delay={0.5 + i * 0.2} />
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-gray-600 text-[11px] tracking-widest uppercase"
        >
          <span>scroll</span>
          <ChevronDown size={14} className="animate-bounce" />
        </motion.div>
      </section>

      {/* FOUNDER QUOTE */}
      <Section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="flex justify-center mb-5">
          {[...Array(5)].map((_, i) => <Star key={i} size={13} className="text-yellow-400 fill-yellow-400" />)}
        </div>
        <blockquote className="text-2xl font-medium text-white leading-relaxed mb-8">
          "I was a first-year at UofT with no network and no name recognition.
          Cold emailing manually took me 2 hours for 30 emails.
          Then I built FirstShot. Now it takes 5 minutes.
          I landed an investment management internship in my first year.
          <span className="text-brand-400"> Take your shots.</span>"
        </blockquote>
        <div className="flex items-center justify-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">R</div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Rithik Singh</div>
            <div className="text-xs text-gray-500">Founder · First-year, University of Toronto</div>
          </div>
        </div>
      </Section>

      {/* STATS STRIP */}
      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <div className="max-w-4xl mx-auto px-6 py-14 grid grid-cols-3 gap-8 text-center">
          {[
            { n: '5 min', l: 'from idea to 30 emails sent' },
            { n: '50+',   l: 'companies discovered per run' },
            { n: '100%',  l: 'personalized to each recipient' },
          ].map(s => (
            <Section key={s.l}>
              <div className="text-4xl font-black text-white mb-1.5">{s.n}</div>
              <div className="text-xs text-gray-500 tracking-wide">{s.l}</div>
            </Section>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-28">
        <Section className="text-center mb-16">
          <div className="text-[11px] font-semibold text-brand-400 uppercase tracking-[0.15em] mb-4">How it works</div>
          <h2 className="text-4xl font-black text-white mb-4">Three steps. Five minutes.</h2>
          <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
            The 2-hour workflow — researching companies, finding contacts, writing emails, staggering sends — is now fully automated.
          </p>
        </Section>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: <Target size={20} />,
              step: '01',
              title: 'Tell us your target',
              desc: 'Enter the type of internship, industries you want, and a few sentences about yourself. Upload your resume if you have one.',
            },
            {
              icon: <Zap size={20} />,
              step: '02',
              title: 'AI finds the decision-makers',
              desc: 'We identify the right people — hiring managers, team leads, founders — at companies in your space and find their professional contact info.',
            },
            {
              icon: <Mail size={20} />,
              step: '03',
              title: 'Personalized emails fly',
              desc: "Every email references the specific company's work, written in your voice. Sent from your Gmail or Outlook, staggered to look human.",
            },
          ].map((s, i) => (
            <Section key={i}>
              <div className="group relative rounded-2xl p-7 h-full border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-brand-500/25 transition-all duration-300 cursor-default">
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: 'radial-gradient(400px circle at 50% 0%, rgba(99,102,241,0.06), transparent)' }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                      {s.icon}
                    </div>
                    <span className="text-5xl font-black text-white/[0.04] group-hover:text-white/[0.07] transition-colors">{s.step}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </Section>
          ))}
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="bg-white/[0.015] border-y border-white/[0.06] py-28">
        <div className="max-w-6xl mx-auto px-6">
          <Section className="text-center mb-14">
            <div className="text-[11px] font-semibold text-brand-400 uppercase tracking-[0.15em] mb-4">Who it's for</div>
            <h2 className="text-4xl font-black text-white mb-3">Built for first and second years</h2>
            <p className="text-gray-500 max-w-md mx-auto text-sm">If you're early in your career and feel like applications disappear into a void, this is for you.</p>
          </Section>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: <BarChart2 size={18} />, label: 'Finance', desc: 'Investment banking, asset management, fintech, VC — reach the people who actually make hiring decisions.', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'group-hover:border-blue-500/20' },
              { icon: <Code size={18} />,      label: 'Tech & Startups', desc: 'Software engineering, product, data science — target YC companies, Series A startups, and fast-moving teams.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'group-hover:border-violet-500/20' },
              { icon: <Briefcase size={18} />, label: 'Consulting', desc: 'Strategy, boutique advisory, management consulting — find the right senior partners and reach them directly.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'group-hover:border-amber-500/20' },
            ].map(s => (
              <Section key={s.label}>
                <div className={`group rounded-2xl p-6 text-center border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] ${s.border} transition-all duration-300 cursor-default`}>
                  <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mx-auto mb-4`}>{s.icon}</div>
                  <h3 className="font-bold text-white mb-2 text-sm">{s.label}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* BETA CTA */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <Section>
          <div className="relative rounded-2xl overflow-hidden p-14 border border-brand-500/20"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(109,40,217,0.12) 100%)' }}
          >
            {/* Glow */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ background: 'radial-gradient(600px at 50% 0%, rgba(99,102,241,0.15), transparent)' }} />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/25 rounded-full px-3 py-1 text-[11px] text-brand-300 font-medium mb-6 tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                Early access · Beta
              </div>
              <h2 className="text-4xl font-black text-white mb-4">Free during beta.</h2>
              <p className="text-gray-400 text-base mb-8 max-w-md mx-auto leading-relaxed">
                Unlimited sends during our 30-day beta period. No credit card.
                No catch. We want you to land the interview first — everything else can wait.
              </p>
              <button
                onClick={() => navigate('/sign-in')}
                className="inline-flex items-center gap-2 bg-white text-navy-900 font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-all duration-200 hover:-translate-y-px shadow-lg text-sm"
              >
                Take your first shot <ArrowRight size={15} />
              </button>
              <p className="mt-4 text-gray-600 text-xs">Takes 2 minutes to set up.</p>
            </div>
          </div>
        </Section>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-6 pb-28">
        <Section className="text-center mb-10">
          <h2 className="text-2xl font-black text-white">Questions</h2>
        </Section>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <Section key={i}>
              <div
                className={`rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer ${openFaq === i ? 'border-white/10 bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03]'}`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm font-medium text-white">{faq.q}</span>
                  <ChevronDown size={14} className={`text-gray-500 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </div>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-xs text-gray-400 leading-relaxed border-t border-white/[0.06] pt-3">{faq.a}</div>
                )}
              </div>
            </Section>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="font-bold text-white text-sm">FirstShot</span>
          </div>
          <div className="text-[11px] text-gray-600">
            Built by a first-year who took the shot. © 2025 FirstShot.
          </div>
          <div className="flex gap-5 text-[11px] text-gray-600">
            <button onClick={() => navigate('/sign-in')} className="hover:text-white transition-colors">Sign in</button>
            <a href="mailto:Singh.Manmit@gmail.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
