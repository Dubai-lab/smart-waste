import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from 'motion/react';
import {
  ArrowRight, BarChart3, Bell, Building2, Camera, CheckCircle2, ChevronDown, CloudOff, Coins, Download, Leaf, LogIn,
  MapPin, Menu, MessageSquareWarning, Phone, QrCode, Recycle, Route, ShieldCheck, Smartphone, Sparkles, Truck, Users, X,
  type LucideIcon,
} from 'lucide-react';
import { CountUp, EASE } from '../components/ui';

// "latest" always resolves to the newest GitHub release, so these links never change when the apps are rebuilt.
const RELEASE = 'https://github.com/Dubai-lab/smart-waste/releases/latest/download';
const APK_URL = (import.meta.env.VITE_APK_URL as string | undefined) || `${RELEASE}/SmartWaste.apk`;
const IPA_URL = (import.meta.env.VITE_IPA_URL as string | undefined) || `${RELEASE}/SmartWaste.ipa`;

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };
const spring = { type: 'spring', stiffness: 300, damping: 20 } as const;

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.ul className={className} variants={stagger} initial={reduce ? false : 'hidden'} whileInView="show" viewport={{ once: true, amount: 0.15 }}>
      {children}
    </motion.ul>
  );
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-strong">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base text-muted-fg text-pretty">{children}</p>}
    </Reveal>
  );
}

function CtaLink({ to, href, children, variant = 'primary', icon: Icon }: { to?: string; href?: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'light'; icon?: LucideIcon }) {
  const reduce = useReducedMotion();
  const cls = {
    primary: 'bg-primary-strong text-white hover:bg-primary',
    secondary: 'border border-border bg-card text-fg hover:bg-muted',
    light: 'bg-white text-primary-strong hover:bg-primary-soft',
  }[variant];
  const inner = <>{Icon && <Icon className="size-4" aria-hidden />}{children}</>;
  const className = `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-colors duration-150 ${cls}`;
  const motionProps = reduce ? {} : { whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 }, transition: spring };
  return (
    <motion.span className="inline-flex" {...motionProps}>
      {to ? <Link to={to} className={className}>{inner}</Link> : <a href={href} className={className}>{inner}</a>}
    </motion.span>
  );
}

// ───────── Navbar ─────────
const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#who', label: 'Who it is for' },
  { href: '#download', label: 'Get the app' },
  { href: '#faq', label: 'FAQ' },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${scrolled || open ? 'border-b border-border bg-bg/85 backdrop-blur-md' : 'border-b border-transparent'}`}>
      <nav className={`mx-auto flex max-w-6xl items-center justify-between px-5 transition-[height] duration-300 ${scrolled ? 'h-14' : 'h-18'}`} aria-label="Main">
        <a href="#top" className="flex items-center gap-2 text-base font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-strong text-white"><Leaf className="size-4.5" aria-hidden /></span>
          Smart Waste
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <li key={n.href}><a href={n.href} className="rounded-md px-3 py-2 text-sm text-muted-fg transition-colors hover:bg-muted hover:text-fg">{n.label}</a></li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/login" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-fg transition-colors hover:bg-muted">
            <LogIn className="size-4" aria-hidden /> Sign in
          </Link>
          <a href="#download" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-sm font-medium text-white transition-colors hover:bg-primary">
            <Download className="size-4" aria-hidden /> Get the app
          </a>
        </div>
        <button
          type="button"
          className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-muted md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
            transition={{ duration: 0.28, ease: EASE }}
            className="border-t border-border px-5 pb-5 md:hidden"
          >
            <ul className="flex flex-col py-2">
              {NAV.map((n) => (
                <li key={n.href}><a href={n.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-base">{n.label}</a></li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card font-medium"><LogIn className="size-4" aria-hidden /> Sign in</Link>
              <a href="#download" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary-strong font-medium text-white"><Download className="size-4" aria-hidden /> Get the app</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ───────── Hero preview (illustration, not live data) ─────────
const STOPS = [
  { name: 'House 14 · KG 11 Ave', note: 'Reported full', done: true },
  { name: 'House 22 · KG 15 St', note: 'Predicted 82% full', done: true },
  { name: 'House 31 · KG 19 Ave', note: 'Predicted 74% full', done: false },
  { name: 'House 08 · KG 7 St', note: 'Reported full', done: false },
];

function HeroPreview() {
  const reduce = useReducedMotion();
  return (
    <motion.figure
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
      className="relative mx-auto w-full max-w-md"
      aria-label="Illustration of a crew's daily route with verified stops"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-28px_rgba(15,46,43,0.35)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Route className="size-4 text-primary-strong" aria-hidden /> Today's route</div>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-strong">Example</span>
        </div>
        <div className="relative h-44 bg-muted">
          <svg viewBox="0 0 400 176" className="absolute inset-0 size-full" aria-hidden>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth="1" className="text-border" /></pattern>
            </defs>
            <rect width="400" height="176" fill="url(#grid)" />
            <path d="M-10 120 C 80 100, 120 150, 210 120 S 330 60, 410 80" fill="none" stroke="currentColor" strokeWidth="10" className="text-white/70 dark:text-white/10" />
            <path d="M120 -10 C 140 60, 110 120, 150 190" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/70 dark:text-white/10" />
            <motion.path
              d="M40 140 L 105 112 L 170 128 L 240 78 L 330 64"
              fill="none" stroke="#0F766E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, delay: 0.6, ease: EASE }}
            />
            {[[105, 112, true], [170, 128, true], [240, 78, false], [330, 64, false]].map(([x, y, done], i) => (
              <g key={i}>
                <circle cx={x as number} cy={y as number} r="11" fill={done ? '#0F766E' : '#fff'} stroke="#0F766E" strokeWidth="2.5" />
                <text x={x as number} y={(y as number) + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={done ? '#fff' : '#0F766E'} fontFamily="Fira Code, monospace">{i + 1}</text>
              </g>
            ))}
            <rect x="26" y="128" width="28" height="24" rx="6" fill="#D97706" />
            <path d="M33 136h10v8H33zM43 139h5l2 3v2h-7z" fill="#1C1917" />
          </svg>
        </div>
        <ul className="divide-y divide-border">
          {STOPS.map((s, i) => (
            <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`num grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? 'bg-primary-strong text-white' : 'border-2 border-primary-strong text-primary-strong'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-fg">{s.note}</p>
              </div>
              {s.done
                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" aria-hidden /> Verified</span>
                : <span className="text-xs text-muted-fg">Next</span>}
            </li>
          ))}
        </ul>
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.1, ease: EASE }}
        className="absolute top-[150px] -right-3 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:-right-8"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-strong"><QrCode className="size-4" aria-hidden /></span>
        <div>
          <p className="text-xs font-semibold">QR + GPS + time</p>
          <p className="text-[11px] text-muted-fg">Pickup proven at the door</p>
        </div>
      </motion.div>
    </motion.figure>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const up = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: EASE },
  });
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[560px] rounded-full bg-primary/15 blur-3xl"
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-[-10%] size-[420px] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.p {...up(0)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-fg">
            <MapPin className="size-3.5 text-primary-strong" aria-hidden /> Built for households in Kigali
          </motion.p>
          <motion.h1 {...up(0.05)} className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-[56px]">
            Collect where it is needed. <span className="text-primary-strong">Prove every pickup.</span>
          </motion.h1>
          <motion.p {...up(0.1)} className="mt-5 max-w-xl text-base text-muted-fg text-pretty sm:text-lg">
            Smart Waste plans each day's collection around the bins that are actually full, guides crews on the shortest road route,
            and records every pickup with a signed QR code, GPS and time. Households earn green points for sorting, and the points lower their monthly fee.
          </motion.p>
          <motion.div {...up(0.2)} className="mt-8 flex flex-wrap gap-3">
            <CtaLink href="#download" icon={Smartphone}>Get the app</CtaLink>
            <CtaLink to="/login" variant="secondary" icon={ArrowRight}>Open the dashboard</CtaLink>
          </motion.div>
          <motion.ul {...up(0.3)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-fg">
            {['No sensors needed', 'Works offline for crews', 'USSD for basic phones'].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-primary-strong" aria-hidden /> {t}</li>
            ))}
          </motion.ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

// ───────── How it works ─────────
const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Bell, title: 'Report or predict', text: 'Residents tap "my bin is full" in the app or by USSD. For everyone else, a model trained on past pickups estimates which bins are full today.' },
  { icon: Route, title: 'Plan the route', text: 'Every morning the system builds routes for each truck on real Kigali roads, visiting only the homes that need it.' },
  { icon: QrCode, title: 'Collect and prove', text: 'The crew scans the QR sticker at each gate. The scan only counts if the GPS shows the truck is at that house, inside the collection window.' },
  { icon: Coins, title: 'Pay and earn', text: 'Bills arrive monthly and can be paid with Mobile Money. Sorting, on-time payment and reporting dumping earn points that reduce the fee.' },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-border bg-card py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="How it works" title="From a full bin to a verified pickup">
          Fixed weekly rounds send trucks past empty bins and miss full ones. Smart Waste starts from demand instead.
        </SectionHead>
        <Grid className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.li key={s.title} variants={item} className="relative rounded-2xl border border-border bg-bg p-6">
              <span className="num text-xs font-semibold text-muted-fg">0{i + 1}</span>
              <span className="mt-3 grid size-11 place-items-center rounded-xl bg-primary-strong text-white"><s.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-fg">{s.text}</p>
            </motion.li>
          ))}
        </Grid>
      </div>
    </section>
  );
}

// ───────── Features ─────────
const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Sparkles, title: 'Demand prediction without sensors', text: 'Reports, pickup history, household size, day of the week and public holidays such as Umuganda feed one shared model.' },
  { icon: Route, title: 'Daily route optimisation', text: 'A vehicle-routing solver on OpenStreetMap road distances, compared every day with the old fixed route.' },
  { icon: Truck, title: 'Live truck tracking', text: 'Residents see the truck on the map and get an alert when it is about ten minutes away.' },
  { icon: ShieldCheck, title: 'Verifiable proof of service', text: 'Signed QR codes, GPS geofencing and time windows make missed or faked pickups visible.' },
  { icon: CloudOff, title: 'Offline-first crew app', text: 'Scans are stored on the phone and sync when the network returns, with no duplicates.' },
  { icon: Phone, title: 'USSD and SMS', text: 'Basic phones can report a full bin, check the next pickup and pay, in Kinyarwanda or English.' },
  { icon: Camera, title: 'AI sorting assistant', text: 'Point the camera at an item and the phone says which bin it goes in. It runs on the device, no internet needed.' },
  { icon: Coins, title: 'Green points', text: 'Good habits earn points, and points become a discount on the next monthly bill.' },
  { icon: Recycle, title: 'Recyclables marketplace', text: 'Households list sorted plastic, paper, metal or glass, and recycling cooperatives collect them.' },
  { icon: Building2, title: 'Local authority dashboard', text: 'Sector officers see service quality, a complaints heatmap and illegal dumping, with automatic escalation.' },
];

function Features() {
  const reduce = useReducedMotion();
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="Features" title="Ten ideas working together">
          Each one solves a real problem in household collection, and together they make the service measurable.
        </SectionHead>
        <Grid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.li
              key={f.title}
              variants={item}
              whileHover={reduce ? undefined : { y: -4 }}
              transition={spring}
              className={`group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50 ${i === FEATURES.length - 1 ? 'lg:col-start-2' : ''}`}
            >
              <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-strong transition-colors group-hover:bg-primary-strong group-hover:text-white">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-fg">{f.text}</p>
            </motion.li>
          ))}
        </Grid>
      </div>
    </section>
  );
}

// ───────── Results ─────────
function Results() {
  const stats = [
    { value: 90, suffix: '%', label: 'sorting accuracy', note: 'On 1,427 test photos the model had never seen' },
    { value: 30, suffix: '%+', label: 'shorter routes', note: 'In a 25-household test on real Kigali roads, compared with the fixed route' },
    { value: 3, suffix: '', label: 'languages', note: 'Kinyarwanda, English and French in the app' },
    { value: 0, suffix: '', label: 'sensors to install', note: 'Demand comes from reports and pickup history' },
  ];
  return (
    <section className="relative overflow-hidden bg-primary-strong py-20 text-white sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Measured, not promised</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-balance sm:text-4xl">Results from our own tests</h2>
        </Reveal>
        <Grid className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <motion.li key={s.label} variants={item} className="border-t border-white/25 pt-5">
              <p className="text-5xl font-semibold"><CountUp value={s.value} />{s.suffix}</p>
              <p className="mt-2 font-medium">{s.label}</p>
              <p className="mt-1 text-sm text-white/70">{s.note}</p>
            </motion.li>
          ))}
        </Grid>
      </div>
    </section>
  );
}

// ───────── Who it is for ─────────
const ROLES: { icon: LucideIcon; title: string; where: string; points: string[] }[] = [
  { icon: Users, title: 'Households', where: 'Mobile app and USSD', points: ['Report a full bin', 'Track the truck', 'Pay with Mobile Money', 'Earn green points'] },
  { icon: Truck, title: 'Collection crews', where: 'Mobile app', points: ["Today's optimised route", 'Scan QR at each gate', 'Works without network'] },
  { icon: BarChart3, title: 'Managers', where: 'Web dashboard', points: ['Plan and adjust routes', 'Billing and payments', 'Trucks, crews and zones'] },
  { icon: MessageSquareWarning, title: 'Local authorities', where: 'Web dashboard', points: ['Service quality per village', 'Complaints and escalation', 'Illegal dumping map'] },
  { icon: Recycle, title: 'Recyclers', where: 'Web dashboard', points: ['See listed recyclables', 'Claim and collect', 'Track volumes'] },
];

function WhoItIsFor() {
  const reduce = useReducedMotion();
  return (
    <section id="who" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="Who it is for" title="One system, five kinds of users">
          Everyone sees what they need, and nothing more. Access rules are enforced in the database, not only in the screens.
        </SectionHead>
        <Grid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((r) => (
            <motion.li key={r.title} variants={item} whileHover={reduce ? undefined : { y: -4 }} transition={spring} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <r.icon className="size-6 text-primary-strong" aria-hidden />
              <h3 className="mt-4 text-base font-semibold">{r.title}</h3>
              <p className="text-xs font-medium text-accent">{r.where}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-fg">
                {r.points.map((p) => <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{p}</li>)}
              </ul>
            </motion.li>
          ))}
        </Grid>
      </div>
    </section>
  );
}

// ───────── Download ─────────
/** A phone drawn in CSS 3D (stacked layers give it thickness) that tilts toward the pointer and floats gently. */
function Phone3D() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-26, 6]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [14, -4]), { stiffness: 120, damping: 18 });
  const glareX = useTransform(px, [-0.5, 0.5], ['20%', '80%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} 20%, rgba(255,255,255,0.22), transparent 55%)`;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { px.set(-0.15); py.set(-0.1); };
  useEffect(reset, []);
  const depth = 16;
  return (
    <div className="relative mx-auto flex h-[520px] w-full max-w-[340px] items-center justify-center [perspective:1200px]" onPointerMove={onMove} onPointerLeave={reset}>
      <motion.div
        aria-hidden
        className="absolute bottom-2 h-8 w-52 rounded-[50%] bg-black/45 blur-xl"
        animate={reduce ? undefined : { scale: [1, 0.9, 1], opacity: [0.7, 0.5, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        animate={reduce ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="[transform-style:preserve-3d]"
      >
        <motion.div style={reduce ? { rotateY: -14, rotateX: 6 } : { rotateY, rotateX }} className="relative h-[460px] w-[222px] [transform-style:preserve-3d]">
          {/* body thickness: layers stacked behind the front face */}
          {Array.from({ length: depth }, (_, i) => (
            <div key={i} aria-hidden className="absolute inset-0 rounded-[38px] bg-[#1f2b29]" style={{ transform: `translateZ(${-(i + 1)}px)`, filter: `brightness(${0.9 - i * 0.02})` }} />
          ))}
          <div aria-hidden className="absolute inset-0 rounded-[38px] bg-gradient-to-br from-primary-strong to-[#0b3d39]" style={{ transform: `translateZ(${-depth - 1}px) rotateY(180deg)` }} />
          {/* front face */}
          <div className="absolute inset-0 rounded-[38px] bg-[#0b1514] p-[9px] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)]">
            <div className="relative h-full w-full overflow-hidden rounded-[30px] bg-bg">
              <img src="/app-home.webp" alt="Smart Waste app home screen: next collection, report a full bin, bill and green points" className="h-full w-full object-cover object-top" width={600} height={1333} loading="lazy" />
              <div aria-hidden className="absolute left-1/2 top-2 h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-black" />
            </div>
          </div>
          <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[38px]" style={{ background: glare }} />
          {/* side buttons */}
          <div aria-hidden className="absolute -right-[3px] top-28 h-14 w-[3px] rounded-r bg-[#2a3836]" />
          <div aria-hidden className="absolute -left-[3px] top-24 h-9 w-[3px] rounded-l bg-[#2a3836]" />
          <div aria-hidden className="absolute -left-[3px] top-36 h-9 w-[3px] rounded-l bg-[#2a3836]" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function DownloadCta() {
  return (
    <section id="download" className="scroll-mt-20 px-5 pb-20 sm:pb-28">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-fg px-6 py-12 text-white sm:px-14 dark:bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-primary/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-soft">Get the app</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-balance sm:text-4xl">Join the pilot from your phone</h2>
            <p className="mt-4 max-w-xl text-white/75">
              Households and crews use the mobile app. Managers, sector officers and recyclers sign in on the web.
              No smartphone? The USSD menu works on any phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href={APK_URL} variant="light" icon={Download}>Download for Android</CtaLink>
              <CtaLink to="/login" variant="primary" icon={LogIn}>Sign in to the dashboard</CtaLink>
            </div>
            <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
              {[
                { n: '1', t: 'Download', d: 'Tap the button on your Android phone.' },
                { n: '2', t: 'Allow install', d: 'Your browser asks once to allow apps from it. Allow it.' },
                { n: '3', t: 'Open and sign up', d: 'Create an account and register your house.' },
              ].map((x) => (
                <li key={x.n} className="rounded-xl border border-white/15 bg-white/5 p-4">
                  <span className="font-mono text-primary-soft">{x.n}</span>
                  <p className="mt-1 font-medium">{x.t}</p>
                  <p className="text-white/65">{x.d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-col gap-2 rounded-xl border border-white/15 p-4 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md">
                <span className="font-medium text-white">iPhone (test build).</span> Installed with a free Apple ID and a sideloading tool;
                re-install every 7 days. Push alerts are Android only.
              </p>
              <a href={IPA_URL} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-white/25 px-4 font-medium text-white transition-colors hover:bg-white/10">
                <Smartphone className="size-4" aria-hidden /> Download .ipa
              </a>
            </div>
          </div>
          <Phone3D />
        </div>
      </Reveal>
    </section>
  );
}

// ───────── FAQ ─────────
const FAQS = [
  { q: 'Is this a real service?', a: 'It is a working pilot built as a final year project (BSc Information Systems Management, 2026/2027). The app, routes, QR verification and data are real, and it is being tested with real users.' },
  { q: 'Will I be charged real money?', a: 'No. During the pilot, Mobile Money runs in test (sandbox) mode, so no real money moves. Bills and green-point discounts are calculated exactly as they would be in a live service.' },
  { q: 'Do I need a smartphone?', a: 'No. The USSD menu lets you report a full bin, check your next pickup and your balance from any phone. The Android app adds truck tracking, the sorting assistant and the marketplace.' },
  { q: 'What happens to my location and data?', a: 'Your home location is used only to plan routes and verify pickups. Crews see only the houses on their route. Read the privacy notice for details.' },
  { q: 'How do crews and managers get accounts?', a: 'Staff accounts are created by the administrator. Households and recyclers can sign up themselves.' },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-card py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <SectionHead eyebrow="FAQ" title="Questions people ask" />
        <Reveal>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-bg">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <li key={f.q}>
                  <h3>
                    <button
                      type="button"
                      id={`faq-q-${i}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium"
                    >
                      {f.q}
                      <ChevronDown className={`size-5 shrink-0 text-muted-fg transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-a-${i}`}
                        role="region"
                        aria-labelledby={`faq-q-${i}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        <p className="px-5 pb-5 text-sm text-muted-fg">
                          {f.a}{i === 3 && <> <Link to="/privacy" className="text-primary-strong underline">Privacy notice</Link>.</>}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 text-sm text-muted-fg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-semibold text-fg"><Leaf className="size-4 text-primary-strong" aria-hidden /> Smart Waste</div>
        <p>Final year project · BSc ISM 2026/2027 · Kigali, Rwanda</p>
        <nav className="flex gap-5" aria-label="Footer">
          <Link to="/privacy" className="hover:text-fg">Privacy</Link>
          <Link to="/login" className="hover:text-fg">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = ''; };
  }, []);
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-[15px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2">Skip to content</a>
      <Navbar />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Features />
        <Results />
        <WhoItIsFor />
        <DownloadCta />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
