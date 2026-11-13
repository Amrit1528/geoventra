/**
 * Unit tests for the API transport helpers.
 */

import { describe, expect, it } from 'vitest';
import { ApiError, buildQueryString, type QueryParams } from './api';

describe('buildQueryString', () => {
  it('serialises values and skips empty entries', () => {
    expect(buildQueryString(undefined)).toBe('');
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ a: 1, b: 'x', c: undefined, d: null, e: '' })).toBe('?a=1&b=x');
    expect(buildQueryString({ metrics: 'a,b,c' })).toBe('?metrics=a%2Cb%2Cc');
  });

  it('builds a URL-safe query string', () => {
    const query = buildQueryString({ q: 'Del 1', limit: 25 } satisfies QueryParams);
    expect(query).toBe('?q=Del+1&limit=25');
  });
});

describe('ApiError', () => {
  it('carries status, url and body and exposes isUnauthorized', () => {
    const error = new ApiError(401, 'nope', 'http://x/y', { message: 'nope' });
    expect(error.status).toBe(401);
    expect(error.isUnauthorized).toBe(true);
    expect(error.url).toBe('http://x/y');
    expect(error.body).toEqual({ message: 'nope' });

    expect(new ApiError(500, 'x', 'http://x', null).isUnauthorized).toBe(false);
  });
});
