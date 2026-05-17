import { expect, test } from '@playwright/test'

test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText(/sign in/i)).toBeVisible({ timeout: 10_000 })
})
