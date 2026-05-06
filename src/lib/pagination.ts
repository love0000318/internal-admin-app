export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function parsePagination(params: {
  page?: string;
  pageSize?: string;
}) {
  const parsedPage = Number(params.page ?? "1");
  const parsedPageSize = Number(params.pageSize ?? String(DEFAULT_PAGE_SIZE));
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginationHref(
  pathname: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") {
      search.set(key, value);
    }
  }

  search.set("page", String(page));

  return `${pathname}?${search.toString()}`;
}
