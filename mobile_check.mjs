import { chromium } from 'playwright';

const SCRATCHPAD = 'C:/Users/User/AppData/Local/Temp/claude/d--nextApps-science-hub/2a7afc89-9f6e-4959-b69e-ce0477817ab2/scratchpad';
const BASE = 'http://localhost:3000';

const PAGES = [
  { url: '/invoices',  name: 'invoices'  },
  { url: '/customers', name: 'customers' },
  { url: '/products',  name: 'products'  },
  { url: '/brands',    name: 'brands'    },
  { url: '/payments',  name: 'payments'  },
  { url: '/reports',   name: 'reports'   },
];

// Mock session payload – lets NextAuth's useSession() think we're logged in
const SESSION_MOCK = {
  user: { id: 'mock-id', name: 'Admin', email: 'admin@sciencehub.com', role: 'admin' },
  expires: '2027-12-31T00:00:00.000Z',
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });

  // Intercept NextAuth session so the client-side auth guard passes
  await ctx.route('**/api/auth/session', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_MOCK) })
  );

  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + p.url);
    // wait for navigation to settle (may redirect to login if server-side guard kicks in)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const url = page.url();
    console.log(`${p.name}: ${url}`);

    const file = `${SCRATCHPAD}/mobile_${p.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ✓ screenshot saved`);
    await page.close();
  }

  await ctx.close();
  await browser.close();
  console.log('Done.');
})();
