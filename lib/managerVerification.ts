import { parseChart, parseModelJSON } from './chartSpec.ts';

export interface ModelMessages {
  system: string;
  user: string;
}

export type Complete = (messages: ModelMessages) => Promise<string>;

export interface ManagerVerification extends ModelMessages {
  status: 'verified' | 'issues_found' | 'failed';
  issues: string[];
  draft: string;
}

export async function verifyManagerArtifact(options: {
  kind: 'title' | 'article' | 'visualization' | 'discussion';
  context: string;
  draft: string;
  originalCounts: string;
  complete: Complete;
}): Promise<{ output: string; verification: ManagerVerification }> {
  const { kind, context, draft, originalCounts, complete } = options;
  const messages = {
    system: 'You are the same newsroom participant, with additional verification responsibility. Verify the complete received input, including upstream claims and visible discussion, against the original dataset counts. Check the counts independently. Reconcile incorrect input and finish your original task. A subgroup leader differing from the overall leader is not inherently a contradiction. Do not assess unseen work or make a publication decision. Return JSON with status (verified or issues_found), issues (array of unresolved concerns), and artifact (the complete corrected node output as a string). For visualization the artifact must contain valid Vega-Lite JSON with inline counts. For discussion it must be a discussion contribution. Keep editorial commentary in issues.',
    user: JSON.stringify({ kind, receivedInput: context, taskDraft: draft, originalCounts }),
  };
  try {
    const parsed = parseModelJSON(await complete(messages)) as {
      status?: unknown; issues?: unknown; artifact?: unknown;
    } | null;
    if (!parsed || (parsed.status !== 'verified' && parsed.status !== 'issues_found') ||
        !Array.isArray(parsed.issues) || !parsed.issues.every(issue => typeof issue === 'string') ||
        typeof parsed.artifact !== 'string' || !parsed.artifact.trim()) {
      throw new Error('Invalid Manager verification response.');
    }
    if (kind === 'visualization') parseChart(parsed.artifact);
    return {
      output: parsed.artifact,
      verification: { ...messages, status: parsed.status, issues: parsed.issues, draft },
    };
  } catch (error) {
    return {
      output: draft,
      verification: {
        ...messages, status: 'failed', draft,
        issues: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
