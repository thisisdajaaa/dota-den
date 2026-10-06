export type JournalError = { type: "not_found" };

export interface JournalOwner {
  userId: string;
  accountId32: number;
}
