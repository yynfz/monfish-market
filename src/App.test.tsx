import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('Buyer browses the canonical market', () => {
  it('inspects every stall and can discard a local checkout draft', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Demo Mode')).toBeVisible();
    expect(screen.getByText('MockUSDC is the product token. MON pays gas only.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Enter Sardine Harbor' }));
    expect(screen.getByRole('heading', { name: 'Sardine Harbor' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browse Stalls' }));

    const pixelReefStall = screen.getByRole('button', { name: /Pixel Reef Starter Pack/ });
    await user.click(pixelReefStall);
    let details = screen.getByRole('dialog', { name: 'Pixel Reef Starter Pack details' });
    expect(within(details).getByRole('button', { name: 'Close listing details' })).toHaveFocus();
    expect(within(details).getByText('Listing #1')).toBeVisible();
    expect(within(details).getByText('$5.00 MockUSDC')).toBeVisible();
    expect(within(details).getByText('Delivery window: 24 hours')).toBeVisible();
    expect(within(details).getByText('Fresh reef tiles, packed and ready for your next world.')).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Open checkout draft' }));
    expect(within(details).getByRole('heading', { name: 'Checkout draft' })).toBeVisible();
    expect(within(details).getByText('No Trade has been created.')).toBeVisible();
    await user.click(within(details).getByRole('button', { name: 'Discard checkout draft' }));
    expect(within(details).queryByRole('heading', { name: 'Checkout draft' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Pixel Reef Starter Pack details' })).not.toBeInTheDocument();
    await waitFor(() => expect(pixelReefStall).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /Ghost Ship Map Pack/ }));
    details = screen.getByRole('dialog', { name: 'Ghost Ship Map Pack details' });
    expect(within(details).getByText('Listing #2')).toBeVisible();
    expect(within(details).getByText('$3.00 MockUSDC')).toBeVisible();
    expect(within(details).getByText('Delivery window: 60 seconds')).toBeVisible();
    expect(within(details).getByText('Chart the haunted channels before the fog rolls back in.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Enter Coral Capital' }));
    expect(screen.getByRole('heading', { name: 'Coral Capital' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browse Stalls' }));
    await user.click(screen.getByRole('button', { name: /Captain's Hat Template/ }));
    details = screen.getByRole('dialog', { name: "Captain's Hat Template details" });
    expect(within(details).getByText('Listing #3')).toBeVisible();
    expect(within(details).getByText('$2.00 MockUSDC')).toBeVisible();
    expect(within(details).getByText('Delivery window: 24 hours')).toBeVisible();
    expect(within(details).getByText('Cut a sharp captain’s hat for any fish who means business.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Trade History' })).not.toBeInTheDocument();
  });
});
