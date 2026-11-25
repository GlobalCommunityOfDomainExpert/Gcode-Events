export interface ApiListResponse<T> {
  items: T[];
  hasMore: boolean;
  limit: number;
  offset: number;
  count: number;
}
