import { listStashes } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);

    const stashes = listStashes(workingDirectory);

    return { stashes };
  } catch (error) {
    handleGitApiError(error, "Error listing stashes", "Failed to list stashes");
  }
});
