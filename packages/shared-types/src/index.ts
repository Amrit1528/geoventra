/**
 * GEOVENTRA — shared type surface.
 *
 * This package exists so non-TypeScript consumers (Python services, load-testing harnesses)
 * can depend on a thin, stable façade before the full contract set is extracted. For now it
 * re-exports `@geoventra/contracts` verbatim.
 */

export * from '@geoventra/contracts';
