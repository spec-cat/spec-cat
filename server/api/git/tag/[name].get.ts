import { getTagDetail } from "~/server/utils/git";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);
    const name = getRouterParam(event, "name");

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    try {
      const detail = getTagDetail(workingDirectory, name);
      return detail;
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to get tag detail: ${errorMessage}`,
      });
    }
  } catch (error) {
    handleGitApiError(error, "fetching tag detail", "Failed to fetch tag detail");
  }
});
