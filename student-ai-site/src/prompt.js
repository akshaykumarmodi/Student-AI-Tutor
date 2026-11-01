export const SYSTEM_PROMPT = '';

export function buildUpstreamMessages(history, subject) {
  if (SYSTEM_PROMPT && SYSTEM_PROMPT.trim()) {
    return [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      ...history
    ];
  }
  return [...history];
}


