// src/api/axiosConfig.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://appresqforce.onrender.com';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`, // This adds /api to all requests
  withCredentials: true,
});

export default apiClient;
