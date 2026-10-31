import { describe, it, expect } from 'vitest';
import { calculateCost, TokenUsage } from './cost.js';

describe('SpecForge FinOps Token Economics', () => {
  it('correctly calculates zero token cost', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: 'claude-3-5-sonnet-20241022',
    };
    expect(calculateCost(usage)).toBe(0);
  });

  it('calculates standard Sonnet 3.5 pricing', () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: 'claude-3-5-sonnet-20241022',
    };
    //  per MTok input +  per MTok output = 
    expect(calculateCost(usage)).toBe(18.0);
  });

  it('correctly prices prompt cache hits and writes', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      model: 'claude-3-5-sonnet-20241022',
    };
    // .30 cache read + .75 cache write = .05
    expect(calculateCost(usage)).toBe(4.05);
  });

  it('routes to Haiku pricing accurately', () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: 'claude-3-5-haiku-20241022',
    };
    // .0 input + .0 output = .0
    expect(calculateCost(usage)).toBe(6.0);
  });
});
