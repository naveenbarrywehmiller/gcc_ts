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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh attempt on auth endpoints to prevent loops
    if (originalRequest.url === '/auth/login' || originalRequest.url === '/auth/refresh') {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Must use raw axios to avoid interceptor loop
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        isRefreshing = false;
        processQueue(null);
        return api(originalRequest);
      } catch (err) {
        isRefreshing = false;
        processQueue(err);
        
        // Refresh token is expired or invalid
        localStorage.removeItem('user');
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
