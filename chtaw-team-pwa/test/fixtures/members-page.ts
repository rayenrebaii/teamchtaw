import { filterRequests, type RequestFilters } from "@/features/requests";
import { useCommunity } from "@/stores/community";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";

// Keep action/dialog tests focused on local interactions. Network pagination has its own suite.
export function useMembersPageFixture(filters: RequestFilters, requestedPage: number) {
  const store = useCommunity();
  const results = filterRequests(store.users, filters, store.groups);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(results.length / TABLE_PAGE_SIZE)));
  return {
    data: { items: results.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE), total: results.length, page, pageSize: TABLE_PAGE_SIZE,
      counts: { ALL: store.users.length, PENDING: store.users.filter(u => u.status === "PENDING").length,
        APPROVED: store.users.filter(u => u.status === "APPROVED").length, REJECTED: store.users.filter(u => u.status === "REJECTED").length } },
    loading: false, error: undefined, refresh: () => {},
  };
}
