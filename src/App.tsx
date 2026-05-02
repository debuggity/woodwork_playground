import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Workbench } from './components/Workbench';
import standingDeskTopperProject from './data/standingDeskTopper.json';
import {
  ActivitySquare,
  ArrowRight,
  ArrowUp,
  Cpu,
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
  Maximize2,
  Move,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Scissors,
  Shield,
  Sun,
  RotateCw,
  Settings2,
  ShoppingCart,
  Trash2,
  Undo2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';

type RouteId = 'home' | 'app' | 'blog' | 'about' | 'privacy' | 'terms' | 'contact' | 'notFound';
type CookieConsentChoice = 'accepted' | 'declined';
type BlogPost = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  body: string[];
};
type AppRoute = { page: RouteId; blogSlug?: string };
type PageMeta = {
  title: string;
  description: string;
  canonicalPath: string;
  image: string;
  type: 'website' | 'article';
  robots: string;
};
type TutorialAction = 'add' | 'close-build-panel' | 'move' | 'resize' | 'close-edit-panel' | 'rotate' | 'center';
type TutorialTool = 'select' | 'move' | 'rotate';

const SITE_URL = 'https://beav.it';
const BRAND_NAME = 'BEAV.IT';
const BRAND_SHORT_NAME = 'BEAV.IT';
const BRAND_TAGLINE = '3D Woodworking Planner';
const BRAND_LOGO_SRC = '/icons/beav-it-logo.png';
const BRAND_LOCKUP_SRC = '/icons/logo-title.png';
const BRAND_JOURNAL_NAME = `${BRAND_NAME} Journal`;

const COOKIE_CONSENT_KEY = 'woodworker_cookie_consent';
const INTERACTIVE_TUTORIAL_SLUG = 'interactive-quickstart-build-your-first-layout';
const ADVANCED_FEATURES_SLUG = 'advanced-features-special-tools-and-control-panel';
const STANDING_DESK_TOPPER_SLUG = 'why-i-built-beav-it-and-fixed-my-neck-pain';
const PENDING_PROJECT_IMPORT_KEY = 'woodworker_pending_project_import_asset';
const PENDING_PROJECT_IMPORT_PAYLOAD_KEY = 'woodworker_pending_project_import_payload';
const STANDING_DESK_TOPPER_IMPORT_ASSET = '/blogs/standing-desk-topper/standing-desk-topper.json';

const ROUTE_LABELS: Record<RouteId, string> = {
  home: 'Home',
  app: 'App',
  blog: 'Blog',
  about: 'About',
  privacy: 'Privacy Policy',
  terms: 'Terms',
  contact: 'Contact',
  notFound: 'Not Found',
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
    slug: ADVANCED_FEATURES_SLUG,
    title: 'Advanced features guide: special tools + control panel',
    date: 'February 2026',
    summary: 'A clear visual guide for Auto Screw, trim/snap helpers, structural heat maps, and control panel workflows.',
    body: [
      'This guide focuses on every major feature not covered in the basics quickstart.',
      'It includes visual UI maps that mirror the real app so you can immediately apply each workflow in Build mode.',
    ],
  },
  {
    slug: STANDING_DESK_TOPPER_SLUG,
    title: `Why I made ${BRAND_NAME}: my $0 standing desk topper story`,
    date: 'February 2026',
    summary: 'How neck pain pushed me to build software, plan my first woodworking project, and build a standing desk topper from scrap.',
    body: [
      'I needed a standing desk setup fast, but everything online was expensive.',
      `So I used ${BRAND_NAME} to plan a full topper build before making a single cut.`,
    ],
  },
  {
    slug: 'choosing-screw-size-quickly-in-cabinet-projects',
    title: 'Choosing wood screw size quickly for cabinet and furniture projects',
    date: 'February 2026',
    summary: 'A practical beginner-friendly guide to choosing #8, #10, or #12 wood screws by material thickness, edge distance, and load.',
    body: [
      'If you want faster, cleaner joinery, screw size selection matters more than most people think. The right length and diameter reduce split-outs, improve pull strength, and make final assembly easier.',
      'For light-duty woodworking such as trim, thin sheet goods, and small brackets, start with #8 x 1-1/4 in screws. They are easier to drive and reduce blowout risk near edges.',
      'For most furniture and 2x lumber projects, #10 x 2-1/2 in is a strong default. It gives reliable bite through one piece and enough embedment into the second piece for day-to-day structural use.',
      'For heavier shelves, thicker stock, and high-load connections, move to #12 x 3 in screws. This is the better option when anti-wobble and long-term stiffness matter.',
      'A quick sizing rule: target screw penetration into the receiving piece at roughly 1 to 1.5 times that piece thickness when practical, while keeping tip blow-through under control.',
      'Near edges or on plywood layers, pre-drill pilot holes and reduce diameter before increasing length. This improves consistency and lowers the chance of cracking veneers or end grain splits.',
      `In ${BRAND_NAME}, plan fastener layout first with Auto Screw, then verify edge spacing in your view before committing to final hardware count.`,
      'For SEO and real project planning keywords: wood screw size chart, cabinet screw length, screw diameter for plywood, and furniture joint screw selection are all covered by this workflow.',
    ],
  },
  {
    slug: 'how-to-avoid-edge-blowout-when-placing-screws',
    title: 'How to avoid edge blowout when placing wood screws',
    date: 'January 2026',
    summary: 'Step-by-step techniques to prevent plywood edge split-outs, weak joints, and ugly screw exits in woodworking builds.',
    body: [
      'Edge blowout usually comes from three causes: screws too close to edges, diameter too large for the material, or no pilot hole in brittle stock.',
      'First, increase edge distance whenever possible. Even a small shift inward can dramatically reduce cracking in plywood and hardwood strips.',
      'Second, pre-drill pilot holes for edge fastening, especially on dense woods or thin ply. Pilot holes reduce driving force and let threads cut cleanly instead of wedging fibers apart.',
      'Third, choose smaller screws for narrow overlaps. Two smaller screws spaced correctly are often stronger and cleaner than one oversized fastener near a corner.',
      'Use staggered screw lines when fastening long seams. Staggering spreads stress and helps avoid creating a single fracture line along the grain.',
      'Countersink carefully if screw heads need to sit flush. Over-countersinking removes top-layer material and can weaken thin panels around the head.',
      `Inside ${BRAND_NAME}, use Select Assist and Edge Snap to place parts accurately, then use Auto Screw to prototype screw locations without committing to risky edge placements.`,
      'If a joint still looks risky, redesign with a cleat or backing strip. Adding support geometry is usually better than forcing larger screws into weak edges.',
    ],
  },
  {
    slug: 'why-planning-in-3d-saves-shop-time',
    title: 'Why 3D woodworking planning saves shop time and material waste',
    date: 'December 2025',
    summary: 'See why digital woodworking plans reduce rework, improve cut accuracy, and speed up real-world builds for beginners and pros.',
    body: [
      'Most expensive woodworking mistakes do not happen at the saw. They happen earlier in layout, sizing, and assembly order.',
      'A 3D planning workflow helps you catch part collisions, impossible screw angles, and awkward assembly sequences before buying extra material.',
      'You can test dimensions quickly, duplicate parts, and validate spacing with snapping tools before you touch lumber in the shop.',
      'Digital planning also improves cut-list quality. When parts are modeled correctly, your cuts list and shopping list are cleaner, which means fewer guesswork purchases.',
      'For new builders, this removes a lot of anxiety. You can preview the full build, check fit, and rehearse joins in software instead of learning every lesson on scrap costs.',
      'For experienced builders, it saves throughput time. You spend less time re-measuring and more time making clean cuts and accurate assemblies.',
      `In ${BRAND_NAME}, practical speed comes from combining move/rotate tools, edge snap, auto-centering camera, and export/import to iterate versions quickly.`,
      'If your goal is faster projects with fewer surprises, 3D woodworking design software is one of the highest-leverage upgrades you can make.',
    ],
  },
  {
    slug: 'garage-shelf-planning-checklist',
    title: 'Garage shelf planning checklist: dimensions, spans, screws, and cut lists',
    date: 'March 2026',
    summary: 'A practical checklist for planning sturdy garage shelves before buying lumber or cutting plywood.',
    body: [
      'Garage shelves look simple until the first heavy storage bin exposes weak spans, uneven supports, or shelves that are just a little too shallow for the boxes you actually own.',
      'Start by measuring the objects you want to store, not the wall. Storage totes, paint cans, tool cases, and seasonal bins should define shelf depth, vertical spacing, and bay width.',
      'For a basic wall shelf, keep long unsupported plywood spans conservative. Wide spans with thin sheet goods can sag even when the frame feels strong, especially if the load sits near the front edge.',
      'A good planning pass includes upright locations, shelf thickness, screw access, wall clearance, and whether the structure can be assembled in the space after cutting.',
      'Before buying lumber, create a cut list that separates repeated parts from one-off pieces. Repeated uprights, front rails, back rails, and shelf panels are easier to batch cut accurately.',
      'Plan screw lines before assembly. Marking fastener locations in the model helps avoid driving screws into awkward overlaps, plywood edges, or hardware you need to install later.',
      `In ${BRAND_NAME}, build the shelf as separate boards and panels, use edge snapping to align rails, then check the generated shopping list before heading to the store.`,
      'The final check is simple: every shelf panel should have a clear load path into rails or uprights, and every rail should have enough fasteners or bearing surface to resist racking.',
    ],
  },
  {
    slug: 'plywood-cut-list-example-for-beginners',
    title: 'Plywood cut list example for beginners: plan panels without wasting a sheet',
    date: 'March 2026',
    summary: 'Learn how to turn a plywood project into a cleaner cut list with fewer mistakes and less sheet waste.',
    body: [
      'Plywood waste usually comes from designing parts one at a time instead of thinking about the whole sheet. A good cut list starts with finished part sizes, then adds layout logic.',
      'Write down every panel width, depth, and thickness before choosing a sheet. If the project uses both structural panels and visible faces, label which edges need to look clean.',
      'Group identical parts early. Two side panels, two shelves, and four cleats should be obvious in your cut list so you do not accidentally measure each one separately at the saw.',
      'Leave room for blade kerf, trimming, and imperfect factory edges. Even if software tracks finished dimensions, real cutting benefits from a little planning margin.',
      'Think about grain direction and visible faces. For shop fixtures it may not matter, but for furniture and cabinets it can change how you orient every panel.',
      'Use a staged cutting order: rough break-down cuts first, then final sizing. This is safer and more accurate than trying to wrestle a full sheet through every final cut.',
      `With ${BRAND_NAME}, model the plywood parts, export the cut report, and use it as a planning checklist before making the first large sheet cut.`,
      'The goal is not just saving plywood. A clear cut list reduces mental load, keeps part labels consistent, and makes assembly feel less like guessing from a pile of similar rectangles.',
    ],
  },
  {
    slug: 'simple-workbench-frame-design-before-you-build',
    title: 'Simple workbench frame design: what to check before you build',
    date: 'March 2026',
    summary: 'Plan a basic workbench frame by checking height, racking, leg placement, top support, and assembly order.',
    body: [
      'A workbench frame needs to feel boring in the best way: flat, stiff, predictable, and sized for the work you actually do. Most problems come from skipping the layout step.',
      'Start with height. A bench for hand tool work may feel better lower than a general assembly table, while a sanding or light-duty project bench can be closer to counter height.',
      'Next, decide where the legs sit relative to the top. Legs inset too far can make the bench tip or flex; legs placed too close to the edge can interfere with clamps and movement.',
      'Racking resistance matters more than raw lumber size. Long rectangular frames need stretchers, aprons, diagonal bracing, or panels to keep the structure from twisting under side force.',
      'Top support should match the surface material. A thick torsion-style top can span farther than thin plywood, but every top still benefits from predictable bearing points underneath.',
      'Plan assembly access before committing to the frame. If a screw line is hidden by another part or too close to the floor, the build may be technically correct but annoying to assemble.',
      `In ${BRAND_NAME}, model legs, aprons, stretchers, and top panels separately so you can inspect overlaps, duplicate repeated boards, and export a cut list for the bench frame.`,
      'Before cutting, check three things: the bench fits through the door if assembled elsewhere, clamps can reach useful edges, and the frame has a clear path to resist side-to-side movement.',
    ],
  },
  {
    slug: 'cabinet-box-layout-basics-for-diy-builders',
    title: 'Cabinet box layout basics for DIY builders',
    date: 'March 2026',
    summary: 'Understand cabinet box parts, joinery planning, screw spacing, and layout checks before cutting panels.',
    body: [
      'A cabinet box is mostly rectangles, but the order and orientation of those rectangles matter. Side panels, top and bottom panels, back panels, shelves, face frames, and cleats all compete for space.',
      'Decide whether the top and bottom sit between the sides or overlap the sides. That single choice changes finished width, panel dimensions, screw direction, and visible edges.',
      'Back panels are easy to forget until they change the depth. A full back, recessed back, or thin hardboard back can each shift shelf depth and hardware clearance.',
      'Plan screw spacing around plywood edges. Screws too close to a side edge can split layers or bulge the face, while screws too far from the joint may not pull panels tight.',
      'Use temporary labels for left side, right side, top, bottom, fixed shelf, and adjustable shelf zones. This prevents mirrored parts from being cut correctly but assembled backwards.',
      'If the cabinet will hold heavy items, consider adding a rear stretcher, cleat, or thicker bottom panel. The design should show where load transfers into the sides or wall.',
      `In ${BRAND_NAME}, sketch the cabinet box in 3D first, then use Auto Screw to visualize fastener rows and the cut list to verify panel sizes before touching plywood.`,
      'A final cabinet layout review should answer four questions: what is the finished outside size, what are the exact panel sizes, which edges show, and how will the box be clamped or screwed together?',
    ],
  },
  {
    slug: 'how-to-reduce-lumber-waste-before-cutting',
    title: 'How to reduce lumber waste before cutting a woodworking project',
    date: 'March 2026',
    summary: 'Use better planning, repeated dimensions, cut sequencing, and project review to waste less lumber.',
    body: [
      'Lumber waste is not only offcuts on the floor. It is also extra boards bought for uncertainty, replacement pieces after mistakes, and parts recut because the first layout was unclear.',
      'Start by standardizing dimensions where possible. If several rails can share a length, make them identical instead of creating tiny differences that are hard to track.',
      'Separate structural dimensions from cosmetic dimensions. A hidden cleat may not need the same precision or board grade as a visible rail, which can change how you use imperfect stock.',
      'Create a rough cut sequence before final cuts. Breaking long boards into manageable pieces first can improve safety and reduce the chance of cutting a final part from the wrong end.',
      'Account for defects. Knots, checks, twist, and bowed edges may force you to choose part locations carefully instead of assuming every inch of a board is usable.',
      'Label parts as soon as they are cut. A perfect part becomes waste if it gets confused with a similar piece and drilled or trimmed incorrectly.',
      `In ${BRAND_NAME}, model repeated lumber parts, compare the shopping list against your real stock, and keep exported reports with the project so dimensions do not live only in memory.`,
      'The best waste reduction habit is reviewing the design before cutting: confirm part count, finished sizes, assembly order, and the first three cuts you will actually make.',
    ],
  },
];

const BLOG_POST_BY_SLUG = BLOG_POSTS.reduce<Record<string, BlogPost>>((acc, post) => {
  acc[post.slug] = post;
  return acc;
}, {});

const routeToPath = (route: AppRoute) => {
  if (route.page === 'home') return '/';
  if (route.page === 'blog' && route.blogSlug) return `/blog/${route.blogSlug}/`;
  if (route.page === 'notFound') return '/404';
  return `/${route.page}/`;
};

const routeToRelativeUrl = (route: AppRoute) => {
  if (typeof window === 'undefined') return routeToPath(route);
  return `${routeToPath(route)}${window.location.search}`;
};

const routeToAbsoluteUrl = (route: AppRoute) => {
  if (typeof window === 'undefined') return `${SITE_URL}${routeToPath(route)}`;
  return `${window.location.origin}${routeToRelativeUrl(route)}`;
};

const DEFAULT_META_IMAGE = `${SITE_URL}/icons/logo-title.png`;

const getRouteMeta = (route: AppRoute): PageMeta => {
  const base: PageMeta = {
    title: `${BRAND_NAME} - ${BRAND_TAGLINE}`,
    description: 'Plan woodworking projects in 3D with smart layout tools, Auto Screw, structural heat maps, instant cut lists, and shopping lists.',
    canonicalPath: routeToPath({ page: 'home' }),
    image: DEFAULT_META_IMAGE,
    type: 'website',
    robots: 'index,follow',
  };

  if (route.page === 'app') {
    return {
      ...base,
      title: `${BRAND_NAME} Build Studio`,
      description: 'Open the free BEAV.IT 3D woodworking planner to lay out parts, test dimensions, use Auto Screw, and export build-ready cut lists.',
      canonicalPath: routeToPath(route),
      robots: 'noindex,follow',
    };
  }

  if (route.page === 'blog' && route.blogSlug && BLOG_POST_BY_SLUG[route.blogSlug]) {
    const post = BLOG_POST_BY_SLUG[route.blogSlug];
    return {
      ...base,
      title: `${post.title} | ${BRAND_NAME}`,
      description: post.summary,
      canonicalPath: routeToPath(route),
      type: 'article',
    };
  }

  if (route.page === 'blog') {
    return {
      ...base,
      title: `${BRAND_JOURNAL_NAME} | ${BRAND_NAME}`,
      description: 'Woodworking planning guides, BEAV.IT tutorials, build notes, screw placement tips, and practical 3D design workflows.',
      canonicalPath: routeToPath({ page: 'blog' }),
    };
  }

  if (route.page === 'about') {
    return {
      ...base,
      title: `About | ${BRAND_NAME}`,
      description: 'Learn why BEAV.IT exists: practical 3D woodworking planning for builders who want clearer layouts, fewer mistakes, and faster cut lists.',
      canonicalPath: routeToPath(route),
    };
  }

  if (route.page === 'privacy') {
    return {
      ...base,
      title: `Privacy Policy | ${BRAND_NAME}`,
      description: 'Read the BEAV.IT privacy policy for browser storage, cookies, advertising disclosures, and contact details.',
      canonicalPath: routeToPath(route),
    };
  }

  if (route.page === 'terms') {
    return {
      ...base,
      title: `Terms | ${BRAND_NAME}`,
      description: 'Read the BEAV.IT terms for using the woodworking planner and verifying real-world dimensions, safety, and build decisions.',
      canonicalPath: routeToPath(route),
    };
  }

  if (route.page === 'contact') {
    return {
      ...base,
      title: `Contact | ${BRAND_NAME}`,
      description: 'Contact BEAV.IT for woodworking planner questions, bug reports, partnership inquiries, and product feedback.',
      canonicalPath: routeToPath(route),
    };
  }

  if (route.page === 'notFound') {
    return {
      ...base,
      title: `Page Not Found | ${BRAND_NAME}`,
      description: 'This BEAV.IT page could not be found. Use the main navigation to find the woodworking planner, blog, privacy policy, or contact page.',
      canonicalPath: routeToPath({ page: 'notFound' }),
      robots: 'noindex,follow',
    };
  }

  return base;
};

const toSimplePageRoute = (value: string): RouteId | null => {
  if (value === '' || value === 'home' || value === 'index.html') return 'home';
  if (value === 'app') return 'app';
  if (value === 'blog') return 'blog';
  if (value === 'about') return 'about';
  if (value === 'privacy' || value === 'privacy-policy') return 'privacy';
  if (value === 'terms') return 'terms';
  if (value === 'contact') return 'contact';
  return null;
};

const normalizeRouteValue = (value: string): AppRoute | null => {
  const cleaned = value.trim().toLowerCase().replace(/^#\/?/, '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/index\.html$/, '');
  const pageRoute = toSimplePageRoute(cleaned);
  if (pageRoute) return { page: pageRoute };
  if (cleaned === '404' || cleaned === '404.html' || cleaned === 'not-found') return { page: 'notFound' };

  if (cleaned.startsWith('blog/')) {
    const slug = cleaned.slice('blog/'.length).trim();
    if (!slug) return { page: 'blog' };
    if (BLOG_POST_BY_SLUG[slug]) {
      return { page: 'blog', blogSlug: slug };
    }
    return { page: 'notFound' };
  }

  return { page: 'notFound' };
};

const getInitialRoute = (): AppRoute => {
  if (typeof window === 'undefined') return { page: 'home' };
  const hashRoute = window.location.hash ? normalizeRouteValue(window.location.hash) : null;
  const pathRoute = normalizeRouteValue(window.location.pathname);
  if (pathRoute) return pathRoute;
  if (hashRoute) return hashRoute;
  return { page: 'notFound' };
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
    <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
    <div className="mt-4 space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

const upsertMeta = (selector: string, attrs: Record<string, string>) => {
  const head = document.head;
  let element = document.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    head.appendChild(element);
  }

  Object.entries(attrs).forEach(([name, value]) => {
    element?.setAttribute(name, value);
  });
};

const upsertCanonical = (href: string) => {
  let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const shouldHandleClientNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => (
  !event.defaultPrevented
  && event.button === 0
  && !event.metaKey
  && !event.altKey
  && !event.ctrlKey
  && !event.shiftKey
);

const RouteLink = ({
  route,
  navigate,
  className,
  children,
  ariaLabel,
  title,
}: {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  title?: string;
}) => (
  <a
    href={routeToPath(route)}
    aria-label={ariaLabel}
    title={title}
    onClick={(event) => {
      if (!shouldHandleClientNavigation(event)) return;
      event.preventDefault();
      navigate(route);
    }}
    className={className}
  >
    {children}
  </a>
);

const PingPongVideo = ({ src, className }: { src: string; className?: string }) => {
  return (
    <video
      className={className}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
    />
  );
};

const HomePage = ({ navigate }: { navigate: (route: AppRoute) => void }) => (
  <div className="space-y-6">
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-7 shadow-sm sm:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-blue-300/15 blur-3xl" />
      <div className="relative mx-auto max-w-5xl space-y-8 text-center">
        <div>
          <div className="mx-auto max-w-[18rem]">
        <img src={BRAND_LOCKUP_SRC} alt={BRAND_NAME} className="h-auto w-full object-contain" />
          </div>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            <img src={BRAND_LOGO_SRC} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
            {BRAND_TAGLINE}
          </p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Woodworking for everyone,
            <span className="block">with real-world results.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-700 sm:text-lg">
            Use smart 3D planning, Auto Screw, and instant cut and shopping lists to turn ideas into build-ready projects fast.
          </p>
          <div className="mt-6 flex justify-center">
            <RouteLink
              route={{ page: 'app' }}
              navigate={navigate}
              className="rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Start Building Free
            </RouteLink>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Beginner-friendly</span>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Serious-project ready</span>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-slate-600">Export + share anytime</span>
          </div>
        </div>

        <RouteLink
          route={{ page: 'app' }}
          navigate={navigate}
          className="mx-auto block w-full max-w-[32rem] cursor-pointer text-left"
          ariaLabel="Open live planner preview in build mode"
        >
          <div className="cursor-pointer overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-3 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-950 p-2 shadow-inner">
              <div className="mb-2 flex items-center gap-1.5 px-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-100/70">
                  Live Planner Preview
                </span>
              </div>
              <div className="overflow-hidden rounded-[0.95rem] border border-cyan-400/10 bg-slate-900">
                <PingPongVideo
                  className="aspect-[16/10] h-full w-full object-cover"
                  src="/preview-pingpong.mp4"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">3D part layout</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Auto Screw</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Import / export</span>
            </div>
          </div>
        </RouteLink>
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
          <img
            className="h-full w-full object-cover"
            src="/import-export.png"
            alt="Import and export project preview"
          />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Your Designs Stay Yours</h3>
        <p className="mt-2 text-sm text-slate-600">
          Export and import projects anytime so you can keep designs forever, back them up, and easily share them with friends.
        </p>
      </div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Woodworking planning software</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Plan shelves, desk toppers, cabinets, benches, shop fixtures, and simple furniture before cutting material.</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              {BRAND_NAME} is built for practical woodworking plans where the exact board sizes, screw placement, assembly order, and material
              list matter. Instead of drawing a flat sketch and hoping the joinery works, you can test part dimensions in 3D, move boards into
              position, trim overlaps, and check the build from different camera angles.
            </p>
            <p>
              The planner is especially useful for beginner woodworking projects, plywood fixtures, standing desk toppers, garage storage,
              cabinet mockups, and quick furniture prototypes. Each design can become a cut list and shopping list, which helps reduce
              off-by-one measurements, extra hardware trips, and wasted lumber.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-base font-semibold text-slate-900">Popular workflows</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Lay out dimensional lumber and plywood parts in 3D.</li>
            <li>Use Auto Screw to prototype fastener positions and counts.</li>
            <li>Generate project cut lists and shopping lists from the model.</li>
            <li>Export, import, and share woodworking plans between devices.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <RouteLink route={{ page: 'blog', blogSlug: 'why-planning-in-3d-saves-shop-time' }} navigate={navigate} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              3D planning guide
            </RouteLink>
            <RouteLink route={{ page: 'blog', blogSlug: 'choosing-screw-size-quickly-in-cabinet-projects' }} navigate={navigate} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              Screw size guide
            </RouteLink>
          </div>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start Here</p>
        <h2 className="text-2xl font-semibold text-slate-900">Quick blog links for getting started</h2>
        <p className="max-w-2xl text-sm text-slate-600">
          Jump straight to the hands-on walkthroughs and the story behind why {BRAND_NAME} exists.
        </p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <RouteLink
          route={{ page: 'blog', blogSlug: INTERACTIVE_TUTORIAL_SLUG }}
          navigate={navigate}
          className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-5 text-left shadow-sm hover:border-blue-300"
        >
          <span className="inline-flex rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">
            Quick Start
          </span>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Build your first layout</h3>
          <p className="mt-2 text-sm text-slate-700">
            Learn the basics in minutes with the interactive quickstart tutorial.
          </p>
        </RouteLink>
        <RouteLink
          route={{ page: 'blog', blogSlug: ADVANCED_FEATURES_SLUG }}
          navigate={navigate}
          className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 text-left shadow-sm hover:border-indigo-300"
        >
          <span className="inline-flex rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-800">
            Advanced Tutorial
          </span>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Master the special tools</h3>
          <p className="mt-2 text-sm text-slate-700">
            See Auto Screw, overlap trimming, control panel tools, and more in one guide.
          </p>
        </RouteLink>
        <RouteLink
          route={{ page: 'blog', blogSlug: STANDING_DESK_TOPPER_SLUG }}
          navigate={navigate}
          className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-5 text-left shadow-sm hover:border-emerald-300"
        >
          <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
            My Story
          </span>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Why I built {BRAND_NAME}</h3>
          <p className="mt-2 text-sm text-slate-700">
            Read the standing desk topper story that turned a real build problem into this app.
          </p>
        </RouteLink>
      </div>
    </section>
  </div>
);

const BlogTitleGraphic = () => (
  <div className="w-full max-w-3xl text-center">
    <div className="mx-auto max-w-[24rem]">
      <img src={BRAND_LOCKUP_SRC} alt={BRAND_NAME} className="h-auto w-full object-contain" />
    </div>
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
      <img src={BRAND_LOGO_SRC} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
      Journal
    </div>
    <p className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">
      Build notes, workflows, and practical shop tips.
    </p>
    <p className="mt-2 text-lg font-medium text-slate-600">
      Simple reads for better plans and cleaner projects.
    </p>
  </div>
);

const BlogPage = ({ navigate }: { navigate: (route: AppRoute) => void }) => {
  const quickstartPost = BLOG_POSTS.find((post) => post.slug === INTERACTIVE_TUTORIAL_SLUG);
  const regularPosts = BLOG_POSTS.filter((post) => post.slug !== INTERACTIVE_TUTORIAL_SLUG);

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-blue-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-20 h-52 w-52 rounded-full bg-sky-200/20 blur-3xl" />
        <div className="relative flex justify-center">
          <BlogTitleGraphic />
        </div>
      </section>

      {quickstartPost ? (
        <article className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 sm:p-7 shadow-sm ring-1 ring-blue-200/70">
          <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-cyan-300/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-36 w-36 rounded-full bg-blue-300/20 blur-2xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-800">
                Start Here
              </span>
              <span className="rounded-full border border-cyan-300 bg-cyan-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800">
                Interactive Demo
              </span>
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-600">{quickstartPost.date}</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">{quickstartPost.title}</h3>
            <p className="mt-2 max-w-3xl text-slate-700">
              Learn the app basics in a few minutes with a guided, hands-on walkthrough that mirrors the real UI.
            </p>
            <RouteLink
              route={{ page: 'blog', blogSlug: quickstartPost.slug }}
              navigate={navigate}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Start Quickstart Demo
            </RouteLink>
          </div>
        </article>
      ) : null}

      {regularPosts.map((post) => (
        <article key={post.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {post.slug === ADVANCED_FEATURES_SLUG ? (
            <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
              <Cpu size={12} />
              Advanced Guide
            </div>
          ) : null}
          {post.slug === STANDING_DESK_TOPPER_SLUG ? (
            <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              <Hammer size={12} />
              Tutorial Blog
            </div>
          ) : null}
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{post.date}</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{post.title}</h3>
          <p className="mt-2 text-slate-700">{post.summary}</p>
          <RouteLink
            route={{ page: 'blog', blogSlug: post.slug }}
            navigate={navigate}
            className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {post.slug === ADVANCED_FEATURES_SLUG ? 'Read Advanced Guide' : 'Read Post'}
          </RouteLink>
        </article>
      ))}
    </div>
  );
};

const TUTORIAL_STEPS: { action: TutorialAction; title: string; description: string; tip: string }[] = [
  {
    action: 'add',
    title: 'Add a piece from Build',
    description: 'Use the Build sidebar and add a 2x4 piece.',
    tip: 'Click the 2x4 Lumber card.',
  },
  {
    action: 'close-build-panel',
    title: 'Close the sidebar',
    description: 'Close the panel using the X so you can work in the viewport.',
    tip: '',
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
    action: 'close-edit-panel',
    title: 'Close the sidebar',
    description: 'Close the panel using the X before continuing.',
    tip: '',
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
  'close-build-panel': false,
  move: false,
  resize: false,
  'close-edit-panel': false,
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
  const [moveDrag, setMoveDrag] = useState<{ pointerId: number; axis: 'x' | 'y'; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [rotateDrag, setRotateDrag] = useState<{ pointerId: number; centerX: number; centerY: number; startAngleDeg: number; startPointerAngleRad: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showTryRealPopup, setShowTryRealPopup] = useState(false);
  const [completionCelebrated, setCompletionCelebrated] = useState(false);
  const [controlHint, setControlHint] = useState<{
    text: string;
    x: number;
    y: number;
    width: number;
    side: 'right' | 'left' | 'top' | 'bottom';
    arrowOffset: number;
  } | null>(null);
  const desktopPieceRef = useRef<HTMLDivElement | null>(null);
  const mobilePieceRef = useRef<HTMLDivElement | null>(null);
  const desktopGridRef = useRef<HTMLDivElement | null>(null);
  const mobileGridRef = useRef<HTMLDivElement | null>(null);
  const tutorialCardRef = useRef<HTMLElement | null>(null);
  const confettiTimeoutRef = useRef<number | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);

  const currentStep = stepIndex < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[stepIndex] : null;
  const currentAction = currentStep?.action ?? null;
  const actionStepIndex: Record<TutorialAction, number> = {
    add: 0,
    'close-build-panel': 1,
    move: 2,
    resize: 3,
    'close-edit-panel': 4,
    rotate: 5,
    center: 6,
  };
  const reachedStepIndex = Math.max(stepIndex, maxUnlockedStep);
  const confettiPieces = useMemo(
    () => Array.from({ length: 34 }).map((_, idx) => ({
      id: idx,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.28}s`,
      duration: `${1.15 + Math.random() * 0.65}s`,
      drift: `${-48 + Math.random() * 96}px`,
      color: ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'][idx % 6],
      size: 5 + Math.floor(Math.random() * 5),
    })),
    []
  );
  const actionEnabled = (action: TutorialAction) => {
    if (action === 'add') return currentAction === 'add';
    return reachedStepIndex >= actionStepIndex[action];
  };

  useEffect(() => {
    if (tutorialTool === 'move' && !actionEnabled('move')) setTutorialTool('select');
    if (tutorialTool === 'rotate' && !actionEnabled('rotate')) setTutorialTool('select');
  }, [currentAction, reachedStepIndex, tutorialTool]);

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

  useEffect(() => {
    if (currentAction !== 'close-build-panel' && currentAction !== 'close-edit-panel') return;
    if (!isMobileTutorial) {
      markStepReady(currentAction);
      return;
    }
    if (!mobileLeftPanelOpen && !mobileRightPanelOpen) {
      markStepReady(currentAction);
    }
  }, [currentAction, isMobileTutorial, mobileLeftPanelOpen, mobileRightPanelOpen]);

  useEffect(() => () => {
    if (confettiTimeoutRef.current) window.clearTimeout(confettiTimeoutRef.current);
    if (popupTimeoutRef.current) window.clearTimeout(popupTimeoutRef.current);
  }, []);

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
    setShowConfetti(false);
    setShowTryRealPopup(false);
    setCompletionCelebrated(false);
    if (confettiTimeoutRef.current) {
      window.clearTimeout(confettiTimeoutRef.current);
      confettiTimeoutRef.current = null;
    }
    if (popupTimeoutRef.current) {
      window.clearTimeout(popupTimeoutRef.current);
      popupTimeoutRef.current = null;
    }
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

  const beginMoveDrag = (axis: 'x' | 'y') => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!hasPiece || !actionEnabled('move') || tutorialTool !== 'move') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoveDrag({
      pointerId: event.pointerId,
      axis,
      startX: event.clientX,
      startY: event.clientY,
      originX: pieceOffset[0],
      originY: pieceOffset[1],
    });
  };

  const clampPieceOffset = (nextX: number, nextY: number) => {
    const viewport = isMobileTutorial ? mobileGridRef.current : desktopGridRef.current;
    if (!viewport) return [nextX, nextY] as const;
    const boardWidth = Math.max(72, Math.min(176, boardDims.length * 1.1));
    const boardHeight = Math.max(14, Math.min(42, boardDims.height * 4.2));
    const margin = 12;
    const halfViewportW = viewport.clientWidth / 2;
    const halfViewportH = viewport.clientHeight / 2;
    const maxX = Math.max(0, halfViewportW - boardWidth / 2 - margin);
    const maxY = Math.max(0, halfViewportH - boardHeight / 2 - margin);
    return [
      Math.max(-maxX, Math.min(maxX, nextX)),
      Math.max(-maxY, Math.min(maxY, nextY)),
    ] as const;
  };

  const updateMoveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!moveDrag || moveDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - moveDrag.startX;
    const deltaY = event.clientY - moveDrag.startY;
    const moved = Math.abs(deltaX) + Math.abs(deltaY) > 0.6;
    if (moveDrag.axis === 'x') {
      const [clampedX, clampedY] = clampPieceOffset(moveDrag.originX + deltaX, moveDrag.originY);
      setPieceOffset([clampedX, clampedY]);
      if (moved) markStepReady('move');
      return;
    }
    const [clampedX, clampedY] = clampPieceOffset(moveDrag.originX, moveDrag.originY + deltaY);
    setPieceOffset([clampedX, clampedY]);
    if (moved) markStepReady('move');
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

  useEffect(() => {
    if (!currentStep) return;
    const action = currentStep.action;
    if (!stepReady[action] || progress[action]) return;

    const timerId = window.setTimeout(() => {
      setProgress((prev) => ({ ...prev, [action]: true }));
      const next = Math.min(TUTORIAL_STEPS.length, stepIndex + 1);
      setMaxUnlockedStep(next);
      setStepIndex(next);
    }, 220);

    return () => window.clearTimeout(timerId);
  }, [currentStep, progress, stepReady, stepIndex]);

  useEffect(() => {
    const completed = stepIndex >= TUTORIAL_STEPS.length;
    if (!completed || completionCelebrated) return;
    setCompletionCelebrated(true);
    setShowConfetti(true);
    popupTimeoutRef.current = window.setTimeout(() => {
      setShowTryRealPopup(true);
      popupTimeoutRef.current = null;
    }, 320);
    confettiTimeoutRef.current = window.setTimeout(() => {
      setShowConfetti(false);
      confettiTimeoutRef.current = null;
    }, 2100);
  }, [completionCelebrated, stepIndex]);

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
    if (currentAction === 'close-build-panel') return 'Step 2: close the sidebar using X.';
    if (currentAction === 'move') {
      return tutorialTool === 'move'
        ? 'Step 3: drag a move axis handle (X or Y).'
        : 'Step 3: click Move in the toolbar.';
    }
    if (currentAction === 'resize') {
      return sidebarTab === 'edit'
        ? 'Step 4: change Height or Length in Edit.'
        : 'Step 4: click the Edit tab.';
    }
    if (currentAction === 'close-edit-panel') return 'Step 5: close the sidebar using X.';
    if (currentAction === 'rotate') {
      return tutorialTool === 'rotate'
        ? 'Step 6: use a rotate handle around the board.'
        : 'Step 6: click Rotate in the toolbar.';
    }
    if (currentAction === 'center') return 'Step 7: click Auto Center Camera.';
    return 'Tutorial complete. Open the app and start a real project.';
  })();

  const showMoveGizmo = hasPiece && actionEnabled('move') && tutorialTool === 'move';
  const showRotateGizmo = hasPiece && actionEnabled('rotate') && tutorialTool === 'rotate';
  const rotateHandleDistance = Math.max(boardWidthPx, boardHeightPx) / 2 + 24;
  const rotateHandleAngleRad = ((pieceRotation - 90) * Math.PI) / 180;
  const rotateHandleX = Math.cos(rotateHandleAngleRad) * rotateHandleDistance;
  const rotateHandleY = Math.sin(rotateHandleAngleRad) * rotateHandleDistance;
  const isTutorialDragging = !!moveDrag || !!rotateDrag;
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

  const getHintText = (element: HTMLElement) => {
    const explicit =
      element.getAttribute('data-hint')
      || element.getAttribute('aria-label')
      || element.getAttribute('title');
    if (explicit && explicit.trim()) return explicit.trim();

    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length >= 3) return text.slice(0, 88);
    return null;
  };

  useEffect(() => {
    const root = tutorialCardRef.current;
    if (!root || isTutorialDragging) {
      setControlHint(null);
      return;
    }

    const activeTargets = Array.from(root.querySelectorAll<HTMLElement>('[data-guide-active="true"]'));
    const target = activeTargets
      .sort((a, b) => {
        const pa = Number(a.dataset.guidePriority ?? '0');
        const pb = Number(b.dataset.guidePriority ?? '0');
        return pb - pa;
      })[0];
    if (!target) {
      setControlHint(null);
      return;
    }

    const updateHint = () => {
      const text = getHintText(target);
      if (!text) {
        setControlHint(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setControlHint(null);
        return;
      }

      const width = Math.max(132, Math.min(236, text.length * 7 + 24));
      const lineCount = Math.max(1, Math.ceil(text.length / 34));
      const height = 30 + (lineCount - 1) * 14;
      const gap = 12;
      const viewportMargin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
      const overlapsTarget = (x: number, y: number) => !(
        x + width + 2 < rect.left
        || x - 2 > rect.right
        || y + height + 2 < rect.top
        || y - 2 > rect.bottom
      );

      const hintZone = target.getAttribute('data-hint-zone');
      if (hintZone === 'under-panel') {
        const toolbar = root.querySelector<HTMLElement>('[data-tutorial-toolbar="true"]');
        if (toolbar) {
          const toolbarRect = toolbar.getBoundingClientRect();
          const safeRegion = root.querySelector<HTMLElement>('[data-hint-safe-region="true"]');
          const safeRect = safeRegion?.getBoundingClientRect();
          const minX = safeRect ? safeRect.left + viewportMargin : viewportMargin;
          const rawMaxX = safeRect ? safeRect.right - width - viewportMargin : vw - width - viewportMargin;
          const maxX = rawMaxX >= minX ? rawMaxX : vw - width - viewportMargin;
          const forcedX = clamp(toolbarRect.left + toolbarRect.width / 2 - width / 2, minX, maxX);
          const forcedY = clamp(toolbarRect.bottom + gap, viewportMargin, vh - height - viewportMargin);
          const arrowOffset = clamp(centerX - forcedX, 12, width - 12);
          setControlHint({ text, x: forcedX, y: forcedY, width, side: 'bottom', arrowOffset });
          return;
        }
      }

      const placeForSide = (side: 'right' | 'left' | 'top' | 'bottom') => {
        if (side === 'right') return { x: rect.right + gap, y: centerY - height / 2 };
        if (side === 'left') return { x: rect.left - gap - width, y: centerY - height / 2 };
        if (side === 'top') return { x: centerX - width / 2, y: rect.top - gap - height };
        return { x: centerX - width / 2, y: rect.bottom + gap };
      };

      const preferredSides = ([
        ['right', vw - rect.right],
        ['left', rect.left],
        ['bottom', vh - rect.bottom],
        ['top', rect.top],
      ] as const)
        .sort((a, b) => b[1] - a[1])
        .map(([side]) => side);

      let chosen: { x: number; y: number; side: 'right' | 'left' | 'top' | 'bottom' } | null = null;
      for (const side of preferredSides) {
        const placed = placeForSide(side);
        const x = clamp(placed.x, viewportMargin, vw - width - viewportMargin);
        const y = clamp(placed.y, viewportMargin, vh - height - viewportMargin);
        if (!overlapsTarget(x, y)) {
          chosen = { x, y, side };
          break;
        }
      }

      if (!chosen) {
        const fallback = placeForSide('bottom');
        chosen = {
          x: clamp(fallback.x, viewportMargin, vw - width - viewportMargin),
          y: clamp(fallback.y, viewportMargin, vh - height - viewportMargin),
          side: 'bottom',
        };
      }

      const arrowOffset = chosen.side === 'right' || chosen.side === 'left'
        ? clamp(centerY - chosen.y, 10, height - 10)
        : clamp(centerX - chosen.x, 12, width - 12);
      setControlHint({ text, x: chosen.x, y: chosen.y, width, side: chosen.side, arrowOffset });
    };

    updateHint();
    window.addEventListener('resize', updateHint);
    window.addEventListener('scroll', updateHint, true);
    return () => {
      window.removeEventListener('resize', updateHint);
      window.removeEventListener('scroll', updateHint, true);
    };
  }, [
    isTutorialDragging,
    isMobileTutorial,
    mobileLeftPanelOpen,
    mobileRightPanelOpen,
    highlightAddButton,
    highlightMoveTool,
    highlightMoveControls,
    highlightEditTab,
    highlightResizeControls,
    highlightRotateTool,
    highlightRotateHandle,
    highlightCenterButton,
    highlightNextStep,
    highlightMobileLeftOpen,
    currentAction,
    tutorialTool,
    sidebarTab,
    stepIndex,
  ]);

  return (
    <div className="space-y-4">
      <button
        onClick={backToBlog}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Back to Blog
      </button>

      <article
        ref={tutorialCardRef}
        className="relative rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
      >
        <style>{`
          @keyframes tutorialConfettiDrop {
            0% { transform: translate3d(0, -18px, 0) rotate(0deg); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translate3d(var(--dx), 280px, 0) rotate(630deg); opacity: 0; }
          }
        `}</style>
        {showConfetti ? (
          <div className="pointer-events-none absolute inset-0 z-[70] overflow-hidden">
            {confettiPieces.map((piece) => (
              <span
                key={piece.id}
                className="absolute top-0 rounded-[2px]"
                style={{
                  left: piece.left,
                  width: `${piece.size}px`,
                  height: `${piece.size * 1.6}px`,
                  backgroundColor: piece.color,
                  animation: `tutorialConfettiDrop ${piece.duration} ease-out ${piece.delay} forwards`,
                  ['--dx' as string]: piece.drift,
                }}
              />
            ))}
          </div>
        ) : null}

        {showTryRealPopup ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 p-4">
            <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-blue-200 bg-white p-4 shadow-2xl">
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                {confettiPieces.map((piece) => (
                  <span
                    key={`popup-${piece.id}`}
                    className="absolute -top-4 rounded-[2px] opacity-80"
                    style={{
                      left: piece.left,
                      width: `${Math.max(4, piece.size - 1)}px`,
                      height: `${Math.max(7, piece.size + 1)}px`,
                      backgroundColor: piece.color,
                      animation: `tutorialConfettiDrop ${1.35 + (piece.id % 6) * 0.08}s ease-out ${Number(piece.delay.replace('s', '')) * 0.6}s infinite`,
                      ['--dx' as string]: `${parseFloat(piece.drift) * 0.55}px`,
                    }}
                  />
                ))}
              </div>
              <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Tutorial Complete</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Try the real program</h3>
              <p className="mt-1 text-sm text-slate-700">
                Nice work. You learned the core controls. Want to jump into the full Build app now?
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowTryRealPopup(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Keep Practicing
                </button>
                <button
                  onClick={openApp}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Open Build
                </button>
              </div>
              </div>
            </div>
          </div>
        ) : null}

        <h1 className="text-2xl font-semibold text-slate-900 text-center">Build your first layout in 5 minutes</h1>

        <section className="mt-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-5">
          <div className="rounded-xl border-2 border-blue-300 bg-white px-4 py-4 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              {currentStep ? `Step ${stepIndex + 1} Command` : 'Final Step'}
            </p>
            <p className="mt-1 min-h-[2.85rem] sm:min-h-[3.15rem] text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center justify-center">
              {currentStep ? currentStep.title : 'Tutorial Complete'}
            </p>
            <p className="mt-1 min-h-[2.35rem] text-sm sm:text-base font-semibold text-blue-800 flex items-center justify-center">
              {hintText}
            </p>
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
                    data-guide-active={highlightEditTab ? 'true' : undefined}
                    data-guide-priority="30"
                    data-hint="Open Edit tab to resize the selected board."
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
                        data-guide-active={highlightAddButton ? 'true' : undefined}
                        data-guide-priority="30"
                        data-hint="Add this 2x4 board to begin."
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
                                data-guide-active={highlightResizeControls ? 'true' : undefined}
                                data-guide-priority="24"
                                data-hint={`Decrease ${field}.`}
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
                                data-guide-active={highlightResizeControls ? 'true' : undefined}
                                data-guide-priority="28"
                                data-hint={`Set ${field} value.`}
                              />
                              <button
                                onClick={() => updateDimension(field, boardDims[field] + (field === 'length' ? 2 : 0.25))}
                                disabled={!actionEnabled('resize')}
                                className={`rounded border text-sm ${
                                  actionEnabled('resize')
                                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                } ${highlightResizeControls ? guideGlowClass : ''}`}
                                data-guide-active={highlightResizeControls ? 'true' : undefined}
                                data-guide-priority="24"
                                data-hint={`Increase ${field}.`}
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

              <div className="absolute inset-y-0 left-[15rem] right-[15rem]" data-hint-safe-region="true">
                <div data-tutorial-toolbar="true" className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1.5 sm:p-2 flex flex-col gap-1 z-30 max-w-[calc(100%-0.5rem)] overflow-visible">
                  <div className="flex flex-nowrap items-center justify-center gap-0.5 sm:gap-2">
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
                      data-guide-active={highlightMoveTool ? 'true' : undefined}
                      data-guide-priority="30"
                      data-hint-zone="under-panel"
                      data-hint="Switch to Move tool."
                    >
                      <Move size={18} />
                    </button>
                    <button
                      onClick={() => activateTool('rotate')}
                      disabled={!actionEnabled('rotate')}
                      className={`${toolbarButtonClass(actionEnabled('rotate'), tutorialTool === 'rotate')} ${highlightRotateTool ? guideGlowClass : ''}`}
                      title="Rotate"
                      data-guide-active={highlightRotateTool ? 'true' : undefined}
                      data-guide-priority="30"
                      data-hint-zone="under-panel"
                      data-hint="Switch to Rotate tool."
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
                      data-guide-active={highlightCenterButton ? 'true' : undefined}
                      data-guide-priority="30"
                      data-hint-zone="under-panel"
                      data-hint="Center the camera on your board."
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

                <div className="h-full px-4 pt-[6.75rem] pb-4">
                  <div
                    ref={desktopGridRef}
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
                              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[calc(100%+3rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300/80" />
                              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[calc(100%+3rem)] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300/80" />
                              <button
                                onPointerDown={beginMoveDrag('x')}
                                onPointerMove={updateMoveDrag}
                                onPointerUp={endMoveDrag}
                                onPointerCancel={endMoveDrag}
                                className={`absolute top-1/2 -translate-y-1/2 -right-10 h-8 w-8 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Drag along X axis"
                                data-guide-active={highlightMoveControls ? 'true' : undefined}
                                data-guide-priority="26"
                                data-hint="Drag this handle to move along X."
                              >
                                <ArrowRight size={14} className="mx-auto" />
                              </button>
                              <button
                                onPointerDown={beginMoveDrag('y')}
                                onPointerMove={updateMoveDrag}
                                onPointerUp={endMoveDrag}
                                onPointerCancel={endMoveDrag}
                                className={`absolute left-1/2 -translate-x-1/2 -top-10 h-8 w-8 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                                title="Drag along Y axis"
                                data-guide-active={highlightMoveControls ? 'true' : undefined}
                                data-guide-priority="26"
                                data-hint="Drag this handle to move along Y."
                              >
                                <ArrowUp size={14} className="mx-auto" />
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
                                className={`absolute h-7 w-7 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightRotateHandle ? guideGlowClass : ''}`}
                                style={{
                                  left: '50%',
                                  top: '50%',
                                  transform: `translate(calc(-50% + ${rotateHandleX}px), calc(-50% + ${rotateHandleY}px))`,
                                }}
                                title="Drag to rotate"
                                data-guide-active={highlightRotateHandle ? 'true' : undefined}
                                data-guide-priority="26"
                                data-hint="Drag this handle to rotate."
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
            <div className="relative h-[clamp(21.5rem,56dvh,27rem)]">
              <div className="absolute top-3 left-2 z-20 flex gap-1.5 sm:gap-2">
                <button
                  onClick={() => {
                    setMobileRightPanelOpen(false);
                    setMobileLeftPanelOpen(true);
                  }}
                  className={`h-8 w-8 sm:h-9 sm:w-9 rounded-md border bg-white/95 text-slate-700 shadow hover:bg-white ${highlightMobileLeftOpen ? guideGlowClass : ''}`}
                  title="Open Build/Edit Panel"
                  data-guide-active={highlightMobileLeftOpen ? 'true' : undefined}
                  data-guide-priority="35"
                  data-hint="Open the Build and Edit sidebar."
                >
                  <PanelLeft size={14} className="mx-auto" />
                </button>
                <button
                  onClick={() => {
                    setMobileLeftPanelOpen(false);
                    setMobileRightPanelOpen(true);
                  }}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border bg-white/95 text-slate-700 shadow hover:bg-white"
                  title="Open Bill of Materials"
                  data-hint="Open the Bill of Materials panel."
                >
                  <PanelRight size={14} className="mx-auto" />
                </button>
              </div>

              <div data-tutorial-toolbar="true" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-white/95 backdrop-blur shadow-lg p-1.5 flex flex-col gap-1 max-w-[calc(100%-5.2rem)] sm:max-w-[calc(100%-0.75rem)]">
                <div className="flex items-center justify-center gap-1">
                  <button disabled className={toolbarButtonClass(false, tutorialTool === 'select')} title="Select">
                    <MousePointer2 size={18} />
                  </button>
                  <button
                    onClick={() => activateTool('move')}
                    disabled={!actionEnabled('move')}
                    className={`${toolbarButtonClass(actionEnabled('move'), tutorialTool === 'move')} ${highlightMoveTool ? guideGlowClass : ''}`}
                    title="Move"
                    data-guide-active={highlightMoveTool ? 'true' : undefined}
                    data-guide-priority="30"
                    data-hint-zone="under-panel"
                    data-hint="Switch to Move tool."
                  >
                    <Move size={18} />
                  </button>
                  <button
                    onClick={() => activateTool('rotate')}
                    disabled={!actionEnabled('rotate')}
                    className={`${toolbarButtonClass(actionEnabled('rotate'), tutorialTool === 'rotate')} ${highlightRotateTool ? guideGlowClass : ''}`}
                    title="Rotate"
                    data-guide-active={highlightRotateTool ? 'true' : undefined}
                    data-guide-priority="30"
                    data-hint-zone="under-panel"
                    data-hint="Switch to Rotate tool."
                  >
                    <RotateCw size={18} />
                  </button>
                  <button
                    onClick={centerCamera}
                    disabled={!actionEnabled('center')}
                    className={`${toolbarButtonClass(actionEnabled('center'))} ${highlightCenterButton ? guideGlowClass : ''}`}
                    title="Auto Center Camera"
                    data-guide-active={highlightCenterButton ? 'true' : undefined}
                    data-guide-priority="30"
                    data-hint-zone="under-panel"
                    data-hint="Center the camera on your board."
                  >
                    <LocateFixed size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <button disabled className={toolbarButtonClass(false)} title="Save Design">
                    <Download size={18} />
                  </button>
                  <button disabled className={toolbarButtonClass(false)} title="Load Design">
                    <Upload size={18} />
                  </button>
                </div>
              </div>

              <div className="h-full px-3 pt-[6.8rem] pb-3" data-hint-safe-region="true">
                <div
                  ref={mobileGridRef}
                  className="relative h-full overflow-hidden rounded-lg border border-slate-200"
                  style={{
                    backgroundColor: '#f8fafc',
                    backgroundImage:
                      'linear-gradient(to right, rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.2) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                    touchAction: isTutorialDragging ? 'none' : 'pan-y',
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
                          <>
                            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[calc(100%+2rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300/80" />
                            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[calc(100%+2rem)] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300/80" />
                            <button
                              onPointerDown={beginMoveDrag('x')}
                              onPointerMove={updateMoveDrag}
                              onPointerUp={endMoveDrag}
                              onPointerCancel={endMoveDrag}
                              className={`absolute top-1/2 -translate-y-1/2 -right-9 h-8 w-8 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                              title="Drag along X axis"
                              data-guide-active={highlightMoveControls ? 'true' : undefined}
                              data-guide-priority="26"
                              data-hint="Drag this handle to move along X."
                            >
                              <ArrowRight size={14} className="mx-auto" />
                            </button>
                            <button
                              onPointerDown={beginMoveDrag('y')}
                              onPointerMove={updateMoveDrag}
                              onPointerUp={endMoveDrag}
                              onPointerCancel={endMoveDrag}
                              className={`absolute left-1/2 -translate-x-1/2 -top-9 h-8 w-8 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightMoveControls ? guideGlowClass : ''}`}
                              title="Drag along Y axis"
                              data-guide-active={highlightMoveControls ? 'true' : undefined}
                              data-guide-priority="26"
                              data-hint="Drag this handle to move along Y."
                            >
                              <ArrowUp size={14} className="mx-auto" />
                            </button>
                          </>
                        )}
                        {showRotateGizmo && (
                          <button
                            onPointerDown={beginRotateDrag}
                            onPointerMove={updateRotateDrag}
                            onPointerUp={endRotateDrag}
                            onPointerCancel={endRotateDrag}
                            className={`absolute h-7 w-7 touch-none rounded-full border border-blue-300 bg-white text-blue-700 shadow cursor-grab active:cursor-grabbing hover:bg-blue-50 ${highlightRotateHandle ? guideGlowClass : ''}`}
                            style={{
                              left: '50%',
                              top: '50%',
                              transform: `translate(calc(-50% + ${rotateHandleX}px), calc(-50% + ${rotateHandleY}px))`,
                            }}
                            title="Drag to rotate"
                            data-guide-active={highlightRotateHandle ? 'true' : undefined}
                            data-guide-priority="26"
                            data-hint="Drag this handle to rotate."
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
                  <div className="absolute inset-y-0 left-0 w-[min(15rem,70vw)] bg-white border-r border-slate-200 shadow-xl flex flex-col">
                    <button
                      onClick={() => setMobileLeftPanelOpen(false)}
                      className={`absolute right-2 top-2 z-10 p-1.5 rounded-md border border-slate-200 bg-white/95 hover:bg-slate-100 text-slate-500 ${
                        (currentAction === 'close-build-panel' || currentAction === 'close-edit-panel') && !stepSatisfied ? guideGlowClass : ''
                      }`}
                      data-guide-active={(currentAction === 'close-build-panel' || currentAction === 'close-edit-panel') && !stepSatisfied ? 'true' : undefined}
                      data-guide-priority="40"
                    >
                      <X size={14} />
                    </button>
                    <div className="mt-11 flex border-b border-slate-200 shrink-0">
                      <button onClick={() => setSidebarTab('build')} className={`flex-1 py-3 text-sm font-medium ${sidebarTab === 'build' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-500'}`}>Build</button>
                      <button className="flex-1 py-3 text-sm font-medium text-slate-300 bg-slate-50 cursor-not-allowed">Scene</button>
                      <button
                        onClick={() => hasPiece && setSidebarTab('edit')}
                        disabled={!hasPiece}
                        className={`flex-1 py-3 text-sm font-medium ${!hasPiece ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : sidebarTab === 'edit' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-500'} ${highlightEditTab ? guideGlowClass : ''}`}
                        data-guide-active={highlightEditTab ? 'true' : undefined}
                        data-guide-priority="30"
                        data-hint="Open Edit tab to resize the selected board."
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
                          data-guide-active={highlightAddButton ? 'true' : undefined}
                          data-guide-priority="30"
                          data-hint="Add this 2x4 board to begin."
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
                                  data-guide-active={highlightResizeControls ? 'true' : undefined}
                                  data-guide-priority="24"
                                  data-hint={`Decrease ${field}.`}
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
                                  data-guide-active={highlightResizeControls ? 'true' : undefined}
                                  data-guide-priority="28"
                                  data-hint={`Set ${field} value.`}
                                />
                                <button
                                  onClick={() => updateDimension(field, boardDims[field] + (field === 'length' ? 2 : 0.25))}
                                  disabled={!actionEnabled('resize')}
                                  className={`rounded border text-sm ${
                                    actionEnabled('resize')
                                      ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  } ${highlightResizeControls ? guideGlowClass : ''}`}
                                  data-guide-active={highlightResizeControls ? 'true' : undefined}
                                  data-guide-priority="24"
                                  data-hint={`Increase ${field}.`}
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
                  <div className="absolute inset-y-0 right-0 w-[min(15rem,70vw)] bg-white border-l border-slate-200 shadow-xl p-3">
                    <button
                      onClick={() => setMobileRightPanelOpen(false)}
                      className={`absolute right-2 top-2 z-10 p-1.5 rounded-md border border-slate-200 bg-white/95 hover:bg-slate-100 text-slate-500 ${
                        (currentAction === 'close-build-panel' || currentAction === 'close-edit-panel') && !stepSatisfied ? guideGlowClass : ''
                      }`}
                      data-guide-active={(currentAction === 'close-build-panel' || currentAction === 'close-edit-panel') && !stepSatisfied ? 'true' : undefined}
                      data-guide-priority="40"
                    >
                      <X size={14} />
                    </button>
                    <h3 className="mt-10 font-semibold text-lg text-slate-800">Bill of Materials</h3>
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
                {currentStep.tip ? <p className="mt-1 text-xs text-slate-500">{currentStep.tip}</p> : null}
                <p className="mt-2 text-xs font-medium text-blue-800">
                  {stepSatisfied ? 'Step action complete. Advancing automatically...' : 'Complete the highlighted action to continue.'}
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

        {controlHint ? (
          <div
            className="pointer-events-none fixed z-[80] overflow-visible rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-[11px] text-slate-700 shadow-lg backdrop-blur"
            style={{ left: `${controlHint.x}px`, top: `${controlHint.y}px`, width: `${controlHint.width}px` }}
          >
            {controlHint.side === 'right' ? (
              <span
                className="absolute -left-1.5 h-3 w-3 rotate-45 border-b border-l border-slate-300 bg-white/95"
                style={{ top: `${controlHint.arrowOffset - 6}px` }}
              />
            ) : null}
            {controlHint.side === 'left' ? (
              <span
                className="absolute -right-1.5 h-3 w-3 rotate-45 border-r border-t border-slate-300 bg-white/95"
                style={{ top: `${controlHint.arrowOffset - 6}px` }}
              />
            ) : null}
            {controlHint.side === 'top' ? (
              <span
                className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-r border-b border-slate-300 bg-white/95"
                style={{ left: `${controlHint.arrowOffset - 6}px` }}
              />
            ) : null}
            {controlHint.side === 'bottom' ? (
              <span
                className="absolute -top-1.5 h-3 w-3 rotate-45 border-l border-t border-slate-300 bg-white/95"
                style={{ left: `${controlHint.arrowOffset - 6}px` }}
              />
            ) : null}
            {controlHint.text}
          </div>
        ) : null}
      </article>
    </div>
  );
};

const AdvancedFeaturesBlog = ({ openApp, backToBlog }: { openApp: () => void; backToBlog: () => void }) => (
  <div className="space-y-4">
    <button
      onClick={backToBlog}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      Back to Blog
    </button>

    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4 sm:p-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
          <Cpu size={13} />
          Advanced Features Deep Dive
        </div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-slate-900">
          Special Tools + Control Panel, explained visually
        </h1>
        <p className="mt-2 text-slate-700 max-w-4xl">
          This is a practical guide to the advanced toolset: Auto Screw workflows, overlap trimming, snapping helpers, shadows, and the futuristic
          control panel with explosion + structural stress analysis.
        </p>
        <button
          onClick={() => {
            const appUrl = routeToAbsoluteUrl({ page: 'app' });
            window.open(appUrl, '_blank', 'noopener,noreferrer');
          }}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open Build While Reading
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Where these features live in the real UI</h2>
        <p className="text-sm text-slate-700">
          Advanced controls are concentrated on the toolbar: <strong>Control Panel</strong> and <strong>Special Tools</strong>, with Export and
          Import grouped beside them.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <MousePointer2 size={13} /> Select
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <Move size={13} /> Move
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <RotateCw size={13} /> Rotate
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div className="inline-flex items-center gap-1 rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
              <Cpu size={13} /> Control Panel
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-800">
              <Wrench size={13} /> Special Tools
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <Download size={13} /> Export
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <Upload size={13} /> Import
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Special Tools menu map</h2>
        <p className="text-sm text-slate-700">
          The dropdown is grouped into <strong>Building</strong>, <strong>Handling</strong>, and <strong>Settings</strong>. Here is the exact flow
          and what each control is best for.
        </p>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,320px),1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-2 py-1">Building</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Hammer size={14} /> Auto Screw</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Scissors size={14} /> Trim Overlaps</div>
            <div className="my-1 h-px bg-slate-200" />
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-2 py-1">Handling</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><MousePointer2 size={14} /> Select Assist</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Magnet size={14} /> Snapping</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Magnet size={14} /> Edge Snap</div>
            <div className="my-1 h-px bg-slate-200" />
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-2 py-1">Settings</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Grid size={14} /> Floor On/Off</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-slate-700 inline-flex items-center gap-2"><Sun size={14} /> Shadows On/Off</div>
            <div className="rounded-md px-2 py-1.5 text-sm text-red-600 inline-flex items-center gap-2"><Trash2 size={14} /> Reset Scene</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-2">
            <div><strong>Auto Screw:</strong> select entry piece first, destination piece second. It places screws intended to bridge both parts.</div>
            <div><strong>Trim Overlaps:</strong> select one wood/sheet part, then cut away regions where it overlaps other wood parts.</div>
            <div><strong>Select Assist:</strong> in Select mode, hovered parts flash green to reduce selection mistakes.</div>
            <div><strong>Edge Snap:</strong> aligns nearby edges, including floor-level alignment, for faster placement.</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Auto Screw: recommended workflow</h2>
        <p className="text-sm text-slate-700">
          Auto Screw is directional. Piece 1 is the entry side (screw head side), piece 2 is the destination side.
        </p>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 sm:p-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500 text-center">Auto Screw demo</div>
            <div className="mt-2 mx-auto w-full max-w-[18rem] sm:max-w-[20rem] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <video
                className="h-auto w-full object-cover"
                src="/auto-screw.mp4"
                autoPlay
                loop
                muted
                playsInline
                controls
                preload="metadata"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-blue-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step 1</div>
              <div className="mt-1 text-sm text-slate-700">Enable <strong>Auto Screw</strong> in Special Tools.</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step 2</div>
              <div className="mt-1 text-sm text-slate-700">Click entry piece, then click destination piece.</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Result</div>
              <div className="mt-1 text-sm text-slate-700">Pick a target from 1 to 4 screws (default 2). Failed placements should place nothing.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Futuristic Control Panel map</h2>
        <p className="text-sm text-slate-700">
          Use this panel for exploded inspection, heat-map overlay, stress scenarios, and build telemetry. On small screens, minimize keeps it out of
          the way while preserving quick access.
        </p>
        <div className="rounded-xl border border-cyan-300/40 bg-slate-950/85 p-3 sm:p-4 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-cyan-300">
            <span>Future Build Console</span>
            <span className="font-mono">68%</span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-cyan-300/30 bg-slate-900/70 p-2">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                <Maximize2 size={12} />
                Explosion
              </div>
              <div className="mt-2 h-2 rounded bg-slate-800">
                <div className="h-2 w-2/5 rounded bg-cyan-400" />
              </div>
              <div className="mt-1 text-[10px] text-cyan-100/80">0.00 normal to 1.00 full explode</div>
            </div>
            <div className="rounded-lg border border-cyan-300/30 bg-slate-900/70 p-2">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                <Shield size={12} />
                Structural Stress Lab
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                <span className="rounded border border-cyan-300/50 bg-cyan-500/15 px-1.5 py-0.5">Baseline</span>
                <span className="rounded border border-slate-600 px-1.5 py-0.5">Vertical Load</span>
                <span className="rounded border border-slate-600 px-1.5 py-0.5">Side Racking</span>
                <span className="rounded border border-slate-600 px-1.5 py-0.5">Twist Torque</span>
              </div>
              <div className="mt-2 h-1.5 rounded bg-slate-800 overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-rose-500 via-amber-400 to-cyan-400" />
              </div>
              <div className="mt-1 text-[10px] text-cyan-100/80">Heat map: red high risk, amber moderate, cyan reinforced</div>
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-cyan-300/30 bg-slate-900/70 p-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
              <ActivitySquare size={12} />
              Build Telemetry
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
              <div className="rounded border border-slate-700 bg-slate-900/80 p-1.5">Wood Pieces: 18</div>
              <div className="rounded border border-slate-700 bg-slate-900/80 p-1.5">Fasteners: 26</div>
              <div className="rounded border border-slate-700 bg-slate-900/80 p-1.5">Support: 71%</div>
              <div className="rounded border border-slate-700 bg-slate-900/80 p-1.5">Max Span: 38.2 in</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Quick recipes to try next</h2>
        <div className="mt-2 space-y-1.5 text-sm text-slate-700">
          <p><strong>Fast shelf jointing:</strong> turn on Edge Snap, align parts, then use Auto Screw to lock joints quickly.</p>
          <p><strong>Custom notch workflow:</strong> duplicate a guide part, overlap it where needed, then run Trim Overlaps.</p>
          <p><strong>Stability tuning:</strong> run baseline stress lab, add braces/fasteners where red clusters appear, and re-check score.</p>
        </div>
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
        <p className="text-sm text-slate-700">You now have the full advanced map. Apply it directly in your real build.</p>
        <button
          onClick={openApp}
          className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Start Building with Advanced Tools
        </button>
      </div>
    </article>
  </div>
);

const StandingDeskTopperStoryBlog = ({ openApp, backToBlog }: { openApp: () => void; backToBlog: () => void }) => {
  const steps: Array<{
    id: number;
    title: string;
    description: string;
    how: string[];
    media: string;
    mediaType: 'image' | 'video';
    alt: string;
  }> = [
    {
      id: 1,
      title: 'Add plywood for the monitor platform',
      description: 'Measured my monitor stand at 22 in wide and 10 in deep, then set a plywood part to match.',
      how: [
        'Open Build panel, add a plywood/sheet part first.',
        'In Edit, set dimensions to 22 in by 10 in for the monitor platform.',
      ],
      media: '/blogs/standing-desk-topper/1-add-plywood-shape-for-screen.png',
      mediaType: 'image',
      alt: `Step 1 plywood monitor platform setup in ${BRAND_NAME}`,
    },
    {
      id: 2,
      title: 'Add legs to match standing eye level',
      description: 'Measured standing eye level from desk height, then used edge snap to place legs quickly.',
      how: [
        'Add lumber legs in Build, then switch to Move for placement.',
        'With Edge Snap on (default), drag each leg into aligned position under the platform.',
      ],
      media: '/blogs/standing-desk-topper/2-add-legs-for-screen-height.png',
      mediaType: 'image',
      alt: `Step 2 adding legs for screen height in ${BRAND_NAME}`,
    },
    {
      id: 3,
      title: 'Add the keyboard and mouse shelf',
      description: 'Placed a second plywood level where my hands felt comfortable while standing.',
      how: [
        'Add another sheet piece for keyboard/mouse height.',
        'Use Move + Edit dimensions to dial in both elevation and working area.',
      ],
      media: '/blogs/standing-desk-topper/3-add-plywood-for-mouse-keyboard.png',
      mediaType: 'image',
      alt: 'Step 3 adding plywood shelf for keyboard and mouse',
    },
    {
      id: 4,
      title: 'Trim overlapping sheet regions',
      description: 'Ran Trim Overlaps from Special Tools to remove extra sheet area where legs intersected.',
      how: [
        'Select the sheet to cut, then open Special Tools > Trim Overlaps.',
        'The tool removes overlap zones against other wood parts to form a clean custom shape.',
      ],
      media: '/blogs/standing-desk-topper/4-trim-overlap-of-sheet-to-fit-legs.png',
      mediaType: 'image',
      alt: 'Step 4 using trim overlaps on plywood',
    },
    {
      id: 5,
      title: 'Add cleats under the plywood',
      description: 'Placed cleats below the shelf so the plywood had reliable support points.',
      how: [
        'Add short lumber cleats under each supported edge/region.',
        'Use Edge Snap and Move to seat cleats tightly under the shelf.',
      ],
      media: '/blogs/standing-desk-topper/5-add-cleats-for-sheet.mp4',
      mediaType: 'video',
      alt: 'Step 5 adding cleats for plywood support',
    },
    {
      id: 6,
      title: 'Use Auto Screw for fast join planning',
      description: 'Selected entry piece first, destination piece second, and planned all fastener locations in seconds.',
      how: [
        'Enable Special Tools > Auto Screw.',
        'Click piece 1 (drill-through side), then piece 2 (finish side) for each connection.',
      ],
      media: '/blogs/standing-desk-topper/6-use-auto-screw.png',
      mediaType: 'image',
      alt: `Step 6 using auto screw in ${BRAND_NAME}`,
    },
    {
      id: 7,
      title: 'Review cut list and shopping list',
      description: 'Verified required materials and exact cuts from the right-side BOM tools.',
      how: [
        'Open the right BOM panel to inspect Shopping and Cuts.',
        'Export reports when ready so buying and cutting stay organized.',
      ],
      media: '/blogs/standing-desk-topper/7-cut-list-shopping-list.png',
      mediaType: 'image',
      alt: `Step 7 cut list and shopping list view in ${BRAND_NAME}`,
    },
    {
      id: 8,
      title: 'Build result',
      description: 'After a couple of hours and scrap materials, I had a usable standing desk topper and much better neck comfort.',
      how: [
        'Export your design JSON so it can be imported and revised later.',
        'Re-open the file anytime to iterate or share with someone else.',
      ],
      media: '/blogs/standing-desk-topper/8-actually-made-it.png',
      mediaType: 'image',
      alt: 'Finished standing desk topper project built from the design',
    },
  ];

  const openImportedDesign = (openInNewTab: boolean) => {
    window.localStorage.setItem(PENDING_PROJECT_IMPORT_PAYLOAD_KEY, JSON.stringify(standingDeskTopperProject));
    window.localStorage.setItem(PENDING_PROJECT_IMPORT_KEY, STANDING_DESK_TOPPER_IMPORT_ASSET);
    if (openInNewTab) {
      const appUrl = routeToAbsoluteUrl({ page: 'app' });
      window.open(appUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    openApp();
  };

  return (
    <div className="space-y-4">
      <button
        onClick={backToBlog}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Back to Blog
      </button>

      <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 sm:p-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            <Hammer size={13} />
            Real Build Story
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-slate-900">
            Why I made {BRAND_NAME}, and how it helped fix my neck pain
          </h1>
          <p className="mt-3 text-slate-700 max-w-4xl">
            I noticed that my neck was hurting badly while sitting at my computer. I wanted better posture and blood flow, so I decided to convert my
            desk into a standing setup.
          </p>
          <p className="mt-2 text-slate-700 max-w-4xl">
            Prebuilt options were expensive, and I had never done woodworking before, so I built software to help me plan with confidence. I sourced
            scrap wood from a friend and found basic tools at home.
          </p>
          <p className="mt-2 text-slate-700 max-w-4xl">
            The workflow below is intentionally practical: each step explains which panel/tool I used so someone new can reproduce the same process.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => openImportedDesign(false)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try My Design in Build
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => openImportedDesign(true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Open in New Tab
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The design auto-loads from <code>standing-desk-topper.json</code>.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">How I planned the build in {BRAND_NAME}</h2>
          <p className="text-sm text-slate-700">
            This was my exact planning sequence from measurements to hardware placement, then cut and shopping prep.
          </p>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
                    {step.id}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">{step.description}</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc list-inside">
                  {step.how.map((hint) => (
                    <li key={`${step.id}-${hint}`}>{hint}</li>
                  ))}
                </ul>
                <div className="mt-3 mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {step.mediaType === 'video' ? (
                    <video
                      className="h-auto w-full object-cover"
                      src={step.media}
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <img className="h-auto w-full object-cover" src={step.media} alt={step.alt} loading="lazy" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Result</h2>
          <p className="mt-2 text-sm text-slate-700">
            After a few hours of build time and low-cost materials, I ended up with the exact standing desk topper I wanted. It is fully usable, and my
            neck pain is much better than before.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => openImportedDesign(false)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Build This Design
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => openImportedDesign(true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Build in New Tab
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Why this mattered</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <ClipboardList size={12} />
                Planning clarity
              </div>
              <p className="mt-1">Confidence before cutting, even with zero prior woodworking experience.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <ShoppingCart size={12} />
                Materials control
              </div>
              <p className="mt-1">Shopping list + cut list reduced guesswork and wasted trips.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Download size={12} />
                Reusable design
              </div>
              <p className="mt-1">Saved locally so I can import and iterate whenever I want.</p>
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
  if (post.slug === ADVANCED_FEATURES_SLUG) {
    return <AdvancedFeaturesBlog openApp={openApp} backToBlog={backToBlog} />;
  }
  if (post.slug === STANDING_DESK_TOPPER_SLUG) {
    return <StandingDeskTopperStoryBlog openApp={openApp} backToBlog={backToBlog} />;
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
    <p>{BRAND_NAME} is built to reduce friction between design and real-world woodworking builds.</p>
    <p>
      The goal is simple: make planning faster, clearer, and less error-prone without forcing a heavy CAD workflow for everyday woodworking.
    </p>
    <p>
      The site combines a free 3D woodworking planner with practical written guides about cut lists, screw placement, plywood layout, garage shelves,
      workbench frames, cabinet boxes, and beginner-friendly project planning.
    </p>
    <p>
      Editorial content is written for DIY builders who want to understand the planning decisions behind a project before buying lumber or making
      irreversible cuts. The planner is a tool, but the blog is the publisher content surface for tutorials, examples, and woodworking workflows.
    </p>
    <p>
      Product decisions and article topics come from real planning problems: avoiding edge blowout, reducing material waste, keeping screw rows clear,
      and turning simple 3D layouts into build-ready cut and shopping lists.
    </p>
  </SectionCard>
);

const PrivacyPage = ({
  consent,
  onReopenCookieSettings,
}: {
  consent: CookieConsentChoice | null;
  onReopenCookieSettings: () => void;
}) => (
  <SectionCard title="Privacy Policy">
    <p><strong>Last updated:</strong> March 14, 2026</p>
    <p>
      {BRAND_NAME} is designed to run with minimal personal data. This page explains what information may be stored or processed when you use the
      site and app.
    </p>
    <p>
      We use browser storage for core product behavior such as remembering cookie choices, preserving certain app preferences, and queuing project
      import data that you intentionally open in the planner.
    </p>
    <p>
      We may use essential cookies or similar storage for basic site functionality. We may also use optional analytics or advertising tools in the
      future, but those should only be enabled according to the consent choices presented to the user where required.
    </p>
    <p>
      If advertising services such as Google AdSense are enabled, those services may use cookies, local storage, device information, IP address,
      and similar signals to measure traffic, prevent fraud, limit abuse, and personalize or select ads as permitted by law and user consent.
    </p>
    <p>
      We do not sell your personal information. We may share limited technical data with service providers that help host, secure, measure, or
      operate the site.
    </p>
    <p>
      You can review or change your cookie choice at any time using the control below. Your current saved choice is{' '}
      <strong>{consent ?? 'not set'}</strong>.
    </p>
    <div className="pt-1">
      <button
        onClick={onReopenCookieSettings}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Review Cookie Choices
      </button>
    </div>
    <p>
      For Google advertising products, you can also review how Google uses information from sites or apps that use its services:
      {' '}<a
        href="https://policies.google.com/technologies/partner-sites"
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline"
      >
        policies.google.com/technologies/partner-sites
      </a>
    </p>
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

const ContactPage = () => {
  const [copied, setCopied] = useState(false);
  const email = 'ippity-dev@proton.me';

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 sm:p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contact</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-slate-900">Get in touch</h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Questions, bug reports, or partnership inquiries are welcome.
        </p>

        <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4 sm:p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Best Contact Method</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <span className="break-all text-lg sm:text-2xl font-semibold text-slate-800">{email}</span>
            <button
              onClick={copyEmail}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              title="Copy email"
            >
              <Copy size={13} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">Use the copy button to paste the email into your mail app.</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <p className="text-sm text-slate-700">
          <strong>Response window:</strong> typically 2-3 business days.
        </p>
      </section>
    </div>
  );
};

const NotFoundPage = ({ navigate }: { navigate: (route: AppRoute) => void }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">404</p>
    <h1 className="mt-2 text-3xl font-semibold text-slate-900">Page not found</h1>
    <p className="mt-3 max-w-2xl text-slate-700">
      This URL does not match a public BEAV.IT page. Use one of the main pages below to keep browsing.
    </p>
    <div className="mt-5 flex flex-wrap gap-2">
      <RouteLink route={{ page: 'home' }} navigate={navigate} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Home
      </RouteLink>
      <RouteLink route={{ page: 'blog' }} navigate={navigate} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Blog
      </RouteLink>
      <RouteLink route={{ page: 'contact' }} navigate={navigate} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Contact
      </RouteLink>
    </div>
  </section>
);

const AppOverlayNav = ({ navigate, activePage }: { navigate: (route: AppRoute) => void; activePage: RouteId }) => (
  <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <div className="hidden sm:flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
        <img src={BRAND_LOGO_SRC} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
        <span className="font-semibold text-slate-700">{BRAND_SHORT_NAME}</span>
      </div>
      <RouteLink
        route={{ page: 'app' }}
        navigate={navigate}
        className={`rounded-md px-3 py-1.5 text-[12px] font-semibold shadow-sm transition-colors ${
          activePage === 'app'
            ? 'bg-blue-700 text-white ring-2 ring-blue-200'
            : 'bg-blue-600 text-white ring-2 ring-blue-300 hover:bg-blue-700'
        }`}
      >
        Build
      </RouteLink>
      <RouteLink route={{ page: 'home' }} navigate={navigate} className="rounded px-2 py-1 hover:bg-slate-100">Home</RouteLink>
      <RouteLink route={{ page: 'blog' }} navigate={navigate} className="rounded px-2 py-1 hover:bg-slate-100">Blog</RouteLink>
      <RouteLink route={{ page: 'contact' }} navigate={navigate} className="rounded px-2 py-1 hover:bg-slate-100">Contact</RouteLink>
    </div>
  </div>
);

const CookieConsentBanner = ({
  consent,
  initialized,
  navigate,
  onSave,
}: {
  consent: CookieConsentChoice | null;
  initialized: boolean;
  navigate: (route: AppRoute) => void;
  onSave: (choice: CookieConsentChoice) => void;
}) => {
  if (!initialized || consent) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
      <p className="text-sm text-slate-700">
        We use cookies for core functionality and optional analytics. You can accept or decline optional cookies.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => onSave('accepted')} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Accept
        </button>
        <button onClick={() => onSave('declined')} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Decline
        </button>
        <RouteLink route={{ page: 'privacy' }} navigate={navigate} className="rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
          Privacy Policy
        </RouteLink>
      </div>
    </div>
  );
};

export function App() {
  const [route, setRoute] = useState<AppRoute>(getInitialRoute);
  const [cookieConsent, setCookieConsent] = useState<CookieConsentChoice | null>(null);
  const [cookieConsentInitialized, setCookieConsentInitialized] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === 'accepted' || stored === 'declined') {
      setCookieConsent(stored);
    }
    setCookieConsentInitialized(true);
  }, []);

  const saveCookieConsent = useCallback((choice: CookieConsentChoice) => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    setCookieConsent(choice);
  }, []);

  const reopenCookieSettings = useCallback(() => {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
    setCookieConsent(null);
  }, []);

  const updateBrowserRoute = useCallback((nextRoute: AppRoute, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') {
      setRoute(nextRoute);
      return;
    }

    const nextUrl = routeToRelativeUrl(nextRoute);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== nextUrl) {
      window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }

    setRoute(nextRoute);
  }, []);

  const navigateRoute = useCallback((nextRoute: AppRoute) => updateBrowserRoute(nextRoute), [updateBrowserRoute]);
  const navigate = useCallback((nextRoute: RouteId) => updateBrowserRoute({ page: nextRoute }), [updateBrowserRoute]);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      const pathRoute = normalizeRouteValue(window.location.pathname);
      const hashRoute = window.location.hash ? normalizeRouteValue(window.location.hash) : null;
      setRoute(pathRoute ?? hashRoute ?? { page: 'notFound' });
    };

    const legacyHashRoute = window.location.hash ? normalizeRouteValue(window.location.hash) : null;
    if (legacyHashRoute) {
      updateBrowserRoute(legacyHashRoute, 'replace');
    } else {
      syncRouteFromLocation();
    }

    window.addEventListener('popstate', syncRouteFromLocation);
    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation);
    };
  }, [updateBrowserRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expectedUrl = routeToRelativeUrl(route);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== expectedUrl) {
      window.history.replaceState({}, '', expectedUrl);
    }
  }, [route]);

  useEffect(() => {
    const meta = getRouteMeta(route);
    const canonicalUrl = `${SITE_URL}${meta.canonicalPath}`;

    document.title = meta.title;
    upsertCanonical(canonicalUrl);
    upsertMeta('meta[name="description"]', { name: 'description', content: meta.description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: meta.robots });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: meta.type });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: meta.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: meta.description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: meta.image });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: meta.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: meta.description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: meta.image });
  }, [route]);

  const activePage = route.page;

  const page = useMemo(() => {
    if (activePage === 'home') {
      return <HomePage navigate={navigateRoute} />;
    }
    if (activePage === 'blog') {
      const post = route.blogSlug ? BLOG_POST_BY_SLUG[route.blogSlug] : null;
      if (post) {
        return <BlogPostPage post={post} backToBlog={() => navigate('blog')} openApp={() => navigate('app')} />;
      }
      return <BlogPage navigate={navigateRoute} />;
    }
    if (activePage === 'about') return <AboutPage />;
    if (activePage === 'privacy') return <PrivacyPage consent={cookieConsent} onReopenCookieSettings={reopenCookieSettings} />;
    if (activePage === 'terms') return <TermsPage />;
    if (activePage === 'contact') return <ContactPage />;
    if (activePage === 'notFound') return <NotFoundPage navigate={navigateRoute} />;
    return null;
  }, [activePage, cookieConsent, navigate, navigateRoute, reopenCookieSettings, route.blogSlug]);

  if (activePage === 'app') {
    return (
      <>
        <Workbench />
        <AppOverlayNav navigate={navigateRoute} activePage={activePage} />
        <CookieConsentBanner
          consent={cookieConsent}
          initialized={cookieConsentInitialized}
          navigate={navigateRoute}
          onSave={saveCookieConsent}
        />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <RouteLink
            route={{ page: 'home' }}
            navigate={navigateRoute}
            className="inline-flex items-center gap-3 rounded-lg px-2 py-1 text-left text-slate-900 hover:bg-slate-100"
          >
            <img src={BRAND_LOGO_SRC} alt="" aria-hidden="true" className="h-9 w-9 object-contain" />
            <span>
              <span className="block font-semibold tracking-tight">{BRAND_NAME}</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{BRAND_TAGLINE}</span>
            </span>
          </RouteLink>
          <nav className="flex flex-wrap items-center gap-1">
            {ROUTE_ORDER.map((item) => (
              <RouteLink
                key={item}
                route={{ page: item }}
                navigate={navigateRoute}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  activePage === item
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {ROUTE_LABELS[item]}
              </RouteLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{page}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>&copy; 2026 {BRAND_NAME}</p>
          <div className="flex items-center gap-2">
            {(['privacy', 'terms', 'contact'] as RouteId[]).map((item) => (
              <RouteLink key={item} route={{ page: item }} navigate={navigateRoute} className="rounded px-2 py-1 hover:bg-slate-100">
                {ROUTE_LABELS[item]}
              </RouteLink>
            ))}
          </div>
        </div>
      </footer>

      <AppOverlayNav navigate={navigateRoute} activePage={activePage} />
      <CookieConsentBanner
        consent={cookieConsent}
        initialized={cookieConsentInitialized}
        navigate={navigateRoute}
        onSave={saveCookieConsent}
      />
    </div>
  );
}
