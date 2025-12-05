/**
 * Template filler utility - equivalent to fillTpl_() from prompts.gs
 * Replaces {{PLACEHOLDER}} with values from dict
 */
export function fillTemplate(template, dict = {}) {
  let output = String(template || '');
  
  Object.keys(dict).forEach(key => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const value = dict[key] == null ? '' : String(dict[key]);
    output = output.replace(regex, value);
  });
  
  return output;
}

/**
 * Debug version of template filler - logs placeholders and values
 */
export function fillTemplateDebug(label, template, vars) {
  // Extract all placeholders from template
  const placeholders = Array.from(
    new Set((String(template || '').match(/\{\{\s*[^}]+\s*\}\}/g) || []))
  ).map(t => t.replace(/[{}]/g, '').trim());

  // Log inputs
  const kvLog = {};
  placeholders.forEach(k => {
    kvLog[k] = k in vars ? vars[k] : '(missing)';
  });
  
  console.log(`[fillTemplateDebug:${label}] Vars →`, kvLog);

  const output = fillTemplate(template, vars);
  console.log(`[fillTemplateDebug:${label}] Output (first 500) →`, output.slice(0, 500));
  
  return output;
}

export default { fillTemplate, fillTemplateDebug };

