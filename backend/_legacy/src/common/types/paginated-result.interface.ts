export interface IPaginatedResult<T>{
    date:T[],
     pagination: {
    page: number;
    limit: number;
    total: number;
  };

}