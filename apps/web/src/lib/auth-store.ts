/**
 * GEOVENTRA — authentication store.
 *
 * A zustand store that owns the session (access token, refresh token, user and
 * organisation) and persists it to `localStorage` under the `geoventra.session`
 * key so a page reload keeps the user signed in.
 *
 * The store also acts as the auth bridge of the HTTP client: it hands the
 * bearer token to `api.ts` and performs the refresh exchange on its behalf.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthSession, AuthUser, OrganisationSummary } from '@geoventra/contracts';
import { requestLogout, requestRefreshedSession, requestSession, setAuthBridge } from './api';

/** LocalStorage key that holds the persisted session. */
export const SESSION_STORAGE_KEY = 'geoventra.session';

export interface AuthState {
  /** The full session as returned by the API. */
  session: AuthSession | null;
  /** Bearer token used for API calls. */
  accessToken: string | null;
  /** Token used to obtain a new access token. */
  refreshToken: string | null;
  /** Signed-in user. */
  user: AuthUser | null;
  /** Organisation the user belongs to. */
  organisation: OrganisationSummary | null;
  /** True once the persisted session has been read from storage. */
  hydrated: boolean;
  /** Exchange credentials for a session and persist it. */
  signIn: (email: string, password: string) => Promise<AuthSession>;
  /** Drop the local session (and try to invalidate it server-side). */
  signOut: () => Promise<void>;
  /** Exchange the refresh token for a new access token. */
  refresh: () => Promise<string | null>;
  /** Re-read the persisted session from `localStorage`. */
  hydrate: () => void;
  /** Replace the current session (used by the refresh flow). */
  setSession: (session: AuthSession | null) => void;
  /** Flip the hydration flag. */
  setHydrated: (hydrated: boolean) => void;
}

function applySession(session: AuthSession): Pick<
  AuthState,
  'session' | 'accessToken' | 'refreshToken' | 'user' | 'organisation'
> {
  return {
    session,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
    organisation: session.organisation,
  };
}

/** In-flight refresh promise, shared so concurrent 401s trigger one exchange. */
let refreshInFlight: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      accessToken: null,
      refreshToken: null,
      user: null,
      organisation: null,
      hydrated: false,

      setHydrated: (hydrated) => set({ hydrated }),

      setSession: (session) => {
        if (!session) {
          set({
            session: null,
            accessToken: null,
            refreshToken: null,
            user: null,
            organisation: null,
          });
          return;
        }
        set(applySession(session));
      },

      signIn: async (email, password) => {
        const session = await requestSession(email, password);
        set(applySession(session));
        return session;
      },

      signOut: async () => {
        try {
          await requestLogout();
        } catch {
          // Signing out locally must always succeed, even when the API is down.
        }
        set({
          session: null,
          accessToken: null,
          refreshToken: null,
          user: null,
          organisation: null,
        });
      },

      refresh: async () => {
        if (refreshInFlight) return refreshInFlight;

        const refreshToken = get().refreshToken;
        if (!refreshToken) return null;

        refreshInFlight = (async () => {
          try {
            const session = await requestRefreshedSession(refreshToken);
            set(applySession(session));
            return session.accessToken;
          } catch {
            set({
              session: null,
              accessToken: null,
              refreshToken: null,
              user: null,
              organisation: null,
            });
            return null;
          } finally {
            refreshInFlight = null;
          }
        })();

        return refreshInFlight;
      },

      hydrate: () => {
        void useAuthStore.persist.rehydrate();
        set({ hydrated: true });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        organisation: state.organisation,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

// Let the HTTP client resolve bearer tokens and perform refreshes.
setAuthBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  refreshAccessToken: () => useAuthStore.getState().refresh(),
  clearSession: () => {
    void useAuthStore.getState().signOut();
  },
});
