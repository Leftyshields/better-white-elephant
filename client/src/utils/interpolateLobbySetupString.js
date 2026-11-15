/**
 * Replace {key} placeholders in lobby setup copy.
 */
export function interpolateLobbySetupString(template, variables) {
  if (typeof template !== 'string') {
    return '';
  }
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}