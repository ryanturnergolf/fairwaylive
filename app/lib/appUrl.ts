const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const configuredAppUrl = trimTrailingSlashes(process.env.NEXT_PUBLIC_APP_URL?.trim() || "");

export const getConfiguredAppUrl = () => configuredAppUrl;

export const getCurrentBrowserAppUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return trimTrailingSlashes(window.location.origin);
};

export const getAppBaseUrl = () => getConfiguredAppUrl() || getCurrentBrowserAppUrl();

export const buildAppUrl = (path: string) => {
  const baseUrl = getAppBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};

export const buildCurrentBrowserUrl = (path: string) => {
  const baseUrl = getCurrentBrowserAppUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};
