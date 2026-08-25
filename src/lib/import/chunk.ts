/**
 * Slice size for a chunked upload. A serverless request body is capped at a
 * few megabytes, so this sits comfortably below that ceiling; the browser and
 * the route both read it from here so they cannot drift apart.
 */
export const CHUNK_BYTES = 3 * 1024 * 1024;
