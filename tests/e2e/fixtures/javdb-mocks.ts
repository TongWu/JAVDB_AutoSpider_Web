import type { Page } from '@playwright/test'

// Shared Playwright route mocks for the Browse journeys so each spec doesn't
// have to hand-roll its own fixture set. Each helper installs a single route;
// callers combine them as needed.

export const SAMPLE_VIDEO_CODE = 'ABC-123'

export const SAMPLE_DETAIL_URL = 'https://javdb.com/v/ABC-123-mock'

export const SAMPLE_MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Sample'

export const SAMPLE_DETAIL = {
  url: SAMPLE_DETAIL_URL,
  page_type: 'detail',
  detail: {
    title: 'Sample Title for E2E',
    code: SAMPLE_VIDEO_CODE,
    release_date: '2026-05-01',
    cover: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    actors: ['Actor One'],
    tags: ['Tag A'],
    magnets: [
      {
        magnet: SAMPLE_MAGNET,
        title: 'sample-1080p',
        size: '5.2GB',
        quality: '1080p',
        date: '2026-05-01',
        href: SAMPLE_DETAIL_URL,
      },
    ],
  },
}

export async function mockExploreSearchByCode(page: Page): Promise<void> {
  await page.route('**/api/explore/search-by-video-code', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        video_code: SAMPLE_VIDEO_CODE,
        search_url: 'https://javdb.com/search?q=ABC-123',
        movies: [
          {
            code: SAMPLE_VIDEO_CODE,
            title: 'Sample Title for E2E',
            href: SAMPLE_DETAIL_URL,
          },
        ],
        exact_match_entry: {
          code: SAMPLE_VIDEO_CODE,
          title: 'Sample Title for E2E',
          href: SAMPLE_DETAIL_URL,
        },
        letter_suffix_fallback_searched: false,
      }),
    })
  })
}

export async function mockExploreResolve(page: Page): Promise<void> {
  await page.route('**/api/explore/resolve', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_DETAIL),
    })
  })
}

export async function mockExploreIndexStatus(page: Page): Promise<void> {
  await page.route('**/api/explore/index-status', async (route) => {
    const req = route.request().postDataJSON() as { movies?: Array<{ href: string }> } | null
    const movies = req?.movies ?? []
    const items: Record<string, { downloaded: boolean; has_uncensored: boolean }> = {}
    for (const m of movies) {
      items[m.href] = { downloaded: false, has_uncensored: false }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    })
  })
}

export async function mockExploreDownloadMagnet(page: Page): Promise<void> {
  await page.route('**/api/explore/download-magnet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
}

export async function mockExploreOneClick(page: Page): Promise<void> {
  await page.route('**/api/explore/one-click', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        selected: { magnet: SAMPLE_MAGNET, size: '5.2GB' },
        video_code: SAMPLE_VIDEO_CODE,
      }),
    })
  })
}

export async function mockExploreSyncCookie(page: Page): Promise<void> {
  await page.route('**/api/explore/sync-cookie', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
}

export async function mockExploreProxyPage(page: Page): Promise<void> {
  await page.route('**/api/explore/proxy-page**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<html><body><h1>Mock proxy-page snapshot</h1><p>Sanitised content here.</p></body></html>',
    })
  })
}

export async function mockParseUrl(page: Page): Promise<void> {
  await page.route('**/api/parse/url', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page_type: 'top',
        total_pages: 1,
        movies: [
          {
            href: 'https://javdb.com/v/top-1',
            title: 'Top item one',
            code: 'TOP-001',
            image_url: '',
          },
          {
            href: 'https://javdb.com/v/top-2',
            title: 'Top item two',
            code: 'TOP-002',
            image_url: '',
          },
        ],
      }),
    })
  })
}

export async function installBrowseMocks(page: Page): Promise<void> {
  await mockExploreSearchByCode(page)
  await mockExploreResolve(page)
  await mockExploreIndexStatus(page)
  await mockExploreDownloadMagnet(page)
  await mockExploreOneClick(page)
  await mockExploreSyncCookie(page)
  await mockExploreProxyPage(page)
  await mockParseUrl(page)
}
