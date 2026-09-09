// @vitest-environment jsdom
//
// render needs a DOM. The pragma is per-file because vite.config.ts sets no
// global test environment — see PlanCard.test.tsx.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import FaqAccordion from './FaqAccordion';
import { FAQ_ITEMS } from './landing.data';

// This project registers no global cleanup, so each render is unmounted here.
afterEach(() => {
  cleanup();
});

describe('FaqAccordion', () => {
  it('renders every question collapsed', () => {
    render(<FaqAccordion />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(FAQ_ITEMS.length);
    buttons.forEach((button) => {
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('expands the question that was clicked', () => {
    render(<FaqAccordion />);

    const first = screen.getByRole('button', { name: FAQ_ITEMS[0].question });
    fireEvent.click(first);

    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(FAQ_ITEMS[0].answer)).toBeTruthy();
  });

  it('collapses the open question when it is clicked again', () => {
    render(<FaqAccordion />);

    const first = screen.getByRole('button', { name: FAQ_ITEMS[0].question });
    fireEvent.click(first);
    fireEvent.click(first);

    expect(first.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps only one question open at a time', () => {
    render(<FaqAccordion />);

    const first = screen.getByRole('button', { name: FAQ_ITEMS[0].question });
    const second = screen.getByRole('button', { name: FAQ_ITEMS[1].question });

    fireEvent.click(first);
    fireEvent.click(second);

    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
  });
});
