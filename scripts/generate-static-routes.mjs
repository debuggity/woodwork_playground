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
    robots: 'index,follow',
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
${routes.map((route) => `  <url>
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
