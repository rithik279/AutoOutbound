import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Zap, Clock, Target, Mail, ArrowRight, CheckCircle,
  TrendingUp, Users, ChevronDown, Star, Briefcase, Code, BarChart2
} from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const stagger = (delay = 0) => ({
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay } },
})

function Section({ children, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Animated email card floating in hero
function EmailCard({ delay, name, company, role, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`glass rounded-xl p-4 w-64 ${className}`}
      style={{ animation: `float ${5 + delay}s ease-in-out infinite`, animationDelay: `${delay * 0.5}s` }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {name[0]}
        </div>
        <div className="min-w-0">
          <div className="text-white text-xs font-semibold truncate">{name}</div>
          <div className="text-gray-400 text-[10px] truncate">{role} · {company}</div>
        </div>
      </div>
      <div className="text-gray-300 text-[11px] leading-relaxed line-clamp-2">
        Hi {name.split(' ')[0]}, I came across {company} and was really impressed by...
      </div>
      <div className="mt-2 flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span className="text-[10px] text-green-400">Sent · personalized</span>
      </div>
    </motion.div>
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
      a: "No. Every email is personalized to the recipient's role and company, sent from your real Gmail or Outlook account, and written in your voice. It reads like you wrote it — because the AI wrote it for you, based on what you told it about yourself.",
    },
    {
      q: 'How does AI find the decision-makers?',
      a: 'You tell FirstShot the type of company and role you want. The AI identifies the right people — hiring managers, team leads, founders — and finds their professional contact info. No manual searching required.',
    },
    {
      q: 'What email providers does it work with?',
      a: 'Gmail and Outlook. You connect your existing account via OAuth — we never store your password. Emails are sent from your own address so replies land directly in your inbox.',
    },
    {
      q: "What if I don't have much experience?",
      a: "That's exactly who this is built for. FirstShot helps you lead with what you do have — your drive, your projects, your perspective — and matches it to what companies are actually looking for right now.",
    },
    {
      q: 'Is it really free?',
      a: 'Yes. Free unlimited sends for your first month. No credit card required. We want you to land the internship first — we can figure out the rest later.',
    },
  ]

  return (
    <div className="bg-navy-900 text-white min-h-screen overflow-x-hidden">

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-navy-900/90 backdrop-blur-md border-b border-white/5' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-white tracking-tight text-lg">FirstShot</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/app')}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/app')}
              className="text-sm font-medium bg-white text-navy-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Get started free
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background orbs */}
        <div className="orb w-[600px] h-[600px] bg-brand-500/20 top-[-100px] left-[-200px]" />
        <div className="orb w-[400px] h-[400px] bg-indigo-800/30 bottom-[0px] right-[-100px]" />
        <div className="orb w-[300px] h-[300px] bg-violet-600/15 top-[30%] right-[20%]" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 flex flex-col lg:flex-row items-center gap-16">
          {/* Left — copy */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              variants={stagger(0.1)}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Free for students · Unlimited sends · First month
            </motion.div>

            <motion.h1
              variants={stagger(0.2)}
              initial="hidden"
              animate="show"
              className="text-6xl lg:text-7xl font-black tracking-tight leading-[1.0] mb-6"
            >
              Take your
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-violet-400">
                shot.
              </span>
            </motion.h1>

            <motion.p
              variants={stagger(0.3)}
              initial="hidden"
              animate="show"
              className="text-xl text-gray-300 leading-relaxed mb-4 max-w-xl"
            >
              You miss 100% of the shots you don't take.
            </motion.p>

            <motion.p
              variants={stagger(0.35)}
              initial="hidden"
              animate="show"
              className="text-base text-gray-400 leading-relaxed mb-10 max-w-lg"
            >
              FirstShot finds the decision-makers at companies you actually want to work at,
              and sends them a personalized email in your voice — in under 5 minutes.
              Not 2 hours.
            </motion.p>

            <motion.div
              variants={stagger(0.45)}
              initial="hidden"
              animate="show"
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
            >
              <button
                onClick={() => navigate('/app')}
                className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 hover:shadow-glow hover:-translate-y-0.5 text-base"
              >
                Take your first shot <ArrowRight size={16} />
              </button>
              <button
                onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-8 py-3.5 rounded-xl transition-all duration-200 text-base"
              >
                See how it works
              </button>
            </motion.div>

            <motion.div
              variants={stagger(0.55)}
              initial="hidden"
              animate="show"
              className="mt-8 flex items-center gap-6 justify-center lg:justify-start"
            >
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CheckCircle size={14} className="text-green-400" />
                No credit card
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CheckCircle size={14} className="text-green-400" />
                Free first month
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CheckCircle size={14} className="text-green-400" />
                2-minute setup
              </div>
            </motion.div>
          </div>

          {/* Right — floating email cards */}
          <div className="flex-1 relative hidden lg:flex items-center justify-center h-[500px]">
            <EmailCard delay={0.5}  name="Sarah Chen"    company="Citadel"       role="MD, Quant"      className="absolute top-8 right-8" />
            <EmailCard delay={0.7}  name="James Park"    company="Shopify"       role="Eng Manager"    className="absolute top-40 left-4" />
            <EmailCard delay={0.9}  name="Priya Sharma"  company="McKinsey"      role="Senior Partner" className="absolute bottom-16 right-16" />
            <EmailCard delay={1.1}  name="Alex Liu"      company="a16z"          role="Principal"      className="absolute bottom-36 left-8" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shadow-glow">
                <Zap size={40} className="text-brand-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500 text-xs"
        >
          <span>scroll</span>
          <ChevronDown size={16} className="animate-bounce" />
        </motion.div>
      </section>

      {/* FOUNDER QUOTE */}
      <Section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="flex justify-center mb-4">
          {[...Array(5)].map((_, i) => <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />)}
        </div>
        <blockquote className="text-2xl font-medium text-white leading-relaxed mb-6">
          "I was a first-year at UofT with no network and no name recognition.
          I started cold emailing — manually — and it took me 2 hours for 30 emails.
          Then I built this. Now it takes 5 minutes. I got an investment management
          internship as a first-year. Take your shots."
        </blockquote>
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
            R
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Rithik Singh</div>
            <div className="text-xs text-gray-400">Founder · First-year, University of Toronto</div>
          </div>
        </div>
      </Section>

      {/* STATS STRIP */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-3 gap-8 text-center">
          {[
            { n: '5 min', l: 'from idea to 30 emails sent' },
            { n: '50+',   l: 'companies discovered per run' },
            { n: '100%',  l: 'personalized to each recipient' },
          ].map(s => (
            <Section key={s.l}>
              <div className="text-4xl font-black text-white mb-2">{s.n}</div>
              <div className="text-sm text-gray-400">{s.l}</div>
            </Section>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-28">
        <Section className="text-center mb-16">
          <div className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">How it works</div>
          <h2 className="text-4xl font-black text-white mb-4">Three steps. Five minutes.</h2>
          <p className="text-gray-400 max-w-lg mx-auto">The workflow that used to take 2 hours — researching companies, finding contacts, writing emails, sending them — is now fully automated.</p>
        </Section>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Target size={24} />,
              step: '01',
              title: 'Tell us your target',
              desc: 'Enter the type of internship, industries, and a few sentences about yourself. Upload your resume if you have one.',
            },
            {
              icon: <Zap size={24} />,
              step: '02',
              title: 'AI finds the people',
              desc: "We identify decision-makers — hiring managers, team leads, founders — at companies in your target space and find their contact info.",
            },
            {
              icon: <Mail size={24} />,
              step: '03',
              title: 'Personalized emails fly',
              desc: 'Every email is written in your voice, referencing the specific company and what they\'re working on. Sent from your Gmail or Outlook. Staggered so it looks human.',
            },
          ].map((s, i) => (
            <Section key={i}>
              <div className="glass rounded-2xl p-7 h-full border-white/5 hover:border-brand-500/30 transition-all duration-300 group">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center group-hover:bg-brand-500/25 transition-colors">
                    {s.icon}
                  </div>
                  <span className="text-5xl font-black text-white/5 group-hover:text-white/10 transition-colors">{s.step}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </Section>
          ))}
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="bg-white/[0.02] border-y border-white/5 py-28">
        <div className="max-w-6xl mx-auto px-6">
          <Section className="text-center mb-16">
            <div className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-4">Who it's for</div>
            <h2 className="text-4xl font-black text-white mb-4">Built for early-career students</h2>
            <p className="text-gray-400 max-w-lg mx-auto">If you're in Year 1 or 2 and feel like job applications disappear into a void, this is for you.</p>
          </Section>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: <BarChart2 size={20} />, label: 'Finance', desc: 'Investment banking, asset management, fintech, VC', color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { icon: <Code size={20} />,      label: 'Tech',    desc: 'Software engineering, product, data science, AI startups', color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { icon: <Briefcase size={20} />, label: 'Consulting', desc: 'Strategy, management consulting, boutique advisory', color: 'text-amber-400', bg: 'bg-amber-500/10' },
            ].map(s => (
              <Section key={s.label}>
                <div className="glass rounded-2xl p-6 text-center">
                  <div className={`w-12 h-12 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mx-auto mb-4`}>
                    {s.icon}
                  </div>
                  <h3 className="font-bold text-white mb-2">{s.label}</h3>
                  <p className="text-gray-400 text-sm">{s.desc}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* FREE CTA SECTION */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <Section>
          <div className="relative rounded-3xl overflow-hidden p-12 bg-gradient-to-br from-brand-600 to-violet-700">
            <div className="orb w-80 h-80 bg-white/10 top-[-80px] right-[-80px]" />
            <div className="orb w-60 h-60 bg-brand-400/20 bottom-[-60px] left-[-60px]" />
            <div className="relative z-10">
              <div className="text-xs font-semibold uppercase tracking-widest text-brand-100 mb-4">Limited time</div>
              <h2 className="text-4xl font-black text-white mb-4">Free. Unlimited. First month.</h2>
              <p className="text-brand-100 text-lg mb-8 max-w-lg mx-auto">
                No credit card. No catch. We want you to land the interview first.
                Sign up, connect your email, and start sending today.
              </p>
              <button
                onClick={() => navigate('/app')}
                className="bg-white text-brand-700 font-bold px-10 py-4 rounded-xl hover:bg-brand-50 transition-all duration-200 hover:-translate-y-0.5 shadow-lg text-lg"
              >
                Take your first shot →
              </button>
              <p className="mt-4 text-brand-200 text-sm">Takes 2 minutes to set up.</p>
            </div>
          </div>
        </Section>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-28">
        <Section className="text-center mb-12">
          <h2 className="text-3xl font-black text-white mb-2">Questions</h2>
        </Section>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <Section key={i}>
              <div
                className="glass rounded-xl overflow-hidden border-white/5 cursor-pointer"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between p-5">
                  <span className="font-medium text-white">{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </div>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed border-t border-white/5 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            </Section>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Zap size={11} className="text-white" />
            </div>
            <span className="font-bold text-white text-sm">FirstShot</span>
          </div>
          <div className="text-xs text-gray-500">
            Built by a first-year who took the shot. © 2025 FirstShot.
          </div>
          <div className="flex gap-5 text-xs text-gray-500">
            <button onClick={() => navigate('/app')} className="hover:text-white transition-colors">Sign in</button>
            <a href="mailto:Singh.Manmit@gmail.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
