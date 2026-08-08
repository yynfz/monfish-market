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

  it('opens the same Seller interaction by click and Browse Stalls', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Enter Sardine Harbor' }));
    const seller = screen.getByRole('button', { name: /Talk to Mara the Maker/ });
    await user.click(seller);
    expect(screen.getByRole('dialog', { name: 'Pixel Reef Starter Pack details' })).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(seller).toHaveFocus());
    const browse = screen.getByRole('button', { name: 'Browse Stalls' });
    expect(browse).toBeVisible();
    await user.click(browse);
    screen.getByRole('button', { name: /Pixel Reef Starter Pack/ }).focus();
    await user.keyboard('{Space}');
    expect(screen.getByRole('dialog', { name: 'Pixel Reef Starter Pack details' })).toBeVisible();
  });

  it('announces Browse and proximity changes and closes Browse with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    const browse = screen.getByRole('button', { name: 'Browse Stalls' });
    await user.click(browse);
    expect(screen.getByRole('status')).toHaveTextContent('Opened Coral Capital Browse Stalls.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Captain's Hat Template/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Closed Coral Capital Browse Stalls.');

    await user.click(screen.getByRole('button', { name: 'Enter Sardine Harbor' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('status')).toHaveTextContent('Old Finn is nearby. Press Enter to talk.');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('Moved away from Old Finn.');
  });

  it('moves into Seller proximity and activates the prompt by keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Enter Sardine Harbor' }));
    expect(screen.queryByRole('button', { name: /Talk to Old Finn nearby/ })).not.toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    const prompt = screen.getByRole('button', { name: /Talk to Old Finn nearby/ });
    expect(prompt).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Ghost Ship Map Pack details' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Opened Ghost Ship Map Pack with Old Finn.');
  });

  it('contains drawer focus and restores it to the triggering Seller', async () => {
    const user = userEvent.setup();
    render(<App />);

    const seller = screen.getByRole('button', { name: /Talk to Tailor Tilda/ });
    await user.click(seller);
    const dialog = screen.getByRole('dialog', { name: "Captain's Hat Template details" });
    const close = within(dialog).getByRole('button', { name: 'Close listing details' });
    expect(close).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(within(dialog).getByRole('button', { name: 'Open checkout draft' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    screen.getByRole('button', { name: 'Enter Sardine Harbor' }).focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(seller).toHaveFocus());
  });
});
