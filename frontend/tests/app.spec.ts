import { test, expect } from '@playwright/test';

test.describe('Monfish Market E2E', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    
    // Set mock mode in local storage
    await page.addInitScript(() => {
      window.localStorage.setItem('monfish_use_mock', '1');
    });
    
    // Navigate and reset demo state to ensure clean run
    await page.goto('/');
    
    // Optional: if there's a Reset Demo button, click it to clear localStorage
    const resetBtn = page.locator('button', { hasText: 'Reset Demo' });
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
    }
    
    // Wait for hydration
    await page.waitForTimeout(1000);
  });

  test('Happy Path: Purchase and Verify', async ({ page }) => {
    // 1. Connect Wallet
    await page.click('button#btn-hero-connect');
    
    // 2. Buy Pixel Reef Starter Pack (Listing ID 1)
    await expect(page.locator('button#btn-buy-1')).toBeVisible({ timeout: 10000 });
    await page.click('button#btn-buy-1');
    
    // 3. Approve and Fund
    await page.click('button:has-text("Approve")');
    await page.click('button:has-text("Deposit")');
    
    // Close modal implicitly happens, wait for trade to appear
    await expect(page.locator('.my-trades-section')).toBeVisible({ timeout: 10000 });

    // 4. Mark Delivered via Demo Panel
    const deliverButton = page.locator('button', { hasText: 'Mark Delivered' }).first();
    await expect(deliverButton).toBeVisible();
    await deliverButton.click();

    // 5. Wait for the "Delivered" state to load and click Download
    const downloadButton = page.locator('button', { hasText: 'Download' }).first();
    await expect(downloadButton).toBeVisible({ timeout: 10000 });
    
    // Playwright intercept for the download
    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    await downloadPromise;

    // 5. Confirm Receipt
    const confirmButton = page.locator('button', { hasText: 'Confirm Receipt' }).first();
    // It takes a couple of seconds to verify the hash
    await expect(confirmButton).toBeEnabled({ timeout: 10000 });
    await confirmButton.click();

    // Wait for Trade Completed state
    await expect(page.locator('.status-Completed').first()).toBeVisible({ timeout: 10000 });
  });

  test('Refund Path: Wait for expiry and refund', async ({ page }) => {
    await page.click('button#btn-hero-connect');
    await expect(page.locator('button#btn-buy-2')).toBeVisible({ timeout: 10000 });
    
    // Buy Ghost Ship Map Pack (Listing ID 2, 60s window)
    await page.click('button#btn-buy-2');
    
    await page.click('button:has-text("Approve")');
    await page.click('button:has-text("Deposit")');

    await expect(page.locator('.my-trades-section')).toBeVisible({ timeout: 10000 });

    // Simulate expiry via demo panel
    const expireButton = page.locator('button', { hasText: 'Expire' }).first();
    await expect(expireButton).toBeVisible();
    await expireButton.click();

    // Reclaim Funds button should become active
    const reclaimButton = page.locator('button', { hasText: 'Reclaim Funds' }).first();
    await expect(reclaimButton).toBeEnabled();
    await reclaimButton.click();

    await expect(page.locator('.status-Refunded').first()).toBeVisible({ timeout: 10000 });
  });
});
