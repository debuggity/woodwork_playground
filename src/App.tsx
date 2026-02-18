import { useEffect, useMemo, useRef, useState } from 'react';
import { Workbench } from './components/Workbench';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  FileDown,
  Grid,
  Hammer,
  Layers,
  LocateFixed,
  Magnet,
  Move,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  RotateCw,
  Settings2,
  ShoppingCart,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

type RouteId = 'home' | 'app' | 'blog' | 'about' | 'privacy' | 'terms' | 'contact';
type CookieConsentChoice = 'accepted' | 'declined';
type BlogPost = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  body: string[];
};
type AppRoute = { page: RouteId; blogSlug?: string };
type TutorialAction = 'add' | 'move' | 'resize' | 'rotate' | 'center';
type TutorialTool = 'select' | 'move' | 'rotate';

const COOKIE_CONSENT_KEY = 'woodworker_cookie_consent';
const INTERACTIVE_TUTORIAL_SLUG = 'interactive-quickstart-build-your-first-layout';

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

const BLOG_POSTS: BlogPost[] = [
  {
    slug: INTERACTIVE_TUTORIAL_SLUG,
    title: 'Interactive quickstart: build your first layout in 5 minutes',
    date: 'February 2026',
    summary: 'A hands-on walkthrough for adding, moving, rotating, and centering your first parts.',
    body: [
      'Use this post as a guided warmup before jumping into your real project.',
      'You can practice the core controls right on this page, then switch directly into Build mode.',
    ],
  },
  {
    slug: 'choosing-screw-size-quickly-in-cabinet-projects',
    title: 'Choosing screw size quickly in cabinet projects',
    date: 'February 2026',
    summary: 'Pick the right screw size quickly for cabinet and furniture builds.',
    body: [
      'Use #8 x 1-1/4" for light-duty jobs like trim, brackets, and thinner stock.',
      'For most furniture and 2x joining, #10 x 2-1/2" is the workhorse size.',
      'Use #12 x 3" when structure and pull strength matter more than appearance.',
      'If edge distance is tight, pre-drill and reduce diameter before increasing length.',
    ],
  },
  {
    slug: 'how-to-avoid-edge-blowout-when-placing-screws',
    title: 'How to avoid edge blowout when placing screws',
    date: 'January 2026',
    summary: 'Simple techniques to reduce split-outs and edge failures when fastening.',
    body: [
      'Keep screws away from weak edges and corners whenever possible.',
      'Pilot holes help a lot on hardwoods and plywood edge fastening.',
      'Use smaller screws near narrow overlaps, then increase count instead of diameter.',
      'When possible, stagger screw lines to distribute stress across the joint.',
    ],
  },
  {
    slug: 'why-planning-in-3d-saves-shop-time',
    title: 'Why planning in 3D saves shop time',
    date: 'December 2025',
    summary: 'Catch fit and sequence problems before they become material waste.',
    body: [
      'Most project mistakes happen in layout and sequence, not cutting speed.',
      '3D planning catches collisions and awkward tool access before shop work begins.',
      'It also improves your cut list quality by surfacing redundant or conflicting parts.',
      'A clean digital plan means less rework, fewer extra trips, and faster assembly.',
    ],
  },
];

const BLOG_POST_BY_SLUG = BLOG_POSTS.reduce<Record<string, BlogPost>>((acc, post) => {
  acc[post.slug] = post;
  return acc;
}, {});

const routeToHash = (route: AppRoute) => {
  if (route.page === 'home') return '#/';
  if (route.page === 'blog' && route.blogSlug) return `#/blog/${route.blogSlug}`;
  return `#/${route.page}`;
};

const toSimplePageRoute = (value: string): RouteId | null => {
  if (value === '' || value === 'home') return 'home';
  if (value === 'app') return 'app';
  if (value === 'blog') return 'blog';
  if (value === 'about') return 'about';
  if (value === 'privacy' || value === 'privacy-policy') return 'privacy';
  if (value === 'terms') return 'terms';
  if (value === 'contact') return 'contact';
  return null;
};

const normalizeRouteValue = (value: string): AppRoute | null => {
  const cleaned = value.trim().toLowerCase().replace(/^#\/?/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const pageRoute = toSimplePageRoute(cleaned);
  if (pageRoute) return { page: pageRoute };

  if (cleaned.startsWith('blog/')) {
    const slug = cleaned.slice('blog/'.length).trim();
    if (!slug) return { page: 'blog' };
    if (BLOG_POST_BY_SLUG[slug]) {
      return { page: 'blog', blogSlug: slug };
    }
    return { page: 'blog' };
  }

  return null;
};

const getInitialRoute = (): AppRoute => {
  if (typeof window === 'undefined') return { page: 'home' };
  const hashRoute = normalizeRouteValue(window.location.hash);
  if (hashRoute) return hashRoute;

  const pathRoute = normalizeRouteValue(window.location.pathname);
  if (pathRoute) return pathRoute;
  return { page: 'home' };
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
    <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
    <div className="mt-4 space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

const HomePage = ({ openApp }: { openApp: () => void }) => (
  <div className="space-y-6">
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-7 sm:p-10 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-blue-300/15 blur-3xl" />
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">WoodWorker</p>
      <h1 className="mt-3 max-w-4xl text-4xl sm:text-5xl font-semibold text-slate-900 leading-tight">
        Woodworking for everyone,
        <span className="block">with real-world results.</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-700 text-lg">
        Move parts around like digital LEGO, use smart helpers like Auto Screw, and generate cut and shopping lists so projects stay fun, clear, and build-ready.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Beginner-friendly</span>
        <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Serious-project ready</span>
        <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Export + share anytime</span>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={openApp}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white font-medium hover:bg-blue-700"
        >
          Start Building
        </button>
      </div>
    </section>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-[4/3] sm:aspect-square">
          <video
            className="h-full w-full object-cover"
            src="/legos.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Feels Like a Game, Scales to Real Work</h3>
        <p className="mt-2 text-sm text-slate-600">
          Start with little experience and design by moving parts around like digital LEGO. Convenience tools like Auto Screw keep it fun and fast, while still supporting serious builds.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-[4/3] sm:aspect-square">
          <video
            className="h-full w-full object-cover"
            src="/cuts-shops.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Cut List + Shopping List Built In</h3>
        <p className="mt-2 text-sm text-slate-600">
          Generate what to cut and what to buy from your design so projects feel closer to assembling an IKEA-style plan than guessing measurements from scratch.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 aspect-[4/3] sm:aspect-square">
          <video
            className="h-full w-full object-cover"
            src="/import-export.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Your Designs Stay Yours</h3>
        <p className="mt-2 text-sm text-slate-600">
          Export and import projects anytime so you can keep designs forever, back them up, and easily share them with friends.
        </p>
      </div>
    </div>
  </div>
);

const BlogTitleSvg = () => (
  <svg
    viewBox="0 0 760 248"
    preserveAspectRatio="xMidYMid meet"
    className="h-auto w-full max-w-3xl"
    role="img"
    aria-label="Blog title graphic"
  >
    <defs>
      <linearGradient id="blogAccentGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1d4ed8" />
        <stop offset="50%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#0ea5e9" />
      </linearGradient>
    </defs>
    <rect x="110" y="28" width="540" height="56" rx="14" fill="url(#blogAccentGradient)" />
    <text x="170" y="65" textAnchor="start" fontSize="28" fontWeight="700" fill="#eff6ff" style={{ letterSpacing: '0.18em' }}>
      BLOG
    </text>
    <text x="320" y="65" textAnchor="start" fontSize="20" fontWeight="500" fill="#dbeafe">
      WoodWorker Journal
    </text>
    <text x="380" y="124" textAnchor="middle" fontSize="32" fontWeight="800" fill="#0f172a">
      Build notes, workflows,
    </text>
    <text x="380" y="152" textAnchor="middle" fontSize="31" fontWeight="800" fill="#0f172a">
      and practical shop tips.
    </text>
    <text x="380" y="183" textAnchor="middle" fontSize="23" fontWeight="700" fill="#334155">
      Simple reads for better plans
    </text>
    <text x="380" y="207" textAnchor="middle" fontSize="23" fontWeight="700" fill="#334155">
      and cleaner projects.
    </text>
    <line x1="150" y1="228" x2="610" y2="228" stroke="#93c5fd" strokeWidth="10" strokeLinecap="round" />
    <line x1="180" y1="242" x2="580" y2="242" stroke="#bfdbfe" strokeWidth="8" strokeLinecap="round" />
  </svg>
);

const BlogPage = ({ openPost }: { openPost: (slug: string) => void }) => (
  <div className="space-y-4">
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 sm:p-8 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-blue-300/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-20 h-52 w-52 rounded-full bg-sky-200/20 blur-3xl" />
      <div className="relative flex justify-center">
        <BlogTitleSvg />
      </div>
    </section>
    {BLOG_POSTS.map((post) => (
      <article key={post.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{post.date}</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">{post.title}</h3>
        <p className="mt-2 text-slate-700">{post.summary}</p>
        <button
          onClick={() => openPost(post.slug)}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Read Post
        </button>
      </article>
    ))}
  </div>
);

const TUTORIAL_STEPS: { action: TutorialAction; title: string; description: string; tip: string }[] = [
  {
    action: 'add',
    title: 'Add a piece from Build',
    description: 'Use the Build sidebar and add a 2x4 piece.',
    tip: 'Click the 2x4 Lumber card.',
  },
  {
    action: 'move',
    title: 'Move using the toolbar gizmo',
    description: 'Enable Move, then use the 2D arrows on the part to position it.',
    tip: 'Use any move arrow to complete this step.',
  },
  {
    action: 'resize',
    title: 'Resize from the Edit panel',
    description: 'Switch to Edit and adjust a board dimension just like the app.',
    tip: 'Change Width, Height, or Length once.',
  },
  {
    action: 'rotate',
    title: 'Rotate with 2D handles',
    description: 'Enable Rotate, then use the curved arrows around the part.',
    tip: 'Rotate once to continue.',
  },
  {
    action: 'center',
    title: 'Center camera',
    description: 'Use Auto Center Camera to reframe the scene.',
    tip: 'This quickly restores a clean view after edits.',
  },
];

const EMPTY_TUTORIAL_PROGRESS: Record<TutorialAction, boolean> = {
  add: false,
  move: false,
  resize: false,
  rotate: false,
  center: false,
};

const INITIAL_TUTORIAL_DIMS = { width: 1.5, height: 3.5, length: 96 };

const clampTutorialDimension = (field: keyof typeof INITIAL_TUTORIAL_DIMS, value: number) => {
  const limits = {
    width: [0.5, 6],
    height: [0.5, 10],
    length: [12, 120],
  } as const;
  const [min, max] = limits[field];
  return Math.max(min, Math.min(max, value));
};

const InteractiveTutorialBlog = ({ openApp, backToBlog }: { openApp: () => void; backToBlog: () => void }) => {
  const [hasPiece, setHasPiece] = useState(false);
  const [pieceOffset, setPieceOffset] = useState<[number, number]>([0, 0]);
  const [pieceRotation, setPieceRotation] = useState(0);
  const [boardDims, setBoardDims] = useState({ ...INITIAL_TUTORIAL_DIMS });
  const [cameraPulse, setCameraPulse] = useState(0);
  const [tutorialTool, setTutorialTool] = useState<TutorialTool>('select');
  const [sidebarTab, setSidebarTab] = useState<'build' | 'edit'>('build');
  const [mobileLeftPanelOpen, setMobileLeftPanelOpen] = useState(false);
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);
  const [isMobileTutorial, setIsMobileTutorial] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [progress, setProgress] = useState<Record<TutorialAction, boolean>>({ ...EMPTY_TUTORIAL_PROGRESS });
  const [stepReady, setStepReady] = useState<Record<TutorialAction, boolean>>({ ...EMPTY_TUTORIAL_PROGRESS });
  const [nextStepFlashOn, setNextStepFlashOn] = useState(true);
  const [moveDrag, setMoveDrag] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [rotateDrag, setRotateDrag] = useState<{ pointerId: number; centerX: number; centerY: number; startAngleDeg: number; startPointerAngleRad: number } | null>(null);
  const desktopPieceRef = useRef<HTMLDivElement | null>(null);
  const mobilePieceRef = useRef<HTMLDivElement | null>(null);

  const currentStep = stepIndex < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[stepIndex] : null;
  const currentAction = currentStep?.action ?? null;
  const actionEnabled = (action: TutorialAction) => currentAction === action;

  useEffect(() => {
    if (!currentAction) return;
    if (currentAction !== 'move' && currentAction !== 'rotate') {
      setTutorialTool('select');
    }
  }, [currentAction]);

  useEffect(() => {
    const onResize = () => setIsMobileTutorial(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobileTutorial) {
      setMobileLeftPanelOpen(false);
      setMobileRightPanelOpen(false);
    }
  }, [isMobileTutorial]);

  const markStepReady = (action: TutorialAction) => {
    if (currentAction !== action) return;
    setStepReady((prev) => ({ ...prev, [action]: true }));
  };

  const resetDemo = () => {
    setHasPiece(false);
    setPieceOffset([0, 0]);
    setPieceRotation(0);
    setBoardDims({ ...INITIAL_TUTORIAL_DIMS });
    setCameraPulse(0);
    setTutorialTool('select');
    setSidebarTab('build');
    setMobileLeftPanelOpen(false);
    setMobileRightPanelOpen(false);
    setStepIndex(0);
    setMaxUnlockedStep(0);
    setProgress({ ...EMPTY_TUTORIAL_PROGRESS });
    setStepReady({ ...EMPTY_TUTORIAL_PROGRESS });
    setMoveDrag(null);
    setRotateDrag(null);
  };

  const addPieceFromLibrary = () => {
    if (!actionEnabled('add')) return;
    setHasPiece(true);
    setPieceOffset([0, 0]);
    setPieceRotation(0);
    setBoardDims({ ...INITIAL_TUTORIAL_DIMS });
    setTutorialTool('select');
    markStepReady('add');
  };

  const activateTool = (tool: TutorialTool) => {
    if (tool === 'move' && !actionEnabled('move')) return;
    if (tool === 'rotate' && !actionEnabled('rotate')) return;
    if (tool === 'select') return;
    setTutorialTool(tool);
  };

  const nudgePiece = (dx: number, dy: number) => {
    if (!hasPiece || !actionEnabled('move') || tutorialTool !== 'move') return;
    setPieceOffset((prev) => [prev[0] + dx, prev[1] + dy]);
    markStepReady('move');
  };

  const beginMoveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!hasPiece || !actionEnabled('move') || tutorialTool !== 'move') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoveDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pieceOffset[0],
      originY: pieceOffset[1],
    });
    markStepReady('move');
  };

  const updateMoveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!moveDrag || moveDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - moveDrag.startX;
    const deltaY = event.clientY - moveDrag.startY;
    setPieceOffset([moveDrag.originX + deltaX, moveDrag.originY + deltaY]);
  };

  const endMoveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!moveDrag || moveDrag.pointerId !== event.pointerId) return;
    setMoveDrag(null);
  };

  const beginRotateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const activePieceRef = isMobileTutorial ? mobilePieceRef.current : desktopPieceRef.current;
    if (!hasPiece || !actionEnabled('rotate') || tutorialTool !== 'rotate' || !activePieceRef) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = activePieceRef.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startPointerAngleRad = Math.atan2(event.clientY - centerY, event.clientX - centerX);

    setRotateDrag({
      pointerId: event.pointerId,
      centerX,
      centerY,
      startAngleDeg: pieceRotation,
      startPointerAngleRad,
    });
    markStepReady('rotate');
  };

  const updateRotateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!rotateDrag || rotateDrag.pointerId !== event.pointerId) return;
    const pointerAngle = Math.atan2(event.clientY - rotateDrag.centerY, event.clientX - rotateDrag.centerX);
    let delta = pointerAngle - rotateDrag.startPointerAngleRad;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    const nextAngle = rotateDrag.startAngleDeg + (delta * 180) / Math.PI;
    setPieceRotation(((nextAngle % 360) + 360) % 360);
  };

  const endRotateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!rotateDrag || rotateDrag.pointerId !== event.pointerId) return;
    setRotateDrag(null);
  };

  const updateDimension = (field: keyof typeof INITIAL_TUTORIAL_DIMS, value: number) => {
    if (!hasPiece || !actionEnabled('resize')) return;
    const clamped = clampTutorialDimension(field, value);
    const nextDims = { ...boardDims, [field]: clamped };
    setBoardDims(nextDims);

    const changed =
      Math.abs(nextDims.height - INITIAL_TUTORIAL_DIMS.height) > 0.001
      || Math.abs(nextDims.length - INITIAL_TUTORIAL_DIMS.length) > 0.001;
    if (changed) {
      markStepReady('resize');
    }
  };

  const centerCamera = () => {
    if (!actionEnabled('center') || !hasPiece) return;
    setPieceOffset([0, 0]);
    setCameraPulse((prev) => prev + 1);
    setTutorialTool('select');
    markStepReady('center');
  };

  const goToNextStep = () => {
    if (!currentStep) return;
    const action = currentStep.action;
    const stepSatisfied = progress[action] || stepReady[action];

    if (stepIndex < maxUnlockedStep) {
      setStepIndex((prev) => Math.min(maxUnlockedStep, prev + 1));
      return;
    }
    if (!stepSatisfied) return;

    setProgress((prev) => ({ ...prev, [action]: true }));
    const next = Math.min(TUTORIAL_STEPS.length, stepIndex + 1);
    setMaxUnlockedStep(next);
    setStepIndex(next);
  };

  const completedCount = TUTORIAL_STEPS.filter((step) => progress[step.action]).length;
  const boardWidthPx = Math.max(72, Math.min(176, boardDims.length * 1.1));
  const boardHeightPx = Math.max(14, Math.min(42, boardDims.height * 4.2));

  const toolbarButtonClass = (enabled: boolean, active = false) =>
    `p-1.5 sm:p-2 rounded-md transition-colors ${
      enabled
        ? active
          ? 'bg-blue-100 text-blue-600'
          : 'text-slate-600 hover:bg-slate-100'
        : 'text-slate-300 bg-slate-50 cursor-not-allowed'
    }`;

  const panelButtonClass = (enabled: boolean, active = false) =>
    `w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
      enabled
        ? active
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50'
        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
    }`;
  const guideGlowClass = 'ring-2 ring-emerald-400/90 ring-offset-1 ring-offset-white animate-pulse';

  const hintText = (() => {
    if (currentAction === 'add') return 'Step 1: click 2x4 Lumber in Build.';
    if (currentAction === 'move') {
      return tutorialTool === 'move'
        ? 'Step 2: use the move arrows around the board.'
        : 'Step 2: click Move in the toolbar.';
    }
    if (currentAction === 'resize') {
      return sidebarTab === 'edit'
        ? 'Step 3: change Height or Length in Edit.'
        : 'Step 3: click the Edit tab.';
    }
    if (currentAction === 'rotate') {
      return tutorialTool === 'rotate'
        ? 'Step 4: use a rotate handle around the board.'
        : 'Step 4: click Rotate in the toolbar.';
    }
    if (currentAction === 'center') return 'Step 5: click Auto Center Camera.';
    return 'Tutorial complete. Open the app and start a real project.';
  })();

  const showMoveGizmo = hasPiece && actionEnabled('move') && tutorialTool === 'move';
  const showRotateGizmo = hasPiece && actionEnabled('rotate') && tutorialTool === 'rotate';
  const rotateHandleDistance = Math.max(boardWidthPx, boardHeightPx) / 2 + 24;
  const rotateHandleAngleRad = ((pieceRotation - 90) * Math.PI) / 180;
  const rotateHandleX = Math.cos(rotateHandleAngleRad) * rotateHandleDistance;
  const rotateHandleY = Math.sin(rotateHandleAngleRad) * rotateHandleDistance;
  const canGoBack = stepIndex > 0;
  const stepSatisfied = currentStep ? (progress[currentStep.action] || stepReady[currentStep.action]) : false;
  const canGoForward = !!currentStep && (stepIndex < maxUnlockedStep || stepSatisfied);
  const highlightAddButton = currentAction === 'add' && !stepSatisfied;
  const highlightMoveTool = currentAction === 'move' && !stepSatisfied && tutorialTool !== 'move';
  const highlightMoveControls = currentAction === 'move' && !stepSatisfied && tutorialTool === 'move';
  const highlightEditTab = currentAction === 'resize' && !stepSatisfied && sidebarTab !== 'edit';
  const highlightResizeControls = currentAction === 'resize' && !stepSatisfied && sidebarTab === 'edit';
  const highlightRotateTool = currentAction === 'rotate' && !stepSatisfied && tutorialTool !== 'rotate';
  const highlightRotateHandle = currentAction === 'rotate' && !stepSatisfied && tutorialTool === 'rotate';
  const highlightCenterButton = currentAction === 'center' && !stepSatisfied;
  const highlightNextStep = !!currentStep && stepSatisfied;
  const highlightMobileLeftOpen = isMobileTutorial && !stepSatisfied && (currentAction === 'add' || currentAction === 'resize') && !mobileLeftPanelOpen;
  const highlightMobileRightOpen = isMobileTutorial && !mobileLeftPanelOpen && !mobileRightPanelOpen && currentAction !== 'add' && currentAction !== 'resize' && false;

  useEffect(() => {
    if (!highlightNextStep) {
      setNextStepFlashOn(true);
      return;
    }
    const intervalId = window.setInterval(() => {
      setNextStepFlashOn((prev) => !prev);
    }, 430);
    return () => window.clearInterval(intervalId);
  }, [highlightNextStep]);

  return (
    <div className="space-y-4">
      <button
        onClick={backToBlog}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Back to Blog
      </button>

      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Interactive Tutorial</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Build your first layout in 5 minutes</h1>
        <p className="mt-3 max-w-3xl text-slate-700">
          Learn the core workflow with a close UI simulation, then jump into the full app.
        </p>

        <section className="mt-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Practice Zone</h2>
          <p className="mt-1 text-sm text-slate-600">
            This mirrors the real layout: left sidebar, top toolbar, center viewport, and right BOM.
          </p>
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            {hintText}
          </div>

          {!isMobileTutorial ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100">
            <div className="relative h-[31rem] min-w-[980px]">
              <div className="absolute inset-y-0 left-0 w-[15rem] bg-white border-r border-slate-200 flex flex-col">
                <div className="flex border-b border-slate-200 shrink-0">
                  <button
                    onClick={() => setSidebarTab('build')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                      sidebarTab === 'build'
                        ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Hammer size={16} />
                    Build
                  </button>
                  <button className="flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 border-transparent text-slate-400 bg-slate-50 cursor-not-allowed">
                    <Layers size={16} />
                    Scene
                  </button>
                  <button
                    onClick={() => hasPiece && setSidebarTab('edit')}
                    disabled={!hasPiece}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                      !hasPiece
                        ? 'border-transparent text-slate-300 bg-slate-50 cursor-not-allowed'
                        : sidebarTab === 'edit'
                          ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    } ${highlightEditTab ? guideGlowClass : ''}`}
                  >
                    <Settings2 size={16} />
                    Edit
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  {sidebarTab === 'build' ? (
                    <>
                      <div className="pb-2">
                        <h3 className="font-semibold text-slate-800">Part Library</h3>
                        <p className="text-xs text-slate-500">Select a category, then add a part.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 text-xs rounded-full border bg-blue-600 text-white border-blue-600">All</span>
                        <span className="px-2.5 py-1 text-xs rounded-full border bg-white text-slate-400 border-slate-200">Lumber</span>
                        <span className="px-2.5 py-1 text-xs rounded-full border bg-white text-slate-400 border-slate-200">Sheet Goods</span>
                        <span className="px-2.5 py-1 text-xs rounded-full border bg-white text-slate-400 border-slate-200">Hardware</span>
                      </div>

                      <button
                        onClick={addPieceFromLibrary}
                        disabled={!actionEnabled('add')}
                        className={`${panelButtonClass(actionEnabled('add'), actionEnabled('add'))} ${highlightAddButton ? guideGlowClass : ''}`}
                      >
                        <div>
                          <div className="font-medium">2x4 Lumber</div>
                          <div className="text-xs text-slate-500">1.5" x 3.5" x 96"</div>
                        </div>
                        <div className={actionEnabled('add') ? 'text-blue-500' : 'text-slate-300'}>
                          <Plus size={18} />
                        </div>
                      </button>

                      <button
                        disabled
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed text-left"
                      >
                        <div>
                          <div className="font-medium">Plywood 3/4"</div>
                          <div className="text-xs">48" x 0.75" x 96"</div>
                        </div>
                        <Plus size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="pb-2">
                        <h3 className="font-semibold text-slate-800">Edit Part</h3>
                        <p className="text-xs text-slate-500">Resize this board by editing dimensions.</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                        {(['height', 'length'] as const).map((field) => (
                          <div key={field}>
                            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{field}</div>
                            <div className="grid grid-cols-[2rem_1fr_2rem] gap-1">
                              <button
                                onClick={() => updateDimension(field, boardDims[field] - (field === 'length' ? 2 : 0.25))}
                                disabled={!actionEnabled('resize')}
                                className={`rounded border text-sm ${
                                  actionEnabled('resize')
                                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                } ${highlightResizeControls ? guideGlowClass : ''}`}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step={field === 'length' ? 1 : 0.1}
                                value={boardDims[field].toFixed(field === 'length' ? 0 : 2)}
                                onChange={(e) => updateDimension(field, Number(e.target.value))}
                                disabled={!actionEnabled('resize')}
                                className={`w-full px-2 py-1 text-sm border rounded outline-none ${
                                  actionEnabled('resize')
                                    ? 'border-slate-300 bg-white focus:ring-2 focus:ring-blue-500'
                                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                } ${highlightResizeControls ? guideGlowClass : ''}`}
                              />
                              <button
                                onClick={() => updateDimension(field, boardDims[field] + (field === 'length' ? 2 : 0.25))}
                                disabled={!actionEnabled('resize')}
                                className={`rounded border text-sm ${
                                  actionEnabled('resize')
                                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                } ${highlightResizeControls ? guideGlowClass : ''}`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="absolute inset-y-0 right-0 w-[15rem] bg-white border-l border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-200 shrink-0">
                  <h3 className="font-semibold text-lg text-slate-800">Bill of Materials</h3>
                  <div className="flex gap-2 mt-4 bg-slate-100 p-1 rounded-lg">
                    <button className="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md bg-white text-slate-800 shadow-sm">
                      <ClipboardList size={14} />
                      Cut List
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md text-slate-400 bg-slate-50 cursor-not-allowed">
                      <ShoppingCart size={14} />
                      Shopping
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs rounded-md bg-slate-100 text-slate-400 cursor-not-allowed"
                  >
                    <FileDown size={14} />
                    Download Cut Report
                  </button>
                  {hasPiece ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                      <div className="font-semibold">2x4 Lumber</div>
                      <div className="mt-1 text-slate-500">
                        {boardDims.width.toFixed(2)}" x {boardDims.height.toFixed(2)}" x {boardDims.length.toFixed(1)}" x1
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
                      Scene is empty.
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute inset-y-0 left-[15rem] right-[15rem]">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1.5 sm:p-2 flex flex-col gap-1 z-20 max-w-[calc(100%-0.5rem)] overflow-visible">
                  <div className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-2">
                    <button
                      onClick={() => activateTool('select')}
                      disabled
                      className={toolbarButtonClass(false, tutorialTool === 'select')}
                      title="Select"
                    >
                      <MousePointer2 size={18} />
                    </button>
                    <button
                      onClick={() => activateTool('move')}
                      disabled={!actionEnabled('move')}
                      className={`${toolbarButtonClass(actionEnabled('move'), tutorialTool === 'move')} ${highlightMoveTool ? guideGlowClass : ''}`}
                      title="Move"
                    >
                      <Move size={18} />
                    </button>
                    <button
                      onClick={() => activateTool('rotate')}
                      disabled={!actionEnabled('rotate')}
                      className={`${toolbarButtonClass(actionEnabled('rotate'), tutorialTool === 'rotate')} ${highlightRotateTool ? guideGlowClass : ''}`}
                      title="Rotate"
                    >
                      <RotateCw size={18} />
                    </button>

                    <div className="w-px h-6 bg-slate-200 mx-1" />

                    <button disabled className={toolbarButtonClass(false)} title="Delete Selected">
                      <Trash2 size={18} />
                    </button>
                    <button disabled className={toolbarButtonClass(false)} title="Duplicate Selected">
                      <Copy size={18} />
                    </button>
                    <button disabled className={toolbarButtonClass(false)} title="Undo">
                      <Undo2 size={18} />
                    </button>
                    <button disabled className={toolbarButtonClass(false)} title="Redo">
                      <Redo2 size={18} />
                    </button>
                    <button
                      onClick={centerCamera}
                      disabled={!actionEnabled('center')}
                      className={`${toolbarButtonClass(actionEnabled('center'))} ${highlightCenterButton ? guideGlowClass : ''}`}
                      title="Auto Center Camera"
                    >
                      <LocateFixed size={18} />
                    </button>
                  </div>

                  <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap overflow-visible">
                    <button disabled className={toolbarButtonClass(false)} title="Save Design">
                      <Download size={18} />
                    </button>
                    <button disabled className={toolbarButtonClass(false)} title="Load Design">
                      <Upload size={18} />
                    </button>
                  </div>
                </div>

                <div className="h-full px-4 pt-[6.25rem] pb-4">
                  <div
                    className="relative h-full overflow-hidden rounded-lg border border-slate-200"
                    style={{
                      backgroundColor: '#f8fafc',
                      backgroundImage:
                        'linear-gradient(to right, rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.2) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  >
                    <div className="absolute left-3 top-3 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-600 inline-flex items-center gap-1.5">
                      <Grid size={12} />
                      Floor Grid On
                      <Magnet size={12} />
                      Snap On
                    </div>

                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400" />
                    {cameraPulse > 0 ? (
                      <div
                        key={cameraPulse}
                        className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/70 animate-ping"
                      />
                    ) : null}

                    {hasPiece ? (
                      <div
                        className="absolute left-1/2 top-1/2"
                        style={{
                          transform: `translate(calc(-50% + ${pieceOffset[0]}px), calc(-50% + ${pieceOffset[1]}px))`,
                        }}
                      >
                        <div ref={desktopPieceRef} className="relative" style={{ width: `${boardWidthPx}px`, height: `${boardHeightPx}px` }}>
                          <div
                            className="absolute inset-0 rounded-md border border-amber-900/30 bg-gradient-to-b from-amber-200 to-amber-300 shadow-sm"
                            style={{ transform: `rotate(${pieceRotation}deg)` }}
                          >
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-amber-900/75">
                              Board
                            </span>
                          </div>

                          {showMoveGizmo && (
                            <>
                              <button
                                onPointerDown={beginMoveDrag}
                                onPointerMove={updateMoveDrag}
                                onPointerUp={endMoveDrag}
                                onPointerCancel={endMoveDrag}
                                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Drag to move"
                              >
                                <Move size={14} className="mx-auto" />
                              </button>
                              <button
                                onClick={() => nudgePiece(0, -12)}
                                className={`absolute left-1/2 -translate-x-1/2 -top-8 h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Move up"
                              >
                                <ArrowUp size={14} className="mx-auto" />
                              </button>
                              <button
                                onClick={() => nudgePiece(0, 12)}
                                className={`absolute left-1/2 -translate-x-1/2 -bottom-8 h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Move down"
                              >
                                <ArrowDown size={14} className="mx-auto" />
                              </button>
                              <button
                                onClick={() => nudgePiece(-12, 0)}
                                className={`absolute top-1/2 -translate-y-1/2 -left-8 h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Move left"
                              >
                                <ArrowLeft size={14} className="mx-auto" />
                              </button>
                              <button
                                onClick={() => nudgePiece(12, 0)}
                                className={`absolute top-1/2 -translate-y-1/2 -right-8 h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Move right"
                              >
                                <ArrowRight size={14} className="mx-auto" />
                              </button>
                            </>
                          )}

                          {showRotateGizmo && (
                            <>
                              <div className={`pointer-events-none absolute -inset-5 rounded-full border border-blue-300/70 ${highlightRotateHandle ? 'animate-pulse ring-2 ring-emerald-400/60' : ''}`} />
                              <button
                                onPointerDown={beginRotateDrag}
                                onPointerMove={updateRotateDrag}
                                onPointerUp={endRotateDrag}
                                onPointerCancel={endRotateDrag}
                                className={`absolute h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightRotateHandle ? guideGlowClass : ''}`}
                                style={{
                                  left: '50%',
                                  top: '50%',
                                  transform: `translate(calc(-50% + ${rotateHandleX}px), calc(-50% + ${rotateHandleY}px))`,
                                }}
                                title="Drag to rotate"
                              >
                                <RotateCw size={14} className="mx-auto" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                        Add a board from the Build sidebar to begin.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden">
            <div className="relative h-[33rem]">
              <div className="absolute top-3 left-3 z-30 flex gap-2">
                <button
                  onClick={() => {
                    setMobileRightPanelOpen(false);
                    setMobileLeftPanelOpen(true);
                  }}
                  className={`h-9 w-9 rounded-md border bg-white/95 text-slate-700 shadow hover:bg-white ${highlightMobileLeftOpen ? guideGlowClass : ''}`}
                  title="Open Build/Edit Panel"
                >
                  <PanelLeft size={16} className="mx-auto" />
                </button>
                <button
                  onClick={() => {
                    setMobileLeftPanelOpen(false);
                    setMobileRightPanelOpen(true);
                  }}
                  className="h-9 w-9 rounded-md border bg-white/95 text-slate-700 shadow hover:bg-white"
                  title="Open Bill of Materials"
                >
                  <PanelRight size={16} className="mx-auto" />
                </button>
              </div>

              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-lg bg-white/95 backdrop-blur shadow-lg p-1.5 flex items-center gap-1">
                <button disabled className={toolbarButtonClass(false, tutorialTool === 'select')} title="Select">
                  <MousePointer2 size={18} />
                </button>
                <button
                  onClick={() => activateTool('move')}
                  disabled={!actionEnabled('move')}
                  className={`${toolbarButtonClass(actionEnabled('move'), tutorialTool === 'move')} ${highlightMoveTool ? guideGlowClass : ''}`}
                  title="Move"
                >
                  <Move size={18} />
                </button>
                <button
                  onClick={() => activateTool('rotate')}
                  disabled={!actionEnabled('rotate')}
                  className={`${toolbarButtonClass(actionEnabled('rotate'), tutorialTool === 'rotate')} ${highlightRotateTool ? guideGlowClass : ''}`}
                  title="Rotate"
                >
                  <RotateCw size={18} />
                </button>
                <button
                  onClick={centerCamera}
                  disabled={!actionEnabled('center')}
                  className={`${toolbarButtonClass(actionEnabled('center'))} ${highlightCenterButton ? guideGlowClass : ''}`}
                  title="Auto Center Camera"
                >
                  <LocateFixed size={18} />
                </button>
              </div>

              <div className="h-full px-3 pt-[4.35rem] pb-3">
                <div
                  className="relative h-full overflow-hidden rounded-lg border border-slate-200"
                  style={{
                    backgroundColor: '#f8fafc',
                    backgroundImage:
                      'linear-gradient(to right, rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.2) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                  }}
                >
                  <div className="absolute left-3 top-3 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] text-slate-600 inline-flex items-center gap-1.5">
                    <Grid size={11} />
                    Floor
                    <Magnet size={11} />
                    Snap
                  </div>

                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400" />
                  {cameraPulse > 0 ? (
                    <div
                      key={`mobile-${cameraPulse}`}
                      className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400/70 animate-ping"
                    />
                  ) : null}

                  {hasPiece ? (
                    <div
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${pieceOffset[0]}px), calc(-50% + ${pieceOffset[1]}px))`,
                      }}
                    >
                      <div ref={mobilePieceRef} className="relative" style={{ width: `${boardWidthPx}px`, height: `${boardHeightPx}px` }}>
                        <div
                          className="absolute inset-0 rounded-md border border-amber-900/30 bg-gradient-to-b from-amber-200 to-amber-300 shadow-sm"
                          style={{ transform: `rotate(${pieceRotation}deg)` }}
                        />
                        {showMoveGizmo && (
                          <button
                            onPointerDown={beginMoveDrag}
                            onPointerMove={updateMoveDrag}
                            onPointerUp={endMoveDrag}
                            onPointerCancel={endMoveDrag}
                            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-md border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                            title="Drag to move"
                          >
                            <Move size={14} className="mx-auto" />
                          </button>
                        )}
                        {showRotateGizmo && (
                          <button
                            onPointerDown={beginRotateDrag}
                            onPointerMove={updateRotateDrag}
                            onPointerUp={endRotateDrag}
                            onPointerCancel={endRotateDrag}
                            className={`absolute h-7 w-7 rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightRotateHandle ? guideGlowClass : ''}`}
                            style={{
                              left: '50%',
                              top: '50%',
                              transform: `translate(calc(-50% + ${rotateHandleX}px), calc(-50% + ${rotateHandleY}px))`,
                            }}
                            title="Drag to rotate"
                          >
                            <RotateCw size={14} className="mx-auto" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                      Open Build panel and add 2x4 Lumber.
                    </div>
                  )}
                </div>
              </div>

              {mobileLeftPanelOpen && (
                <div className="absolute inset-0 z-40">
                  <div className="absolute inset-0 bg-slate-900/35" onClick={() => setMobileLeftPanelOpen(false)} />
                  <div className="absolute inset-y-0 left-0 w-[min(21rem,84vw)] bg-white border-r border-slate-200 shadow-xl flex flex-col">
                    <button onClick={() => setMobileLeftPanelOpen(false)} className="absolute right-2 top-2 p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
                      <X size={16} />
                    </button>
                    <div className="flex border-b border-slate-200 shrink-0">
                      <button onClick={() => setSidebarTab('build')} className={`flex-1 py-3 text-sm font-medium ${sidebarTab === 'build' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-500'}`}>Build</button>
                      <button className="flex-1 py-3 text-sm font-medium text-slate-300 bg-slate-50 cursor-not-allowed">Scene</button>
                      <button
                        onClick={() => hasPiece && setSidebarTab('edit')}
                        disabled={!hasPiece}
                        className={`flex-1 py-3 text-sm font-medium ${!hasPiece ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : sidebarTab === 'edit' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-500'} ${highlightEditTab ? guideGlowClass : ''}`}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                      {sidebarTab === 'build' ? (
                        <button
                          onClick={addPieceFromLibrary}
                          disabled={!actionEnabled('add')}
                          className={`${panelButtonClass(actionEnabled('add'), actionEnabled('add'))} ${highlightAddButton ? guideGlowClass : ''}`}
                        >
                          <div>
                            <div className="font-medium">2x4 Lumber</div>
                            <div className="text-xs text-slate-500">1.5" x 3.5" x 96"</div>
                          </div>
                          <Plus size={18} className={actionEnabled('add') ? 'text-blue-500' : 'text-slate-300'} />
                        </button>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                          {(['height', 'length'] as const).map((field) => (
                            <div key={`mobile-${field}`}>
                              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{field}</div>
                              <div className="grid grid-cols-[2rem_1fr_2rem] gap-1">
                                <button
                                  onClick={() => updateDimension(field, boardDims[field] - (field === 'length' ? 2 : 0.25))}
                                  disabled={!actionEnabled('resize')}
                                  className={`rounded border text-sm ${
                                    actionEnabled('resize')
                                      ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  } ${highlightResizeControls ? guideGlowClass : ''}`}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step={field === 'length' ? 1 : 0.1}
                                  value={boardDims[field].toFixed(field === 'length' ? 0 : 2)}
                                  onChange={(e) => updateDimension(field, Number(e.target.value))}
                                  disabled={!actionEnabled('resize')}
                                  className={`w-full px-2 py-1 text-sm border rounded outline-none ${
                                    actionEnabled('resize')
                                      ? 'border-slate-300 bg-white focus:ring-2 focus:ring-blue-500'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  } ${highlightResizeControls ? guideGlowClass : ''}`}
                                />
                                <button
                                  onClick={() => updateDimension(field, boardDims[field] + (field === 'length' ? 2 : 0.25))}
                                  disabled={!actionEnabled('resize')}
                                  className={`rounded border text-sm ${
                                    actionEnabled('resize')
                                      ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  } ${highlightResizeControls ? guideGlowClass : ''}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {mobileRightPanelOpen && (
                <div className="absolute inset-0 z-40">
                  <div className="absolute inset-0 bg-slate-900/35" onClick={() => setMobileRightPanelOpen(false)} />
                  <div className="absolute inset-y-0 right-0 w-[min(21rem,84vw)] bg-white border-l border-slate-200 shadow-xl p-4">
                    <button onClick={() => setMobileRightPanelOpen(false)} className="absolute right-2 top-2 p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
                      <X size={16} />
                    </button>
                    <h3 className="font-semibold text-lg text-slate-800">Bill of Materials</h3>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      {hasPiece
                        ? `${boardDims.height.toFixed(2)}" x ${boardDims.length.toFixed(1)}" board in scene`
                        : 'Scene is empty.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {stepIndex < TUTORIAL_STEPS.length ? `Step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}` : 'Tutorial Complete'}
              </div>
              <div className="text-xs text-slate-500">{completedCount}/{TUTORIAL_STEPS.length} complete</div>
            </div>

            {currentStep ? (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{currentStep.title}</p>
                <p className="mt-1 text-sm text-slate-700">{currentStep.description}</p>
                <p className="mt-1 text-xs text-slate-500">{currentStep.tip}</p>
                <p className="mt-2 text-xs font-medium text-blue-800">
                  {stepSatisfied ? 'Step action complete. Click Next Step when you are ready.' : 'Complete the action above, then click Next Step.'}
                </p>
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-base font-semibold text-blue-900">All core steps complete.</p>
                <p className="mt-1 text-sm text-blue-900/80">
                  You are ready to jump into your real design and use the full toolset.
                </p>
                <button
                  onClick={openApp}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Now try the real thing!
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={!canGoBack}
                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${
                  canGoBack
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <ChevronLeft size={14} />
                Back Step
              </button>
              <button
                onClick={goToNextStep}
                disabled={!canGoForward}
                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${
                  canGoForward
                    ? highlightNextStep
                      ? nextStepFlashOn
                        ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                        : 'border-emerald-500 bg-white text-emerald-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                Next Step
                <ChevronRight size={14} />
              </button>
              <button
                onClick={resetDemo}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reset Tutorial
              </button>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
};

const BlogPostPage = ({ post, backToBlog, openApp }: { post: BlogPost; backToBlog: () => void; openApp: () => void }) => {
  if (post.slug === INTERACTIVE_TUTORIAL_SLUG) {
    return <InteractiveTutorialBlog openApp={openApp} backToBlog={backToBlog} />;
  }

  return (
  <div className="space-y-4">
    <button
      onClick={backToBlog}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      Back to Blog
    </button>
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{post.date}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{post.title}</h1>
      <div className="mt-4 space-y-3 text-slate-700 leading-relaxed">
        {post.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  </div>
  );
};

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

const AppOverlayNav = ({ navigate, activePage }: { navigate: (route: RouteId) => void; activePage: RouteId }) => (
  <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <button
        onClick={() => navigate('app')}
        className={`rounded-md px-3 py-1.5 text-[12px] font-semibold shadow-sm transition-colors ${
          activePage === 'app'
            ? 'bg-blue-700 text-white ring-2 ring-blue-200'
            : 'bg-blue-600 text-white ring-2 ring-blue-300 hover:bg-blue-700'
        }`}
      >
        Build
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
  const [route, setRoute] = useState<AppRoute>(getInitialRoute);

  useEffect(() => {
    const onHashChange = () => {
      const next = normalizeRouteValue(window.location.hash);
      setRoute(next ?? { page: 'home' });
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

  const navigate = (nextRoute: RouteId) => setRoute({ page: nextRoute });
  const openBlogPost = (slug: string) => setRoute({ page: 'blog', blogSlug: slug });
  const activePage = route.page;

  const page = useMemo(() => {
    if (activePage === 'home') return <HomePage openApp={() => navigate('app')} />;
    if (activePage === 'blog') {
      const post = route.blogSlug ? BLOG_POST_BY_SLUG[route.blogSlug] : null;
      if (post) {
        return <BlogPostPage post={post} backToBlog={() => navigate('blog')} openApp={() => navigate('app')} />;
      }
      return <BlogPage openPost={openBlogPost} />;
    }
    if (activePage === 'about') return <AboutPage />;
    if (activePage === 'privacy') return <PrivacyPage />;
    if (activePage === 'terms') return <TermsPage />;
    if (activePage === 'contact') return <ContactPage />;
    return null;
  }, [activePage, route.blogSlug]);

  if (activePage === 'app') {
    return (
      <>
        <Workbench />
        <AppOverlayNav navigate={navigate} activePage={activePage} />
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
                  activePage === item
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

      <AppOverlayNav navigate={navigate} activePage={activePage} />
      <CookieConsentBanner navigate={navigate} />
    </div>
  );
}
