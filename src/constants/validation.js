/**
 * Shared validation constants used across frontend and can be referenced by backend
 */

// Password validation
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
export const PASSWORD_REQUIREMENTS = 'Password must be at least 8 characters with at least one letter, one number, and one special character (@$!%*?&)';

// Email validation
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation
export const PHONE_REGEX = /^\+?[\d\s\(\)\-\.]+$/;

// Color validation (hex)
export const HEX_COLOR_REGEX = /^#[0-9A-F]{6}$/i;

// Validation helper functions
export const isValidPassword = (password) => {
  return password && password.length >= PASSWORD_MIN_LENGTH && PASSWORD_REGEX.test(password);
};

export const isValidEmail = (email) => {
  return email && EMAIL_REGEX.test(email);
};

export const isValidPhone = (phone) => {
  return phone && PHONE_REGEX.test(phone);
};

export const isValidHexColor = (color) => {
  return color && HEX_COLOR_REGEX.test(color);
};

// Validation error messages
export const VALIDATION_MESSAGES = {
  password: {
    required: 'Password is required',
    minLength: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    format: 'Password must contain at least one letter, one number, and one special character',
  },
  email: {
    required: 'Email is required',
    format: 'Please enter a valid email address',
  },
  phone: {
    required: 'Phone number is required',
    format: 'Please enter a valid phone number',
  },
  name: {
    required: 'Name is required',
    minLength: 'Name must be at least 1 character',
  },
};
