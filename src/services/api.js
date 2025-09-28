const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add auth token if available
    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, config);
      
      // Handle token refresh for 401 errors
      if (response.status === 401 && this.refreshToken && endpoint !== '/auth/refresh') {
        const refreshSuccess = await this.refreshAccessToken();
        if (refreshSuccess) {
          // Retry original request with new token
          config.headers.Authorization = `Bearer ${this.token}`;
          const retryResponse = await fetch(url, config);
          return this.handleResponse(retryResponse);
        } else {
          // Refresh failed, logout user
          this.logout();
          throw new Error('Session expired');
        }
      }

      return this.handleResponse(response);
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async handleResponse(response) {
    // Try to parse as JSON, but handle plain text responses
    let data;
    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      // Handle plain text responses (like rate limiting messages)
      const text = await response.text();
      data = { error: text || `HTTP error! status: ${response.status}` };
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this.refreshToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setToken(data.accessToken);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('accessToken', token);
  }

  setRefreshToken(token) {
    this.refreshToken = token;
    localStorage.setItem('refreshToken', token);
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  // Auth methods
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(data.accessToken);
    this.setRefreshToken(data.refreshToken);
    
    return data;
  }

  async register(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async signup(userData) {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async verifyEmail(token) {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async resendVerification(email) {
    return this.request(`/auth/resend-verification/${encodeURIComponent(email)}`);
  }

  async logout() {
    try {
      if (this.refreshToken) {
        await this.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.clearTokens();
      // Redirect to login or reload page
      window.location.reload();
    }
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // User methods
  async getUserProfile() {
    return this.request('/users/profile');
  }

  async updateProfile(profileData) {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Admin methods
  async getUsers(page = 1, limit = 20) {
    return this.request(`/users?page=${page}&limit=${limit}`);
  }

  async toggleUserActive(userId) {
    return this.request(`/users/${userId}/toggle-active`, {
      method: 'PUT',
    });
  }

  async deleteUser(userId) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Properties methods
  async getProperties(params = {}) {
    const searchParams = new URLSearchParams();
    
    if (params.active !== undefined) searchParams.append('active', params.active);
    if (params.search) searchParams.append('search', params.search);
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);
    
    const queryString = searchParams.toString();
    return this.request(`/properties${queryString ? '?' + queryString : ''}`);
  }

  async getProperty(id) {
    return this.request(`/properties/${id}`);
  }

  async createProperty(propertyData) {
    return this.request('/properties', {
      method: 'POST',
      body: JSON.stringify(propertyData),
    });
  }

  async updateProperty(id, propertyData) {
    return this.request(`/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(propertyData),
    });
  }

  async deleteProperty(id) {
    return this.request(`/properties/${id}`, {
      method: 'DELETE',
    });
  }

  // Contacts methods
  async getContacts(params = {}) {
    const searchParams = new URLSearchParams();
    
    if (params.service_type) searchParams.append('service_type', params.service_type);
    if (params.property_id) searchParams.append('property_id', params.property_id);
    if (params.language) searchParams.append('language', params.language);
    if (params.search) searchParams.append('search', params.search);
    if (params.active !== undefined) searchParams.append('active', params.active);
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);
    
    const queryString = searchParams.toString();
    return this.request(`/contacts${queryString ? '?' + queryString : ''}`);
  }

  async getContact(id) {
    return this.request(`/contacts/${id}`);
  }

  async createContact(contactData) {
    return this.request('/contacts', {
      method: 'POST',
      body: JSON.stringify(contactData),
    });
  }

  async updateContact(id, contactData) {
    return this.request(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contactData),
    });
  }

  async deleteContact(id) {
    return this.request(`/contacts/${id}`, {
      method: 'DELETE',
    });
  }

  async getContactsByProperty(propertyId) {
    return this.request(`/contacts/by-property/${propertyId}`);
  }

  // FAQs methods
  async getFAQs(params = {}) {
    const searchParams = new URLSearchParams();
    
    if (params.answer_type) searchParams.append('answer_type', params.answer_type);
    if (params.category_id) searchParams.append('category_id', params.category_id);
    if (params.property_id) searchParams.append('property_id', params.property_id);
    if (params.search) searchParams.append('search', params.search);
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);
    if (params.sort) searchParams.append('sort', params.sort);
    if (params.order) searchParams.append('order', params.order);
    
    const queryString = searchParams.toString();
    return this.request(`/faqs${queryString ? '?' + queryString : ''}`);
  }

  async getFAQ(id) {
    return this.request(`/faqs/${id}`);
  }

  async createFAQ(faqData) {
    return this.request('/faqs', {
      method: 'POST',
      body: JSON.stringify(faqData),
    });
  }

  async updateFAQ(id, faqData) {
    return this.request(`/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(faqData),
    });
  }

  async deleteFAQ(id) {
    return this.request(`/faqs/${id}`, {
      method: 'DELETE',
    });
  }

  async recordFAQAsk(id, data = {}) {
    return this.request(`/faqs/${id}/ask`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFAQCategories() {
    return this.request('/faqs/categories/list');
  }

  async createFAQCategory(categoryData) {
    return this.request('/faqs/categories', {
      method: 'POST',
      body: JSON.stringify(categoryData),
    });
  }

  async getFAQTags() {
    return this.request('/faqs/tags/list');
  }

  // Messages methods
  async getConversations(params = {}) {
    const searchParams = new URLSearchParams();
    
    if (params.search) searchParams.append('search', params.search);
    if (params.limit) searchParams.append('limit', params.limit);
    
    const queryString = searchParams.toString();
    return this.request(`/messages${queryString ? '?' + queryString : ''}`);
  }

  async getConversation(conversationId, params = {}) {
    const searchParams = new URLSearchParams();
    
    if (params.limit) searchParams.append('limit', params.limit);
    
    const queryString = searchParams.toString();
    return this.request(`/messages/${conversationId}${queryString ? '?' + queryString : ''}`);
  }

  // Sandbox methods
  async getSandboxSessions(activeOnly = true) {
    return this.request(`/sandbox/sessions?active_only=${activeOnly}`);
  }

  async getSandboxSession(sessionId) {
    return this.request(`/sandbox/session/${sessionId}`);
  }

  async createSandboxSession(sessionData) {
    return this.request('/sandbox/initialize', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async sendSandboxMessage(sessionId, message, senderType, senderName, autoResponse = true) {
    return this.request('/sandbox/message', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        message: message,
        sender_type: senderType,
        sender_name: senderName,
        auto_response: autoResponse
      }),
    });
  }

  async processSandboxSession(sessionId) {
    return this.request('/sandbox/process', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  }

  async deleteSandboxSession(sessionId) {
    return this.request(`/sandbox/session/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async getSandboxProperties() {
    return this.request('/sandbox/properties');
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token;
  }
}

export default new ApiService(); 