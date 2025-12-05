/**
 * Shared validation constants for server-side validation
 * These should match the frontend constants in src/constants/validation.js
 */

// Password validation
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

// Phone validation
export const PHONE_REGEX = /^\+?[\d\s\(\)\-\.]+$/;

// Color validation (hex)
export const HEX_COLOR_REGEX = /^#[0-9A-F]{6}$/i;

// express-validator validation chains
import { body } from 'express-validator';

/**
 * Reusable password validation chain for express-validator
 * @param {string} field - The field name to validate (default: 'password')
 */
export const passwordValidation = (field = 'password') => [
  body(field)
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
    .matches(PASSWORD_REGEX)
    .withMessage('Password must contain at least one letter, one number, and one special character')
];

/**
 * Email validation chain with normalization
 */
export const emailValidation = () => [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail()
];

/**
 * Name validation chain
 * @param {string} field - The field name to validate
 */
export const nameValidation = (field) => [
  body(field)
    .trim()
    .isLength({ min: 1 })
    .withMessage(`${field} is required`)
];

/**
 * Phone validation chain
 */
export const phoneValidation = () => [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone is required')
    .matches(PHONE_REGEX)
    .withMessage('Invalid phone number format')
];

/**
 * Hex color validation chain
 */
export const hexColorValidation = (field = 'color') => [
  body(field)
    .optional()
    .matches(HEX_COLOR_REGEX)
    .withMessage('Color must be a valid hex color')
];
