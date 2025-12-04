/**
 * API Client for Ramble Backend
 * Connects React frontend to Node.js/Express server
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error(`[API] ${options.method || 'GET'} ${endpoint} failed:`, error.message);
    throw error;
  }
}

// ============================================================================
// MESSAGES API
// ============================================================================

export const messagesApi = {
  /**
   * Get all conversations
   */
  async getConversations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/messages${query ? `?${query}` : ''}`);
  },

  /**
   * Get conversation by phone number
   */
  async getConversation(phone, params = {}) {
    const encoded = encodeURIComponent(phone);
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/messages/${encoded}${query ? `?${query}` : ''}`);
  },

  /**
   * Send a message
   */
  async sendMessage(data) {
    return apiFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================================================
// TASKS API
// ============================================================================

export const tasksApi = {
  /**
   * Get all tasks
   */
  async getTasks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/tasks${query ? `?${query}` : ''}`);
  },

  /**
   * Get task by ID
   */
  async getTask(taskId) {
    return apiFetch(`/tasks/${taskId}`);
  },

  /**
   * Create a new task
   */
  async createTask(data) {
    return apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update task
   */
  async updateTask(taskId, updates) {
    return apiFetch(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete task
   */
  async deleteTask(taskId) {
    return apiFetch(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Mark task as complete
   */
  async completeTask(taskId) {
    return apiFetch(`/tasks/${taskId}/complete`, {
      method: 'POST',
    });
  },
};

// ============================================================================
// PROPERTIES API
// ============================================================================

export const propertiesApi = {
  /**
   * Get all properties
   */
  async getProperties(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/properties${query ? `?${query}` : ''}`);
  },

  /**
   * Get property by ID
   */
  async getProperty(propertyId) {
    return apiFetch(`/properties/${propertyId}`);
  },

  /**
   * Create property
   */
  async createProperty(data) {
    return apiFetch('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get bookings for property
   */
  async getBookings(propertyId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/properties/${propertyId}/bookings${query ? `?${query}` : ''}`);
  },

  /**
   * Create booking
   */
  async createBooking(propertyId, data) {
    return apiFetch(`/properties/${propertyId}/bookings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function checkHealth() {
  try {
    const response = await fetch('/health');
    return response.ok;
  } catch {
    return false;
  }
}

export default {
  messages: messagesApi,
  tasks: tasksApi,
  properties: propertiesApi,
  checkHealth,
};
