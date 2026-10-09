import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if ((err.response?.status === 401 || err.response?.status === 403) && !err.config?.url?.includes('/auth/login')) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const login  = (email: string, password: string) => api.post('/auth/login', { email, password });
export const register = (data: any) => api.post('/auth/register', data);

// E-waste
export const getMyItems = () => api.get('/ewaste');
export const getItem    = (id: string) => api.get(`/ewaste/${id}`);
export const submitEwaste = (data: any) => api.post('/ewaste', data);

// Pickups
export const getPickups        = () => api.get('/pickups');
export const confirmPickup     = (id: string, data: any) => api.post(`/pickups/${id}/confirm`, data);
export const receivePickup     = (id: string) => api.post(`/pickups/${id}/receive`, {});

// Inspections
export const createInspection  = (data: any) => api.post('/inspections', data);
export const getInspections    = () => api.get('/inspections');

// Batches
export const getBatches        = () => api.get('/batches');
export const createBatch       = (data: any) => api.post('/batches', data);
export const completeBatch     = (id: string, data: any) => api.post(`/batches/${id}/complete`, data);

// Analytics
export const getKpis           = () => api.get('/analytics/kpis');
export const getCharts         = () => api.get('/analytics/charts');

// Centers
export const getCenters        = () => api.get('/centers');

// Users (admin)
export const getUsers          = () => api.get('/users');
export const getRecyclers      = () => api.get('/users/recyclers');
