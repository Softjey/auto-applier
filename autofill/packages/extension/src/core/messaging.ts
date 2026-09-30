import type {
  BackgroundRequest,
  BackgroundResponses,
  BackgroundResult,
  FieldDescriptor,
} from '@applier/protocol';

/** The only door from a page-side script to the local server. */
export interface Backend {
  plan(fields: FieldDescriptor[]): Promise<BackgroundResponses['plan']>;
  cvs(): Promise<BackgroundResponses['cvs']>;
  cv(id: string): Promise<BackgroundResponses['cv']>;
}

async function send<K extends BackgroundRequest['type']>(
  message: Extract<BackgroundRequest, { type: K }>,
): Promise<BackgroundResponses[K]> {
  const result = (await browser.runtime.sendMessage(message)) as
    BackgroundResult<BackgroundResponses[K]> | undefined;
  if (!result) throw new Error('The extension background did not answer.');
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const chromeBackend: Backend = {
  plan: (fields) => send({ type: 'plan', fields }),
  cvs: () => send({ type: 'cvs' }),
  cv: (id) => send({ type: 'cv', id }),
};
