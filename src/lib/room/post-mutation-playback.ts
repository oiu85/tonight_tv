import { roomUiErrorFromUnknown } from "./domain-errors";

export type PostMutationPlaybackResult = Readonly<{
  selectionSucceeded: boolean;
  warning: string | null;
}>;

export async function settlePostMutationPlayback(options: Readonly<{
  select?: () => Promise<void>;
  reconcile: () => Promise<void>;
  selectionFailureMessage: string;
  reconciliationFailureMessage: string;
}>): Promise<PostMutationPlaybackResult> {
  let selectionSucceeded = options.select === undefined;
  let warning: string | null = null;

  if (options.select) {
    try {
      await options.select();
      selectionSucceeded = true;
    } catch (error) {
      warning = roomUiErrorFromUnknown(
        error,
        options.selectionFailureMessage,
      ).message;
    }
  }

  try {
    await options.reconcile();
  } catch (error) {
    warning ??= roomUiErrorFromUnknown(
      error,
      options.reconciliationFailureMessage,
    ).message;
  }

  return Object.freeze({ selectionSucceeded, warning });
}
