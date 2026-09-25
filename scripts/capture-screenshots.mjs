import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUTPUT_DIR = path.resolve('docs/screenshots');

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Connecting to TeslaMap at ${BASE_URL}...`);

  // 1. Authenticate to get session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });

  if (!loginRes.ok) {
    throw new Error(`Failed to login: ${loginRes.status} ${loginRes.statusText}`);
  }

  const setCookieHeader = loginRes.headers.get('set-cookie');
  const sessionMatch = setCookieHeader ? setCookieHeader.match(/teslamap_session=([^;]+)/) : null;
  const sessionCookie = sessionMatch ? sessionMatch[1] : '';

  const authHeaders = {
    'Content-Type': 'application/json',
    Cookie: `teslamap_session=${sessionCookie}`,
  };

  // 2. Ensure a sample share link exists
  let token = '';
  const linksRes = await fetch(`${BASE_URL}/api/admin/links`, { headers: authHeaders });
  if (linksRes.ok) {
    const links = await linksRes.json();
    const active = links.find((l) => l.is_active);
    if (active) {
      token = active.token;
    }
  }

  if (!token) {
    console.log('Creating sample share link...');
    const createRes = await fetch(`${BASE_URL}/api/admin/links`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        label: 'Road Trip to Geneva',
        duration_minutes: 240,
        expire_on_arrival: true,
        show_speed: true,
        show_battery: true,
      }),
    });
    if (createRes.ok) {
      const newLink = await createRes.json();
      token = newLink.token;
    }
  }

  // 3. Ensure a sample safe zone exists
  const zonesRes = await fetch(`${BASE_URL}/api/admin/zones`, { headers: authHeaders });
  if (zonesRes.ok) {
    const zones = await zonesRes.json();
    if (!zones || zones.length === 0) {
      console.log('Creating sample safe zone...');
      await fetch(`${BASE_URL}/api/admin/zones`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Home (Paris)',
          latitude: 48.8566,
          longitude: 2.3522,
          radius_meters: 500,
        }),
      });
    }
  }

  console.log(`Using share link token: ${token}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const urlObj = new URL(BASE_URL);
  const cookieDomain = urlObj.hostname;

  // Helper for waiting until map tiles and telemetry are loaded
  async function waitForMap(page) {
    // Wait for the car SVG marker to be attached to the DOM
    try {
      await page.waitForSelector('#car-svg-icon', { timeout: 8000 });
    } catch {
      // fallback
    }
    // Give Leaflet tiles and smooth telemetry interpolation 3 seconds to render cleanly
    await page.waitForTimeout(3000);
  }

  // A. Tracking Desktop
  if (token) {
    console.log('Capturing live tracking (desktop)...');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const pageDesktop = await contextDesktop.newPage();
    await pageDesktop.goto(`${BASE_URL}/share/${token}`, { waitUntil: 'networkidle' });
    await waitForMap(pageDesktop);
    await pageDesktop.screenshot({
      path: path.join(OUTPUT_DIR, 'tracking-desktop.png'),
      fullPage: false,
    });
    await contextDesktop.close();

    // B. Tracking Mobile
    console.log('Capturing live tracking (mobile)...');
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(`${BASE_URL}/share/${token}`, { waitUntil: 'networkidle' });
    await waitForMap(pageMobile);
    await pageMobile.screenshot({
      path: path.join(OUTPUT_DIR, 'tracking-mobile.png'),
      fullPage: false,
    });
    await contextMobile.close();
  }

  // C. Admin Desktop
  console.log('Capturing admin dashboard (desktop)...');
  const contextAdminDesktop = await browser.newContext({
    viewport: { width: 1280, height: 950 },
    deviceScaleFactor: 2,
  });
  await contextAdminDesktop.addCookies([
    {
      name: 'teslamap_session',
      value: sessionCookie,
      domain: cookieDomain,
      path: '/',
    },
  ]);
  const pageAdminDesktop = await contextAdminDesktop.newPage();
  await pageAdminDesktop.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
  await pageAdminDesktop.waitForTimeout(2500);
  await pageAdminDesktop.screenshot({
    path: path.join(OUTPUT_DIR, 'admin-desktop.png'),
    fullPage: false,
  });
  await contextAdminDesktop.close();

  // D. Admin Mobile
  console.log('Capturing admin dashboard (mobile)...');
  const contextAdminMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await contextAdminMobile.addCookies([
    {
      name: 'teslamap_session',
      value: sessionCookie,
      domain: cookieDomain,
      path: '/',
    },
  ]);
  const pageAdminMobile = await contextAdminMobile.newPage();
  await pageAdminMobile.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
  await pageAdminMobile.waitForTimeout(2500);
  await pageAdminMobile.screenshot({
    path: path.join(OUTPUT_DIR, 'admin-mobile.png'),
    fullPage: false,
  });
  await contextAdminMobile.close();

  await browser.close();
  console.log('All screenshots captured successfully in docs/screenshots/!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
