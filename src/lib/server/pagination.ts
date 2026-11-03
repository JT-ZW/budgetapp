type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// Callers must use a stable order, including an ID tie-breaker.
// Never return a partial history as if it were complete when a page fails.
export async function loadAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await page(offset, offset + 999);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) return { data: rows, error: null };
  }
}
