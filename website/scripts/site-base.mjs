export const DEFAULT_SITE_BASE_PATH = '/dc34badge';

export function resolveSiteBasePath(value = process.env.SITE_BASE_PATH) {
  const basePath = value ?? DEFAULT_SITE_BASE_PATH;

  if (basePath === '' || basePath === '/') return '';
  if (!basePath.startsWith('/') || basePath.endsWith('/') || basePath.includes('//')) {
    throw new Error('SITE_BASE_PATH must be empty or an absolute path without a trailing slash.');
  }
  if (/[?#\\]/.test(basePath) || basePath.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('SITE_BASE_PATH cannot contain a query, fragment, backslash, or dot segment.');
  }
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
    throw new Error('SITE_BASE_PATH contains unsupported characters.');
  }

  return basePath;
}

export function sitePath(basePath, relativePath = '') {
  const suffix = relativePath.replace(/^\/+/, '');
  if (!suffix) return basePath || '/';
  return `${basePath}/${suffix}`;
}
