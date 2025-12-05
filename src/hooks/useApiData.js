import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for fetching API data with loading, error, and refetch support
 *
 * @param {Function} apiFunction - The async function that fetches data
 * @param {Array} dependencies - Dependencies array that triggers refetch when changed
 * @param {Object} options - Additional options
 * @param {boolean} options.immediate - Whether to fetch immediately on mount (default: true)
 * @param {*} options.initialData - Initial data value (default: null)
 * @param {Function} options.onSuccess - Callback on successful fetch
 * @param {Function} options.onError - Callback on error
 *
 * @returns {Object} { data, loading, error, refetch, setData }
 *
 * @example
 * // Basic usage
 * const { data: users, loading, error, refetch } = useApiData(
 *   () => apiService.getUsers(),
 *   []
 * );
 *
 * @example
 * // With dependencies
 * const { data: property } = useApiData(
 *   () => apiService.getProperty(propertyId),
 *   [propertyId]
 * );
 *
 * @example
 * // With options
 * const { data, refetch } = useApiData(
 *   () => apiService.getConversations({ limit: 50 }),
 *   [],
 *   {
 *     initialData: [],
 *     onSuccess: (data) => console.log('Loaded', data.length, 'items'),
 *     onError: (err) => toast.error(err.message)
 *   }
 * );
 */
export function useApiData(apiFunction, dependencies = [], options = {}) {
  const {
    immediate = true,
    initialData = null,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiFunction();
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'An error occurred';
      setError(errorMessage);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunction, onSuccess, onError]);

  useEffect(() => {
    if (immediate) {
      fetchData().catch(() => {
        // Error already handled in fetchData
      });
    }
  }, [...dependencies, immediate]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    setData,
  };
}

/**
 * Custom hook for fetching paginated API data
 *
 * @param {Function} apiFunction - Function that takes (page, limit) and returns paginated data
 * @param {Object} options - Pagination options
 * @param {number} options.initialPage - Starting page (default: 1)
 * @param {number} options.limit - Items per page (default: 20)
 *
 * @returns {Object} Paginated data with navigation functions
 */
export function usePaginatedApiData(apiFunction, options = {}) {
  const {
    initialPage = 1,
    limit = 20,
    ...restOptions
  } = options;

  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);

  const { data, loading, error, refetch, setData } = useApiData(
    () => apiFunction(page, limit),
    [page, limit],
    {
      initialData: { items: [], total: 0 },
      onSuccess: (result) => {
        const total = result.total || result.items?.length || 0;
        setHasMore(page * limit < total);
      },
      ...restOptions,
    }
  );

  const nextPage = useCallback(() => {
    if (hasMore && !loading) {
      setPage((p) => p + 1);
    }
  }, [hasMore, loading]);

  const prevPage = useCallback(() => {
    if (page > 1 && !loading) {
      setPage((p) => p - 1);
    }
  }, [page, loading]);

  const goToPage = useCallback((newPage) => {
    if (newPage >= 1 && !loading) {
      setPage(newPage);
    }
  }, [loading]);

  return {
    data: data?.items || data || [],
    total: data?.total || 0,
    page,
    limit,
    hasMore,
    loading,
    error,
    refetch,
    setData,
    nextPage,
    prevPage,
    goToPage,
  };
}

export default useApiData;
