/**
 * The attention a permission request already raises: a modal VS Code
 * warning (`showWarningMessage` with `modal: true`) so a card is not missed
 * when the chat is hidden. CLI 1.0.85 sends that same terminal notification
 * for question/elicitation cards, MCP input, and plan approval. Callers
 * pass the returned message and detail to the same dialog.
 */

export type AttentionKind = 'permission' | 'elicitation' | 'plan-approval';

export interface AttentionNotice {
  kind: AttentionKind;
  /** Always modal — the same channel as a permission request. */
  modal: true;
  message: string;
  detail: string;
}

function clip(summary: string, max = 240): string {
  const text = summary.replace(/\s+/g, ' ').trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export function attentionNotice(kind: AttentionKind, summary: string): AttentionNotice {
  const text = clip(summary);
  switch (kind) {
    case 'permission':
      return {
        kind,
        modal: true,
        message: `Grok wants to: ${text || 'tool action'}`,
        detail: 'Allow or reject this tool action',
      };
    case 'elicitation':
      return {
        kind,
        modal: true,
        message: `Grok is asking: ${text || 'a question'}`,
        detail: 'Answer in the Grok chat. This uses the same attention as a permission request.',
      };
    case 'plan-approval':
      return {
        kind,
        modal: true,
        message: 'Grok is waiting for plan approval',
        detail: text || 'Review the plan and approve or reject it.',
      };
  }
}
