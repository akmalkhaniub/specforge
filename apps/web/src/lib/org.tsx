/**
 * Auth context stand-in for the demo: provides the current org id (the seeded
 * "acme" org), fetched once at startup. Real auth would replace this provider.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useDefaultOrg } from './hooks';

interface OrgContextValue {
  orgId: string | undefined;
  orgName: string;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  orgId: undefined,
  orgName: 'Default Org',
  isLoading: true,
});

export function OrgProvider({ children }: { children: ReactNode }): JSX.Element {
  const { data, isLoading } = useDefaultOrg();
  return (
    <OrgContext.Provider
      value={{ orgId: data?.id, orgName: data?.name ?? 'Default Org', isLoading }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  return useContext(OrgContext);
}
