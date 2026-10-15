import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Shopify Hosted Customer Accounts & Order Tracking Specifications', async (t) => {
  await t.test('1. SHOPIFY_CUSTOMER_ACCOUNT_URL is configurable and never invented or inferred from store domain', () => {
    const shopifyLibSource = fs.readFileSync(path.resolve('./src/lib/shopify.ts'), 'utf-8');
    assert.match(
      shopifyLibSource,
      /export const SHOPIFY_CUSTOMER_ACCOUNT_URL/,
      'Must export SHOPIFY_CUSTOMER_ACCOUNT_URL'
    );
    // Ensure it does NOT default to `https://${SHOPIFY_STORE_DOMAIN}/account`
    assert.doesNotMatch(
      shopifyLibSource,
      /SHOPIFY_CUSTOMER_ACCOUNT_URL\s*=\s*['"`]https:\/\/[^'"`]*\/account['"`]/,
      'SHOPIFY_CUSTOMER_ACCOUNT_URL must not be hardcoded or inferred from domain'
    );

    const envExample = fs.readFileSync(path.resolve('./.env.example'), 'utf-8');
    assert.match(
      envExample,
      /SHOPIFY_CUSTOMER_ACCOUNT_URL=""/,
      '.env.example must document SHOPIFY_CUSTOMER_ACCOUNT_URL as empty by default'
    );
  });

  await t.test('2. Navigation contains accessible "Sign in / Create account" and "My orders" links on desktop and mobile', () => {
    const navbarSource = fs.readFileSync(path.resolve('./src/components/Navbar.tsx'), 'utf-8');

    // Desktop
    assert.match(
      navbarSource,
      /id="nav-my-orders-link"/,
      'Desktop nav must include an accessible My orders link'
    );
    assert.match(
      navbarSource,
      /id="nav-customer-account-link"/,
      'Desktop nav must include an accessible Sign in / Create account link'
    );
    assert.match(
      navbarSource,
      /Sign in \/ Create account/,
      'Desktop nav text must say "Sign in / Create account"'
    );

    // Mobile
    assert.match(
      navbarSource,
      /id="mobile-nav-sign-in"/,
      'Mobile nav must include accessible Sign in / Create account link'
    );
    assert.match(
      navbarSource,
      /id="mobile-nav-my-orders"/,
      'Mobile nav must include accessible My orders link'
    );
  });

  await t.test('3. No fake authentication, demo customer sessions, or localStorage login flags exist', () => {
    const appSource = fs.readFileSync(path.resolve('./src/App.tsx'), 'utf-8');
    const portalSource = fs.readFileSync(path.resolve('./src/components/CustomerPortalModal.tsx'), 'utf-8');
    const trackSource = fs.readFileSync(path.resolve('./src/components/TrackOrderModal.tsx'), 'utf-8');

    // Must not store customer session in localStorage
    assert.doesNotMatch(
      appSource,
      /localStorage\.(set|get)Item\(['"`](customer|user|session|account)/i,
      'Must not store fake customer auth sessions in localStorage'
    );
    assert.doesNotMatch(
      portalSource,
      /isLoggedIn|setLoggedIn|fakeUser|demoCustomer/i,
      'Must not maintain fake logged-in state in CustomerPortalModal'
    );

    // Must explain emailed one-time codes
    assert.match(
      portalSource,
      /one-time/i,
      'CustomerPortalModal must explain passwordless emailed one-time verification codes'
    );

    // Must explain sign out occurs in hosted Shopify account
    assert.match(
      portalSource,
      /Sign Out|sign out/i,
      'CustomerPortalModal must explain customers sign out inside hosted Shopify accounts'
    );
  });

  await t.test('4. Order tracking routes to hosted accounts or email confirmation status without public unauthenticated lookup forms', () => {
    const trackSource = fs.readFileSync(path.resolve('./src/components/TrackOrderModal.tsx'), 'utf-8');

    // Must NOT contain public order number / email search input form
    assert.doesNotMatch(
      trackSource,
      /<input[^>]*placeholder=["'][^"']*#\d+[^"']*["']/,
      'TrackOrderModal must not contain unauthenticated public order number search input'
    );

    // Must explain confirmation email order status link
    assert.match(
      trackSource,
      /confirmation email/i,
      'TrackOrderModal must explain the official Shopify confirmation email order status link'
    );

    // Must explain authentic logistics without fake milestones or invented carrier data
    assert.match(
      trackSource,
      /Authentic Tracking Policy/i,
      'TrackOrderModal must state authentic tracking policy and not claim Printify is synced prematurely'
    );
  });

  await t.test('5. Truthful configuration warning is shown when SHOPIFY_CUSTOMER_ACCOUNT_URL is not set', () => {
    const portalSource = fs.readFileSync(path.resolve('./src/components/CustomerPortalModal.tsx'), 'utf-8');
    const trackSource = fs.readFileSync(path.resolve('./src/components/TrackOrderModal.tsx'), 'utf-8');

    assert.match(
      portalSource,
      /SHOPIFY_CUSTOMER_ACCOUNT_URL/,
      'CustomerPortalModal must explain how to configure SHOPIFY_CUSTOMER_ACCOUNT_URL when missing'
    );
    assert.match(
      trackSource,
      /SHOPIFY_CUSTOMER_ACCOUNT_URL/,
      'TrackOrderModal must explain how to configure SHOPIFY_CUSTOMER_ACCOUNT_URL when missing'
    );
  });

  await t.test('6. No email provider or custom email automations are introduced', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf-8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    assert.equal(allDeps['nodemailer'], undefined, 'No nodemailer dependency');
    assert.equal(allDeps['@sendgrid/mail'], undefined, 'No Sendgrid dependency');
    assert.equal(allDeps['resend'], undefined, 'No Resend dependency');
    assert.equal(allDeps['postmark'], undefined, 'No Postmark dependency');
  });
});
