import { filterRequests, type RequestFilters } from "@/features/requests";
import { useCommunity } from "@/stores/community";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";

// Keep action/dialog tests focused on local interactions. Network pagination has its own suite.
export function useMembersPageFixture(filters: RequestFilters, requestedPage: number) {
  const store = useCommunity();
  const students = store.users.filter(user => user.role === "USER");
  const results = filterRequests(students, filters, store.groups);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(results.length / TABLE_PAGE_SIZE)));
  return {
    data: { items: results.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE), total: results.length, page, pageSize: TABLE_PAGE_SIZE,
      counts: { ALL: students.length, PENDING: students.filter(u => u.status === "PENDING").length,
        APPROVED: students.filter(u => u.status === "APPROVED").length, REJECTED: students.filter(u => u.status === "REJECTED").length } },
    loading: false, error: undefined, refresh: () => {},
  };
}
