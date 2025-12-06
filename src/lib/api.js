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

    // Short-circuit no-content responses
    if (response.status === 204) return {};

    const text = await response.text();

    if (!response.ok) {
      // Try to parse error JSON; otherwise surface status text/body
      let errorMsg = response.statusText;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || parsed.message || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
      }
      throw new Error(errorMsg || `HTTP ${response.status}`);
    }

    // No body
    if (!text) return {};

    // Parse JSON body
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${e.message}`);
    }
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

  /**
   * Recurring tasks
   */
  async getRecurringTasks() {
    return apiFetch('/tasks/recurring');
  },

  async createRecurringTask(data) {
    return apiFetch('/tasks/recurring', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRecurringTask(id, data) {
    return apiFetch(`/tasks/recurring/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteRecurringTask(id) {
    return apiFetch(`/tasks/recurring/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Assign staff to task and trigger workflow
   */
  async assignTask(taskId, staffData) {
    return apiFetch(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify(staffData),
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
// STAFF API
// ============================================================================

export const staffApi = {
  /**
   * Get staff for a property
   */
  async getStaff(propertyId) {
    return apiFetch(`/properties/${propertyId}/staff`);
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
  staff: staffApi,
  checkHealth,
};
