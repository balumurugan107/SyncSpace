import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isAvailable } from './navigation';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  it('renders implemented pages as links and future pages as non-interactive items', () => {
    const client = new QueryClient();
    client.setQueryData(['workspaces'], []);
    render(
      <QueryClientProvider client={client}><MemoryRouter>
        <Sidebar />
      </MemoryRouter></QueryClientProvider>,
    );
    for (const item of NAV_ITEMS) {
      const link = screen.queryByRole('link', { name: item.label });
      if (isAvailable(item)) {
        expect(link, item.label).toHaveAttribute('href', item.to);
      } else {
        expect(link, item.label).toBeNull();
        expect(screen.getByTitle(`${item.label} arrives in Phase ${item.phase}`)).toHaveAttribute('aria-disabled', 'true');
      }
    }
  });
});
