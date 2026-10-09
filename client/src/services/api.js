import axios from 'axios';

/**
 * Axios instance configured to:
 *  - Send the HttpOnly session cookie automatically (withCredentials: true)
 *  - Intercept 401s, attempt to refresh token, and retry the request
 *
 * Both access and refresh tokens are stored in HttpOnly cookies,
 * protecting against XSS attacks.
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue = [];

function rememberAssignmentError(error) {
  if (error.response?.data?.code !== 'ADMIN_ASSIGNMENT_REQUIRED') return false;
  sessionStorage.setItem('loginError', error.response.data.error);
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  if (window.location.pathname !== '/login') window.location.href = '/login';
  return true;
}

const processQueue = (error) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((reqConfig) => {
  const token = localStorage.getItem('token');
  if (token && !reqConfig.headers.Authorization) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh attempt on auth endpoints to prevent loops
    if (!originalRequest || ['/auth/login', '/auth/maintenance-login', '/auth/ms-callback', '/auth/refresh', '/auth/logout'].includes(originalRequest.url)) {
      return Promise.reject(error);
    }

    if (rememberAssignmentError(error)) return Promise.reject(error);

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        originalRequest._retry = true;
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          const token = localStorage.getItem('token');
          if (token) originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Must use raw axios to avoid interceptor loop
        const refreshRes = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        if (refreshRes.data?.token) {
          localStorage.setItem('token', refreshRes.data.token);
          originalRequest.headers.Authorization = `Bearer ${refreshRes.data.token}`;
        }
        isRefreshing = false;
        processQueue(null);
        return api(originalRequest);
      } catch (err) {
        isRefreshing = false;
        processQueue(err);
        rememberAssignmentError(err);
        
        // Refresh token is expired or invalid
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(err);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
