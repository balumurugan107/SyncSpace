import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Real API calls and isolated verification accounts. No production/user fixture data.
async function captureResponsive(page: Page, name: string, info: TestInfo) {
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
    await expect(page.locator('h1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    if (name === 'architecture') {
      await expect.poll(() => page.getByRole('button', { name: 'Previous step', exact: true }).evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test('all routes, forms, workspace management and task workflows survive the redesign', async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const stamp = Date.now();
  const email = `ui-review-${stamp}@example.test`;
  const password = `Review-${randomUUID()}-a1`;
  const name = 'UI Review';
  let workspaceId: string | undefined;
  let auth: Record<string, string> | undefined;
  try {
    await page.goto('/login');
    await captureResponsive(page, 'login', info);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
    await page.goto('/register');
    await captureResponsive(page, 'register', info);
    await page.getByLabel('Full name', { exact: true }).fill(name);
    await page.getByLabel('Work email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const registered = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const registration = await registered;
    expect(registration.status()).toBe(201);
    const session = await registration.json();
    auth = { Authorization: `Bearer ${session.accessToken}` };
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await captureResponsive(page, 'dashboard-empty', info);
    await page.goto('/workspaces');
    await page.getByRole('button', { name: 'New workspace', exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(`Design review ${stamp}`);
    await dialog.getByLabel('Description (optional)').fill('An isolated workspace for UI verification.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('create-workspace-mobile.png'), fullPage: true });
    const created = page.waitForResponse(response => response.url().endsWith('/api/workspaces') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create workspace', exact: true }).click();
    workspaceId = (await (await created).json()).workspace.id;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Design review ${stamp}`);
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Launch workspace');
    await dialog.getByLabel('Key', { exact: true }).fill('REV');
    await dialog.getByLabel('Description (optional)').fill('Design review tasks and release coordination.');
    await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Launch workspace');
    const projectId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill('Review the new experience');
    await dialog.getByLabel('Description', { exact: true }).fill('Check the layout, forms and responsive states.');
    await dialog.getByRole('combobox', { name: 'Assignee', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
    await dialog.getByLabel('Due date', { exact: true }).fill('2026-11-20');
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    const taskCard = page.getByRole('button', { name: /REV-1: Review the new experience/ });
    await expect(taskCard).toBeVisible();
    await taskCard.click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Review the new experience');
    await dialog.getByRole('combobox', { name: 'Status', exact: true }).click();
    await page.getByRole('option', { name: 'In progress', exact: true }).click();
    await dialog.getByLabel('Description', { exact: true }).fill('Updated from the redesigned task sheet.');
    await dialog.getByRole('button', { name: 'Save description', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Save description', exact: true })).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('task-sheet-mobile.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('textbox', { name: 'Filter tasks', exact: true }).fill('no matching task');
    await expect(taskCard).toBeHidden();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(taskCard).toBeVisible();
    await taskCard.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.getByRole('region', { name: 'In review', exact: true }).getByRole('button', { name: /REV-1: Review the new experience/ })).toBeVisible();
    await captureResponsive(page, 'board', info);

    await page.goto(`/workspaces/${workspaceId}`);
    const teammate = await context.request.post(`${baseURL}/api/auth/register`, { data: { email: `ui-member-${stamp}@example.test`, displayName: 'Review teammate', password } });
    expect(teammate.status()).toBe(201);
    // APIRequestContext shares cookies; restore this browser's owner session before navigating again.
    const teammateUser = (await teammate.json()).user;
    await context.request.post(`${baseURL}/api/auth/login`, { data: { email, password } });
    await page.getByRole('tab', { name: /Members/ }).click();
    await page.getByRole('textbox', { name: 'Email of the person to add' }).fill(teammateUser.email);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Review teammate', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Role of Review teammate' }).click();
    await page.getByRole('option', { name: 'Admin', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Role of Review teammate' })).toHaveText('Admin');
    await captureResponsive(page, 'workspace-members', info);
    await page.getByRole('tab', { name: 'Activity', exact: true }).click();
    await captureResponsive(page, 'workspace-activity', info);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Description', { exact: true }).fill('Workspace settings verified.');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await captureResponsive(page, 'workspace-settings', info);
    await page.getByRole('tab', { name: 'Projects', exact: true }).click();
    await captureResponsive(page, 'workspace-projects', info);

    for (const [path, label] of [['/', 'dashboard'], ['/workspaces', 'workspaces'], ['/projects', 'projects'], ['/tasks', 'my-tasks'], [`/chat?workspace=${workspaceId}`, 'chat'], ['/settings', 'settings'], ['/health', 'health'], ['/architecture', 'architecture']]) {
      await page.goto(path!);
      await expect(page.locator('h1')).toBeVisible();
      if (label === 'chat') {
        await page.getByRole('textbox', { name: 'Message', exact: true }).fill('The redesigned workspace is ready for review.');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await expect(page.getByText('The redesigned workspace is ready for review.', { exact: true })).toBeVisible();
      }
      if (label === 'settings') {
        await page.getByLabel('Display name', { exact: true }).fill('UI Reviewer');
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await page.getByRole('radio', { name: 'Dark', exact: true }).click();
        await expect(page.locator('html')).toHaveClass(/dark/);
        await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute('aria-checked', 'true');
        await expect.poll(() => page.getByLabel('Display name', { exact: true }).evaluate(element => getComputedStyle(element).color === getComputedStyle(document.body).color)).toBe(true);
        await page.screenshot({ path: info.outputPath('settings-dark.png'), fullPage: true, animations: 'disabled' });
        await page.getByRole('radio', { name: 'Light', exact: true }).click();
      }
      if (label === 'health') {
        await page.getByRole('button', { name: 'Send 12 requests' }).click();
        await expect(page.getByRole('button', { name: 'Send 12 requests' })).toBeEnabled();
      }
      if (label === 'architecture') {
        await page.getByRole('button', { name: 'Next step', exact: true }).click();
        await page.getByRole('button', { name: 'Show planned components' }).click();
        await page.getByRole('button', { name: 'Hide planned components' }).click();
        await page.getByRole('button', { name: 'Node.js API', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Node.js API', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Close explanation', exact: true }).click();
        await page.keyboard.press('Tab');
        const graphNode = page.locator('.react-flow__node').first();
        await expect(graphNode).toBeVisible();
        // Closing the inspector updates the controlled node list; focus the settled node.
        await expect.poll(async () => {
          await graphNode.focus();
          return graphNode.evaluate(element => element === document.activeElement && getComputedStyle(element).outlineStyle === 'solid');
        }).toBe(true);
      }
      await captureResponsive(page, label!, info);
    }
    // Mobile navigation must trap focus, dismiss with Escape, and restore the opener.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('dialog', { name: 'Navigation', exact: true }).getByRole('link', { name: 'My Tasks', exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workspaces/${workspaceId}`);
    await page.getByRole('tab', { name: /Members/ }).click();
    await page.getByRole('button', { name: 'Remove Review teammate', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove member', exact: true }).click();
    await expect(page.getByText('Review teammate', { exact: true })).toBeHidden();
    await page.goto(`/projects/${projectId}`);
    await page.getByRole('button', { name: 'Project menu' }).click();
    await page.getByRole('menuitem', { name: 'Project settings', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Launch workspace revised');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Launch workspace revised');
    await page.getByRole('button', { name: /REV-1: Review the new experience/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete task', exact: true }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Delete task', exact: true }).click();
    await expect(page.getByRole('button', { name: /REV-1: Review the new experience/ })).toBeHidden();
    await page.getByRole('button', { name: 'Project menu' }).click();
    await page.getByRole('menuitem', { name: 'Project settings', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete project', exact: true }).click();
    dialog = page.getByRole('dialog').last();
    await dialog.getByLabel('Confirmation text').fill('REV');
    await dialog.getByRole('button', { name: 'Delete project', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}$`));
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Delete workspace', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Confirmation text').fill(`Design review ${stamp}`);
    await dialog.getByRole('button', { name: 'Delete forever', exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces$/);
    workspaceId = undefined;
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Existing auth guards restore the protected route used before sign-out.
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(projectId).toBeTruthy();
  } finally {
    if (workspaceId && auth) await context.request.delete(`${baseURL}/api/workspaces/${workspaceId}`, { headers: auth });
  }
});
