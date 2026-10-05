/** The signed-in player whose data is exported or deleted. */
export interface DataOwner {
  userId: string;
  accountId32: number;
}

/** Documents as plain records for export: `_id` as `id`, internal fields dropped. */
export function forExport<T extends Record<string, unknown>>(docs: T[]) {
  return docs.map(({ _id, schemaVersion: _v, ...rest }) => ({ id: String(_id), ...rest }));
}
