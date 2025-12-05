/**
 * OpenAI Service - Ported from guestResponse.gs
 * Handles all OpenAI API interactions
 */

import OpenAI from 'openai';
import { config } from '../config/env.js';

let openaiClient = null;

function getClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiClient;
}

/**
 * Call OpenAI chat completion and return raw text response
 * Equivalent to callGPTTurbo() from guestResponse.gs
 */
export async function callGPTTurbo(messages, model = null) {
  const client = getClient();
  
  const response = await client.chat.completions.create({
    model: model || config.openai.model,
    messages,
  });
  
  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * Call OpenAI and parse JSON response
 * Equivalent to openAIChatJSON_() from guestResponse.gs
 */
export async function chatJSON(prompt, model = null) {
  const client = getClient();
  
  try {
    const response = await client.chat.completions.create({
      model: model || config.openai.model,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.choices[0]?.message?.content?.trim() || '';
    
    // Try to parse as JSON
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from response
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}') + 1;
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(content.slice(start, end));
        } catch (e2) {
          // Ignore
        }
      }
    }
    
    return {
      raw: content,
      json: parsed,
      error: null,
    };
  } catch (error) {
    return {
      raw: '',
      json: null,
      error: error.message || 'OpenAI API error',
    };
  }
}

/**
 * Call OpenAI chat with system and user messages
 * Equivalent to callOpenAIChat() from guestResponse.gs
 */
export async function callChat(prompt, model = null) {
  const result = await chatJSON(prompt, model);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.json || result.raw;
}

/**
 * Detect language of text (uses OpenAI for accuracy)
 * Simple implementation - could use a dedicated language detection API
 */
export async function detectLanguage(text) {
  if (!text || text.length < 3) return 'en';
  
  try {
    const response = await callGPTTurbo([
      {
        role: 'system',
        content: 'You are a language detector. Return ONLY the 2-letter ISO language code (e.g., "en", "es", "fr", "de"). No other text.',
      },
      {
        role: 'user',
        content: `Detect the language of this text: "${text.slice(0, 200)}"`,
      },
    ]);
    
    const code = response.trim().toLowerCase().slice(0, 2);
    return /^[a-z]{2}$/.test(code) ? code : 'en';
  } catch (e) {
    return 'en';
  }
}

export default {
  callGPTTurbo,
  chatJSON,
  callChat,
  detectLanguage,
};

