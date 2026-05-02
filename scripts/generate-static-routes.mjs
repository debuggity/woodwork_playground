import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

const SITE_URL = 'https://beav.it';
const BRAND_NAME = 'BEAV.IT';
const DEFAULT_IMAGE = `${SITE_URL}/icons/logo-title.png`;

const blogPosts = [
  {
    slug: 'interactive-quickstart-build-your-first-layout',
    title: 'Interactive quickstart: build your first layout in 5 minutes',
    date: 'February 2026',
    summary: 'A hands-on walkthrough for adding, moving, rotating, and centering your first parts.',
    body: [
      'Use this post as a guided warmup before jumping into your real project. You can practice the core controls, then switch directly into Build mode.',
      'The workflow covers adding a 2x4, moving a board, resizing a part, rotating it, and using Auto Center Camera to reframe the project.',
      'This tutorial is intended for new woodworkers who want to understand 3D part layout before building a real shelf, desk topper, cabinet, bench, or shop fixture.',
    ],
  },
  {
    slug: 'advanced-features-special-tools-and-control-panel',
    title: 'Advanced features guide: special tools + control panel',
    date: 'February 2026',
    summary: 'A clear visual guide for Auto Screw, trim/snap helpers, structural heat maps, and control panel workflows.',
    body: [
      'This guide explains BEAV.IT advanced tools for faster woodworking planning: Auto Screw, Trim Overlaps, Select Assist, Edge Snap, shadows, structural stress analysis, and exploded inspection.',
      'Use Auto Screw after placing parts to prototype fastener counts and screw positions. Use Trim Overlaps when plywood or boards intersect and need a cleaner shape.',
      'The control panel helps inspect dense builds, spot weak spans, and understand where extra braces or fasteners may improve the plan before cutting material.',
    ],
  },
  {
    slug: 'why-i-built-beav-it-and-fixed-my-neck-pain',
    title: 'Why I made BEAV.IT: my $0 standing desk topper story',
    date: 'February 2026',
    summary: 'How neck pain pushed me to build software, plan my first woodworking project, and build a standing desk topper from scrap.',
    body: [
      'I needed a standing desk setup fast, but everything online was expensive. I used BEAV.IT to plan a full topper build before making a single cut.',
      'The design used plywood surfaces, legs, cleats, screw planning, and a generated shopping list and cut list so the physical build felt less intimidating.',
      'The result was a usable standing desk topper built from scrap material, plus a clearer workflow for turning rough woodworking ideas into build-ready plans.',
    ],
  },
  {
    slug: 'choosing-screw-size-quickly-in-cabinet-projects',
    title: 'Choosing wood screw size quickly for cabinet and furniture projects',
    date: 'February 2026',
    summary: 'A practical beginner-friendly guide to choosing #8, #10, or #12 wood screws by material thickness, edge distance, and load.',
    body: [
      'If you want faster, cleaner joinery, screw size selection matters more than most people think. The right length and diameter reduce split-outs, improve pull strength, and make final assembly easier.',
      'For light-duty woodworking such as trim, thin sheet goods, and small brackets, start with #8 x 1-1/4 in screws. For most furniture and 2x lumber projects, #10 x 2-1/2 in is a strong default.',
      'For heavier shelves, thicker stock, and high-load connections, move to #12 x 3 in screws. Near edges or on plywood layers, pre-drill pilot holes and reduce diameter before increasing length.',
      'In BEAV.IT, plan fastener layout first with Auto Screw, then verify edge spacing in your view before committing to final hardware count.',
    ],
  },
  {
    slug: 'how-to-avoid-edge-blowout-when-placing-screws',
    title: 'How to avoid edge blowout when placing wood screws',
    date: 'January 2026',
    summary: 'Step-by-step techniques to prevent plywood edge split-outs, weak joints, and ugly screw exits in woodworking builds.',
    body: [
      'Edge blowout usually comes from three causes: screws too close to edges, diameter too large for the material, or no pilot hole in brittle stock.',
      'Increase edge distance whenever possible. Even a small shift inward can dramatically reduce cracking in plywood and hardwood strips.',
      'Pre-drill pilot holes for edge fastening, especially on dense woods or thin ply. Pilot holes reduce driving force and let threads cut cleanly instead of wedging fibers apart.',
      'Use staggered screw lines when fastening long seams. If a joint still looks risky, redesign with a cleat or backing strip instead of forcing larger screws into weak edges.',
    ],
  },
  {
    slug: 'why-planning-in-3d-saves-shop-time',
    title: 'Why 3D woodworking planning saves shop time and material waste',
    date: 'December 2025',
    summary: 'See why digital woodworking plans reduce rework, improve cut accuracy, and speed up real-world builds for beginners and pros.',
    body: [
      'Most expensive woodworking mistakes do not happen at the saw. They happen earlier in layout, sizing, and assembly order.',
      'A 3D planning workflow helps catch part collisions, impossible screw angles, awkward assembly sequences, and unclear dimensions before buying material.',
      'Digital planning improves cut-list quality. When parts are modeled correctly, the cuts list and shopping list are cleaner, which means fewer guesswork purchases.',
      'In BEAV.IT, practical speed comes from combining move and rotate tools, edge snap, auto-centering camera, and export/import to iterate project versions quickly.',
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
      'In BEAV.IT, build the shelf as separate boards and panels, use edge snapping to align rails, then check the generated shopping list before heading to the store.',
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
      'With BEAV.IT, model the plywood parts, export the cut report, and use it as a planning checklist before making the first large sheet cut.',
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
      'In BEAV.IT, model legs, aprons, stretchers, and top panels separately so you can inspect overlaps, duplicate repeated boards, and export a cut list for the bench frame.',
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
      'In BEAV.IT, sketch the cabinet box in 3D first, then use Auto Screw to visualize fastener rows and the cut list to verify panel sizes before touching plywood.',
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
      'In BEAV.IT, model repeated lumber parts, compare the shopping list against your real stock, and keep exported reports with the project so dimensions do not live only in memory.',
      'The best waste reduction habit is reviewing the design before cutting: confirm part count, finished sizes, assembly order, and the first three cuts you will actually make.',
    ],
  },
];

const mainNav = [
  ['/', 'Home'],
  ['/app/', 'App'],
  ['/blog/', 'Blog'],
  ['/about/', 'About'],
  ['/privacy/', 'Privacy Policy'],
  ['/terms/', 'Terms'],
  ['/contact/', 'Contact'],
];

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const escapeAttr = escapeHtml;

const absoluteUrl = (routePath) => `${SITE_URL}${routePath === '/' ? '/' : routePath}`;

const navHtml = () => `
  <nav aria-label="Public pages">
    ${mainNav.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('\n    ')}
  </nav>
`;

const pageHtml = ({ title, intro, sections = '' }) => `
  <main>
    ${navHtml()}
    <article>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
      ${sections}
    </article>
  </main>
`;

const paragraphList = (paragraphs) => paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');

const blogListHtml = () => `
  <section>
    <h2>Woodworking planning guides</h2>
    ${blogPosts.map((post) => `
      <article>
        <h3><a href="/blog/${post.slug}/">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.date)}</p>
        <p>${escapeHtml(post.summary)}</p>
      </article>
    `).join('\n')}
  </section>
`;

const routes = [
  {
    path: '/',
    title: 'BEAV.IT - 3D Woodworking Planner',
    description: 'Plan woodworking projects in 3D with smart layout tools, Auto Screw, structural heat maps, instant cut lists, and shopping lists.',
    changefreq: 'weekly',
    priority: '1.0',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'BEAV.IT - 3D Woodworking Planner',
      intro: 'Plan woodworking projects in 3D with smart layout tools, Auto Screw, structural heat maps, instant cut lists, and shopping lists.',
      sections: `
        <section>
          <h2>Woodworking planning software for real projects</h2>
          <p>BEAV.IT helps plan shelves, desk toppers, cabinets, benches, shop fixtures, and simple furniture before cutting material.</p>
          <p>Use it to test part dimensions in 3D, move boards into position, trim overlaps, plan screw locations, and create cut lists and shopping lists from the model.</p>
        </section>
        ${blogListHtml()}
      `,
    }),
  },
  {
    path: '/app/',
    title: 'BEAV.IT Build Studio',
    description: 'Open the free BEAV.IT 3D woodworking planner to lay out parts, test dimensions, use Auto Screw, and export build-ready cut lists.',
    changefreq: 'monthly',
    priority: '0.7',
    type: 'website',
    robots: 'noindex,follow',
    includeInSitemap: false,
    html: pageHtml({
      title: 'BEAV.IT Build Studio',
      intro: 'Use the free 3D woodworking planner to lay out boards, plywood, screws, and project assemblies.',
      sections: '<p>The app includes 3D part placement, Auto Screw, overlap trimming, structural analysis, export/import, cut lists, and shopping lists.</p>',
    }),
  },
  {
    path: '/blog/',
    title: 'BEAV.IT Journal | BEAV.IT',
    description: 'Woodworking planning guides, BEAV.IT tutorials, build notes, screw placement tips, and practical 3D design workflows.',
    changefreq: 'weekly',
    priority: '0.9',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'BEAV.IT Journal',
      intro: 'Build notes, workflows, and practical shop tips for better woodworking plans and cleaner projects.',
      sections: blogListHtml(),
    }),
  },
  {
    path: '/about/',
    title: 'About | BEAV.IT',
    description: 'Learn why BEAV.IT exists: practical 3D woodworking planning for builders who want clearer layouts, fewer mistakes, and faster cut lists.',
    changefreq: 'monthly',
    priority: '0.6',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'About BEAV.IT',
      intro: 'BEAV.IT is built to reduce friction between woodworking design and real-world builds.',
      sections: '<p>The goal is to make planning faster, clearer, and less error-prone without forcing a heavy CAD workflow for everyday woodworking.</p>',
    }),
  },
  {
    path: '/privacy/',
    title: 'Privacy Policy | BEAV.IT',
    description: 'Read the BEAV.IT privacy policy for browser storage, cookies, advertising disclosures, and contact details.',
    changefreq: 'monthly',
    priority: '0.5',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'Privacy Policy',
      intro: 'BEAV.IT is designed to run with minimal personal data. This page explains browser storage, cookies, advertising disclosures, and contact details.',
      sections: `
        <p>We use browser storage for core product behavior such as remembering cookie choices, preserving app preferences, and queuing project import data that you intentionally open in the planner.</p>
        <p>If advertising services such as Google AdSense are enabled, those services may use cookies, local storage, device information, IP address, and similar signals as permitted by law and user consent.</p>
        <p>Contact us for privacy questions through the Contact page.</p>
      `,
    }),
  },
  {
    path: '/terms/',
    title: 'Terms | BEAV.IT',
    description: 'Read the BEAV.IT terms for using the woodworking planner and verifying real-world dimensions, safety, and build decisions.',
    changefreq: 'monthly',
    priority: '0.5',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'Terms',
      intro: 'Use the app at your own discretion. You are responsible for verifying dimensions, safety, and build decisions.',
      sections: '<p>The software is provided as-is without warranties. Do not misuse the service or attempt to disrupt availability.</p>',
    }),
  },
  {
    path: '/contact/',
    title: 'Contact | BEAV.IT',
    description: 'Contact BEAV.IT for woodworking planner questions, bug reports, partnership inquiries, and product feedback.',
    changefreq: 'monthly',
    priority: '0.5',
    type: 'website',
    robots: 'index,follow',
    html: pageHtml({
      title: 'Contact BEAV.IT',
      intro: 'Questions, bug reports, product feedback, or partnership inquiries are welcome.',
      sections: '<p>Email: <a href="mailto:ippity-dev@proton.me">ippity-dev@proton.me</a></p><p>Typical response window: 2-3 business days.</p>',
    }),
  },
  ...blogPosts.map((post) => ({
    path: `/blog/${post.slug}/`,
    title: `${post.title} | ${BRAND_NAME}`,
    description: post.summary,
    changefreq: 'monthly',
    priority: post.slug.includes('quickstart') || post.slug.includes('advanced') || post.slug.includes('beav-it') ? '0.8' : '0.7',
    type: 'article',
    robots: 'index,follow',
    html: pageHtml({
      title: post.title,
      intro: post.summary,
      sections: `<p>${escapeHtml(post.date)}</p>${paragraphList(post.body)}<p><a href="/blog/">Back to the BEAV.IT Journal</a></p>`,
    }),
  })),
];

const notFoundRoute = {
  path: '/404',
  title: 'Page Not Found | BEAV.IT',
  description: 'This BEAV.IT page could not be found. Use the main navigation to find the woodworking planner, blog, privacy policy, or contact page.',
  type: 'website',
  robots: 'noindex,follow',
  html: pageHtml({
    title: 'Page not found',
    intro: 'This URL does not match a public BEAV.IT page.',
    sections: '<p><a href="/">Home</a> <a href="/blog">Blog</a> <a href="/contact">Contact</a></p>',
  }),
};

const replaceOrInsert = (html, regex, replacement) => {
  if (regex.test(html)) return html.replace(regex, replacement);
  return html.replace('</head>', `    ${replacement}\n  </head>`);
};

const routeSchema = (route) => {
  const url = absoluteUrl(route.path);
  const base = route.type === 'article'
    ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: route.title.replace(` | ${BRAND_NAME}`, ''),
      description: route.description,
      url,
      image: DEFAULT_IMAGE,
      publisher: {
        '@type': 'Organization',
        name: BRAND_NAME,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/icons/beav-it-logo.png`,
        },
      },
    }
    : {
      '@context': 'https://schema.org',
      '@type': route.path === '/' ? 'WebApplication' : 'WebPage',
      name: route.title,
      description: route.description,
      url,
      image: DEFAULT_IMAGE,
    };

  if (route.path === '/') {
    base.applicationCategory = 'DesignApplication';
    base.operatingSystem = 'Web';
  }

  return JSON.stringify(base).replace(/</g, '\\u003c');
};

const applyRouteToHtml = (sourceHtml, route) => {
  const canonicalUrl = absoluteUrl(route.path);
  let html = sourceHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(route.title)}</title>`);
  html = replaceOrInsert(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeAttr(route.description)}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${route.robots}" />`);
  html = replaceOrInsert(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonicalUrl}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="${route.type}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escapeAttr(route.title)}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escapeAttr(route.description)}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonicalUrl}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${DEFAULT_IMAGE}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${escapeAttr(route.title)}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${escapeAttr(route.description)}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${DEFAULT_IMAGE}" />`);
  html = replaceOrInsert(
    html,
    /<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${routeSchema(route)}</script>`,
  );
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<noscript>/i,
    `<div id="root">\n${route.html}\n    </div>\n    <noscript>`,
  );

  return html;
};

const outputPathForRoute = (routePath) => {
  if (routePath === '/') return indexPath;
  return path.join(distDir, routePath.slice(1), 'index.html');
};

const writeRoute = async (sourceHtml, route) => {
  const outputPath = outputPathForRoute(route.path);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, applyRouteToHtml(sourceHtml, route), 'utf8');
};

const sitemapXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.filter((route) => route.includeInSitemap !== false).map((route) => `  <url>
    <loc>${absoluteUrl(route.path)}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

const robotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

const sourceHtml = await readFile(indexPath, 'utf8');

for (const route of routes) {
  await writeRoute(sourceHtml, route);
}

await writeRoute(sourceHtml, notFoundRoute);
await writeFile(path.join(distDir, '404.html'), applyRouteToHtml(sourceHtml, notFoundRoute), 'utf8');
await writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml(), 'utf8');
await writeFile(path.join(distDir, 'robots.txt'), robotsTxt(), 'utf8');

console.log(`Generated ${routes.length} static route pages plus 404.html, sitemap.xml, and robots.txt.`);
