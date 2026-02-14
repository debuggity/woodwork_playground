import { useEffect, useMemo, useState } from 'react';
import { Workbench } from './components/Workbench';

type RouteId = 'home' | 'app' | 'blog' | 'about' | 'privacy' | 'terms' | 'contact';
type CookieConsentChoice = 'accepted' | 'declined';

const COOKIE_CONSENT_KEY = 'woodworker_cookie_consent';

const ROUTE_LABELS: Record<RouteId, string> = {
  home: 'Home',
  app: 'App',
  blog: 'Blog',
  about: 'About',
  privacy: 'Privacy Policy',
  terms: 'Terms',
  contact: 'Contact',
};

const ROUTE_ORDER: RouteId[] = ['home', 'app', 'blog', 'about', 'privacy', 'terms', 'contact'];

const routeToHash = (route: RouteId) => (route === 'home' ? '#/' : `#/${route}`);

const normalizeRouteValue = (value: string): RouteId | null => {
  const cleaned = value.trim().toLowerCase().replace(/^#\/?/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (cleaned === '' || cleaned === 'home') return 'home';
  if (cleaned === 'app') return 'app';
  if (cleaned === 'blog') return 'blog';
  if (cleaned === 'about') return 'about';
  if (cleaned === 'privacy' || cleaned === 'privacy-policy') return 'privacy';
  if (cleaned === 'terms') return 'terms';
  if (cleaned === 'contact') return 'contact';
  return null;
};

const getInitialRoute = (): RouteId => {
  if (typeof window === 'undefined') return 'home';
  const hashRoute = normalizeRouteValue(window.location.hash);
  if (hashRoute) return hashRoute;

  const pathRoute = normalizeRouteValue(window.location.pathname);
  if (pathRoute) return pathRoute;
  return 'home';
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
    <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
    <div className="mt-4 space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

const HomePage = ({ openApp }: { openApp: () => void }) => (
  <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-7 sm:p-10 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">WoodWorker</p>
      <h1 className="mt-3 text-4xl sm:text-5xl font-semibold text-slate-900 leading-tight">Plan, fit, and build smarter.</h1>
      <p className="mt-4 max-w-2xl text-slate-700 text-lg">
        A woodworking design app for laying out cuts, joints, screws, and bill of materials before you touch the saw.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={openApp}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white font-medium hover:bg-blue-700"
        >
          Open App
        </button>
      </div>
    </section>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Fast Layout</h3>
        <p className="mt-2 text-sm text-slate-600">Drag boards into position and check fit in seconds.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Smart Auto Screw</h3>
        <p className="mt-2 text-sm text-slate-600">Auto-place practical screws for common joinery cases.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Clear BOM</h3>
        <p className="mt-2 text-sm text-slate-600">Get bill-of-materials and cut details ready for the shop.</p>
      </div>
    </div>
  </div>
);

const BlogPage = () => (
  <div className="space-y-4">
    <SectionCard title="Blog">
      <p>Tips, workflows, and updates focused on practical woodworking planning.</p>
    </SectionCard>
    {[
      {
        title: 'Choosing screw size quickly in cabinet projects',
        date: 'February 2026',
        body: 'Use #8 x 1-1/4" for light parts, #10 x 2-1/2" for most furniture joinery, and #12 x 3" when load and depth are high.',
      },
      {
        title: 'How to avoid edge blowout when placing screws',
        date: 'January 2026',
        body: 'Keep healthy edge distance and bias placements toward center mass when overlap area is narrow.',
      },
      {
        title: 'Why planning in 3D saves shop time',
        date: 'December 2025',
        body: 'Most mistakes happen in layout. Visual checks in 3D catch collision and alignment errors early.',
      },
    ].map((post) => (
      <article key={post.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{post.date}</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">{post.title}</h3>
        <p className="mt-2 text-slate-700">{post.body}</p>
      </article>
    ))}
  </div>
);

const AboutPage = () => (
  <SectionCard title="About">
    <p>WoodWorker is built to reduce friction between design and real-world builds.</p>
    <p>
      The goal is simple: make planning faster, clearer, and less error-prone without forcing a heavy CAD workflow for everyday woodworking.
    </p>
  </SectionCard>
);

const PrivacyPage = () => (
  <SectionCard title="Privacy Policy">
    <p><strong>Last updated:</strong> February 14, 2026</p>
    <p>We only collect the data needed to run and improve the service.</p>
    <p>We may use essential cookies for session behavior and optional analytics cookies when you consent.</p>
    <p>We do not sell your personal information.</p>
    <p>Contact us for privacy questions at the address listed on the Contact page.</p>
  </SectionCard>
);

const TermsPage = () => (
  <SectionCard title="Terms">
    <p><strong>Last updated:</strong> February 14, 2026</p>
    <p>Use the app at your own discretion. You are responsible for verifying dimensions, safety, and build decisions.</p>
    <p>The software is provided as-is without warranties.</p>
    <p>Do not misuse the service or attempt to disrupt availability.</p>
    <p>We may update features and these terms over time.</p>
  </SectionCard>
);

const ContactPage = () => (
  <SectionCard title="Contact">
    <p>Questions, bug reports, or partnership inquiries are welcome.</p>
    <p>Email: support@woodworker.app</p>
    <p>Response window: typically 2-3 business days.</p>
  </SectionCard>
);

const AppOverlayNav = ({ navigate, route }: { navigate: (route: RouteId) => void; route: RouteId }) => (
  <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <button
        onClick={() => navigate('app')}
        className={`rounded-md px-3 py-1.5 text-[12px] font-semibold shadow-sm transition-colors ${
          route === 'app'
            ? 'bg-blue-700 text-white ring-2 ring-blue-200'
            : 'bg-blue-600 text-white ring-2 ring-blue-300 hover:bg-blue-700'
        }`}
      >
        Use App
      </button>
      <button onClick={() => navigate('home')} className="rounded px-2 py-1 hover:bg-slate-100">Home</button>
      <button onClick={() => navigate('blog')} className="rounded px-2 py-1 hover:bg-slate-100">Blog</button>
      <button onClick={() => navigate('contact')} className="rounded px-2 py-1 hover:bg-slate-100">Contact</button>
    </div>
  </div>
);

const CookieConsentBanner = ({ navigate }: { navigate: (route: RouteId) => void }) => {
  const [consent, setConsent] = useState<CookieConsentChoice | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === 'accepted' || stored === 'declined') {
      setConsent(stored);
    }
    setInitialized(true);
  }, []);

  const save = (choice: CookieConsentChoice) => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    setConsent(choice);
  };

  if (!initialized || consent) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
      <p className="text-sm text-slate-700">
        We use cookies for core functionality and optional analytics. You can accept or decline optional cookies.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => save('accepted')} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Accept
        </button>
        <button onClick={() => save('declined')} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Decline
        </button>
        <button onClick={() => navigate('privacy')} className="rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
          Privacy Policy
        </button>
      </div>
    </div>
  );
};

export function App() {
  const [route, setRoute] = useState<RouteId>(getInitialRoute);

  useEffect(() => {
    const onHashChange = () => {
      const next = normalizeRouteValue(window.location.hash);
      setRoute(next ?? 'home');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const expectedHash = routeToHash(route);
    if (window.location.hash !== expectedHash) {
      window.location.hash = expectedHash;
    }
  }, [route]);

  const navigate = (nextRoute: RouteId) => setRoute(nextRoute);

  const page = useMemo(() => {
    if (route === 'home') return <HomePage openApp={() => navigate('app')} />;
    if (route === 'blog') return <BlogPage />;
    if (route === 'about') return <AboutPage />;
    if (route === 'privacy') return <PrivacyPage />;
    if (route === 'terms') return <TermsPage />;
    if (route === 'contact') return <ContactPage />;
    return null;
  }, [route]);

  if (route === 'app') {
    return (
      <>
        <Workbench />
        <AppOverlayNav navigate={navigate} route={route} />
        <CookieConsentBanner navigate={navigate} />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => navigate('home')} className="font-semibold tracking-tight text-slate-900">
            WoodWorker
          </button>
          <nav className="flex flex-wrap items-center gap-1">
            {ROUTE_ORDER.map((item) => (
              <button
                key={item}
                onClick={() => navigate(item)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  route === item
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {ROUTE_LABELS[item]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{page}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>© 2026 WoodWorker</p>
          <div className="flex items-center gap-2">
            {(['privacy', 'terms', 'contact'] as RouteId[]).map((item) => (
              <button key={item} onClick={() => navigate(item)} className="rounded px-2 py-1 hover:bg-slate-100">
                {ROUTE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
      </footer>

      <AppOverlayNav navigate={navigate} route={route} />
      <CookieConsentBanner navigate={navigate} />
    </div>
  );
}
