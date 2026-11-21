"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCommunity, mergeById } from "@/stores/community";
import { usersService, membersQuery, type MembersPage } from "@/services/users.service";
import type { RequestFilters } from "@/features/requests";

export function useMembersPage(filters: RequestFilters, page: number) {
  const owner = useCommunity(state => state.session?.userId);
  const syncing = useCommunity(state => state.loading);
  const [revision, setRevision] = useState(0);
  const previousSearch = useRef(filters.search);
  const [result, setResult] = useState<{ key: string; data?: MembersPage; error?: string }>();
  const query = membersQuery(filters, page);
  const key = `${owner}:${query}:${revision}:${syncing}`;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!owner || syncing) return;
    let active = true;
    const searchChanged = previousSearch.current !== filters.search;
    previousSearch.current = filters.search;
    // Coalesce typing without delaying next/previous page requests.
    const timer = setTimeout(() => {
      void usersService.members(query).then(data => {
        if (!active || useCommunity.getState().session?.userId !== owner) return;
        useCommunity.setState(state => ({ users: mergeById(state.users, data.items) }));
        setResult({ key, data });
      }).catch(reason => {
        if (active && useCommunity.getState().session?.userId === owner)
          setResult({ key, error: reason instanceof Error ? reason.message : "Actualisation impossible." });
      });
    }, searchChanged && filters.search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [owner, syncing, query, key, filters.search]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, loading: !current, error: current?.error, refresh };
}
